/*
=====================================================

NAIL DREAMS
    
FASE 2A
Criacao de agendamento com procedimentos sequenciais

CONTRATO DE p_itens:
[
  {
    "servico_id": "uuid",
    "profissional_id": "uuid",
    "ordem": 1
  }
]

Preco, duracao e snapshots sempre sao obtidos do banco.

=====================================================
*/

CREATE OR REPLACE FUNCTION public.solicitar_agendamento_recepcao_v2(
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
    v_user_id uuid;
    v_cliente public.clientes%ROWTYPE;
    v_cliente_id uuid;
    v_cliente_nome text := NULLIF(btrim(p_cliente_nome), '');
    v_cliente_phone text := NULLIF(btrim(p_cliente_phone), '');
    v_cliente_email text := NULLIF(lower(btrim(p_cliente_email)), '');
    v_item_input record;
    v_item jsonb;
    v_servico public.servicos%ROWTYPE;
    v_profissional public.profissionais%ROWTYPE;
    v_validated_items jsonb := '[]'::jsonb;
    v_profissional_ids uuid[] := ARRAY[]::uuid[];
    v_item_start_at timestamptz;
    v_item_end_at timestamptz;
    v_end_at timestamptz;
    v_total_price numeric(12, 2) := 0;
    v_deposit_amount numeric(12, 2) := 0;
    v_parent_deposit_percent numeric(5, 2) := 0;
    v_item_requires_deposit boolean;
    v_item_deposit_percent numeric(5, 2);
    v_item_deposit_amount numeric(12, 2);
    v_servico_category_normalized text;
    v_profissional_category_normalized text;
    v_servico_categoria_atuacao text;
    v_profissional_categoria_atuacao text;
    v_agendamento_id uuid;
    v_first_servico_id uuid;
    v_first_profissional_id uuid;
    v_item_count integer;
    v_is_staff boolean := false;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Voce precisa estar logado para criar um agendamento.'
        );
    END IF;

    v_is_staff := COALESCE(public.is_staff(), false);

    /* No fluxo publico a identidade da cliente nunca vem do navegador. */
    IF NOT v_is_staff THEN
        SELECT cliente.* INTO v_cliente
        FROM public.clientes AS cliente
        WHERE cliente.profile_id = v_user_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message',
                'Nao foi possivel localizar o cadastro da cliente autenticada.');
        END IF;

        IF p_cliente_id IS NOT NULL AND p_cliente_id <> v_cliente.id THEN
            RETURN jsonb_build_object('success', false, 'message',
                'A cliente informada nao pertence ao usuario autenticado.');
        END IF;

        p_cliente_id := v_cliente.id;
        v_cliente_nome := NULL;
        v_cliente_phone := NULL;
        v_cliente_email := NULL;
        p_appointment_type := 'normal';
        p_requires_deposit_override := NULL;
        p_deposit_percent_override := NULL;
    END IF;

    IF p_start_at IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Informe a data e o horario inicial.'
        );
    END IF;

    IF p_itens IS NULL OR jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Os procedimentos devem ser enviados em uma lista JSON.'
        );
    END IF;

    v_item_count := jsonb_array_length(p_itens);

    IF v_item_count < 1 OR v_item_count > 10 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'O agendamento deve possuir entre 1 e 10 procedimentos.'
        );
    END IF;

    IF p_deposit_percent_override IS NOT NULL
       AND (p_deposit_percent_override < 0 OR p_deposit_percent_override > 100) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'O percentual de sinal informado deve ficar entre 0 e 100.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_itens) AS item(
            servico_id uuid,
            profissional_id uuid,
            ordem integer
        )
        WHERE item.servico_id IS NULL
           OR item.profissional_id IS NULL
           OR item.ordem IS NULL
           OR item.ordem < 1
           OR item.ordem > v_item_count
    ) OR EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_itens) AS item(
            servico_id uuid,
            profissional_id uuid,
            ordem integer
        )
        GROUP BY item.ordem
        HAVING count(*) > 1
    ) OR EXISTS (
        SELECT expected.ordem
        FROM generate_series(1, v_item_count) AS expected(ordem)
        EXCEPT
        SELECT item.ordem
        FROM jsonb_to_recordset(p_itens) AS item(
            servico_id uuid,
            profissional_id uuid,
            ordem integer
        )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'A lista possui procedimentos ou ordens invalidas.'
        );
    END IF;

    /*
     * A cliente e localizada agora apenas para validar sua existencia e
     * consultar sua regra de sinal. INSERT/UPDATE ocorre somente depois
     * que todos os procedimentos forem validados.
     */
    IF p_cliente_id IS NOT NULL THEN
        SELECT cliente.*
        INTO v_cliente
        FROM public.clientes AS cliente
        WHERE cliente.id = p_cliente_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Cliente nao encontrada.'
            );
        END IF;
    ELSE
        IF v_cliente_nome IS NULL OR v_cliente_phone IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Informe nome e telefone da cliente.'
            );
        END IF;

        SELECT cliente.*
        INTO v_cliente
        FROM public.clientes AS cliente
        WHERE (v_cliente_phone IS NOT NULL AND cliente.phone = v_cliente_phone)
           OR (v_cliente_email IS NOT NULL AND lower(cliente.email) = v_cliente_email)
        ORDER BY
            CASE WHEN cliente.phone = v_cliente_phone THEN 0 ELSE 1 END,
            cliente.id
        LIMIT 1;
    END IF;

    v_item_start_at := p_start_at;

    FOR v_item_input IN
        SELECT item.servico_id, item.profissional_id, item.ordem
        FROM jsonb_to_recordset(p_itens) AS item(
            servico_id uuid,
            profissional_id uuid,
            ordem integer
        )
        ORDER BY item.ordem
    LOOP
        SELECT servico.*
        INTO v_servico
        FROM public.servicos AS servico
        WHERE servico.id = v_item_input.servico_id
          AND servico.active = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'O servico do procedimento %s nao existe ou esta inativo.',
                    v_item_input.ordem
                )
            );
        END IF;

        IF v_servico.duration_minutes IS NULL OR v_servico.duration_minutes <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'A duracao do procedimento %s e invalida.',
                    v_item_input.ordem
                )
            );
        END IF;

        IF v_servico.price IS NULL OR v_servico.price < 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'O valor do procedimento %s e invalido.',
                    v_item_input.ordem
                )
            );
        END IF;

        SELECT profissional.*
        INTO v_profissional
        FROM public.profissionais AS profissional
        WHERE profissional.id = v_item_input.profissional_id
          AND profissional.active = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'A profissional do procedimento %s nao existe ou esta inativa.',
                    v_item_input.ordem
                )
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.profissional_servicos AS vinculo
            WHERE vinculo.profissional_id = v_item_input.profissional_id
              AND vinculo.servico_id = v_item_input.servico_id
              AND vinculo.active = true
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'A profissional nao realiza o procedimento %s.',
                    v_item_input.ordem
                )
            );
        END IF;

        /*
         * Categorias de atuacao canonicas:
         * - UNHAS
         * - OLHOS
         * - CORPO
         *
         * O catalogo atual usa servicos.category e profissionais.specialty.
         * A normalizacao aceita os nomes canonicos e descricoes usuais do
         * catalogo, mas rejeita valores que nao possam ser classificados.
         */
        v_servico_category_normalized := translate(
            lower(btrim(COALESCE(v_servico.category, ''))),
            'áàâãäéèêëíìîïóòôõöúùûüç',
            'aaaaaeeeeiiiiooooouuuuc'
        );
        v_profissional_category_normalized := translate(
            lower(btrim(COALESCE(v_profissional.specialty, ''))),
            'áàâãäéèêëíìîïóòôõöúùûüç',
            'aaaaaeeeeiiiiooooouuuuc'
        );

        v_servico_categoria_atuacao := CASE
            WHEN v_servico_category_normalized ~ '(unha|manicure|pedicure|nail)'
                THEN 'UNHAS'
            WHEN v_servico_category_normalized ~ '(olho|cilio|sobrancelha|lash|brow)'
                THEN 'OLHOS'
            WHEN v_servico_category_normalized ~ '(corpo|quiroprax|massag|ventosa|acupunt|estetic)'
                THEN 'CORPO'
            ELSE NULL
        END;

        v_profissional_categoria_atuacao := CASE
            WHEN v_profissional_category_normalized ~ '(unha|manicure|pedicure|nail)'
                THEN 'UNHAS'
            WHEN v_profissional_category_normalized ~ '(olho|cilio|sobrancelha|lash|brow)'
                THEN 'OLHOS'
            WHEN v_profissional_category_normalized ~ '(corpo|quiroprax|massag|ventosa|acupunt|estetic)'
                THEN 'CORPO'
            ELSE NULL
        END;

        IF v_servico_categoria_atuacao IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'A categoria do servico no procedimento %s nao esta configurada como Unhas, Olhos ou Corpo.',
                    v_item_input.ordem
                )
            );
        END IF;

        IF v_profissional_categoria_atuacao IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'A categoria de atuacao da profissional no procedimento %s nao esta configurada como Unhas, Olhos ou Corpo.',
                    v_item_input.ordem
                )
            );
        END IF;

        IF v_servico_categoria_atuacao IS DISTINCT FROM v_profissional_categoria_atuacao THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'A profissional escolhida nao pertence a categoria do procedimento %s.',
                    v_item_input.ordem
                )
            );
        END IF;

        v_item_end_at := v_item_start_at
            + make_interval(mins => v_servico.duration_minutes);

        IF NOT EXISTS (
            SELECT 1
            FROM public.horarios_trabalho AS horario
            WHERE horario.profissional_id = v_item_input.profissional_id
              AND horario.active = true
              AND horario.weekday = EXTRACT(
                    DOW FROM v_item_start_at AT TIME ZONE 'America/Sao_Paulo'
                  )::integer
              AND horario.start_time <= (
                    v_item_start_at AT TIME ZONE 'America/Sao_Paulo'
                  )::time
              AND horario.end_time >= (
                    v_item_end_at AT TIME ZONE 'America/Sao_Paulo'
                  )::time
              AND (
                    v_item_start_at AT TIME ZONE 'America/Sao_Paulo'
                  )::date = (
                    v_item_end_at AT TIME ZONE 'America/Sao_Paulo'
                  )::date
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'O procedimento %s esta fora do horario de trabalho da profissional.',
                    v_item_input.ordem
                )
            );
        END IF;

        v_item_requires_deposit := COALESCE(
            p_requires_deposit_override,
            CASE
                WHEN v_cliente.id IS NOT NULL
                    THEN v_cliente.requires_deposit_default
                ELSE NULL
            END,
            v_servico.requires_deposit_default,
            false
        );

        v_item_deposit_percent := CASE
            WHEN NOT v_item_requires_deposit THEN 0
            ELSE COALESCE(
                p_deposit_percent_override,
                CASE
                    WHEN v_cliente.id IS NOT NULL
                         AND v_cliente.requires_deposit_default = true
                        THEN v_cliente.deposit_percent_default
                    ELSE NULL
                END,
                CASE
                    WHEN v_servico.requires_deposit_default = true
                        THEN v_servico.deposit_percent_default
                    ELSE NULL
                END,
                30
            )
        END;

        IF v_item_deposit_percent < 0 OR v_item_deposit_percent > 100 THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'A regra de sinal do procedimento %s e invalida.',
                    v_item_input.ordem
                )
            );
        END IF;

        v_item_deposit_amount := CASE
            WHEN v_item_requires_deposit
                THEN round(v_servico.price * v_item_deposit_percent / 100, 2)
            ELSE 0
        END;

        v_total_price := v_total_price + v_servico.price;
        v_deposit_amount := v_deposit_amount + v_item_deposit_amount;
        v_profissional_ids := array_append(
            v_profissional_ids,
            v_item_input.profissional_id
        );

        IF v_item_input.ordem = 1 THEN
            v_first_servico_id := v_item_input.servico_id;
            v_first_profissional_id := v_item_input.profissional_id;
        END IF;

        v_validated_items := v_validated_items || jsonb_build_array(
            jsonb_build_object(
                'servico_id', v_item_input.servico_id,
                'profissional_id', v_item_input.profissional_id,
                'ordem', v_item_input.ordem,
                'nome_snapshot', v_servico.name,
                'categoria_snapshot', v_servico.category,
                'valor_snapshot', v_servico.price,
                'duracao_snapshot', v_servico.duration_minutes,
                'requires_deposit_snapshot', v_item_requires_deposit,
                'deposit_percent_snapshot', v_item_deposit_percent,
                'deposit_amount', v_item_deposit_amount,
                'item_start_at', v_item_start_at,
                'item_end_at', v_item_end_at
            )
        );

        v_item_start_at := v_item_end_at;
    END LOOP;

    v_end_at := v_item_start_at;
    v_total_price := round(v_total_price, 2);
    v_deposit_amount := round(v_deposit_amount, 2);
    v_parent_deposit_percent := CASE
        WHEN v_total_price > 0
            THEN round(v_deposit_amount * 100 / v_total_price, 2)
        ELSE 0
    END;

    /*
     * Locks de linha em ordem estavel. Chamadas v2 que compartilham uma
     * profissional sao serializadas; profissionais distintas nao se
     * bloqueiam entre si.
     */
    PERFORM profissional.id
    FROM public.profissionais AS profissional
    WHERE profissional.id = ANY(v_profissional_ids)
    ORDER BY profissional.id
    FOR UPDATE;

    /*
     * Validacao final depois dos locks. Considera tanto o modelo legado
     * quanto os periodos individuais ja criados pela v2.
     */
    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(v_validated_items)
        ORDER BY (value ->> 'ordem')::integer
    LOOP
        IF EXISTS (
            SELECT 1
            FROM public.agendamentos AS agendamento
            WHERE agendamento.profissional_id = (v_item ->> 'profissional_id')::uuid
              AND NOT EXISTS (
                    SELECT 1
                    FROM public.agendamento_itens AS qualquer_item
                    WHERE qualquer_item.agendamento_id = agendamento.id
                  )
              AND agendamento.status IN (
                    'solicitado',
                    'aguardando_sinal',
                    'confirmado',
                    'reagendamento_solicitado'
                  )
              AND agendamento.start_at < (v_item ->> 'item_end_at')::timestamptz
              AND agendamento.end_at > (v_item ->> 'item_start_at')::timestamptz
        ) OR EXISTS (
            SELECT 1
            FROM public.agendamento_itens AS item_existente
            INNER JOIN public.agendamentos AS agendamento
                ON agendamento.id = item_existente.agendamento_id
            WHERE item_existente.profissional_id = (v_item ->> 'profissional_id')::uuid
              AND item_existente.item_start_at IS NOT NULL
              AND item_existente.item_end_at IS NOT NULL
              AND agendamento.status IN (
                    'solicitado',
                    'aguardando_sinal',
                    'confirmado',
                    'reagendamento_solicitado'
                  )
              AND item_existente.item_start_at < (v_item ->> 'item_end_at')::timestamptz
              AND item_existente.item_end_at > (v_item ->> 'item_start_at')::timestamptz
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format(
                    'A profissional do procedimento %s nao esta mais disponivel nesse periodo.',
                    v_item ->> 'ordem'
                )
            );
        END IF;
    END LOOP;

    /* Somente agora a cliente pode ser criada ou atualizada. */
    IF v_cliente.id IS NOT NULL THEN
        UPDATE public.clientes
        SET full_name = COALESCE(v_cliente_nome, full_name),
            phone = COALESCE(v_cliente_phone, phone),
            email = COALESCE(v_cliente_email, email)
        WHERE id = v_cliente.id
        RETURNING id INTO v_cliente_id;
    ELSE
        INSERT INTO public.clientes (
            full_name,
            phone,
            email
        )
        VALUES (
            v_cliente_nome,
            v_cliente_phone,
            v_cliente_email
        )
        RETURNING id INTO v_cliente_id;
    END IF;

    INSERT INTO public.agendamentos (
        cliente_id,
        profissional_id,
        servico_id,
        start_at,
        end_at,
        status,
        appointment_type,
        source,
        notes,
        total_price,
        requires_deposit,
        deposit_percent,
        deposit_amount
    )
    VALUES (
        v_cliente_id,
        v_first_profissional_id,
        v_first_servico_id,
        p_start_at,
        v_end_at,
        CASE
            WHEN v_deposit_amount > 0 THEN 'aguardando_sinal'
            ELSE 'confirmado'
        END,
        COALESCE(NULLIF(btrim(p_appointment_type), ''), 'normal'),
        CASE WHEN v_is_staff THEN 'recepcao' ELSE 'cliente' END,
        NULLIF(btrim(p_notes), ''),
        v_total_price,
        v_deposit_amount > 0,
        v_parent_deposit_percent,
        v_deposit_amount
    )
    RETURNING id INTO v_agendamento_id;

    INSERT INTO public.agendamento_itens (
        agendamento_id,
        servico_id,
        profissional_id,
        ordem,
        nome_snapshot,
        categoria_snapshot,
        valor_snapshot,
        duracao_snapshot,
        requires_deposit_snapshot,
        deposit_percent_snapshot,
        item_start_at,
        item_end_at
    )
    SELECT
        v_agendamento_id,
        (item.value ->> 'servico_id')::uuid,
        (item.value ->> 'profissional_id')::uuid,
        (item.value ->> 'ordem')::integer,
        item.value ->> 'nome_snapshot',
        item.value ->> 'categoria_snapshot',
        (item.value ->> 'valor_snapshot')::numeric,
        (item.value ->> 'duracao_snapshot')::integer,
        (item.value ->> 'requires_deposit_snapshot')::boolean,
        (item.value ->> 'deposit_percent_snapshot')::numeric,
        (item.value ->> 'item_start_at')::timestamptz,
        (item.value ->> 'item_end_at')::timestamptz
    FROM jsonb_array_elements(v_validated_items) AS item(value)
    ORDER BY (item.value ->> 'ordem')::integer;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Agendamento criado com sucesso.',
        'agendamentoId', v_agendamento_id,
        'clienteId', v_cliente_id,
        'status', CASE
            WHEN v_deposit_amount > 0 THEN 'aguardando_sinal'
            ELSE 'confirmado'
        END,
        'startAt', p_start_at,
        'endAt', v_end_at,
        'totalPrice', v_total_price,
        'depositAmount', v_deposit_amount,
        'depositPercent', v_parent_deposit_percent,
        'items', v_validated_items
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.solicitar_agendamento_recepcao_v2(
    uuid,
    timestamptz,
    jsonb,
    text,
    text,
    text,
    text,
    boolean,
    numeric,
    text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.solicitar_agendamento_recepcao_v2(
    uuid,
    timestamptz,
    jsonb,
    text,
    text,
    text,
    text,
    boolean,
    numeric,
    text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.solicitar_agendamento_recepcao_v2(
    uuid,
    timestamptz,
    jsonb,
    text,
    text,
    text,
    text,
    boolean,
    numeric,
    text
) TO authenticated;
