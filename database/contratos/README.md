# Banco de Dados Nail Dreams SaaS

## Módulo Contratos

Fluxo:

Contrato criado
↓
pendente_assinatura

Profissional envia documento
↓
aguardando_validacao

Admin valida
↓
ativo


## Auditoria

Toda alteração importante gera evento:

contrato_criado

documento_recebido

contrato_validado

contrato_revisao_solicitada