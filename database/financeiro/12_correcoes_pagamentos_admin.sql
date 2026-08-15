begin;

create table if not exists public.pagamentos_correcoes(
 id uuid primary key default gen_random_uuid(),
 agendamento_id uuid not null references public.agendamentos(id) on delete restrict,
 valor_anterior numeric(10,2) not null,
 valor_novo numeric(10,2) not null,
 forma_anterior text,
 forma_nova text not null,
 taxa_anterior numeric(10,2) not null default 0,
 taxa_nova numeric(10,2) not null default 0,
 usuario_id uuid not null references public.profiles(id) on delete restrict,
 motivo text not null check(length(trim(motivo))>=5),
 created_at timestamptz not null default now(),
 constraint pagamentos_correcoes_valores_check check(valor_anterior>=0 and valor_novo>=0 and taxa_anterior>=0 and taxa_nova>=0)
);
create index if not exists idx_pagamentos_correcoes_agendamento on public.pagamentos_correcoes(agendamento_id,created_at desc);
alter table public.pagamentos_correcoes enable row level security;
drop policy if exists "Admin can view payment corrections" on public.pagamentos_correcoes;
create policy "Admin can view payment corrections" on public.pagamentos_correcoes for select to authenticated using((select public.is_admin()));
revoke all on table public.pagamentos_correcoes from public,anon,authenticated;
grant select on table public.pagamentos_correcoes to authenticated;

create or replace function public.corrigir_pagamento_admin(p_agendamento_id uuid,p_valor_recebido numeric,p_forma_pagamento text,p_motivo text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid();v_ag public.agendamentos%rowtype;v_forma text;v_taxa_ant numeric;v_taxa_nova numeric;v_status text;
begin
 if v_uid is null or not public.is_admin() then return jsonb_build_object('success',false,'message','Apenas admin pode corrigir pagamentos.');end if;
 if p_valor_recebido is null or p_valor_recebido<0 then return jsonb_build_object('success',false,'message','Informe um valor recebido válido.');end if;
 if p_motivo is null or length(trim(p_motivo))<5 then return jsonb_build_object('success',false,'message','Informe o motivo da correção.');end if;
 v_forma:=case lower(trim(coalesce(p_forma_pagamento,'')))
  when 'dinheiro' then 'Dinheiro' when 'cartão débito' then 'Cartão de débito' when 'cartao debito' then 'Cartão de débito' when 'cartão de débito' then 'Cartão de débito'
  when 'cartão crédito' then 'Cartão de crédito' when 'cartao credito' then 'Cartão de crédito' when 'cartão de crédito' then 'Cartão de crédito'
  when 'pix maquininha' then 'Pix pela maquininha' when 'pix pela maquininha' then 'Pix pela maquininha'
  when 'pix qr code' then 'Pix QR Code da loja' when 'pix qr code da loja' then 'Pix QR Code da loja' else null end;
 if v_forma is null then return jsonb_build_object('success',false,'message','Forma de pagamento inválida.');end if;
 select * into v_ag from public.agendamentos where id=p_agendamento_id for update;
 if not found then return jsonb_build_object('success',false,'message','Atendimento não encontrado.');end if;
 if v_ag.status<>'concluido' then return jsonb_build_object('success',false,'message','Somente atendimentos concluídos podem ter o pagamento corrigido.');end if;
 v_taxa_ant:=case when v_ag.payment_status='pago' then ceil(coalesce(v_ag.amount_paid,0)*public.taxa_pagamento_configurada(v_ag.payment_method))/100 else 0 end;
 v_status:=case when p_valor_recebido>0 then 'pago' else 'pendente' end;
 v_taxa_nova:=case when v_status='pago' then ceil(p_valor_recebido*public.taxa_pagamento_configurada(v_forma))/100 else 0 end;
 update public.agendamentos set amount_paid=round(p_valor_recebido,2),payment_method=v_forma,payment_status=v_status where id=v_ag.id;
 insert into public.pagamentos_correcoes(agendamento_id,valor_anterior,valor_novo,forma_anterior,forma_nova,taxa_anterior,taxa_nova,usuario_id,motivo)
 values(v_ag.id,coalesce(v_ag.amount_paid,0),round(p_valor_recebido,2),v_ag.payment_method,v_forma,v_taxa_ant,v_taxa_nova,v_uid,trim(p_motivo));
 return jsonb_build_object('success',true,'message','Pagamento corrigido com sucesso. A comissão não foi alterada.','pagamento',jsonb_build_object('agendamentoId',v_ag.id,'valorRecebido',round(p_valor_recebido,2),'formaPagamento',v_forma,'paymentStatus',v_status,'taxaAplicada',v_taxa_nova,'valorLiquido',round(p_valor_recebido,2)-v_taxa_nova));
exception when others then return jsonb_build_object('success',false,'message','Não foi possível corrigir o pagamento.','detail',sqlerrm);end $$;
revoke all on function public.corrigir_pagamento_admin(uuid,numeric,text,text) from public,anon;
grant execute on function public.corrigir_pagamento_admin(uuid,numeric,text,text) to authenticated;

commit;
