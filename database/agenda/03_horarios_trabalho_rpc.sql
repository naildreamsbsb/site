/*
=====================================================

NAIL DREAMS

RPCs SEGURAS PARA HORARIOS DE TRABALHO

- listar_meus_horarios_trabalho()
- listar_horarios_profissional_staff(uuid)
- salvar_meus_horarios_trabalho(jsonb)
- salvar_horarios_profissional_admin(uuid, jsonb)

=====================================================
*/


CREATE OR REPLACE FUNCTION public.listar_meus_horarios_trabalho()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_profissional_id uuid;
    v_profissional_nome text;
    v_items jsonb;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você precisa estar logado para listar seus horários.'
        );
    END IF;

    SELECT profissional.id, profissional.name
    INTO v_profissional_id, v_profissional_nome
    FROM public.profiles AS perfil
    INNER JOIN public.profissionais AS profissional
        ON profissional.profile_id = perfil.id
    WHERE perfil.id = v_user_id
      AND perfil.role = 'profissional'
    LIMIT 1;

    IF v_profissional_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Nenhuma profissional vinculada ao usuário autenticado foi encontrada.'
        );
    END IF;

    SELECT COALESCE(
        jsonb_agg(item ORDER BY item_weekday, item_start_time),
        '[]'::jsonb
    )
    INTO v_items
    FROM (
        SELECT
            horario.weekday AS item_weekday,
            horario.start_time AS item_start_time,
            jsonb_build_object(
                'id', horario.id,
                'weekday', horario.weekday,
                'startTime', to_char(CURRENT_DATE + horario.start_time, 'HH24:MI'),
                'endTime', to_char(CURRENT_DATE + horario.end_time, 'HH24:MI'),
                'active', horario.active
            ) AS item
        FROM public.horarios_trabalho AS horario
        WHERE horario.profissional_id = v_profissional_id
    ) AS horarios;

    RETURN jsonb_build_object(
        'success', true,
        'profissionalId', v_profissional_id,
        'profissionalNome', v_profissional_nome,
        'total', jsonb_array_length(v_items),
        'items', v_items
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Não foi possível listar seus horários de trabalho.'
        );
END;
$function$;


CREATE OR REPLACE FUNCTION public.listar_horarios_profissional_staff(
    p_profissional_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_profissional_nome text;
    v_items jsonb;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você precisa estar logado para listar horários profissionais.'
        );
    END IF;

    IF NOT COALESCE(public.is_staff(), false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Acesso permitido somente para a equipe do studio.'
        );
    END IF;

    IF p_profissional_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Informe a profissional.'
        );
    END IF;

    SELECT profissional.name
    INTO v_profissional_nome
    FROM public.profissionais AS profissional
    WHERE profissional.id = p_profissional_id;

    IF v_profissional_nome IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Profissional não encontrada.'
        );
    END IF;

    SELECT COALESCE(
        jsonb_agg(item ORDER BY item_weekday, item_start_time),
        '[]'::jsonb
    )
    INTO v_items
    FROM (
        SELECT
            horario.weekday AS item_weekday,
            horario.start_time AS item_start_time,
            jsonb_build_object(
                'id', horario.id,
                'weekday', horario.weekday,
                'startTime', to_char(CURRENT_DATE + horario.start_time, 'HH24:MI'),
                'endTime', to_char(CURRENT_DATE + horario.end_time, 'HH24:MI'),
                'active', horario.active
            ) AS item
        FROM public.horarios_trabalho AS horario
        WHERE horario.profissional_id = p_profissional_id
    ) AS horarios;

    RETURN jsonb_build_object(
        'success', true,
        'profissionalId', p_profissional_id,
        'profissionalNome', v_profissional_nome,
        'total', jsonb_array_length(v_items),
        'items', v_items
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Não foi possível listar os horários da profissional.'
        );
END;
$function$;


