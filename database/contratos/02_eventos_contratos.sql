/*
=====================================================
NAIL DREAMS SaaS

Módulo:
Auditoria de Contratos

Tabela:
contratos_eventos

=====================================================
*/


CREATE TABLE contratos_eventos (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    contrato_id uuid NOT NULL,


    -- Tipo do acontecimento

    tipo_evento text NOT NULL,


    -- Texto apresentado ao usuário

    descricao text NOT NULL,


    -- Quem realizou

    usuario_id uuid,


    -- Informações adicionais

    dados_extra jsonb,


    created_at timestamptz DEFAULT now()

);