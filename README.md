# MAJOR//CS

Jogo de navegador inspirado no [7a0](https://7a0.com.br), mas para o cenário profissional de **Counter-Strike**: monte um time dos sonhos com lendas de todas as eras (CS 1.6, CS:Source, CS:GO e CS2) e dispute um Major completo — fase suíça + playoffs, todas as séries em **MD3** com veto de mapas e scoreboard no estilo HLTV (K-D, Swing, ADR, KAST, Rating 3.0, filtros por mapa e por lado TR/CT).

## Como rodar

```bash
npm install
npm run dev      # desenvolvimento em http://localhost:5173
npm run build    # build de produção em dist/
```

## Como se joga

1. **Home** — escolha o modo:
   - **Clássico**: atributos visíveis no draft;
   - **Almanaque**: atributos escondidos, só o seu conhecimento de CS.
2. **Draft** — o dado sorteia 5 elencos históricos; escolha 1 jogador de cada (2 re-rolls disponíveis). Monte um time com funções coerentes: sem IGL ou sem AWPer o time perde força; entry + suporte dão bônus.
3. **Major** — 16 times (você + 15 elencos históricos): fase suíça (3 vitórias classificam, 3 derrotas eliminam) e playoffs (quartas → semi → final). Todas as partidas são MD3.
4. **Veto** — ban/pick oficial de MD3 interativo nas suas partidas.
5. **Partida** — simulação round a round (MR12 com overtime) com scoreboard completo ao final.

## Base de dados (CRM)

Botão **⚙ Base de dados** no topo: crie, edite e exclua times e jogadores (nick, país, função, atributos, força por mapa, cores). As alterações ficam salvas no `localStorage` do navegador; "Restaurar padrão" volta ao dataset original.

O dataset embutido tem **50 elencos históricos** (250 jogadores), de SK Gaming 2003 e mibr 2006 a NiP 87-0, fnatic 2015, SK 2016, Astralis 2018, NaVi s1mple 2021, FaZe 2022, Spirit do donk, Vitality 2025, Legacy e TYLOO — curados com base em [Liquipedia](https://liquipedia.net) e [HLTV](https://www.hltv.org).

## Stack

- React 19 + TypeScript + Vite, sem backend — roda 100% no navegador.
- Design system próprio inspirado no hltv.org (CSS variables em `src/index.css`).
- Motor de simulação determinístico com RNG seedável em `src/engine/`:
  - `match.ts` — simulação round a round, economia/momentum, distribuição de kills/dano/KAST por jogador e por lado, Rating estilo HLTV 2.0/3.0;
  - `veto.ts` — ban/pick MD3 com IA baseada na força por mapa;
  - `swiss.ts` — fase suíça com grupos por campanha, anti-rematch, seeds e playoffs;
  - `ratings.ts` — força de time, sinergia de funções e química de era do time draftado.

## Teste de fumaça

```bash
npx esbuild scripts/smoke-admin.tsx --bundle --format=esm --platform=node --jsx=automatic --outfile=scripts/smoke-admin.mjs --external:react --external:react-dom
node scripts/smoke-admin.mjs
```

Renderiza Admin e Scoreboard via SSR e simula 200 séries validando placares e overtime.
