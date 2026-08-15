begin;

do $$
declare
  v_definition text;
  v_old_calculo text;
  v_new_calculo text;
begin
  select pg_get_functiondef(
    'public.calcular_comissao_agendamento_item_admin(uuid)'::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');

  if position('v_notes text;' in v_definition) = 0 then
    v_definition := replace(v_definition, '  v_valor_comissao numeric;',
      E'  v_valor_comissao numeric;\n  v_notes text;');
  end if;

  v_old_calculo := E'  -- A comissão usa sempre o valor integral do procedimento, nunca amount_paid.\n'
    || E'  v_base := coalesce(v_item.valor_snapshot, 0);\n'
    || E'  if v_regra.calculation_type = ''percentual'' then\n'
    || E'    v_valor_comissao := round(v_base * v_regra.commission_percent / 100, 2);\n'
    || E'  else\n'
    || E'    v_valor_comissao := v_regra.fixed_amount;\n'
    || E'  end if;\n\n';
  v_definition := replace(v_definition, v_old_calculo, '');

  v_new_calculo := E'  -- A parcela recebida é a base da comissão do item.\n'
    || E'  v_base := greatest(coalesce(v_recebido, 0), 0);\n'
    || E'  if v_base = 0 then\n'
    || E'    v_valor_comissao := 0;\n'
    || E'    v_notes := ''Comissão não gerada: atendimento sem pagamento recebido.'';\n'
    || E'  elsif v_regra.calculation_type = ''percentual'' then\n'
    || E'    v_valor_comissao := round(v_base * v_regra.commission_percent / 100, 2);\n'
    || E'    v_notes := ''Comissão calculada automaticamente sobre o valor recebido do procedimento.'';\n'
    || E'  else\n'
    || E'    v_valor_comissao := v_regra.fixed_amount;\n'
    || E'    v_notes := ''Comissão fixa calculada automaticamente para procedimento com pagamento recebido.'';\n'
    || E'  end if;\n\n'
    || E'  insert into public.comissoes_profissionais (';
  v_definition := replace(v_definition,
    E'  insert into public.comissoes_profissionais (', v_new_calculo);
  v_definition := replace(v_definition,
    '''Comissão calculada automaticamente por procedimento.''', 'v_notes');

  if position('v_base := greatest(coalesce(v_recebido, 0), 0)' in v_definition) = 0 then
    raise exception 'Não foi possível atualizar o cálculo por item.';
  end if;
  execute v_definition;
end $$;

do $$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.calcular_comissao_agendamento_legado_admin(uuid)'::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');

  v_old := E'  v_base_calculo := coalesce(v_ag.amount_paid, 0);\n\n'
    || E'  if v_ag.payment_status in (''cortesia'', ''nao_cobrado'', ''cancelado'') then\n'
    || E'    v_base_calculo := 0;\n'
    || E'  end if;';
  v_new := E'  -- O valor efetivamente recebido é sempre a base da comissão.\n'
    || E'  v_base_calculo := greatest(coalesce(v_ag.amount_paid, 0), 0);';
  v_definition := replace(v_definition, v_old, v_new);

  v_definition := replace(v_definition,
    '''Comissão calculada automaticamente.''',
    E'case when v_base_calculo = 0\n'
      || E'      then ''Comissão não gerada: atendimento sem pagamento recebido.''\n'
      || E'      else ''Comissão calculada automaticamente sobre o valor recebido.''\n'
      || E'    end');

  v_definition := replace(v_definition,
    E'  if v_regra.calculation_type = ''percentual'' then\n'
      || E'    v_valor_comissao := round(\n'
      || E'      v_base_calculo * v_regra.commission_percent / 100,\n'
      || E'      2\n'
      || E'    );\n'
      || E'  else\n'
      || E'    v_valor_comissao := v_regra.fixed_amount;\n'
      || E'  end if;',
    E'  if v_base_calculo = 0 then\n'
      || E'    v_valor_comissao := 0;\n'
      || E'  elsif v_regra.calculation_type = ''percentual'' then\n'
      || E'    v_valor_comissao := round(v_base_calculo * v_regra.commission_percent / 100, 2);\n'
      || E'  else\n'
      || E'    v_valor_comissao := v_regra.fixed_amount;\n'
      || E'  end if;');

  if position('v_base_calculo := greatest(coalesce(v_ag.amount_paid, 0), 0)' in v_definition) = 0 then
    raise exception 'Não foi possível atualizar o cálculo legado.';
  end if;
  execute v_definition;
end $$;

-- O resumo usa a parcela recebida já consolidada na comissão quando disponível,
-- evitando divergência de centavos no rateio proporcional.
do $$
declare v_definition text;
begin
  select pg_get_functiondef(
    'public.listar_meu_resumo_financeiro_profissional(date,date)'::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_definition := replace(v_definition,
    'case when sum(ai.valor_snapshot) over(partition by a.id)>0 then round(coalesce(a.amount_paid,0)*ai.valor_snapshot/sum(ai.valor_snapshot) over(partition by a.id),2) else 0 end recebido',
    'coalesce(cpi.valor_recebido, case when sum(ai.valor_snapshot) over(partition by a.id)>0 then round(coalesce(a.amount_paid,0)*ai.valor_snapshot/sum(ai.valor_snapshot) over(partition by a.id),2) else 0 end) recebido');
  v_definition := replace(v_definition,
    'from public.agendamentos a join public.agendamento_itens ai on ai.agendamento_id=a.id where ai.profissional_id=v_prof',
    'from public.agendamentos a join public.agendamento_itens ai on ai.agendamento_id=a.id left join public.comissoes_profissionais cpi on cpi.agendamento_item_id=ai.id where ai.profissional_id=v_prof');
  v_definition := replace(v_definition,
    'from public.agendamentos a join public.agendamento_itens ai on ai.agendamento_id=a.id left join public.clientes c on c.id=a.cliente_id',
    'from public.agendamentos a join public.agendamento_itens ai on ai.agendamento_id=a.id left join public.comissoes_profissionais cpi on cpi.agendamento_item_id=ai.id left join public.clientes c on c.id=a.cliente_id');
  execute v_definition;
end $$;

revoke all on function public.calcular_comissao_agendamento_item_admin(uuid) from public, anon;
revoke all on function public.calcular_comissao_agendamento_legado_admin(uuid) from public, anon;
revoke all on function public.listar_meu_resumo_financeiro_profissional(date,date) from public, anon;
grant execute on function public.calcular_comissao_agendamento_item_admin(uuid) to authenticated;
grant execute on function public.listar_meu_resumo_financeiro_profissional(date,date) to authenticated;

commit;
