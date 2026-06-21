# MAJOR//CS

Jogo de navegador inspirado no [7a0](https://7a0.com.br), mas para o cenário profissional de **Counter-Strike**: monte um time dos sonhos com lendas de todas as eras (CS 1.6, CS:Source, CS:GO e CS2) e dispute um Major completo - fase suíça + playoffs, todas as séries em **MD3** com veto de mapas e scoreboard no estilo HLTV (K-D, Swing, ADR, KAST, Rating 3.0, filtros por mapa e por lado TR/CT).

## Como rodar

```bash
npm install
npm run dev      # desenvolvimento em http://localhost:5173
npm run build    # build de produção em dist/
```

## Como se joga

1. **Home** - escolha o modo:
   - **Clássico**: atributos visíveis no draft;
   - **Almanaque**: atributos escondidos, só o seu conhecimento de CS.
2. **Draft** - o dado sorteia 5 elencos históricos; escolha 1 jogador de cada (2 re-rolls disponíveis). Monte um time com funções coerentes: sem IGL ou sem AWPer o time perde força; entry + suporte dão bônus.
3. **Major** - 16 times (você + 15 elencos históricos): fase suíça (3 vitórias classificam, 3 derrotas eliminam) e playoffs (quartas → semi → final). Todas as partidas são MD3.
4. **Dificuldade** - Normal / Difícil / Lendário: escala a força do campo e dos adversários. O dream team ainda leva um malus de entrosamento (nunca treinou junto), então o título é conquistado, não dado.
5. **Veto** - ban/pick oficial de MD3 interativo, com análise pré-partida e o confronto exibido com a bandeira do país/região do core de cada time (3+ do mesmo país → bandeira do país; 4+ da mesma região → bandeira da região: Europa, CIS, América do Sul, etc).
6. **Partida** - simulação round a round (MR12, economia, timeouts táticos) com scoreboard completo. Toda série do torneio (inclusive entre as IAs) é clicável na bracket/hub para ver mapas e estatísticas.
7. **Bracket** - fase suíça no formato HLTV (colunas 0:0 → 2:2, caixa verde de classificados e vermelha de eliminados) e mata-mata.
8. **Hall da Fama** - ao fim da campanha você registra seu **nick** e a campanha entra no Hall (placar, elenco, recordes), persistido no Neon.

## Base de dados (CRM)

A área administrativa **não aparece no site** - acesse `/admin` (ex: `https://major-cs-pi.vercel.app/admin`) e informe a senha de admin (env `ADMIN_PASSWORD` na Vercel; `dev` em localhost). Lá você cria, edita e exclui times e jogadores (nick, país, função, atributos, força por mapa, cores, coach, logos), registra doações no mural de apoiadores e abre o 🧪 Lab de balanceamento. As alterações de dataset ficam salvas no `localStorage` do navegador; "Restaurar padrão" volta ao dataset original.

O dataset embutido tem **70 elencos históricos** (350 jogadores), de SK Gaming 2003 e mibr 2006 a NiP 87-0, fnatic 2015, SK 2016, Astralis 2018, NaVi s1mple 2021, FaZe 2022, Spirit do donk, Vitality 2025, Legacy e TYLOO - incluindo times tier B/C (Copenhagen Flames, Bad News Eagles, forZe, Sprout, 9z…) e uma base brasileira completa para o modo **GC MASTERS** (Immortals 2017, MIBR 2019, 00 Nation, RED Canids, Fluxo, ODDIK, W7M…) - curados com base em [Liquipedia](https://liquipedia.net) e [HLTV](https://www.hltv.org). Uploads de logo por time e foto por mapa direto no CRM.

## Stack

- React 19 + TypeScript + Vite, sem backend - roda 100% no navegador.
- Design system próprio inspirado no hltv.org (CSS variables em `src/index.css`).
- Motor de simulação determinístico com RNG seedável em `src/engine/`:
  - `match.ts` - simulação round a round, economia/momentum, distribuição de kills/dano/KAST por jogador e por lado, Rating estilo HLTV 2.0/3.0;
  - `veto.ts` - ban/pick MD3 com IA baseada na força por mapa;
  - `swiss.ts` - fase suíça com grupos por campanha, anti-rematch, seeds e playoffs;
  - `ratings.ts` - força de time, sinergia de funções e química de era do time draftado.

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