CREATE OR REPLACE FUNCTION public.salvar_meus_horarios_trabalho(
    p_periodos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_profissional_id uuid;
    v_profissional_nome text;
    v_periodo record;
    v_target_id uuid;
    v_natural_id uuid;
    v_items jsonb;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você precisa estar logado para salvar seus horários.'
        );
    END IF;

    SELECT profissional.id, profissional.name
    INTO v_profissional_id, v_profissional_nome
    FROM public.profiles AS perfil
    INNER JOIN public.profissionais AS profissional
        ON profissional.profile_id = perfil.id
    WHERE perfil.id = v_user_id
      AND perfil.role = 'profissional'
    LIMIT 1;

    IF v_profissional_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Nenhuma profissional vinculada ao usuário autenticado foi encontrada.'
        );
    END IF;

    IF p_periodos IS NULL OR jsonb_typeof(p_periodos) IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Os períodos devem ser enviados em uma lista JSON.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_periodos) AS periodo(
            id uuid,
            weekday integer,
            start_time time,
            end_time time,
            active boolean
        )
        WHERE periodo.weekday IS NULL
           OR periodo.weekday < 0
           OR periodo.weekday > 6
           OR periodo.start_time IS NULL
           OR periodo.end_time IS NULL
           OR periodo.start_time >= periodo.end_time
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Existem períodos com dia ou horário inválido.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_periodos) AS periodo(
            id uuid,
            weekday integer,
            start_time time,
            end_time time,
            active boolean
        )
        GROUP BY periodo.weekday, periodo.start_time, periodo.end_time
        HAVING COUNT(*) > 1
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'A configuração contém períodos duplicados.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_periodos) AS periodo(
            id uuid,
            weekday integer,
            start_time time,
            end_time time,
            active boolean
        )
        WHERE periodo.id IS NOT NULL
        GROUP BY periodo.id
        HAVING COUNT(*) > 1
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'A configuração repete o mesmo identificador de período.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_periodos) AS periodo(
            id uuid,
            weekday integer,
            start_time time,
            end_time time,
            active boolean
        )
        WHERE periodo.id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM public.horarios_trabalho AS horario
              WHERE horario.id = periodo.id
                AND horario.profissional_id = v_profissional_id
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Um dos períodos não pertence à profissional autenticada.'
        );
    END IF;

    IF EXISTS (
        WITH periodos AS (
            SELECT
                ROW_NUMBER() OVER () AS numero,
                periodo.weekday,
                periodo.start_time,
                periodo.end_time,
                COALESCE(periodo.active, true) AS active
            FROM jsonb_to_recordset(p_periodos) AS periodo(
                id uuid,
                weekday integer,
                start_time time,
                end_time time,
                active boolean
            )
        )
        SELECT 1
        FROM periodos AS primeiro
        INNER JOIN periodos AS segundo
            ON primeiro.numero < segundo.numero
           AND primeiro.weekday = segundo.weekday
           AND primeiro.active = true
           AND segundo.active = true
           AND primeiro.start_time < segundo.end_time
           AND segundo.start_time < primeiro.end_time
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Existem períodos ativos sobrepostos no mesmo dia.'
        );
    END IF;

    PERFORM 1
    FROM public.profissionais AS profissional
    WHERE profissional.id = v_profissional_id
    FOR UPDATE;

    UPDATE public.horarios_trabalho
    SET active = false,
        updated_at = now()
    WHERE profissional_id = v_profissional_id;

    FOR v_periodo IN
        SELECT
            periodo.id,
            periodo.weekday,
            periodo.start_time,
            periodo.end_time,
            COALESCE(periodo.active, true) AS active
        FROM jsonb_to_recordset(p_periodos) AS periodo(
            id uuid,
            weekday integer,
            start_time time,
            end_time time,
            active boolean
        )
    LOOP
        v_target_id := NULL;
        v_natural_id := NULL;

        SELECT horario.id
        INTO v_natural_id
        FROM public.horarios_trabalho AS horario
        WHERE horario.profissional_id = v_profissional_id
          AND horario.weekday = v_periodo.weekday
          AND horario.start_time = v_periodo.start_time
          AND horario.end_time = v_periodo.end_time;

        IF v_natural_id IS NOT NULL THEN
            v_target_id := v_natural_id;
        ELSIF v_periodo.id IS NOT NULL THEN
            v_target_id := v_periodo.id;
        END IF;

        IF v_target_id IS NOT NULL THEN
            UPDATE public.horarios_trabalho
            SET weekday = v_periodo.weekday,
                start_time = v_periodo.start_time,
                end_time = v_periodo.end_time,
                active = v_periodo.active,
                updated_at = now()
            WHERE id = v_target_id
              AND profissional_id = v_profissional_id;
        ELSE
            INSERT INTO public.horarios_trabalho (
                profissional_id,
                weekday,
                start_time,
                end_time,
                active,
                updated_at
            )
            VALUES (
                v_profissional_id,
                v_periodo.weekday,
                v_periodo.start_time,
                v_periodo.end_time,
                v_periodo.active,
                now()
            );
        END IF;
    END LOOP;

    SELECT COALESCE(
        jsonb_agg(item ORDER BY item_weekday, item_start_time),
        '[]'::jsonb
    )
    INTO v_items
    FROM (
        SELECT
            horario.weekday AS item_weekday,
            horario.start_time AS item_start_time,
            jsonb_build_object(
                'id', horario.id,
                'weekday', horario.weekday,
                'startTime', to_char(CURRENT_DATE + horario.start_time, 'HH24:MI'),
                'endTime', to_char(CURRENT_DATE + horario.end_time, 'HH24:MI'),
                'active', horario.active
            ) AS item
        FROM public.horarios_trabalho AS horario
        WHERE horario.profissional_id = v_profissional_id
    ) AS horarios;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Horários de trabalho atualizados com sucesso.',
        'profissionalId', v_profissional_id,
        'profissionalNome', v_profissional_nome,
        'total', jsonb_array_length(v_items),
        'items', v_items
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Não foi possível salvar seus horários de trabalho.'
        );
