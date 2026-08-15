/* Adiciona itens à leitura da cliente preservando o contrato legado da RPC. */

CREATE OR REPLACE FUNCTION public.listar_meus_agendamentos_cliente()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_cliente_id uuid;
    v_items jsonb;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você precisa estar logado para listar seus agendamentos.'
        );
    END IF;

    SELECT c.id
    INTO v_cliente_id
    FROM public.clientes AS c
    INNER JOIN public.profiles AS p
        ON p.id = c.profile_id
    WHERE c.profile_id = v_user_id
      AND p.role = 'cliente'
    LIMIT 1;

    IF v_cliente_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Nenhuma cliente vinculada ao usuário autenticado foi encontrada.'
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
                'servicoNome', s.name,
                'servicoCategoria', s.category,
                'profissionalNome', profissional.name,
                'data', to_char(
                    a.start_at AT TIME ZONE 'America/Sao_Paulo',
                    'YYYY-MM-DD'
                ),
                'horaInicio', to_char(
                    a.start_at AT TIME ZONE 'America/Sao_Paulo',
                    'HH24:MI'
                ),
                'horaFim', to_char(
                    a.end_at AT TIME ZONE 'America/Sao_Paulo',
                    'HH24:MI'
                ),
                'status', a.status,
                'totalPrice', a.total_price,
                'depositAmount', a.deposit_amount,
                'paymentStatus', a.payment_status,
                'itens', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'servicoNome', ai.nome_snapshot,
                            'categoria', ai.categoria_snapshot,
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
        INNER JOIN public.profissionais AS profissional
            ON profissional.id = a.profissional_id
        LEFT JOIN public.servicos AS s
            ON s.id = a.servico_id
        WHERE a.cliente_id = v_cliente_id
    ) AS meus_agendamentos;

    RETURN jsonb_build_object(
        'success', true,
        'total', jsonb_array_length(v_items),
        'items', v_items
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Não foi possível listar seus agendamentos.'
        );
END;
$function$;
