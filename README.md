# Studio Nail Dreams — Redesign v2

Versão estática do site da Nail Dreams em HTML, CSS e JavaScript puro.

## O que foi atualizado nesta versão

- Paleta visual inspirada na revista L’Essence: bege, nude, café, cobre/bronze, branco e preto.
- Spa dos pés removido.
- Serviços e valores atualizados com base na revista do studio.
- WhatsApp atualizado: (61) 98587-9423.
- Endereço atualizado:
  Rua 25 Sul, Lote 30, Bloco B, Loja 107 — Condomínio ParkStyle, Águas Claras – Brasília/DF.
- Logo real inserida.
- Fotos reais de unhas, ambiente, fachada e profissionais inseridas.
- Galeria com lightbox em JavaScript.
- Layout responsivo para celular, tablet e desktop.

## Arquivos

- `index.html`
- `styles.css`
- `script.js`
- `assets/`

## Publicação

Pode ser publicado em qualquer hospedagem que aceite arquivos estáticos:
Netlify, Vercel, GitHub Pages, Hostinger, cPanel, KingHost, Locaweb etc.

## Próximos ajustes recomendados

- Confirmar se os nomes Celyne Pereira e Natália Ramos devem aparecer exatamente assim.
- Inserir depoimentos reais de clientes.
- Confirmar horário de funcionamento.
- Avaliar se o hero principal deve usar unha metálica ou uma foto mais natural/nude.


## Versão 3 — Capital Moto Week

Esta versão inclui:

- Pop-up temporário do Capital Moto Week 2026.
- Faixa discreta no topo enquanto a campanha estiver ativa.
- Seção especial “Nail Dreams no Capital Moto Week 2026”.
- Logo do Capital Moto Week inserida em `assets/capital-moto-week.webp`.
- Nova logo transparente da Nail Dreams em `assets/logo.png`.

### Como ativar ou desativar o pop-up

Abra o arquivo `script.js` e procure:

```js
const CMW_CAMPAIGN_ACTIVE = true;
const CMW_CAMPAIGN_END = "2026-08-10T23:59:59-03:00";
```

Para desligar manualmente:

```js
const CMW_CAMPAIGN_ACTIVE = false;
```

Para alterar a data final, modifique `CMW_CAMPAIGN_END`.

O pop-up aparece apenas uma vez por dia para cada visitante, usando `localStorage`.


## Versão 5 — separação do sistema CMW e novo agendamento oficial

Esta versão remove a integração do antigo sistema de agendamento/fila do site principal.
Aquele sistema fica conceitualmente reservado para uso no Capital Moto Week, como ferramenta de evento.

### O que entra nesta versão

- Site institucional mantido com a campanha do Capital Moto Week.
- Nova seção “Novo agendamento oficial”.
- Nova pasta `agendar/` com uma página provisória para o futuro agendamento online.
- Nenhuma dependência do sistema antigo em Google Apps Script dentro do site principal.
- Call-to-action principal de agendamento continua indo para o WhatsApp oficial enquanto o novo sistema Supabase é desenvolvido.

### Próximo passo técnico

Criar o sistema oficial com Supabase:

- autenticação de cliente;
- serviços, profissionais e horários;
- agenda por profissional;
- bloqueios e indisponibilidades;
- cancelamento e reagendamento;
- painel administrativo;
- financeiro, comissões e pagamentos em etapa posterior.
