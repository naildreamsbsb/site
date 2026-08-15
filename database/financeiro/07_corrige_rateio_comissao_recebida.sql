begin;

do $$
declare v_definition text;
begin
  select pg_get_functiondef(
    'public.calcular_comissao_agendamento_item_admin(uuid)'::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition,
    'coalesce(v_ag.amount_paid, 0) * v_base / v_total_itens',
    'coalesce(v_ag.amount_paid, 0) * coalesce(v_item.valor_snapshot, 0) / v_total_itens');
  execute v_definition;
end $$;

-- Evita mascarar a mensagem original quando a função chamada não retorna detail.
do $$
declare v_definition text;
begin
  select pg_get_functiondef(
    'public.marcar_agendamento_concluido_staff(uuid,numeric,text,text,text,text)'::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition,
    'using detail = v_comissao_result->>''detail'';',
    'using detail = coalesce(v_comissao_result->>''detail'', v_comissao_result->>''message'', ''Falha ao gerar comissão.'');');
  execute v_definition;
end $$;

revoke all on function public.calcular_comissao_agendamento_item_admin(uuid) from public, anon;
revoke all on function public.marcar_agendamento_concluido_staff(uuid,numeric,text,text,text,text) from public, anon;
grant execute on function public.calcular_comissao_agendamento_item_admin(uuid) to authenticated;
grant execute on function public.marcar_agendamento_concluido_staff(uuid,numeric,text,text,text,text) to authenticated;

commit;
