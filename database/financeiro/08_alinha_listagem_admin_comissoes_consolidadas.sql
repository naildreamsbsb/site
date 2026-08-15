begin;

do $$
declare
  v_definition text;
  v_old text := 'and (p_statuses is null or cp.status=any(p_statuses))';
  v_new text := v_old
    || E'\n    and (cp.agendamento_item_id is not null or not exists ('
    || E'\n      select 1 from public.agendamento_itens ai_existente'
    || E'\n      where ai_existente.agendamento_id = cp.agendamento_id'
    || E'\n    ))';
begin
  select pg_get_functiondef(
    'public.listar_comissoes_admin(date,date,uuid,text[])'::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');

  if position('ai_existente.agendamento_id = cp.agendamento_id' in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then
      raise exception 'Filtro esperado de listar_comissoes_admin não encontrado.';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
    execute v_definition;
  end if;
end $$;

revoke all on function public.listar_comissoes_admin(date,date,uuid,text[])
  from public, anon;
grant execute on function public.listar_comissoes_admin(date,date,uuid,text[])
  to authenticated;

commit;
