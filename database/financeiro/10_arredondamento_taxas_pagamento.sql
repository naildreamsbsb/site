begin;

do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.resumo_financeiro_admin(date,date,uuid)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'round(amount_paid * taxa_pct / 100, 2)','ceil(amount_paid * taxa_pct) / 100');
  v_definition:=replace(v_definition,'round(amount_paid * pct / 100, 2)','ceil(amount_paid * pct) / 100');
  v_definition:=replace(v_definition,'round(a.amount_paid * public.taxa_pagamento_configurada(a.payment_method) / 100, 2)','ceil(a.amount_paid * public.taxa_pagamento_configurada(a.payment_method)) / 100');
  execute v_definition;
  select pg_get_functiondef('public.listar_meu_resumo_financeiro_profissional(date,date)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'round(recebido * public.taxa_pagamento_configurada(payment_method) / 100, 2)','ceil(recebido * public.taxa_pagamento_configurada(payment_method)) / 100');
  v_definition:=replace(v_definition,'round(f.recebido * public.taxa_pagamento_configurada(f.payment_method) / 100, 2)','ceil(f.recebido * public.taxa_pagamento_configurada(f.payment_method)) / 100');
  execute v_definition;
end $$;

commit;
