/*
=====================================================

NAIL DREAMS

FASE 2A
Periodos sequenciais dos itens de agendamento

Esta migration e somente aditiva. Os campos aceitam
NULL para preservar eventuais itens anteriores. Toda
criacao pela RPC v2 deve preencher ambos os periodos.

=====================================================
*/

BEGIN;

ALTER TABLE public.agendamento_itens
    ADD COLUMN IF NOT EXISTS item_start_at timestamptz,
    ADD COLUMN IF NOT EXISTS item_end_at timestamptz;

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.agendamento_itens'::regclass
          AND conname = 'agendamento_itens_periodo_consistente_ck'
    ) THEN
        ALTER TABLE public.agendamento_itens
            ADD CONSTRAINT agendamento_itens_periodo_consistente_ck
            CHECK (
                (item_start_at IS NULL AND item_end_at IS NULL)
                OR (
                    item_start_at IS NOT NULL
                    AND item_end_at IS NOT NULL
                    AND item_end_at > item_start_at
                )
            );
    END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS agendamento_itens_profissional_periodo_idx
    ON public.agendamento_itens (
        profissional_id,
        item_start_at,
        item_end_at
    )
    WHERE item_start_at IS NOT NULL
      AND item_end_at IS NOT NULL;

COMMENT ON COLUMN public.agendamento_itens.item_start_at IS
    'Inicio efetivo do procedimento dentro da sequencia do agendamento.';

COMMENT ON COLUMN public.agendamento_itens.item_end_at IS
    'Fim efetivo do procedimento dentro da sequencia do agendamento.';

COMMIT;
