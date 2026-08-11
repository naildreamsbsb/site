/*
=====================================================

NAIL DREAMS

FUNCAO:
public.listar_agenda_profissional

OBJETIVO:
Listar exclusivamente os agendamentos da profissional
vinculada ao usuario autenticado.

SEGURANCA:
O identificador da profissional nunca e recebido como
parametro. O vinculo e resolvido por:

auth.uid()
    -> public.profiles.id
    -> public.profissionais.profile_id
    -> public.profissionais.id
    -> public.agendamentos.profissional_id

=====================================================
*/

CREATE OR REPLACE FUNCTION public.listar_agenda_profissional(
    p_data_inicio date,
    p_data_fim date,
    p_statuses text[] DEFAULT NULL
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
    v_items jsonb;

BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você precisa estar logado para listar a agenda.'
        );
    END IF;


    SELECT p.role
    INTO v_role
    FROM public.profiles AS p
    WHERE p.id = v_user_id;


    IF v_role IS DISTINCT FROM 'profissional' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Este usuário não possui perfil de profissional.'
        );
    END IF;


    SELECT p.id
    INTO v_profissional_id
    FROM public.profissionais AS p
    WHERE p.profile_id = v_user_id
      AND p.active = true
    LIMIT 1;


    IF v_profissional_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Nenhuma profissional vinculada ao usuário encontrado.'
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


    SELECT COALESCE(
        jsonb_agg(item ORDER BY item_start_at),
        '[]'::jsonb
    )
    INTO v_items
    FROM (
        SELECT
            a.start_at AS item_start_at,
            jsonb_build_object(
                'id', a.id,
                'clienteId', c.id,
                'clienteNome', c.full_name,
                'clientePhone', c.phone,
                'clienteEmail', c.email,
                'profissionalId', profissional.id,
                'profissionalNome', profissional.name,
                'servicoId', s.id,
                'servicoNome', s.name,
                'servicoCategoria', s.category,
                'startAt', a.start_at,
                'endAt', a.end_at,
                'duracaoMinutos', EXTRACT(EPOCH FROM (a.end_at - a.start_at))::integer / 60,
                'dataBr', to_char(a.start_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
                'horaInicio', to_char(a.start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
                'horaFim', to_char(a.end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
                'status', a.status,
                'appointmentType', a.appointment_type,
                'source', a.source,
                'notes', a.notes,
                'createdAt', a.created_at,
                'totalPrice', a.total_price,
                'requiresDeposit', a.requires_deposit,
                'depositPercent', a.deposit_percent,
                'depositAmount', a.deposit_amount,
                'depositStatus', a.deposit_status,
                'paymentStatus', a.payment_status
            ) AS item
        FROM public.agendamentos AS a
        LEFT JOIN public.clientes AS c
            ON c.id = a.cliente_id
        INNER JOIN public.profissionais AS profissional
            ON profissional.id = a.profissional_id
        LEFT JOIN public.servicos AS s
            ON s.id = a.servico_id
        WHERE a.profissional_id = v_profissional_id
          AND a.start_at >= (
              p_data_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo'
          )
          AND a.start_at < (
              (p_data_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
          )
          AND (
              p_statuses IS NULL
              OR a.status = ANY(p_statuses)
          )
    ) AS agenda;


    RETURN jsonb_build_object(
        'success', true,
        'dataInicio', p_data_inicio,
        'dataFim', p_data_fim,
        'total', jsonb_array_length(v_items),
        'items', v_items
    );


EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Não foi possível listar a agenda profissional.'
        );

END;

$function$;
