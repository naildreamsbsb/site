/*
=====================================================

NAIL DREAMS SaaS

MÓDULO:
Contratos Profissionais

ARQUIVO:
01_estrutura_contratos.sql

OBJETIVO:
Documentação técnica da estrutura das tabelas
relacionadas ao gerenciamento de contratos
entre o Studio e profissionais.

=====================================================
*/


/*
=====================================================
TABELA:
contratos_profissionais

FINALIDADE:

Armazena os contratos firmados entre o Nail Dreams
e suas profissionais.

Responsável por controlar:

- criação do contrato;
- versão contratual;
- período de experiência;
- comissão;
- assinatura;
- envio do documento;
- validação administrativa;
- encerramento da parceria.

=====================================================
*/


contratos_profissionais

Campos:


id
---------------------------------
Tipo:
uuid

Descrição:
Identificador único do contrato.


profissional_id
---------------------------------
Tipo:
uuid

Descrição:
Relaciona o contrato ao cadastro da profissional.


numero_contrato
---------------------------------
Tipo:
text

Descrição:
Número identificador do contrato.

Exemplo:
ND-2026-C9E28752


versao
---------------------------------
Tipo:
text

Descrição:
Versão do contrato.


status
---------------------------------
Tipo:
text

Valores utilizados:

pendente_assinatura
aguardando_validacao
ativo
revisao_necessaria

Descrição:
Representa a etapa atual do fluxo contratual.


data_inicio
---------------------------------
Tipo:
date

Descrição:
Data de início da parceria.


periodo_experiencia_meses
---------------------------------
Tipo:
integer

Descrição:
Quantidade de meses do período de experiência.


data_fim_experiencia
---------------------------------
Tipo:
date

Descrição:
Data final prevista do período de experiência.


percentual_experiencia
---------------------------------
Tipo:
numeric

Descrição:
Percentual de comissão durante o período
de experiência.


percentual_pos_experiencia
---------------------------------
Tipo:
numeric

Descrição:
Percentual de comissão após o período
de experiência.


conteudo_contrato
---------------------------------
Tipo:
text

Descrição:
Texto completo do contrato gerado pelo sistema.


arquivo_assinado_url
---------------------------------
Tipo:
text

Descrição:
Referência do arquivo do contrato assinado.


tipo_assinatura
---------------------------------
Tipo:
text

Exemplo:
gov_br

Descrição:
Método utilizado para assinatura.


assinatura_referencia
---------------------------------
Tipo:
text

Descrição:
Referência complementar da assinatura.


aceito
---------------------------------
Tipo:
boolean

Descrição:
Indica se a profissional enviou aceite/documento.


aceito_em
---------------------------------
Tipo:
timestamp with time zone

Descrição:
Data e hora do aceite.


enviado_em
---------------------------------
Tipo:
timestamp with time zone

Descrição:
Data e hora do envio do documento assinado.


validado_por
---------------------------------
Tipo:
uuid

Descrição:
Usuário administrativo responsável pela validação.


validado_em
---------------------------------
Tipo:
timestamp with time zone

Descrição:
Data da validação administrativa.


observacao_validacao
---------------------------------
Tipo:
text

Descrição:
Observações do administrador durante a validação.


data_fim
---------------------------------
Tipo:
date

Descrição:
Encerramento do contrato.


encerrado_em
---------------------------------
Tipo:
timestamp with time zone

Descrição:
Momento do encerramento.


motivo_encerramento
---------------------------------
Tipo:
text

Descrição:
Motivo do encerramento da parceria.


criado_por
---------------------------------
Tipo:
uuid

Descrição:
Usuário que criou o contrato.


atualizado_por
---------------------------------
Tipo:
uuid

Descrição:
Usuário que realizou última atualização.


dados_studio_snapshot
---------------------------------
Tipo:
jsonb

Descrição:
Cópia dos dados do Studio no momento
da criação do contrato.


dados_profissional_snapshot
---------------------------------
Tipo:
jsonb

Descrição:
Cópia dos dados da profissional no momento
da criação do contrato.


created_at
---------------------------------
Tipo:
timestamp with time zone

Descrição:
Data de criação do registro.


updated_at
---------------------------------
Tipo:
timestamp with time zone

Descrição:
Última atualização do registro.



/*
=====================================================
TABELA:
dados_contratuais_profissionais

FINALIDADE:

Armazena informações complementares utilizadas
na composição contratual das profissionais.

=====================================================
*/


dados_contratuais_profissionais

Descrição:

Tabela complementar vinculada aos contratos,
utilizada para guardar informações contratuais
específicas.


/*
=====================================================
TABELA:
contratos_eventos

FINALIDADE:

Mantém o histórico imutável de acontecimentos
relacionados aos contratos.

=====================================================
*/


contratos_eventos


Campos:


id
---------------------------------
Tipo:
uuid

Descrição:
Identificador do evento.


contrato_id
---------------------------------
Tipo:
uuid

Descrição:
Contrato relacionado ao evento.


tipo_evento
---------------------------------
Tipo:
text

Exemplos:

contrato_criado
documento_recebido
contrato_validado
contrato_revisao_solicitada


descricao
---------------------------------
Tipo:
text

Descrição:
Texto apresentado no histórico.


usuario_id
---------------------------------
Tipo:
uuid

Descrição:
Usuário responsável pela ação.


dados_extra
---------------------------------
Tipo:
jsonb

Descrição:
Informações adicionais do evento.


created_at
---------------------------------
Tipo:
timestamp with time zone

Descrição:
Data e hora do evento.



/*
=====================================================
REGRAS IMPORTANTES

1.
O histórico de eventos não deve ser alterado
manualmente.

2.
Profissionais podem visualizar apenas eventos
dos próprios contratos.

3.
Administradores possuem visão completa.

4.
Alterações importantes devem gerar eventos
através da função:

registrar_evento_contrato()

=====================================================
*/