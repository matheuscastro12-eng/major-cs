# MAJOR//CS (Road to Major)

Simulador de gerência de **Counter-Strike 2** no navegador, inspirado em *Football Manager*, *Brasfoot* e no [7a0](https://7a0.com.br). Tudo roda no cliente com simulação determinística (RNG semeado); o backend (Vercel Functions + Neon) cuida de conta, cloud-save, ranking e da economia do Ultimate.

Mapa do código: [ARCHITECTURE.md](ARCHITECTURE.md). Vocabulário de domínio: [CONTEXT.md](CONTEXT.md).

## Como rodar

Node na versão do `.nvmrc`.

```bash
npm ci
npm run dev        # http://localhost:5173
npm run lint       # gate: 0 problemas
npx tsc -b         # tipos (app, node e payments)
npm test           # testes do servidor (server/*.test.ts)
npm run test:sim   # testes do engine e de contrato (scripts/test-*.mts)
npm run build      # tsc -b + vite build em dist/
```

A CI (`.github/workflows/ci.yml`) roda tudo isso em PR e em push na `master`.

## Modos de jogo

- **Major** (`/jogo`): draft de lendas de todas as eras (Clássico ou Almanaque), veto MD3 e um Major completo (suíço + playoffs), com scoreboard estilo HLTV. Ao fim, a campanha vai para o **Hall da Fama** (`/hall`).
- **Carreira** (`/carreira`): você é o manager de um time ao longo de temporadas: elenco, mercado, patrocínio, química, eventos, circuito e Majors. Deep links em `/carreira/jogador/:id` e `/carreira/time/:id`.
- **Road to Pro** (`/road-to-pro`): você é um jogador subindo do zero até o profissional (a Sala, treinos, peneiras, contratos).
- **Ultimate Team** (`/ultimate`): cartas, packs, mercado e Weekend League, com economia autoritativa no servidor.
- **Diário** (`/diario`): minigames diários com streak.

Saves vivem no `localStorage` (Carreira em 5 slots, Road to Pro e Ultimate com chave própria) e sincronizam com a nuvem para conta paga. As versões de save e as migrações estão no ARCHITECTURE.md.

## Base de dados (CRM)

A área administrativa **não aparece no site**: acesse `/admin` e informe a senha de admin (env `ADMIN_PASSWORD` na Vercel; `dev` em localhost). Lá você edita times e jogadores do dataset embutido (elencos históricos curados de [Liquipedia](https://liquipedia.net) e [HLTV](https://www.hltv.org)), registra doações e abre o Lab de balanceamento.

## Variáveis de ambiente (Vercel)

`DATABASE_URL` (Neon), `APP_SECRET` (assinatura de sessão), `ADMIN_PASSWORD`, as do Stripe (abaixo) e as do Pix via Woovi (`OPENPIX_APP_ID`, `WOOVI_PUBLIC_KEY`, `PIX_PRICE_CENTS`). Opcionais: `BETA_CODE`, `FOUNDER_LIMIT`.

## Pagamentos Stripe

A conta vitalícia é liberada pelo webhook `POST /api/stripe-webhook`; o redirect do Checkout é apenas uma confirmação adicional. Configure na Vercel:

- `STRIPE_SECRET_KEY`: chave secreta live do Stripe;
- `STRIPE_WEBHOOK_SECRET`: segredo do endpoint de webhook;
- `STRIPE_ACCOUNT_PRICE_ID`: opcional, usa o price da conta vitalícia atual por padrão;
- `STRIPE_PAYMENT_LINK_URL`: opcional, usa o Payment Link atual por padrão.

No Stripe, envie `checkout.session.completed` e `checkout.session.async_payment_succeeded` para `https://<dominio>/api/stripe-webhook`. A API também reconcilia sessões pagas pelo e-mail no login, cobrindo pagamentos anteriores à instalação do webhook.

## Teste de fumaça

```bash
npx esbuild scripts/smoke-admin.tsx --bundle --format=esm --platform=node --jsx=automatic --outfile=scripts/smoke-admin.mjs --external:react --external:react-dom
node scripts/smoke-admin.mjs
```

Renderiza Admin e Scoreboard via SSR e simula 200 séries validando placares e overtime.
