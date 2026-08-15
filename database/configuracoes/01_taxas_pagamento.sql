begin;

alter table public.studio_settings
  add column if not exists debit_card_fee_percent numeric(5,2) not null default 1.61,
  add column if not exists credit_card_fee_percent numeric(5,2) not null default 3.51,
  add column if not exists pix_machine_fee_percent numeric(5,2) not null default 0.50,
  add column if not exists pix_qr_code_fee_percent numeric(5,2) not null default 0.00;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.studio_settings'::regclass
      and conname = 'studio_settings_payment_fees_check'
  ) then
    alter table public.studio_settings
      add constraint studio_settings_payment_fees_check check (
        debit_card_fee_percent between 0 and 100
        and credit_card_fee_percent between 0 and 100
        and pix_machine_fee_percent between 0 and 100
        and pix_qr_code_fee_percent between 0 and 100
      );
  end if;
end $$;

comment on column public.studio_settings.debit_card_fee_percent is
  'Taxa percentual configurada para pagamentos em cartão de débito.';
comment on column public.studio_settings.credit_card_fee_percent is
  'Taxa percentual configurada para pagamentos em cartão de crédito.';
comment on column public.studio_settings.pix_machine_fee_percent is
  'Taxa percentual configurada para Pix realizado pela maquininha.';
comment on column public.studio_settings.pix_qr_code_fee_percent is
  'Taxa percentual configurada para Pix via QR Code da loja.';

commit;
