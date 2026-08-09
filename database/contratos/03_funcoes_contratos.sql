/*
=====================================================
FUNÇÃO

registrar_evento_contrato()

Objetivo:

Criar registros imutáveis na timeline
dos contratos.

=====================================================
*/


CREATE OR REPLACE FUNCTION public.registrar_evento_contrato(
...
);


/*
=====================================================
FUNÇÃO

enviar_contrato_assinado_profissional()

Alterações:

- recebe documento assinado
- muda status para aguardando_validacao
- cria evento documento_recebido

=====================================================
*/


