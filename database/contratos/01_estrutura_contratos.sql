/*
=====================================================
NAIL DREAMS SaaS
Módulo: Contratos Profissionais

Arquivo:
01_estrutura_contratos.sql

Objetivo:
Documentar estrutura das tabelas relacionadas
a contratos profissionais.

=====================================================
*/


-- ====================================================
-- contratos_profissionais
-- ====================================================

/*
Responsável por armazenar contratos entre o Studio
e profissionais.

Controle:
- versão contratual
- período de experiência
- comissão
- assinatura
- validação administrativa
- encerramento
*/


CREATE TABLE contratos_profissionais (

    id uuid PRIMARY KEY,

    profissional_id uuid NOT NULL,

    versao text NOT NULL DEFAULT '1.0',

    numero_contrato text,

    status text NOT NULL DEFAULT 'pendente_assinatura',


    -- Datas

    data_inicio date NOT NULL DEFAULT CURRENT_DATE,

    periodo_experiencia_meses integer DEFAULT 3,

    data_fim_experiencia date,

    data_fim date,


    -- Comissão

    percentual_comissao numeric,

    percentual_experiencia numeric,

    percentual_pos_experiencia numeric,


    -- Documento

    conteudo_contrato text,

    arquivo_assinado_url text,

    tipo_assinatura text,

    assinatura_referencia text,


    -- Aceite

    aceito boolean DEFAULT false,

    aceito_em timestamptz,


    -- Validação administrativa

    validado_por uuid,

    validado_em timestamptz,

    observacao_validacao text,


    -- Encerramento

    encerrado_em timestamptz,

    motivo_encerramento text,


    -- Auditoria

    criado_por uuid,

    atualizado_por uuid,

    created_at timestamptz DEFAULT now(),

    updated_at timestamptz DEFAULT now()

);