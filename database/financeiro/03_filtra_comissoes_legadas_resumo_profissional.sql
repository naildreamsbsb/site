begin;

do $$
declare
  v_definition text;
  v_old text := 'from public.comissoes_profissionais where profissional_id=v_prof and data_referencia between p_data_inicio and p_data_fim;';
  v_new text := 'from public.comissoes_profissionais cp where cp.profissional_id=v_prof and cp.data_referencia between p_data_inicio and p_data_fim'
    || E'\n    and (cp.agendamento_item_id is not null or not exists ('
    || E'\n      select 1 from public.agendamento_itens ai where ai.agendamento_id=cp.agendamento_id'
    || E'\n    ));';
begin
  select pg_get_functiondef(
    'public.listar_meu_resumo_financeiro_profissional(date,date)'::regprocedure
  ) into v_definition;

  if position('cp.agendamento_item_id is not null or not exists' in v_definition) > 0 then
    return;
  end if;

  if position(v_old in v_definition) = 0 then
    raise exception 'Trecho esperado da RPC não foi encontrado; migração cancelada.';
  end if;

  execute replace(v_definition, v_old, v_new);
end $$;

revoke all on function public.listar_meu_resumo_financeiro_profissional(date,date)
  from public, anon;
grant execute on function public.listar_meu_resumo_financeiro_profissional(date,date)
  to authenticated;

commit;
