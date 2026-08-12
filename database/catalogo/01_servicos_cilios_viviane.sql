-- Catálogo de efeitos de cílios da Viviane.
-- Preparado para execução manual no Supabase. NÃO foi executado por este projeto.
--
-- Premissas validadas em tempo de execução:
--   1. existe exatamente uma profissional chamada Viviane Oliveira;
--   2. existe exatamente um serviço genérico chamado Cílios;
--   3. a duração e as regras de sinal são herdadas desse serviço;
--   4. o serviço genérico não possui vínculo com outra profissional.
--
-- O registro genérico e todos os agendamentos históricos são preservados.

BEGIN;

DO $catalogo$
DECLARE
    v_viviane_id uuid;
    v_cilios_id uuid;
    v_duration_minutes integer;
    v_requires_deposit boolean;
    v_deposit_percent numeric;
    v_service record;
    v_service_id uuid;
BEGIN
    SELECT p.id
      INTO v_viviane_id
      FROM public.profissionais AS p
     WHERE lower(trim(p.name)) = lower('Viviane Oliveira');

    IF v_viviane_id IS NULL THEN
        RAISE EXCEPTION 'Profissional Viviane Oliveira não encontrada; catálogo não alterado.';
    END IF;

    IF (SELECT count(*) FROM public.profissionais AS p WHERE lower(trim(p.name)) = lower('Viviane Oliveira')) <> 1 THEN
        RAISE EXCEPTION 'Mais de uma profissional chamada Viviane Oliveira foi encontrada; catálogo não alterado.';
    END IF;

    SELECT s.id, s.duration_minutes, s.requires_deposit_default, s.deposit_percent_default
      INTO v_cilios_id, v_duration_minutes, v_requires_deposit, v_deposit_percent
      FROM public.servicos AS s
     WHERE lower(trim(s.name)) = lower('Cílios');

    IF v_cilios_id IS NULL THEN
        RAISE EXCEPTION 'Serviço genérico Cílios não encontrado; catálogo não alterado.';
    END IF;

    IF (SELECT count(*) FROM public.servicos AS s WHERE lower(trim(s.name)) = lower('Cílios')) <> 1 THEN
        RAISE EXCEPTION 'Mais de um serviço genérico Cílios foi encontrado; catálogo não alterado.';
    END IF;

    IF v_duration_minutes IS NULL OR v_duration_minutes <= 0 THEN
        RAISE EXCEPTION 'A duração do serviço genérico Cílios é inválida; catálogo não alterado.';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.profissional_servicos AS ps
         WHERE ps.servico_id = v_cilios_id
           AND ps.profissional_id <> v_viviane_id
           AND ps.active = true
    ) THEN
        RAISE EXCEPTION 'O serviço genérico Cílios possui vínculo ativo com outra profissional; catálogo não alterado.';
    END IF;

    FOR v_service IN
        SELECT *
          FROM (VALUES
              ('Volume Egípcio'::text, 180.00::numeric),
              ('Volume Inglês (5D)'::text, 185.00::numeric),
              ('Volume Brasileiro'::text, 145.00::numeric),
              ('Fox Eyes'::text, 180.00::numeric),
              ('Mega Volume'::text, 200.00::numeric)
          ) AS requested(name, price)
    LOOP
        IF (SELECT count(*) FROM public.servicos AS s WHERE lower(trim(s.name)) = lower(v_service.name)) > 1 THEN
            RAISE EXCEPTION 'Mais de um serviço chamado % foi encontrado; catálogo não alterado.', v_service.name;
        END IF;

        SELECT s.id
          INTO v_service_id
          FROM public.servicos AS s
         WHERE lower(trim(s.name)) = lower(v_service.name)
         ORDER BY s.id
         LIMIT 1;

        IF v_service_id IS NULL THEN
            INSERT INTO public.servicos (
                name,
                category,
                description,
                duration_minutes,
                price,
                active,
                requires_deposit_default,
                deposit_percent_default
            ) VALUES (
                v_service.name,
                'Cílios',
                'Extensão de cílios com efeito ' || v_service.name || '.',
                v_duration_minutes,
                v_service.price,
                true,
                COALESCE(v_requires_deposit, false),
                COALESCE(v_deposit_percent, 0)
            )
            RETURNING id INTO v_service_id;
        ELSE
            UPDATE public.servicos
               SET category = 'Cílios',
                   duration_minutes = v_duration_minutes,
                   price = v_service.price,
                   active = true,
                   requires_deposit_default = COALESCE(v_requires_deposit, false),
                   deposit_percent_default = COALESCE(v_deposit_percent, 0)
             WHERE id = v_service_id;
        END IF;

        UPDATE public.profissional_servicos
           SET active = true
         WHERE profissional_id = v_viviane_id
           AND servico_id = v_service_id;

        IF NOT FOUND THEN
            INSERT INTO public.profissional_servicos (profissional_id, servico_id, active)
            VALUES (v_viviane_id, v_service_id, true);
        END IF;
    END LOOP;

    -- Mantém o registro e seu histórico, removendo apenas a oferta para novos agendamentos.
    UPDATE public.profissional_servicos
       SET active = false
     WHERE profissional_id = v_viviane_id
       AND servico_id = v_cilios_id;

    UPDATE public.servicos
       SET active = false
     WHERE id = v_cilios_id;
END;
$catalogo$;

COMMIT;
