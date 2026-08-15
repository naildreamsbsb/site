begin;

alter table public.comissoes_profissionais
  add column if not exists agendamento_item_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.comissoes_profissionais'::regclass
      and conname = 'comissoes_profissionais_agendamento_item_id_fkey'
  ) then
    alter table public.comissoes_profissionais
      add constraint comissoes_profissionais_agendamento_item_id_fkey
      foreign key (agendamento_item_id)
      references public.agendamento_itens(id)
      on delete restrict;
  end if;
end $$;

alter table public.comissoes_profissionais
  drop constraint if exists comissoes_profissionais_agendamento_id_key;

create index if not exists idx_comissoes_agendamento_id
  on public.comissoes_profissionais (agendamento_id);

create unique index if not exists uq_comissoes_agendamento_item
  on public.comissoes_profissionais (agendamento_item_id)
  where agendamento_item_id is not null;

create unique index if not exists uq_comissoes_agendamento_legado
  on public.comissoes_profissionais (agendamento_id)
  where agendamento_item_id is null;

-- Conserva a implementação anterior para agendamentos históricos sem itens.
do $$
begin
  if to_regprocedure('public.calcular_comissao_agendamento_legado_admin(uuid)') is null then
    alter function public.calcular_comissao_agendamento_admin(uuid)
      rename to calcular_comissao_agendamento_legado_admin;
  end if;
end $$;

revoke all on function public.calcular_comissao_agendamento_legado_admin(uuid) from public, anon;

-- A implementação legada passa a apontar para o índice único parcial.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.calcular_comissao_agendamento_legado_admin(uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    'on conflict (agendamento_id) do update',
    'on conflict (agendamento_id) where agendamento_item_id is null do update'
  );
  execute v_definition;
end $$;

