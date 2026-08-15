begin;

create or replace function public.reprocessar_comissoes_periodo_admin(
  p_data_inicio date,
  p_data_fim date,
  p_profissional_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agendamento record;
  v_item record;
  v_result jsonb;
  v_excluidas integer := 0;
  v_geradas integer := 0;
  v_preservadas integer := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'message', 'Você precisa estar logado.');
  end if;
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'message', 'Apenas admin pode reprocessar comissões.');
  end if;
  if p_data_inicio is null or p_data_fim is null or p_data_fim < p_data_inicio then
    return jsonb_build_object('success', false, 'message', 'Período inválido.');
  end if;
  if p_profissional_id is null or not exists (
    select 1 from public.profissionais where id = p_profissional_id
  ) then
    return jsonb_build_object('success', false, 'message', 'Profissional inválida.');
  end if;

  select count(*) into v_preservadas
  from public.comissoes_profissionais cp
  join public.agendamentos a on a.id = cp.agendamento_id
  where cp.profissional_id = p_profissional_id
    and a.start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo')
    and a.start_at < ((p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
    and (cp.manual_override is true or cp.paid_at is not null or cp.status = 'paga');

  delete from public.comissoes_profissionais cp
  using public.agendamentos a
  where a.id = cp.agendamento_id
    and cp.profissional_id = p_profissional_id
    and a.start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo')
    and a.start_at < ((p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
    and cp.manual_override = false
    and cp.paid_at is null
    and cp.status <> 'paga';
  get diagnostics v_excluidas = row_count;

  for v_agendamento in
    select a.id,
           exists(select 1 from public.agendamento_itens ai where ai.agendamento_id = a.id) as possui_itens
    from public.agendamentos a
    where a.status = 'concluido'
      and a.start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo')
      and a.start_at < ((p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (
        exists (
          select 1 from public.agendamento_itens ai
          where ai.agendamento_id = a.id and ai.profissional_id = p_profissional_id
        )
        or (
          not exists(select 1 from public.agendamento_itens ai where ai.agendamento_id = a.id)
          and a.profissional_id = p_profissional_id
        )
      )
    order by a.start_at, a.id
  loop
    if v_agendamento.possui_itens then
      for v_item in
        select ai.id
        from public.agendamento_itens ai
        where ai.agendamento_id = v_agendamento.id
          and ai.profissional_id = p_profissional_id
        order by ai.ordem, ai.id
      loop
        v_result := public.calcular_comissao_agendamento_item_admin(v_item.id);
        if not coalesce((v_result->>'success')::boolean, false) then
          raise exception 'Falha ao recalcular item %: %', v_item.id,
            coalesce(v_result->>'message', 'erro desconhecido')
            using detail = v_result->>'detail';
        end if;
        if not coalesce((v_result->>'skipped')::boolean, false) then
          v_geradas := v_geradas + 1;
        end if;
      end loop;
    else
      v_result := public.calcular_comissao_agendamento_legado_admin(v_agendamento.id);
      if not coalesce((v_result->>'success')::boolean, false) then
        raise exception 'Falha ao recalcular agendamento %: %', v_agendamento.id,
          coalesce(v_result->>'message', 'erro desconhecido')
          using detail = v_result->>'detail';
      end if;
      if not coalesce((v_result->>'skipped')::boolean, false) then
        v_geradas := v_geradas + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'dataInicio', p_data_inicio,
    'dataFim', p_data_fim,
    'profissionalId', p_profissional_id,
    'comissoesExcluidas', v_excluidas,
    'comissoesGeradas', v_geradas,
    'comissoesProtegidas', v_preservadas
  );
exception
  when others then
    return jsonb_build_object(
      'success', false,
      'message', 'O reprocessamento foi cancelado sem alterações.',
      'detail', sqlerrm
    );
end;
$$;

revoke all on function public.reprocessar_comissoes_periodo_admin(date,date,uuid)
  from public, anon;
grant execute on function public.reprocessar_comissoes_periodo_admin(date,date,uuid)
  to authenticated;

commit;
