/*
=====================================================

NAIL DREAMS SaaS

MÓDULO:
Contratos Profissionais

ARQUIVO:
02_eventos_contratos.sql

OBJETIVO:

Documentar o sistema de auditoria dos contratos
profissionais.

A tabela contratos_eventos funciona como uma
timeline imutável dos acontecimentos contratuais.

=====================================================
*/


/*
=====================================================
TABELA:

contratos_eventos

=====================================================


FINALIDADE:

Registrar todos os acontecimentos importantes
relacionados aos contratos profissionais.

A tabela não representa o estado atual do contrato.

Ela representa a HISTÓRIA do contrato.


Exemplo:

Contrato criado
        ↓
Documento enviado
        ↓
Contrato validado
        ↓
Contrato encerrado


O status atual fica em:

contratos_profissionais.status


O histórico fica em:

contratos_eventos


=====================================================
*/


contratos_eventos


Campos:


id
---------------------------------

Tipo:
uuid


Descrição:

Identificador único do evento.



contrato_id
---------------------------------

Tipo:
uuid


Descrição:

Relaciona o evento ao contrato profissional.



tipo_evento
---------------------------------

Tipo:
text


Descrição:

Categoria do acontecimento.


Eventos previstos:


contrato_criado

Quando:
Contrato é criado pelo sistema.



documento_recebido

Quando:
Profissional envia contrato assinado.



contrato_validado

Quando:
Administrador valida o documento.



contrato_revisao_solicitada

Quando:
Administrador devolve contrato para correção.



descricao
---------------------------------

Tipo:
text


Descrição:

Mensagem legível apresentada no histórico.


Exemplo:

"Contrato assinado enviado pela profissional."



usuario_id
---------------------------------

Tipo:
uuid


Descrição:

Usuário responsável pela ação.


Pode representar:

- profissional;
- administrador;
- sistema.



dados_extra
---------------------------------

Tipo:
jsonb


Descrição:

Informações adicionais relacionadas ao evento.


Exemplo:


{
  "status_anterior": "aguardando_validacao",
  "status_novo": "ativo"
}



created_at
---------------------------------

Tipo:

timestamp with time zone


Descrição:

Data e hora em que o evento aconteceu.



/*
=====================================================
SEGURANÇA

Row Level Security (RLS)

=====================================================
*/


A tabela possui RLS habilitado.


Regras:


ADMINISTRADOR

Pode:

SELECT

em todos os eventos de todos os contratos.



PROFISSIONAL

Pode:

SELECT

somente dos eventos vinculados aos próprios
contratos.



INSERT

Não permitido diretamente.



UPDATE

Não permitido.



DELETE

Não permitido.



Motivo:

O histórico contratual deve ser imutável.

Novos acontecimentos devem ser registrados
somente através das funções internas.



/*
=====================================================
POLICIES IMPLEMENTADAS

=====================================================
*/


Policy:

Admin can view all contract events


Permissão:

SELECT


Regra:

current_user_role() = 'admin'



---------------------------------


Policy:

Professionals can view own contract events


Permissão:

SELECT


Regra:


Usuário autenticado
        ↓
profile_id
        ↓
profissionais
        ↓
contratos_profissionais
        ↓
contratos_eventos



/*
=====================================================
FUNÇÃO DE REGISTRO

=====================================================
*/


Função responsável por criar eventos:


registrar_evento_contrato()


Objetivo:

Centralizar a criação dos eventos.


Nenhuma RPC deve inserir diretamente
na tabela contratos_eventos.


Fluxo:


RPC executa ação

        ↓

registrar_evento_contrato()

        ↓

contratos_eventos


Funções que utilizam essa estrutura:


- gerar_contrato_profissional_interno()

- enviar_contrato_assinado_profissional()

- validar_contrato_profissional()



/*
=====================================================
EXEMPLO DE HISTÓRICO

=====================================================


Contrato:

ND-2026-C9E28752


Eventos:


08/08/2026

Contrato criado


08/08/2026

Contrato assinado enviado pela profissional.


09/08/2026

Contrato validado pelo Studio.



=====================================================
*/