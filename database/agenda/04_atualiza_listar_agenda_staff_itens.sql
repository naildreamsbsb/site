/* Adiciona itens à agenda geral preservando o contrato legado da RPC. */

CREATE OR REPLACE FUNCTION public.listar_agenda_staff(
    p_data_inicio date,
    p_data_fim date,
    p_profissional_id uuid DEFAULT NULL,
    p_statuses text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_items jsonb;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você precisa estar logado para listar a agenda.'
        );
    END IF;

    IF NOT COALESCE(public.is_staff(), false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Apenas admin ou recepção podem ver a agenda geral.'
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
                'profissionalId', p.id,
                'profissionalNome', p.name,
                'servicoId', s.id,
                'servicoNome', s.name,
                'servicoCategoria', s.category,
                'startAt', a.start_at,
                'endAt', a.end_at,
                'dataBr', to_char(a.start_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
                'horaInicio', to_char(a.start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
                'horaFim', to_char(a.end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
                'status', a.status,
                'appointmentType', a.appointment_type,
                'source', a.source,
                'totalPrice', a.total_price,
                'requiresDeposit', a.requires_deposit,
                'depositPercent', a.deposit_percent,
                'depositAmount', a.deposit_amount,
                'depositStatus', a.deposit_status,
                'paymentStatus', a.payment_status,
                'amountPaid', a.amount_paid,
                'paymentMethod', a.payment_method,
                'paymentNotes', a.payment_notes,
                'notes', a.notes,
                'cancelReason', a.cancel_reason,
                'confirmedAt', a.confirmed_at,
                'canceledAt', a.canceled_at,
                'completedAt', a.completed_at,
                'noShowAt', a.no_show_at,
                'rescheduledAt', a.rescheduled_at,
                'rescheduleRequestedAt', a.reschedule_requested_at,
                'rescheduleRequestedStartAt', a.reschedule_requested_start_at,
                'rescheduleReason', a.reschedule_reason,
                'createdAt', a.created_at,
                'itens', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', ai.id,
                            'servicoId', ai.servico_id,
                            'servicoNome', ai.nome_snapshot,
                            'categoria', ai.categoria_snapshot,
                            'profissionalId', ai.profissional_id,
                            'profissionalNome', item_profissional.name,
                            'startAt', ai.item_start_at,
                            'endAt', ai.item_end_at,
                            'duracaoMinutos', ai.duracao_snapshot,
                            'valor', ai.valor_snapshot,
                            'ordem', ai.ordem
                        )
                        ORDER BY ai.ordem
                    )
                    FROM public.agendamento_itens AS ai
                    INNER JOIN public.profissionais AS item_profissional
                        ON item_profissional.id = ai.profissional_id
                    WHERE ai.agendamento_id = a.id
                ), '[]'::jsonb)
            ) AS item
        FROM public.agendamentos AS a
        INNER JOIN public.clientes AS c
            ON c.id = a.cliente_id
        INNER JOIN public.profissionais AS p
            ON p.id = a.profissional_id
        INNER JOIN public.servicos AS s
            ON s.id = a.servico_id
        WHERE a.start_at >= (
              p_data_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo'
          )
          AND a.start_at < (
              (p_data_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
          )
          AND (
              p_profissional_id IS NULL
              OR a.profissional_id = p_profissional_id
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
            'message', 'Não foi possível listar a agenda.'
        );
END;
$function$;
