begin;

create or replace function public.taxa_pagamento_configurada(p_payment_method text)
returns numeric language sql stable security definer set search_path=public as $$
  select case lower(trim(coalesce(p_payment_method,'')))
    when 'cartão de débito' then debit_card_fee_percent
    when 'cartao de debito' then debit_card_fee_percent
    when 'cartão de crédito' then credit_card_fee_percent
    when 'cartao de credito' then credit_card_fee_percent
    when 'pix maquininha' then pix_machine_fee_percent
    when 'pix pela maquininha' then pix_machine_fee_percent
    when 'pix máquina' then pix_machine_fee_percent
    when 'pix maquina' then pix_machine_fee_percent
    when 'pix qr code' then pix_qr_code_fee_percent
    when 'pix qr code da loja' then pix_qr_code_fee_percent
    when 'pix' then pix_qr_code_fee_percent
    else 0 end
  from public.studio_settings where id=true
$$;
revoke all on function public.taxa_pagamento_configurada(text) from public,anon,authenticated;

create or replace function public.resumo_financeiro_admin(p_data_inicio date,p_data_fim date,p_profissional_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_resumo jsonb;v_pag jsonb;v_prof jsonb;v_serv jsonb;v_items jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('success',false,'message','Você precisa estar logado para ver o resumo financeiro.');end if;
 if not public.is_admin() then return jsonb_build_object('success',false,'message','Apenas admin pode ver o resumo financeiro.');end if;
 if p_data_inicio is null or p_data_fim is null or p_data_fim<p_data_inicio then return jsonb_build_object('success',false,'message','Período inválido.');end if;
 with b as(select a.*,public.taxa_pagamento_configurada(a.payment_method) taxa_pct from public.agendamentos a where a.start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo') and a.start_at < ((p_data_fim+1)::timestamp at time zone 'America/Sao_Paulo') and (p_profissional_id is null or a.profissional_id=p_profissional_id))
 select jsonb_build_object(
  'totalAgendamentos',count(*),'totalConcluidos',count(*) filter(where status='concluido'),'totalNaoCompareceu',count(*) filter(where status='nao_compareceu'),
  'totalCanceladoCliente',count(*) filter(where status='cancelado_cliente'),'totalCanceladoStudio',count(*) filter(where status='cancelado_studio'),
  'totalSolicitados',count(*) filter(where status='solicitado'),'totalAguardandoSinal',count(*) filter(where status='aguardando_sinal'),
  'totalConfirmados',count(*) filter(where status='confirmado'),'totalReagendamentoSolicitado',count(*) filter(where status='reagendamento_solicitado'),
  'receitaBrutaConcluida',coalesce(sum(total_price) filter(where status='concluido'),0),
  'totalRecebido',coalesce(sum(amount_paid) filter(where payment_status='pago'),0),
  'totalTaxasPagamento',coalesce(sum(ceil(amount_paid*taxa_pct)/100) filter(where payment_status='pago'),0),
  'totalRecebidoLiquido',coalesce(sum(amount_paid-ceil(amount_paid*taxa_pct)/100) filter(where payment_status='pago'),0),
  'totalPendentePagamento',coalesce(sum(total_price) filter(where status='concluido' and payment_status<>'pago'),0),
  'totalSinalPendente',coalesce(sum(deposit_amount) filter(where requires_deposit and deposit_status='pendente' and status in('solicitado','aguardando_sinal','confirmado','reagendamento_solicitado')),0),
  'ticketMedioConcluido',coalesce(round(avg(total_price) filter(where status='concluido'),2),0)) into v_resumo from b;

 with b as(select coalesce(nullif(a.payment_method,''),'Não informado') forma,a.amount_paid,public.taxa_pagamento_configurada(a.payment_method) pct from public.agendamentos a where a.start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo') and a.start_at < ((p_data_fim+1)::timestamp at time zone 'America/Sao_Paulo') and (p_profissional_id is null or a.profissional_id=p_profissional_id) and a.payment_status='pago')
 select coalesce(jsonb_agg(jsonb_build_object('formaPagamento',forma,'quantidade',qtd,'taxaPercentual',pct,'totalRecebido',bruto,'totalTaxasPagamento',taxas,'totalRecebidoLiquido',bruto-taxas) order by forma),'[]') into v_pag
 from(select forma,pct,count(*) qtd,sum(amount_paid) bruto,sum(ceil(amount_paid*pct)/100) taxas from b group by forma,pct)x;

 with b as(select a.*,p.name profissional_nome,public.taxa_pagamento_configurada(a.payment_method) pct from public.agendamentos a join public.profissionais p on p.id=a.profissional_id where a.start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo') and a.start_at < ((p_data_fim+1)::timestamp at time zone 'America/Sao_Paulo') and (p_profissional_id is null or a.profissional_id=p_profissional_id))
 select coalesce(jsonb_agg(jsonb_build_object('profissionalId',profissional_id,'profissionalNome',profissional_nome,'totalAgendamentos',qtd,'totalConcluidos',concluidos,'totalNaoCompareceu',faltas,'totalCancelados',cancelados,'receitaBrutaConcluida',receita,'totalRecebido',bruto,'totalTaxasPagamento',taxas,'totalRecebidoLiquido',bruto-taxas,'totalPendentePagamento',pendente) order by profissional_nome),'[]') into v_prof
 from(select profissional_id,profissional_nome,count(*) qtd,count(*)filter(where status='concluido')concluidos,count(*)filter(where status='nao_compareceu')faltas,count(*)filter(where status in('cancelado_cliente','cancelado_studio'))cancelados,coalesce(sum(total_price)filter(where status='concluido'),0)receita,coalesce(sum(amount_paid)filter(where payment_status='pago'),0)bruto,coalesce(sum(ceil(amount_paid*pct)/100)filter(where payment_status='pago'),0)taxas,coalesce(sum(total_price)filter(where status='concluido' and payment_status<>'pago'),0)pendente from b group by profissional_id,profissional_nome)x;

 with b as(select a.*,s.name servico_nome,s.category servico_categoria,public.taxa_pagamento_configurada(a.payment_method)pct from public.agendamentos a join public.servicos s on s.id=a.servico_id where a.start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo') and a.start_at < ((p_data_fim+1)::timestamp at time zone 'America/Sao_Paulo') and (p_profissional_id is null or a.profissional_id=p_profissional_id))
 select coalesce(jsonb_agg(jsonb_build_object('servicoId',servico_id,'servicoNome',servico_nome,'servicoCategoria',servico_categoria,'totalAgendamentos',qtd,'totalConcluidos',concluidos,'receitaBrutaConcluida',receita,'totalRecebido',bruto,'totalTaxasPagamento',taxas,'totalRecebidoLiquido',bruto-taxas,'totalPendentePagamento',pendente) order by servico_categoria,servico_nome),'[]') into v_serv
 from(select servico_id,servico_nome,servico_categoria,count(*)qtd,count(*)filter(where status='concluido')concluidos,coalesce(sum(total_price)filter(where status='concluido'),0)receita,coalesce(sum(amount_paid)filter(where payment_status='pago'),0)bruto,coalesce(sum(ceil(amount_paid*pct)/100)filter(where payment_status='pago'),0)taxas,coalesce(sum(total_price)filter(where status='concluido' and payment_status<>'pago'),0)pendente from b group by servico_id,servico_nome,servico_categoria)x;

 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'clienteNome',c.full_name,'profissionalId',a.profissional_id,'profissionalNome',p.name,'servicoId',a.servico_id,'servicoNome',s.name,'servicoCategoria',s.category,'startAt',a.start_at,'endAt',a.end_at,'dataBr',to_char(a.start_at at time zone 'America/Sao_Paulo','DD/MM/YYYY'),'horaInicio',to_char(a.start_at at time zone 'America/Sao_Paulo','HH24:MI'),'horaFim',to_char(a.end_at at time zone 'America/Sao_Paulo','HH24:MI'),'status',a.status,'totalPrice',a.total_price,'amountPaid',case when a.payment_status='pago' then a.amount_paid else 0 end,'amountRegistered',a.amount_paid,'paymentStatus',a.payment_status,'paymentMethod',a.payment_method,'paymentFeePercent',case when a.payment_status='pago' then public.taxa_pagamento_configurada(a.payment_method) else 0 end,'paymentFeeAmount',case when a.payment_status='pago' then ceil(a.amount_paid*public.taxa_pagamento_configurada(a.payment_method))/100 else 0 end,'netAmountReceived',case when a.payment_status='pago' then a.amount_paid-ceil(a.amount_paid*public.taxa_pagamento_configurada(a.payment_method))/100 else 0 end,'pendingAmount',case when a.status='concluido' and a.payment_status<>'pago' then a.total_price else 0 end) order by a.start_at),'[]') into v_items
 from public.agendamentos a join public.clientes c on c.id=a.cliente_id join public.profissionais p on p.id=a.profissional_id join public.servicos s on s.id=a.servico_id where a.start_at >= (p_data_inicio::timestamp at time zone 'America/Sao_Paulo') and a.start_at < ((p_data_fim+1)::timestamp at time zone 'America/Sao_Paulo') and (p_profissional_id is null or a.profissional_id=p_profissional_id) and a.status in('concluido','nao_compareceu','cancelado_cliente','cancelado_studio');
 return jsonb_build_object('success',true,'dataInicio',p_data_inicio,'dataFim',p_data_fim,'profissionalId',p_profissional_id,'resumo',v_resumo,'porPagamento',v_pag,'porProfissional',v_prof,'porServico',v_serv,'items',v_items);
exception when others then return jsonb_build_object('success',false,'message','Não foi possível gerar o resumo financeiro.','detail',sqlerrm);end $$;

revoke all on function public.resumo_financeiro_admin(date,date,uuid) from public,anon;
grant execute on function public.resumo_financeiro_admin(date,date,uuid) to authenticated;

create or replace function public.listar_meu_resumo_financeiro_profissional(p_data_inicio date,p_data_fim date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid();v_prof uuid;v_total integer;v_receita numeric;v_bruto numeric;v_taxas numeric;v_liquido numeric;v_pendente_pag numeric;v_com_total numeric;v_com_paga numeric;v_com_pendente numeric;v_items jsonb;
begin
 if v_uid is null then return jsonb_build_object('success',false,'message','Você precisa estar logado para consultar seu financeiro.');end if;
 if not exists(select 1 from public.profiles where id=v_uid and role='profissional')then return jsonb_build_object('success',false,'message','Este usuário não possui perfil de profissional.');end if;
 select id into v_prof from public.profissionais where profile_id=v_uid and active limit 1;
 if v_prof is null then return jsonb_build_object('success',false,'message','Nenhuma profissional ativa vinculada ao usuário foi encontrada.');end if;
 if p_data_inicio is null or p_data_fim is null or p_data_fim<p_data_inicio then return jsonb_build_object('success',false,'message','Período inválido.');end if;
 with fontes as(
  select a.id agendamento_id,ai.id item_id,a.start_at,a.status,a.payment_status,a.payment_method,ai.valor_snapshot valor,
   case when a.payment_status='pago' then coalesce(cpi.valor_recebido,case when sum(ai.valor_snapshot)over(partition by a.id)>0 then round(a.amount_paid*ai.valor_snapshot/sum(ai.valor_snapshot)over(partition by a.id),2)else 0 end)else 0 end recebido
  from public.agendamentos a join public.agendamento_itens ai on ai.agendamento_id=a.id left join public.comissoes_profissionais cpi on cpi.agendamento_item_id=ai.id where ai.profissional_id=v_prof
  union all
  select a.id,null,a.start_at,a.status,a.payment_status,a.payment_method,coalesce(a.total_price,0),case when a.payment_status='pago'then coalesce(a.amount_paid,0)else 0 end
  from public.agendamentos a where a.profissional_id=v_prof and not exists(select 1 from public.agendamento_itens ai where ai.agendamento_id=a.id)
 )select count(distinct agendamento_id)filter(where status='concluido'),coalesce(sum(valor)filter(where status='concluido'),0),coalesce(sum(recebido),0),coalesce(sum(ceil(recebido*public.taxa_pagamento_configurada(payment_method))/100),0),coalesce(sum(valor)filter(where status='concluido' and payment_status<>'pago'),0)
 into v_total,v_receita,v_bruto,v_taxas,v_pendente_pag from fontes where start_at >=(p_data_inicio::timestamp at time zone 'America/Sao_Paulo')and start_at<((p_data_fim+1)::timestamp at time zone 'America/Sao_Paulo');
 v_liquido:=v_bruto-v_taxas;
 select coalesce(sum(valor_comissao)filter(where status<>'cancelada'),0),coalesce(sum(valor_comissao)filter(where status='paga'),0),coalesce(sum(valor_comissao)filter(where status in('calculada','aprovada')),0)into v_com_total,v_com_paga,v_com_pendente
 from public.comissoes_profissionais cp where cp.profissional_id=v_prof and cp.data_referencia between p_data_inicio and p_data_fim and(cp.agendamento_item_id is not null or not exists(select 1 from public.agendamento_itens ai where ai.agendamento_id=cp.agendamento_id));
 with fontes as(
  select a.id agendamento_id,ai.id item_id,a.start_at,a.payment_status,a.payment_method,c.full_name cliente,ai.nome_snapshot servico,ai.valor_snapshot valor,
   case when a.payment_status='pago'then coalesce(cpi.valor_recebido,case when sum(ai.valor_snapshot)over(partition by a.id)>0 then round(a.amount_paid*ai.valor_snapshot/sum(ai.valor_snapshot)over(partition by a.id),2)else 0 end)else 0 end recebido
  from public.agendamentos a join public.agendamento_itens ai on ai.agendamento_id=a.id left join public.comissoes_profissionais cpi on cpi.agendamento_item_id=ai.id left join public.clientes c on c.id=a.cliente_id where ai.profissional_id=v_prof and a.status in('concluido','nao_compareceu')
  union all
  select a.id,null,a.start_at,a.payment_status,a.payment_method,c.full_name,s.name,coalesce(a.total_price,0),case when a.payment_status='pago'then coalesce(a.amount_paid,0)else 0 end
  from public.agendamentos a left join public.clientes c on c.id=a.cliente_id left join public.servicos s on s.id=a.servico_id where a.profissional_id=v_prof and a.status in('concluido','nao_compareceu')and not exists(select 1 from public.agendamento_itens ai where ai.agendamento_id=a.id)
 )select coalesce(jsonb_agg(jsonb_build_object('data',to_char(f.start_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'dataBr',to_char(f.start_at at time zone 'America/Sao_Paulo','DD/MM/YYYY'),'cliente',f.cliente,'servico',f.servico,'valorServico',f.valor,'valorRecebido',f.recebido,'taxaPagamento',ceil(f.recebido*public.taxa_pagamento_configurada(f.payment_method))/100,'valorLiquidoRecebido',f.recebido-ceil(f.recebido*public.taxa_pagamento_configurada(f.payment_method))/100,'valorPendente',case when f.payment_status<>'pago'then f.valor else 0 end,'paymentStatus',f.payment_status,'paymentMethod',f.payment_method,'comissao',coalesce(cp.valor_comissao,0),'statusComissao',cp.status)order by f.start_at desc),'[]')into v_items
 from fontes f left join public.comissoes_profissionais cp on cp.profissional_id=v_prof and((f.item_id is not null and cp.agendamento_item_id=f.item_id)or(f.item_id is null and cp.agendamento_id=f.agendamento_id and cp.agendamento_item_id is null))where f.start_at >=(p_data_inicio::timestamp at time zone 'America/Sao_Paulo')and f.start_at<((p_data_fim+1)::timestamp at time zone 'America/Sao_Paulo');
 return jsonb_build_object('success',true,'dataInicio',p_data_inicio,'dataFim',p_data_fim,'resumo',jsonb_build_object('totalAtendimentosConcluidos',v_total,'receitaGerada',v_receita,'valorRecebido',v_bruto,'taxasPagamento',v_taxas,'valorLiquidoRecebido',v_liquido,'valorPendente',v_pendente_pag,'comissaoTotal',v_com_total,'comissaoPaga',v_com_paga,'comissaoPendente',v_com_pendente),'items',v_items);
exception when others then return jsonb_build_object('success',false,'message','Não foi possível consultar seu resumo financeiro.','detail',sqlerrm);end $$;
revoke all on function public.listar_meu_resumo_financeiro_profissional(date,date) from public,anon;
grant execute on function public.listar_meu_resumo_financeiro_profissional(date,date) to authenticated;

commit;
