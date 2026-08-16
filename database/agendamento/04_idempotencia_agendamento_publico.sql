/*
Idempotência e reconciliação do agendamento público.

A RPC v3 envolve a implementação v2 na mesma transação. O lock por UUID
serializa repetições da mesma tentativa e a restrição UNIQUE fornece uma
segunda barreira contra duplicidade.
*/

ALTER TABLE public.agendamentos
    ADD COLUMN IF NOT EXISTS booking_attempt_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_booking_attempt_id_uk
    ON public.agendamentos (booking_attempt_id)
    WHERE booking_attempt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.consultar_tentativa_agendamento_v1(
    p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_agendamento jsonb;
    v_profile_id uuid;
BEGIN
    IF v_user_id IS NULL OR p_attempt_id IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT to_jsonb(agendamento), cliente.profile_id
    INTO v_agendamento, v_profile_id
    FROM public.agendamentos AS agendamento
    INNER JOIN public.clientes AS cliente
        ON cliente.id = agendamento.cliente_id
    WHERE agendamento.booking_attempt_id = p_attempt_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    IF v_profile_id IS DISTINCT FROM v_user_id
       AND NOT COALESCE(public.is_staff(), false) THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'success', true,
        'message', 'Agendamento criado com sucesso.',
        'agendamentoId', v_agendamento ->> 'id',
        'clienteId', v_agendamento ->> 'cliente_id',
        'status', v_agendamento ->> 'status',
        'startAt', v_agendamento ->> 'start_at',
        'endAt', v_agendamento ->> 'end_at',
        'totalPrice', v_agendamento ->> 'total_price',
        'depositAmount', v_agendamento ->> 'deposit_amount',
        'depositPercent', v_agendamento ->> 'deposit_percent'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.solicitar_agendamento_publico_v3(
    p_attempt_id uuid,
    p_cliente_id uuid,
    p_start_at timestamptz,
    p_itens jsonb,
    p_cliente_nome text DEFAULT NULL,
    p_cliente_phone text DEFAULT NULL,
    p_cliente_email text DEFAULT NULL,
    p_appointment_type text DEFAULT 'normal',
    p_requires_deposit_override boolean DEFAULT NULL,
    p_deposit_percent_override numeric DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_existing jsonb;
    v_result jsonb;
    v_agendamento_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você precisa estar logado para criar um agendamento.'
        );
    END IF;

    IF p_attempt_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Não foi possível identificar esta tentativa de agendamento.'
        );
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_attempt_id::text, 0));

    v_existing := public.consultar_tentativa_agendamento_v1(p_attempt_id);
    IF COALESCE((v_existing ->> 'found')::boolean, false) THEN
        RETURN v_existing || jsonb_build_object('idempotentReplay', true);
    END IF;

    v_result := public.solicitar_agendamento_recepcao_v2(
        p_cliente_id,
        p_start_at,
        p_itens,
        p_cliente_nome,
        p_cliente_phone,
        p_cliente_email,
        p_appointment_type,
        p_requires_deposit_override,
        p_deposit_percent_override,
        p_notes
    );

    IF NOT COALESCE((v_result ->> 'success')::boolean, false) THEN
        RETURN v_result;
    END IF;

    v_agendamento_id := (v_result ->> 'agendamentoId')::uuid;

    UPDATE public.agendamentos
    SET booking_attempt_id = p_attempt_id
    WHERE id = v_agendamento_id;

    RETURN v_result || jsonb_build_object(
        'attemptId', p_attempt_id,
        'idempotentReplay', false
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.consultar_tentativa_agendamento_v1(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.consultar_tentativa_agendamento_v1(uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.solicitar_agendamento_publico_v3(
    uuid, uuid, timestamptz, jsonb, text, text, text, text, boolean, numeric, text
)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.solicitar_agendamento_publico_v3(
    uuid, uuid, timestamptz, jsonb, text, text, text, text, boolean, numeric, text
)
TO authenticated;