END;
$function$;


CREATE OR REPLACE FUNCTION public.salvar_horarios_profissional_admin(
    p_profissional_id uuid,
    p_periodos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_profissional_nome text;
    v_periodo record;
    v_target_id uuid;
    v_natural_id uuid;
    v_items jsonb;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você precisa estar logado para salvar horários profissionais.'
        );
    END IF;

    IF NOT COALESCE(public.is_admin(), false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Acesso permitido somente para administradores.'
        );
    END IF;

    IF p_profissional_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Informe a profissional.'
        );
    END IF;

    SELECT profissional.name
    INTO v_profissional_nome
    FROM public.profissionais AS profissional
    WHERE profissional.id = p_profissional_id;

    IF v_profissional_nome IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Profissional não encontrada.'
        );
    END IF;

    IF p_periodos IS NULL OR jsonb_typeof(p_periodos) IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Os períodos devem ser enviados em uma lista JSON.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_periodos) AS periodo(
            id uuid,
            weekday integer,
            start_time time,
            end_time time,
            active boolean
        )
        WHERE periodo.weekday IS NULL
           OR periodo.weekday < 0
           OR periodo.weekday > 6
           OR periodo.start_time IS NULL
           OR periodo.end_time IS NULL
           OR periodo.start_time >= periodo.end_time
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Existem períodos com dia ou horário inválido.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_periodos) AS periodo(
            id uuid,
            weekday integer,
            start_time time,
            end_time time,
            active boolean
        )
        GROUP BY periodo.weekday, periodo.start_time, periodo.end_time
        HAVING COUNT(*) > 1
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'A configuração contém períodos duplicados.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_periodos) AS periodo(
            id uuid,
            weekday integer,
            start_time time,
            end_time time,
            active boolean
        )
        WHERE periodo.id IS NOT NULL
        GROUP BY periodo.id
        HAVING COUNT(*) > 1
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'A configuração repete o mesmo identificador de período.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_periodos) AS periodo(
            id uuid,
            weekday integer,
            start_time time,
            end_time time,
            active boolean
        )
        WHERE periodo.id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM public.horarios_trabalho AS horario
              WHERE horario.id = periodo.id
                AND horario.profissional_id = p_profissional_id
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Um dos períodos não pertence à profissional informada.'
        );
    END IF;

    IF EXISTS (
        WITH periodos AS (
            SELECT
                ROW_NUMBER() OVER () AS numero,
                periodo.weekday,
                periodo.start_time,
                periodo.end_time,
                COALESCE(periodo.active, true) AS active
            FROM jsonb_to_recordset(p_periodos) AS periodo(
                id uuid,
                weekday integer,
                start_time time,
                end_time time,
                active boolean
            )
        )
        SELECT 1
        FROM periodos AS primeiro
        INNER JOIN periodos AS segundo
            ON primeiro.numero < segundo.numero
           AND primeiro.weekday = segundo.weekday
           AND primeiro.active = true
           AND segundo.active = true
           AND primeiro.start_time < segundo.end_time
           AND segundo.start_time < primeiro.end_time
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Existem períodos ativos sobrepostos no mesmo dia.'
        );
    END IF;

    PERFORM 1
    FROM public.profissionais AS profissional
    WHERE profissional.id = p_profissional_id
    FOR UPDATE;

    UPDATE public.horarios_trabalho
    SET active = false,
        updated_at = now()
    WHERE profissional_id = p_profissional_id;

    FOR v_periodo IN
        SELECT
            periodo.id,
            periodo.weekday,
            periodo.start_time,
            periodo.end_time,
            COALESCE(periodo.active, true) AS active
        FROM jsonb_to_recordset(p_periodos) AS periodo(
            id uuid,
            weekday integer,
            start_time time,
            end_time time,
            active boolean
        )
    LOOP
        v_target_id := NULL;
        v_natural_id := NULL;

        SELECT horario.id
        INTO v_natural_id
        FROM public.horarios_trabalho AS horario
        WHERE horario.profissional_id = p_profissional_id
          AND horario.weekday = v_periodo.weekday
          AND horario.start_time = v_periodo.start_time
          AND horario.end_time = v_periodo.end_time;

        IF v_natural_id IS NOT NULL THEN
            v_target_id := v_natural_id;
        ELSIF v_periodo.id IS NOT NULL THEN
            v_target_id := v_periodo.id;
        END IF;

        IF v_target_id IS NOT NULL THEN
            UPDATE public.horarios_trabalho
            SET weekday = v_periodo.weekday,
                start_time = v_periodo.start_time,
                end_time = v_periodo.end_time,
                active = v_periodo.active,
                updated_at = now()
            WHERE id = v_target_id
              AND profissional_id = p_profissional_id;
        ELSE
            INSERT INTO public.horarios_trabalho (
                profissional_id,
                weekday,
                start_time,
                end_time,
                active,
                updated_at
            )
            VALUES (
                p_profissional_id,
                v_periodo.weekday,
                v_periodo.start_time,
                v_periodo.end_time,
                v_periodo.active,
                now()
            );
        END IF;
    END LOOP;

    SELECT COALESCE(
        jsonb_agg(item ORDER BY item_weekday, item_start_time),
        '[]'::jsonb
    )
    INTO v_items
    FROM (
        SELECT
            horario.weekday AS item_weekday,
            horario.start_time AS item_start_time,
            jsonb_build_object(
                'id', horario.id,
                'weekday', horario.weekday,
                'startTime', to_char(CURRENT_DATE + horario.start_time, 'HH24:MI'),
                'endTime', to_char(CURRENT_DATE + horario.end_time, 'HH24:MI'),
                'active', horario.active
            ) AS item
        FROM public.horarios_trabalho AS horario
        WHERE horario.profissional_id = p_profissional_id
    ) AS horarios;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Horários da profissional atualizados com sucesso.',
        'profissionalId', p_profissional_id,
        'profissionalNome', v_profissional_nome,
        'total', jsonb_array_length(v_items),
        'items', v_items
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Não foi possível salvar os horários da profissional.'
        );
END;
$function$;
