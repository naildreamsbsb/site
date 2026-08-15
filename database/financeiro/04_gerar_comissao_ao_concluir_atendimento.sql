begin;

-- As rotinas continuam protegidas para usuários internos. A recepção precisa
-- poder acioná-las indiretamente ao concluir um atendimento.
do $$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.calcular_comissao_agendamento_admin(uuid)'::regprocedure,
    'public.calcular_comissao_agendamento_item_admin(uuid)'::regprocedure,
    'public.calcular_comissao_agendamento_legado_admin(uuid)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_definition := replace(
      v_definition,
      'if not public.is_admin() then',
      'if not public.is_staff() then'
    );
    v_definition := replace(
      v_definition,
      'Apenas admin pode calcular comissão.',
      'Apenas usuários internos podem calcular comissão.'
    );
    execute v_definition;
  end loop;
end $$;

do $$
declare
  v_definition text;
  v_declaration_old text := '  v_payment_status text;';
  v_declaration_new text := v_declaration_old || E'\n  v_comissao_result jsonb;';
  v_return_old text := E'  where id = p_agendamento_id\n  returning *\n  into v_ag;\n\n  return jsonb_build_object(';
  v_return_new text := E'  where id = p_agendamento_id\n  returning *\n  into v_ag;\n\n'
    || E'  v_comissao_result := public.calcular_comissao_agendamento_admin(v_ag.id);\n\n'
    || E'  if not coalesce((v_comissao_result->>''success'')::boolean, false) then\n'
    || E'    raise exception ''Falha ao gerar comissão: %'', coalesce(v_comissao_result->>''message'', ''erro desconhecido'')\n'
    || E'      using detail = v_comissao_result->>''detail'';\n'
    || E'  end if;\n\n'
    || E'  return jsonb_build_object(';
begin
  select pg_get_functiondef(
    'public.marcar_agendamento_concluido_staff(uuid,numeric,text,text,text,text)'::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');

  if position('v_comissao_result := public.calcular_comissao_agendamento_admin' in v_definition) = 0 then
    if position(v_declaration_old in v_definition) = 0
       or position(v_return_old in v_definition) = 0 then
      raise exception 'Trecho esperado de marcar_agendamento_concluido_staff não encontrado.';
    end if;

    v_definition := replace(v_definition, v_declaration_old, v_declaration_new);
    v_definition := replace(v_definition, v_return_old, v_return_new);
    execute v_definition;
  end if;
end $$;

revoke all on function public.calcular_comissao_agendamento_admin(uuid) from public, anon;
revoke all on function public.calcular_comissao_agendamento_item_admin(uuid) from public, anon;
revoke all on function public.calcular_comissao_agendamento_legado_admin(uuid) from public, anon;
revoke all on function public.marcar_agendamento_concluido_staff(uuid,numeric,text,text,text,text) from public, anon;

grant execute on function public.calcular_comissao_agendamento_admin(uuid) to authenticated;
grant execute on function public.calcular_comissao_agendamento_item_admin(uuid) to authenticated;
grant execute on function public.marcar_agendamento_concluido_staff(uuid,numeric,text,text,text,text) to authenticated;

commit;
