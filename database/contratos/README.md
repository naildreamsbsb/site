# Módulo de Contratos Profissionais

## 1. Visão geral do módulo

O módulo de contratos profissionais organiza a relação contratual entre o Studio Nail Dreams e suas profissionais dentro do SaaS. Ele concentra os dados usados para compor o contrato, o documento contratual gerado, o envio da versão assinada, a validação administrativa e o histórico das ações relevantes.

O contrato funciona como o registro principal dessa relação. Nele ficam a versão, o período de experiência, os percentuais de comissão, o conteúdo do documento, as informações da assinatura e o estado atual do fluxo.

O ciclo de vida documentado é:

1. geração do contrato;
2. disponibilização para assinatura;
3. envio do documento assinado pela profissional;
4. validação pelo Studio;
5. ativação ou solicitação de revisão.

## 2. Fluxo contratual

```text
geração do contrato
        ↓
pendente_assinatura
        ↓
envio do contrato assinado
        ↓
aguardando_validacao
        ↓
validação administrativa
        ↓
ativo ou revisao_necessaria
```

- `pendente_assinatura`: o contrato foi preparado e aguarda o documento assinado.
- `aguardando_validacao`: a profissional enviou o documento e o Studio precisa conferi-lo.
- `ativo`: o Studio aprovou o contrato.
- `revisao_necessaria`: o Studio solicitou uma correção, registrando a observação da validação.

O estado atual fica em `contratos_profissionais.status`. Os acontecimentos que levaram a esse estado pertencem ao histórico de `contratos_eventos`.

## 3. Estrutura do banco

### `contratos_profissionais`

É a entidade central do módulo. Armazena os contratos firmados entre o Nail Dreams e suas profissionais.

Suas principais responsabilidades são:

- relacionar o contrato à profissional;
- identificar número e versão do documento;
- controlar o status contratual;
- registrar datas de início, experiência, validação e encerramento;
- manter os percentuais de comissão durante e após a experiência;
- guardar o conteúdo integral do contrato;
- referenciar o arquivo assinado e o tipo de assinatura;
- registrar o usuário e a observação da validação administrativa;
- preservar snapshots dos dados do Studio e da profissional usados na criação.

### `dados_contratuais_profissionais`

É a estrutura complementar vinculada ao fluxo contratual. Guarda informações específicas da profissional usadas na composição do contrato.

Sua responsabilidade é separar os dados contratuais complementares do registro principal do contrato, permitindo que `contratos_profissionais` mantenha o documento e seu ciclo de vida.

### `contratos_eventos`

Mantém a linha do tempo dos acontecimentos relevantes de cada contrato. Não representa o estado atual: representa a história do contrato.

Cada evento registra:

- contrato relacionado;
- tipo do evento;
- descrição legível;
- usuário responsável;
- dados extras em `jsonb`;
- data e hora do acontecimento.

## 4. Auditoria

`contratos_eventos` existe para fornecer rastreabilidade ao fluxo contratual. O histórico é tratado como imutável: a aplicação não deve executar `INSERT`, `UPDATE` ou `DELETE` diretamente nessa tabela.

Novos acontecimentos devem ser registrados por `registrar_evento_contrato()`. Essa função centraliza a inserção do evento e recebe o contrato, o tipo, a descrição, o usuário responsável e os dados adicionais.

Eventos documentados no módulo:

| Evento | Momento de uso |
| --- | --- |
| `contrato_criado` | Quando o contrato é criado pelo sistema. A documentação atual da função geradora o identifica como evento futuro. |
| `documento_recebido` | Quando a profissional envia o contrato assinado. |
| `contrato_validado` | Quando o administrador aprova e ativa o contrato. |
| `contrato_revisao_solicitada` | Quando o administrador devolve o contrato para revisão. |

Os dados extras podem registrar transições como `status_anterior` e `status_novo`. Na solicitação de revisão, também podem carregar o motivo informado pelo administrador.

## 5. Segurança

A documentação atual define Row Level Security para `contratos_eventos`:

- o administrador pode consultar todos os eventos;
- a profissional pode consultar somente eventos vinculados aos próprios contratos;
- não há escrita direta de eventos pela aplicação;
- `UPDATE` e `DELETE` do histórico não são permitidos.

A identificação da profissional percorre o usuário autenticado, seu `profile_id`, o cadastro em `profissionais` e os contratos associados. A visão administrativa é condicionada a `current_user_role() = 'admin'`.

As funções operacionais também aplicam controles próprios:

- `enviar_contrato_assinado_profissional()` usa `auth.uid()`, confirma que o contrato pertence a uma profissional ativa e exige o estado `pendente_assinatura`;
- `validar_contrato_profissional()` exige usuário autenticado, papel `admin` e estado `aguardando_validacao`.

As funções definidas usam `SECURITY DEFINER` e fixam `search_path` em `public`. Isso permite centralizar operações privilegiadas nas funções, mantendo as verificações de autorização descritas no próprio fluxo.

## 6. Funções PostgreSQL

### `registrar_evento_contrato()`

Centraliza o registro de auditoria em `contratos_eventos` e retorna o UUID do evento criado.

É chamada pelas funções do fluxo depois de uma ação contratual relevante. Sua etapa é transversal: ela não altera o status do contrato, mas registra o acontecimento, o responsável e os dados adicionais fornecidos pela função chamadora.

### `gerar_contrato_profissional_interno()`

É documentada como responsável por criar o contrato inicial da profissional. Suas responsabilidades descritas incluem validar a profissional e os dados contratuais, carregar os dados do Studio, evitar duplicidade, gerar número e conteúdo, calcular o período de experiência, definir comissões e armazenar snapshots.

Controla a entrada no fluxo, com status inicial `pendente_assinatura`.

> A definição SQL real dessa função ainda não está incluída em `03_funcoes_contratos.sql`. O arquivo contém somente sua documentação e indica `contrato_criado` como evento futuro. A implementação deverá ser documentada novamente após sua extração do Supabase.

### `enviar_contrato_assinado_profissional()`

Recebe a referência do documento assinado, o tipo de assinatura e uma referência complementar opcional.

É chamada quando a profissional envia seu documento. A função verifica autenticação, vínculo com uma profissional ativa, propriedade do contrato, status `pendente_assinatura` e presença da referência do arquivo.

Ela controla a transição para `aguardando_validacao`, registra as informações de envio e gera o evento `documento_recebido`.

### `validar_contrato_profissional()`

Executa a decisão administrativa sobre um contrato que aguarda conferência.

É chamada pelo painel administrativo e exige usuário autenticado com papel `admin`, contrato existente e status `aguardando_validacao`.

- Com aprovação, altera o status para `ativo` e gera `contrato_validado`.
- Sem aprovação, altera o status para `revisao_necessaria`, guarda a observação e gera `contrato_revisao_solicitada`.

## 7. Arquivos do módulo

### `01_estrutura_contratos.sql`

Documenta as estruturas e responsabilidades de `contratos_profissionais`, `dados_contratuais_profissionais` e `contratos_eventos`, incluindo campos relevantes, estados e regras gerais do histórico.

### `02_eventos_contratos.sql`

Documenta o modelo de auditoria, a imutabilidade de `contratos_eventos`, as regras de RLS, as policies de leitura e o uso centralizado de `registrar_evento_contrato()`.

### `03_funcoes_contratos.sql`

Reúne as definições PostgreSQL disponíveis para registro de eventos, envio do documento assinado e validação administrativa. Também mantém a documentação preparatória de `gerar_contrato_profissional_interno()`, cuja definição SQL ainda precisa ser extraída do Supabase.