create or replace function public.calcular_comissao_agendamento_item_admin(
  p_agendamento_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.agendamento_itens%rowtype;
  v_ag public.agendamentos%rowtype;
  v_regra public.comissao_regras%rowtype;
  v_comissao public.comissoes_profissionais%rowtype;
  v_data_ref date;
  v_base numeric;
  v_recebido numeric;
  v_total_itens numeric;
  v_ultimo_item uuid;
  v_outros_recebidos numeric;
  v_valor_comissao numeric;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'message', 'Você precisa estar logado para calcular comissão.');
  end if;
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'message', 'Apenas admin pode calcular comissão.');
  end if;

  select * into v_item from public.agendamento_itens where id = p_agendamento_item_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Item do agendamento não encontrado.');
  end if;
  select * into v_ag from public.agendamentos where id = v_item.agendamento_id;
  if v_ag.status <> 'concluido' then
    return jsonb_build_object('success', false, 'message', 'A comissão só pode ser calculada para atendimento concluído.');
  end if;

  select * into v_comissao
  from public.comissoes_profissionais
  where agendamento_item_id = v_item.id;

  if found and v_comissao.status = 'paga' then
    return jsonb_build_object('success', true, 'skipped', true, 'message', 'Comissão já paga. Nenhuma alteração realizada.');
  end if;
  if found and v_comissao.manual_override then
    return jsonb_build_object('success', true, 'skipped', true, 'message', 'Comissão possui ajuste manual. Nenhuma alteração automática realizada.');
  end if;

  v_data_ref := (v_ag.start_at at time zone 'America/Sao_Paulo')::date;
  select * into v_regra
  from public.comissao_regras r
  where r.profissional_id = v_item.profissional_id
    and r.active
    and (r.servico_id = v_item.servico_id or r.servico_id is null)
    and r.valid_from <= v_data_ref
    and (r.valid_to is null or r.valid_to >= v_data_ref)
  order by case when r.servico_id = v_item.servico_id then 0 else 1 end,
           r.valid_from desc, r.created_at desc
  limit 1;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Nenhuma regra de comissão ativa encontrada para essa profissional.');
  end if;

  -- A comissão usa sempre o valor integral do procedimento, nunca amount_paid.
  v_base := coalesce(v_item.valor_snapshot, 0);
  if v_regra.calculation_type = 'percentual' then
    v_valor_comissao := round(v_base * v_regra.commission_percent / 100, 2);
  else
    v_valor_comissao := v_regra.fixed_amount;
  end if;

  -- valor_recebido é apenas informativo e rateia o pagamento do agendamento.
  select coalesce(sum(valor_snapshot), 0),
         (array_agg(id order by ordem desc, id desc))[1]
    into v_total_itens, v_ultimo_item
  from public.agendamento_itens where agendamento_id = v_ag.id;
  if v_total_itens <= 0 then
    v_recebido := 0;
  elsif v_item.id <> v_ultimo_item then
    v_recebido := round(coalesce(v_ag.amount_paid, 0) * v_base / v_total_itens, 2);
  else
    select coalesce(sum(round(coalesce(v_ag.amount_paid, 0) * valor_snapshot / v_total_itens, 2)), 0)
      into v_outros_recebidos
    from public.agendamento_itens
    where agendamento_id = v_ag.id and id <> v_item.id;
    v_recebido := round(coalesce(v_ag.amount_paid, 0) - v_outros_recebidos, 2);
  end if;

  insert into public.comissoes_profissionais (
    agendamento_id, agendamento_item_id, profissional_id, servico_id, cliente_id,
    data_referencia, valor_servico, valor_recebido, base_calculo,
    calculation_type, commission_percent, fixed_amount, valor_comissao, status, notes
  ) values (
    v_ag.id, v_item.id, v_item.profissional_id, v_item.servico_id, v_ag.cliente_id,
    v_data_ref, v_base, v_recebido, v_base,
    v_regra.calculation_type, v_regra.commission_percent, v_regra.fixed_amount,
    v_valor_comissao, 'calculada', 'Comissão calculada automaticamente por procedimento.'
  )
  on conflict (agendamento_item_id) where agendamento_item_id is not null do update set
    profissional_id = excluded.profissional_id, servico_id = excluded.servico_id,
    cliente_id = excluded.cliente_id, data_referencia = excluded.data_referencia,
    valor_servico = excluded.valor_servico, valor_recebido = excluded.valor_recebido,
    base_calculo = excluded.base_calculo, calculation_type = excluded.calculation_type,
    commission_percent = excluded.commission_percent, fixed_amount = excluded.fixed_amount,
    valor_comissao = excluded.valor_comissao,
    status = case when public.comissoes_profissionais.status = 'aprovada' then 'aprovada' else 'calculada' end,
    notes = excluded.notes, updated_at = now()
  returning * into v_comissao;

  return jsonb_build_object('success', true, 'message', 'Comissão calculada com sucesso.',
    'comissao', jsonb_build_object('id', v_comissao.id, 'agendamentoId', v_comissao.agendamento_id,
      'agendamentoItemId', v_comissao.agendamento_item_id, 'profissionalId', v_comissao.profissional_id,
      'servicoId', v_comissao.servico_id, 'valorServico', v_comissao.valor_servico,
      'valorRecebido', v_comissao.valor_recebido, 'baseCalculo', v_comissao.base_calculo,
      'valorComissao', v_comissao.valor_comissao, 'status', v_comissao.status));
exception when others then
  return jsonb_build_object('success', false, 'message', 'Não foi possível calcular a comissão.', 'detail', sqlerrm);
end;
$$;

revoke all on function public.calcular_comissao_agendamento_item_admin(uuid) from public, anon;
grant execute on function public.calcular_comissao_agendamento_item_admin(uuid) to authenticated;

create or replace function public.calcular_comissao_agendamento_admin(p_agendamento_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ag public.agendamentos%rowtype;
  v_item record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_geradas integer := 0;
  v_erros integer := 0;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'message', 'Você precisa estar logado para calcular comissão.'); end if;
  if not public.is_admin() then return jsonb_build_object('success', false, 'message', 'Apenas admin pode calcular comissão.'); end if;
  select * into v_ag from public.agendamentos where id = p_agendamento_id;
  if not found then return jsonb_build_object('success', false, 'message', 'Agendamento não encontrado.'); end if;
  if v_ag.status <> 'concluido' then return jsonb_build_object('success', false, 'message', 'A comissão só pode ser calculada para atendimento concluído.'); end if;

  if exists (select 1 from public.agendamento_itens where agendamento_id = p_agendamento_id) then
    for v_item in select id from public.agendamento_itens where agendamento_id = p_agendamento_id order by ordem, id loop
      v_result := public.calcular_comissao_agendamento_item_admin(v_item.id);
      v_results := v_results || jsonb_build_array(v_result);
      if coalesce((v_result->>'success')::boolean, false) then v_geradas := v_geradas + 1; else v_erros := v_erros + 1; end if;
    end loop;
    return jsonb_build_object('success', v_erros = 0, 'message', case when v_erros = 0 then 'Comissões calculadas por procedimento.' else 'Algumas comissões não puderam ser calculadas.' end,
      'comissoesGeradas', v_geradas, 'erros', v_erros, 'items', v_results);
  end if;

  -- Agendamentos sem itens continuam usando o cálculo legado, sem backfill.
  return public.calcular_comissao_agendamento_legado_admin(p_agendamento_id);
