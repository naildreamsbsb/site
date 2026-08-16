/*
Permite que admin e recepcao consultem encaixes retroativos apenas no dia
atual, preservando integralmente get_horarios_disponiveis para clientes.
*/

CREATE OR REPLACE FUNCTION public.get_horarios_disponiveis_staff(
    p_profissional_id uuid,
    p_servico_id uuid,
    p_data date,
    p_intervalo_minutos integer DEFAULT 30
)
RETURNS TABLE(
    horario text,
    start_at timestamptz,
    end_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    WITH config AS (
        SELECT
            profissional.id AS profissional_id,
            servico.id AS servico_id,
            COALESCE(vinculo.custom_duration_minutes, servico.duration_minutes) AS duration_minutes
        FROM public.profissionais AS profissional
        INNER JOIN public.profissional_servicos AS vinculo
            ON vinculo.profissional_id = profissional.id
        INNER JOIN public.servicos AS servico
            ON servico.id = vinculo.servico_id
        WHERE profissional.id = p_profissional_id
          AND servico.id = p_servico_id
          AND profissional.active = true
          AND servico.active = true
          AND vinculo.active = true
          AND COALESCE(public.is_staff(), false)
    ),
    expediente AS (
        SELECT
            ((p_data::timestamp + horario.start_time) AT TIME ZONE 'America/Sao_Paulo') AS inicio_expediente,
            ((p_data::timestamp + horario.end_time) AT TIME ZONE 'America/Sao_Paulo') AS fim_expediente,
            config.duration_minutes
        FROM public.horarios_trabalho AS horario
        CROSS JOIN config
        WHERE horario.profissional_id = p_profissional_id
          AND horario.active = true
          AND horario.weekday = EXTRACT(DOW FROM p_data)::integer
    ),
    candidatos AS (
        SELECT
            serie AS start_at,
            serie + (expediente.duration_minutes || ' minutes')::interval AS end_at
        FROM expediente
        CROSS JOIN LATERAL generate_series(
            expediente.inicio_expediente,
            expediente.fim_expediente - (expediente.duration_minutes || ' minutes')::interval,
            make_interval(mins => GREATEST(p_intervalo_minutos, 5))
        ) AS serie
    )
    SELECT
        to_char(candidato.start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS horario,
        candidato.start_at,
        candidato.end_at
    FROM candidatos AS candidato
    WHERE (
            candidato.start_at > now()
            OR p_data = (now() AT TIME ZONE 'America/Sao_Paulo')::date
          )
      AND NOT EXISTS (
            SELECT 1
            FROM public.agendamentos AS agendamento
            WHERE agendamento.profissional_id = p_profissional_id
              AND agendamento.status IN (
                    'solicitado',
                    'aguardando_sinal',
                    'confirmado',
                    'reagendamento_solicitado'
                  )
              AND tstzrange(agendamento.start_at, agendamento.end_at, '[)')
                  && tstzrange(candidato.start_at, candidato.end_at, '[)')
          )
      AND NOT EXISTS (
            SELECT 1
            FROM public.bloqueios_agenda AS bloqueio
            WHERE bloqueio.active = true
              AND (
                    bloqueio.profissional_id = p_profissional_id
                    OR bloqueio.profissional_id IS NULL
                  )
              AND tstzrange(bloqueio.start_at, bloqueio.end_at, '[)')
                  && tstzrange(candidato.start_at, candidato.end_at, '[)')
          )
    ORDER BY candidato.start_at;
$function$;

REVOKE ALL ON FUNCTION public.get_horarios_disponiveis_staff(uuid, uuid, date, integer)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_horarios_disponiveis_staff(uuid, uuid, date, integer)
TO authenticated;
