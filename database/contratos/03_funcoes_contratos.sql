/*
=====================================================

NAIL DREAMS SaaS

MÓDULO:
Contratos Profissionais

ARQUIVO:
03_funcoes_contratos.sql


OBJETIVO:

Documentar todas as funções PostgreSQL (RPCs)
responsáveis pelo fluxo contratual.


Fluxo:


GERAÇÃO DO CONTRATO

gerar_contrato_profissional_interno()

        ↓


ASSINATURA PROFISSIONAL

enviar_contrato_assinado_profissional()

        ↓


VALIDAÇÃO ADMINISTRATIVA

validar_contrato_profissional()

        ↓


AUDITORIA

registrar_evento_contrato()


=====================================================
*/

/*
=====================================================

FUNÇÃO:

registrar_evento_contrato()


OBJETIVO:

Criar registros de auditoria dos contratos.


UTILIZAÇÃO:

É chamada internamente pelas funções do fluxo contratual
sempre que uma ação relevante precisa ser registrada.


EVENTOS DE AUDITORIA:

Registra o tipo, a descrição, o usuário responsável e os
dados extras recebidos de cada função chamadora.


IMPORTANTE:

Nenhuma tela do sistema deve inserir diretamente
na tabela contratos_eventos.


Todas as alterações passam por esta função.


=====================================================
*/


CREATE OR REPLACE FUNCTION public.registrar_evento_contrato(
    p_contrato_id uuid,
    p_tipo_evento text,
    p_descricao text,
    p_usuario_id uuid DEFAULT NULL,
    p_dados_extra jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'

AS $function$

DECLARE
    v_evento_id uuid;

BEGIN

    INSERT INTO public.contratos_eventos (
        contrato_id,
        tipo_evento,
        descricao,
        usuario_id,
        dados_extra
    )
    VALUES (
        p_contrato_id,
        p_tipo_evento,
        p_descricao,
        p_usuario_id,
        p_dados_extra
    )

    RETURNING id INTO v_evento_id;


    RETURN v_evento_id;


END;

$function$;

/*
=====================================================

FUNÇÃO:

enviar_contrato_assinado_profissional()


OBJETIVO:

Receber a referência do documento assinado enviado
pela profissional e encaminhar o contrato para validação.


UTILIZAÇÃO:

É chamada no painel profissional depois que a profissional
assina externamente e envia o documento assinado.


EVENTOS DE AUDITORIA:

Gera o evento documento_recebido, registrando o usuário,
o tipo de assinatura e o novo status do contrato.

=====================================================
*/

CREATE OR REPLACE FUNCTION public.enviar_contrato_assinado_profissional(p_contrato_id uuid, p_arquivo_assinado_url text, p_tipo_assinatura text DEFAULT 'gov_br'::text, p_assinatura_referencia text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id uuid;
    v_contrato public.contratos_profissionais%rowtype;
    v_profissional public.profissionais%rowtype;

BEGIN

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você precisa estar logado.'
        );
    END IF;


    SELECT *
    INTO v_contrato
    FROM public.contratos_profissionais
    WHERE id = p_contrato_id;


    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Contrato não encontrado.'
        );
    END IF;


    SELECT *
    INTO v_profissional
    FROM public.profissionais
    WHERE id = v_contrato.profissional_id
      AND profile_id = v_user_id
      AND active = true;


    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você não possui permissão para este contrato.'
        );
    END IF;


    IF v_contrato.status <> 'pendente_assinatura' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Este contrato não está aguardando assinatura.'
        );
    END IF;


    IF p_arquivo_assinado_url IS NULL
       OR trim(p_arquivo_assinado_url) = '' THEN

        RETURN jsonb_build_object(
            'success', false,
            'message', 'Envie o contrato assinado.'
        );

    END IF;


    UPDATE public.contratos_profissionais
    SET
        arquivo_assinado_url = p_arquivo_assinado_url,
        tipo_assinatura = COALESCE(
            NULLIF(trim(p_tipo_assinatura), ''),
            'gov_br'
        ),
        assinatura_referencia = NULLIF(
            trim(p_assinatura_referencia),
            ''
        ),
        aceito = true,
        aceito_em = now(),
        enviado_em = now(),
        status = 'aguardando_validacao',
        updated_at = now()
    WHERE id = p_contrato_id;


    PERFORM public.registrar_evento_contrato(
        p_contrato_id,
        'documento_recebido',
        'Contrato assinado enviado pela profissional.',
        v_user_id,
        jsonb_build_object(
            'tipo_assinatura', COALESCE(p_tipo_assinatura, 'gov_br'),
            'status_novo', 'aguardando_validacao'
        )
    );


    RETURN jsonb_build_object(
        'success', true,
        'message', 'Contrato enviado para validação do Studio.',
        'status', 'aguardando_validacao'
    );


EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Não foi possível enviar o contrato assinado.',
            'detail', sqlerrm
        );

END;

$function$;

/*
=====================================================

FUNÇÃO:

validar_contrato_profissional()


OBJETIVO:

Permitir que o Studio valide o documento assinado ou
solicite sua revisão, mantendo as regras administrativas.


UTILIZAÇÃO:

É chamada no painel administrativo quando um contrato
está aguardando validação do Studio.


EVENTOS DE AUDITORIA:

Gera contrato_validado quando aprovado ou
contrato_revisao_solicitada quando enviado para revisão.

=====================================================
*/

CREATE OR REPLACE FUNCTION public.validar_contrato_profissional(p_contrato_id uuid, p_aprovado boolean, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id uuid;
    v_role text;
    v_contrato public.contratos_profissionais%rowtype;

BEGIN

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Usuário não autenticado.'
        );
    END IF;


    SELECT public.current_user_role()
    INTO v_role;


    IF v_role <> 'admin' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Apenas administradores podem validar contratos.'
        );
    END IF;


    SELECT *
    INTO v_contrato
    FROM public.contratos_profissionais
    WHERE id = p_contrato_id;


    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Contrato não encontrado.'
        );
    END IF;


    IF v_contrato.status <> 'aguardando_validacao' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Este contrato não está aguardando validação.'
        );
    END IF;


    IF p_aprovado = true THEN


        UPDATE public.contratos_profissionais
        SET
            status = 'ativo',
            validado_por = v_user_id,
            validado_em = now(),
            observacao_validacao = p_observacao,
            updated_at = now()
        WHERE id = p_contrato_id;


        PERFORM public.registrar_evento_contrato(
            p_contrato_id,
            'contrato_validado',
            'Contrato validado pelo Studio.',
            v_user_id,
            jsonb_build_object(
                'status_anterior', 'aguardando_validacao',
                'status_novo', 'ativo'
            )
        );


        RETURN jsonb_build_object(
            'success', true,
            'message', 'Contrato aprovado e ativado.'
        );


    ELSE


        UPDATE public.contratos_profissionais
        SET
            status = 'revisao_necessaria',
            validado_por = v_user_id,
            validado_em = now(),
            observacao_validacao = p_observacao,
            updated_at = now()
        WHERE id = p_contrato_id;


        PERFORM public.registrar_evento_contrato(
            p_contrato_id,
            'contrato_revisao_solicitada',
            'Contrato enviado para revisão.',
            v_user_id,
            jsonb_build_object(
                'status_anterior', 'aguardando_validacao',
                'status_novo', 'revisao_necessaria',
                'motivo', p_observacao
            )
        );


        RETURN jsonb_build_object(
            'success', true,
            'message', 'Contrato enviado para revisão.'
        );


    END IF;


EXCEPTION
    WHEN OTHERS THEN

        RETURN jsonb_build_object(
            'success', false,
            'message', 'Erro ao validar contrato.',
            'detail', sqlerrm
        );

END;

$function$;

/*
=====================================================

FUNÇÃO PREPARADA:

gerar_contrato_profissional_interno()


A definição real desta função será adicionada após sua
extração do Supabase. Nenhuma implementação foi localizada
no workspace durante a organização deste arquivo.

=====================================================
*/
/*
=====================================================

FUNÇÃO:

gerar_contrato_profissional_interno()


OBJETIVO:

Criar o contrato inicial da profissional dentro
do sistema Nail Dreams.


RESPONSABILIDADES:

- validar profissional ativa;
- validar dados contratuais;
- carregar dados oficiais do Studio;
- evitar contratos duplicados;
- gerar número do contrato;
- calcular período de experiência;
- definir percentuais de comissão;
- gerar conteúdo contratual;
- armazenar snapshots dos dados utilizados.


STATUS INICIAL:

pendente_assinatura


EVENTO FUTURO:

contrato_criado


=====================================================
*/