end;
$$;

create or replace function public.gerar_comissoes_periodo_admin(
  p_data_inicio date, p_data_fim date, p_profissional_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ag_id uuid; v_result jsonb; v_total integer := 0; v_sucesso integer := 0; v_erros integer := 0; v_lista jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'message', 'Você precisa estar logado para gerar comissões.'); end if;
  if not public.is_admin() then return jsonb_build_object('success', false, 'message', 'Apenas admin pode gerar comissões.'); end if;
  if p_data_inicio is null or p_data_fim is null or p_data_fim < p_data_inicio then return jsonb_build_object('success', false, 'message', 'Período inválido.'); end if;
  for v_ag_id in
    select a.id from public.agendamentos a
    where a.status = 'concluido'
      and a.start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo')
      and a.start_at < ((p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (p_profissional_id is null or
        exists (select 1 from public.agendamento_itens ai where ai.agendamento_id = a.id and ai.profissional_id = p_profissional_id)
        or (not exists (select 1 from public.agendamento_itens ai where ai.agendamento_id = a.id) and a.profissional_id = p_profissional_id))
    order by a.start_at
  loop
    v_total := v_total + 1;
    v_result := public.calcular_comissao_agendamento_admin(v_ag_id);
    if coalesce((v_result->>'success')::boolean, false) then
      v_sucesso := v_sucesso + coalesce((v_result->>'comissoesGeradas')::integer, 1);
    else
      v_erros := v_erros + 1;
      v_lista := v_lista || jsonb_build_array(jsonb_build_object('agendamentoId', v_ag_id, 'message', v_result->>'message', 'detail', v_result->>'detail'));
    end if;
  end loop;
  return jsonb_build_object('success', true, 'message', 'Processamento de comissões finalizado.', 'totalAgendamentosConcluidos', v_total, 'comissoesGeradas', v_sucesso, 'erros', v_erros, 'errosLista', v_lista);
end;
$$;

create or replace function public.listar_comissoes_admin(
  p_data_inicio date, p_data_fim date, p_profissional_id uuid default null, p_statuses text[] default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_resumo jsonb; v_por_profissional jsonb; v_items jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'message', 'Você precisa estar logado para listar comissões.'); end if;
  if not public.is_admin() then return jsonb_build_object('success', false, 'message', 'Apenas admin pode listar comissões.'); end if;
  if p_data_inicio is null or p_data_fim is null or p_data_fim < p_data_inicio then return jsonb_build_object('success', false, 'message', 'Período inválido.'); end if;

  select jsonb_build_object('totalComissoes', count(*), 'totalCalculado', coalesce(sum(valor_comissao),0),
    'totalPendente', coalesce(sum(valor_comissao) filter(where status in ('calculada','aprovada')),0),
    'totalPago', coalesce(sum(valor_comissao) filter(where status='paga'),0),
    'totalCancelado', coalesce(sum(valor_comissao) filter(where status='cancelada'),0)) into v_resumo
  from public.comissoes_profissionais cp where cp.data_referencia between p_data_inicio and p_data_fim
    and (p_profissional_id is null or cp.profissional_id=p_profissional_id) and (p_statuses is null or cp.status=any(p_statuses));

  select coalesce(jsonb_agg(jsonb_build_object('profissionalId', profissional_id, 'profissionalNome', profissional_nome,
    'quantidade', quantidade, 'totalServicos', total_servicos, 'totalRecebido', total_recebido,
    'totalComissao', total_comissao, 'totalPago', total_pago, 'totalPendente', total_pendente) order by profissional_nome),'[]') into v_por_profissional
  from (select cp.profissional_id, p.name profissional_nome, count(*) quantidade, sum(cp.valor_servico) total_servicos,
    sum(cp.valor_recebido) total_recebido, sum(cp.valor_comissao) total_comissao,
    coalesce(sum(cp.valor_comissao) filter(where cp.status='paga'),0) total_pago,
    coalesce(sum(cp.valor_comissao) filter(where cp.status in ('calculada','aprovada')),0) total_pendente
    from public.comissoes_profissionais cp join public.profissionais p on p.id=cp.profissional_id
    where cp.data_referencia between p_data_inicio and p_data_fim and (p_profissional_id is null or cp.profissional_id=p_profissional_id)
      and (p_statuses is null or cp.status=any(p_statuses)) group by cp.profissional_id,p.name) x;

  select coalesce(jsonb_agg(jsonb_build_object('id',cp.id,'agendamentoId',cp.agendamento_id,'agendamentoItemId',cp.agendamento_item_id,
    'itemOrdem',ai.ordem,'dataReferencia',cp.data_referencia,'dataBr',to_char(a.start_at at time zone 'America/Sao_Paulo','DD/MM/YYYY'),
    'horaInicio',to_char(a.start_at at time zone 'America/Sao_Paulo','HH24:MI'),'clienteNome',c.full_name,
    'profissionalId',cp.profissional_id,'profissionalNome',p.name,'servicoId',cp.servico_id,
    'servicoNome',coalesce(ai.nome_snapshot,s.name),'servicoCategoria',coalesce(ai.categoria_snapshot,s.category),
    'valorServico',cp.valor_servico,'valorRecebido',cp.valor_recebido,'baseCalculo',cp.base_calculo,
    'calculationType',cp.calculation_type,'commissionPercent',cp.commission_percent,'fixedAmount',cp.fixed_amount,
    'valorComissao',cp.valor_comissao,'status',cp.status,'paidAt',cp.paid_at,'notes',cp.notes)
    order by cp.data_referencia,p.name,c.full_name,ai.ordem),'[]') into v_items
  from public.comissoes_profissionais cp join public.agendamentos a on a.id=cp.agendamento_id
  left join public.agendamento_itens ai on ai.id=cp.agendamento_item_id left join public.clientes c on c.id=cp.cliente_id
  join public.profissionais p on p.id=cp.profissional_id join public.servicos s on s.id=cp.servico_id
  where cp.data_referencia between p_data_inicio and p_data_fim and (p_profissional_id is null or cp.profissional_id=p_profissional_id)
    and (p_statuses is null or cp.status=any(p_statuses));
  return jsonb_build_object('success',true,'dataInicio',p_data_inicio,'dataFim',p_data_fim,'profissionalId',p_profissional_id,
    'resumo',v_resumo,'porProfissional',v_por_profissional,'items',v_items);
exception when others then return jsonb_build_object('success',false,'message','Não foi possível listar comissões.','detail',sqlerrm);
end $$;

create or replace function public.listar_meu_resumo_financeiro_profissional(p_data_inicio date,p_data_fim date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_prof uuid; v_total integer; v_receita numeric; v_recebido numeric;
  v_com_total numeric; v_com_paga numeric; v_com_pendente numeric; v_items jsonb;
begin
  if v_uid is null then return jsonb_build_object('success',false,'message','Você precisa estar logado para consultar seu financeiro.'); end if;
  if not exists(select 1 from public.profiles where id=v_uid and role='profissional') then return jsonb_build_object('success',false,'message','Este usuário não possui perfil de profissional.'); end if;
  select id into v_prof from public.profissionais where profile_id=v_uid and active limit 1;
  if v_prof is null then return jsonb_build_object('success',false,'message','Nenhuma profissional ativa vinculada ao usuário foi encontrada.'); end if;
  if p_data_inicio is null or p_data_fim is null or p_data_fim<p_data_inicio then return jsonb_build_object('success',false,'message','Período inválido.'); end if;

  with fontes as (
    select a.id agendamento_id,ai.id item_id,a.start_at,a.status,a.amount_paid,ai.valor_snapshot valor,
      case when sum(ai.valor_snapshot) over(partition by a.id)>0 then round(coalesce(a.amount_paid,0)*ai.valor_snapshot/sum(ai.valor_snapshot) over(partition by a.id),2) else 0 end recebido
    from public.agendamentos a join public.agendamento_itens ai on ai.agendamento_id=a.id where ai.profissional_id=v_prof
    union all
    select a.id,null,a.start_at,a.status,a.amount_paid,coalesce(a.total_price,0),coalesce(a.amount_paid,0)
    from public.agendamentos a where a.profissional_id=v_prof and not exists(select 1 from public.agendamento_itens ai where ai.agendamento_id=a.id)
  ) select count(distinct agendamento_id) filter(where status='concluido'),coalesce(sum(valor) filter(where status='concluido'),0),
      coalesce(sum(recebido) filter(where status in ('concluido','nao_compareceu')),0)
    into v_total,v_receita,v_recebido from fontes where start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo') and start_at < ((p_data_fim+1)::timestamp at time zone 'America/Sao_Paulo');

  select coalesce(sum(valor_comissao) filter(where status<>'cancelada'),0),coalesce(sum(valor_comissao) filter(where status='paga'),0),
    coalesce(sum(valor_comissao) filter(where status in ('calculada','aprovada')),0) into v_com_total,v_com_paga,v_com_pendente
  from public.comissoes_profissionais where profissional_id=v_prof and data_referencia between p_data_inicio and p_data_fim;

  with fontes as (
    select a.id agendamento_id,ai.id item_id,a.start_at,c.full_name cliente,ai.nome_snapshot servico,ai.valor_snapshot valor,
      case when sum(ai.valor_snapshot) over(partition by a.id)>0 then round(coalesce(a.amount_paid,0)*ai.valor_snapshot/sum(ai.valor_snapshot) over(partition by a.id),2) else 0 end recebido
    from public.agendamentos a join public.agendamento_itens ai on ai.agendamento_id=a.id left join public.clientes c on c.id=a.cliente_id
    where ai.profissional_id=v_prof and a.status in ('concluido','nao_compareceu')
    union all
    select a.id,null,a.start_at,c.full_name,s.name,coalesce(a.total_price,0),coalesce(a.amount_paid,0)
    from public.agendamentos a left join public.clientes c on c.id=a.cliente_id left join public.servicos s on s.id=a.servico_id
    where a.profissional_id=v_prof and a.status in ('concluido','nao_compareceu') and not exists(select 1 from public.agendamento_itens ai where ai.agendamento_id=a.id)
  ) select coalesce(jsonb_agg(jsonb_build_object('data',to_char(f.start_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),
      'dataBr',to_char(f.start_at at time zone 'America/Sao_Paulo','DD/MM/YYYY'),'cliente',f.cliente,'servico',f.servico,
      'valorServico',f.valor,'valorRecebido',f.recebido,'comissao',coalesce(cp.valor_comissao,0),'statusComissao',cp.status)
      order by f.start_at desc),'[]') into v_items
    from fontes f left join public.comissoes_profissionais cp on cp.profissional_id=v_prof and
      ((f.item_id is not null and cp.agendamento_item_id=f.item_id) or (f.item_id is null and cp.agendamento_id=f.agendamento_id and cp.agendamento_item_id is null))
    where f.start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo') and f.start_at < ((p_data_fim+1)::timestamp at time zone 'America/Sao_Paulo');
  return jsonb_build_object('success',true,'dataInicio',p_data_inicio,'dataFim',p_data_fim,'resumo',jsonb_build_object(
    'totalAtendimentosConcluidos',v_total,'receitaGerada',v_receita,'valorRecebido',v_recebido,'comissaoTotal',v_com_total,
    'comissaoPaga',v_com_paga,'comissaoPendente',v_com_pendente),'items',v_items);
exception when others then return jsonb_build_object('success',false,'message','Não foi possível consultar seu resumo financeiro.','detail',sqlerrm);
end $$;

revoke all on function public.calcular_comissao_agendamento_admin(uuid) from public, anon;
revoke all on function public.gerar_comissoes_periodo_admin(date,date,uuid) from public, anon;
revoke all on function public.listar_comissoes_admin(date,date,uuid,text[]) from public, anon;
revoke all on function public.listar_meu_resumo_financeiro_profissional(date,date) from public, anon;
grant execute on function public.calcular_comissao_agendamento_admin(uuid) to authenticated;
grant execute on function public.gerar_comissoes_periodo_admin(date,date,uuid) to authenticated;
grant execute on function public.listar_comissoes_admin(date,date,uuid,text[]) to authenticated;
grant execute on function public.listar_meu_resumo_financeiro_profissional(date,date) to authenticated;

commit;
