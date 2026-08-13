/*
=====================================================

NAIL DREAMS

FUNCAO:
public.listar_meu_resumo_financeiro_profissional

OBJETIVO:
Listar exclusivamente o resumo financeiro e as comissoes
da profissional vinculada ao usuario autenticado.

SEGURANCA:
O identificador da profissional nunca e recebido como
parametro. O vinculo e resolvido por auth.uid().

=====================================================
*/

CREATE OR REPLACE FUNCTION public.listar_meu_resumo_financeiro_profissional(
    p_data_inicio date,
    p_data_fim date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_role text;
    v_profissional_id uuid;
    v_total_concluidos integer;
    v_receita_gerada numeric;
    v_valor_recebido numeric;
    v_comissao_total numeric;
    v_comissao_paga numeric;
    v_comissao_pendente numeric;
    v_items jsonb;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você precisa estar logado para consultar seu financeiro.'
        );
    END IF;

    SELECT perfil.role
    INTO v_role
    FROM public.profiles AS perfil
    WHERE perfil.id = v_user_id;

    IF v_role IS DISTINCT FROM 'profissional' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Este usuário não possui perfil de profissional.'
        );
    END IF;

    SELECT profissional.id
    INTO v_profissional_id
    FROM public.profissionais AS profissional
    WHERE profissional.profile_id = v_user_id
      AND profissional.active = true
    LIMIT 1;

    IF v_profissional_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Nenhuma profissional ativa vinculada ao usuário foi encontrada.'
        );
    END IF;

    IF p_data_inicio IS NULL OR p_data_fim IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Informe a data inicial e a data final.'
        );
    END IF;

    IF p_data_fim < p_data_inicio THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'A data final não pode ser anterior à data inicial.'
        );
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE agendamento.status = 'concluido')::integer,
        COALESCE(SUM(agendamento.total_price) FILTER (
            WHERE agendamento.status = 'concluido'
        ), 0),
        COALESCE(SUM(agendamento.amount_paid) FILTER (
            WHERE agendamento.status IN ('concluido', 'nao_compareceu')
        ), 0)
    INTO
        v_total_concluidos,
        v_receita_gerada,
        v_valor_recebido
    FROM public.agendamentos AS agendamento
    WHERE agendamento.profissional_id = v_profissional_id
      AND agendamento.start_at >= (
          p_data_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo'
      )
      AND agendamento.start_at < (
          (p_data_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
      );

    SELECT
        COALESCE(SUM(comissao.valor_comissao) FILTER (
            WHERE comissao.status IS DISTINCT FROM 'cancelada'
        ), 0),
        COALESCE(SUM(comissao.valor_comissao) FILTER (
            WHERE comissao.status = 'paga'
        ), 0),
        COALESCE(SUM(comissao.valor_comissao) FILTER (
            WHERE comissao.status IN ('calculada', 'aprovada')
        ), 0)
    INTO
        v_comissao_total,
        v_comissao_paga,
        v_comissao_pendente
    FROM public.comissoes_profissionais AS comissao
    INNER JOIN public.agendamentos AS agendamento
        ON agendamento.id = comissao.agendamento_id
    WHERE agendamento.profissional_id = v_profissional_id
      AND comissao.profissional_id = v_profissional_id
      AND agendamento.start_at >= (
          p_data_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo'
      )
      AND agendamento.start_at < (
          (p_data_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
      );

    SELECT COALESCE(
        jsonb_agg(item ORDER BY item_start_at DESC),
        '[]'::jsonb
    )
    INTO v_items
    FROM (
        SELECT
            agendamento.start_at AS item_start_at,
            jsonb_build_object(
                'data', to_char(
                    agendamento.start_at AT TIME ZONE 'America/Sao_Paulo',
                    'YYYY-MM-DD'
                ),
                'dataBr', to_char(
                    agendamento.start_at AT TIME ZONE 'America/Sao_Paulo',
                    'DD/MM/YYYY'
                ),
                'cliente', cliente.full_name,
                'servico', servico.name,
                'valorServico', COALESCE(agendamento.total_price, 0),
                'valorRecebido', COALESCE(agendamento.amount_paid, 0),
                'comissao', COALESCE(SUM(comissao.valor_comissao) FILTER (
                    WHERE comissao.status IS DISTINCT FROM 'cancelada'
                ), 0),
                'statusComissao', CASE
                    WHEN BOOL_OR(comissao.status = 'paga') THEN 'paga'
                    WHEN BOOL_OR(comissao.status = 'aprovada') THEN 'aprovada'
                    WHEN BOOL_OR(comissao.status = 'calculada') THEN 'calculada'
                    WHEN BOOL_OR(comissao.status = 'cancelada') THEN 'cancelada'
                    ELSE NULL
                END
            ) AS item
        FROM public.agendamentos AS agendamento
        LEFT JOIN public.clientes AS cliente
            ON cliente.id = agendamento.cliente_id
        LEFT JOIN public.servicos AS servico
            ON servico.id = agendamento.servico_id
        LEFT JOIN public.comissoes_profissionais AS comissao
            ON comissao.agendamento_id = agendamento.id
           AND comissao.profissional_id = v_profissional_id
        WHERE agendamento.profissional_id = v_profissional_id
          AND agendamento.status IN ('concluido', 'nao_compareceu')
          AND agendamento.start_at >= (
              p_data_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo'
          )
          AND agendamento.start_at < (
              (p_data_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
          )
        GROUP BY
            agendamento.id,
            agendamento.start_at,
            cliente.full_name,
            servico.name,
            agendamento.total_price,
            agendamento.amount_paid
    ) AS detalhes;

    RETURN jsonb_build_object(
        'success', true,
        'dataInicio', p_data_inicio,
        'dataFim', p_data_fim,
        'resumo', jsonb_build_object(
            'totalAtendimentosConcluidos', v_total_concluidos,
            'receitaGerada', v_receita_gerada,
            'valorRecebido', v_valor_recebido,
            'comissaoTotal', v_comissao_total,
            'comissaoPaga', v_comissao_paga,
            'comissaoPendente', v_comissao_pendente
        ),
        'items', v_items
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Não foi possível consultar seu resumo financeiro.'
        );
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_meu_resumo_financeiro_profissional(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_meu_resumo_financeiro_profissional(date, date) TO authenticated;
