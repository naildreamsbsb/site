/*
=====================================================

NAIL DREAMS

MODULO:
Agendamentos com multiplos itens

ARQUIVO:
01_agendamento_itens.sql

OBJETIVO:
Criar a estrutura que preserva os servicos, valores,
duracoes e profissionais de cada agendamento.

OBSERVACOES:
- public.agendamentos.servico_id permanece inalterado;
- esta migration nao realiza backfill;
- escritas diretas ficam bloqueadas para anon e
  authenticated; futuras escritas devem ocorrer por
  RPCs SECURITY DEFINER com validacao de acesso.

=====================================================
*/

BEGIN;

CREATE TABLE IF NOT EXISTS public.agendamento_itens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agendamento_id uuid NOT NULL,
    servico_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    ordem integer NOT NULL,
    nome_snapshot text NOT NULL,
    categoria_snapshot text,
    valor_snapshot numeric(12, 2) NOT NULL,
    duracao_snapshot integer NOT NULL,
    requires_deposit_snapshot boolean,
    deposit_percent_snapshot numeric(5, 2),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    CONSTRAINT agendamento_itens_agendamento_fk
        FOREIGN KEY (agendamento_id)
        REFERENCES public.agendamentos (id)
        ON DELETE RESTRICT,

    CONSTRAINT agendamento_itens_servico_fk
        FOREIGN KEY (servico_id)
        REFERENCES public.servicos (id)
        ON DELETE RESTRICT,

    CONSTRAINT agendamento_itens_profissional_fk
        FOREIGN KEY (profissional_id)
        REFERENCES public.profissionais (id)
        ON DELETE RESTRICT,

    CONSTRAINT agendamento_itens_valor_nonnegative_ck
        CHECK (valor_snapshot >= 0),

    CONSTRAINT agendamento_itens_duracao_positive_ck
        CHECK (duracao_snapshot > 0),

    CONSTRAINT agendamento_itens_ordem_positive_ck
        CHECK (ordem > 0),

    CONSTRAINT agendamento_itens_deposit_percent_range_ck
        CHECK (
            deposit_percent_snapshot IS NULL
            OR deposit_percent_snapshot BETWEEN 0 AND 100
        ),

    CONSTRAINT agendamento_itens_agendamento_ordem_uk
        UNIQUE (agendamento_id, ordem)
);

COMMENT ON TABLE public.agendamento_itens IS
    'Itens historicos de servico pertencentes a um agendamento.';

COMMENT ON COLUMN public.agendamento_itens.valor_snapshot IS
    'Valor do servico congelado no momento da criacao do agendamento.';

COMMENT ON COLUMN public.agendamento_itens.duracao_snapshot IS
    'Duracao do servico, em minutos, congelada no momento da criacao do agendamento.';

COMMENT ON COLUMN public.agendamento_itens.profissional_id IS
    'Profissional responsavel pelo item; prepara o modelo para atendimentos multiprofissionais.';

COMMENT ON COLUMN public.agendamento_itens.updated_at IS
    'Deve ser atualizado explicitamente pelas RPCs ate existir um padrao global de trigger confirmado.';

CREATE INDEX IF NOT EXISTS agendamento_itens_agendamento_idx
    ON public.agendamento_itens (agendamento_id);

CREATE INDEX IF NOT EXISTS agendamento_itens_servico_idx
    ON public.agendamento_itens (servico_id);

CREATE INDEX IF NOT EXISTS agendamento_itens_profissional_idx
    ON public.agendamento_itens (profissional_id);

CREATE INDEX IF NOT EXISTS agendamento_itens_profissional_servico_idx
    ON public.agendamento_itens (profissional_id, servico_id);

ALTER TABLE public.agendamento_itens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.agendamento_itens FROM PUBLIC;
REVOKE ALL ON TABLE public.agendamento_itens FROM anon;
REVOKE ALL ON TABLE public.agendamento_itens FROM authenticated;

COMMIT;
