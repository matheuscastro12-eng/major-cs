# Mapa do CS Manager (krekPBI/CSManagerSite) e plano de fusão com o Road to Major Ultimate

Leitura feita em 27/10/2026, só leitura, sem instalar nem rodar nada do projeto externo. Caminhos do CS Manager são relativos ao clone `ext/CSManagerSite`; os nossos, a `major-cs`. Nenhum segredo, e-mail, ID de usuário ou dado de conta foi copiado aqui. O README cita IDs de projeto Supabase, de projeto Google Cloud e do app Discord: foram omitidos de propósito.

---

## 1. Visão geral

- **O que é:** jogo de cartas colecionáveis de CS (jogadores pro, com versões por evento) com simulador automático de partidas. Nasceu como bot de Discord (repositório pai "CS-Manager", não clonado aqui) e está migrando para web em `csmanager.com.br` (README:1-5, README:46).
- **Loops principais:**
  1. Ganhar cartas: pacote inicial, diário com streak, drops de 3 opções a cada 20 min, packs comprados com moedas, desafios de elenco (troca de cartas por recompensa).
  2. Montar o time: 5 cartas próprias, 1 IGL + 4 não IGL, sem repetir `baseName` (README:63).
  3. Jogar: Ranqueada assíncrona contra o time salvo de outro usuário (ELO) e "Road to Major" diário contra NPCs com tiers B/A/S.
  4. Ganhar moedas, gastar em packs.
- **Público:** comunidade BR de Discord. Tamanho real verificado pelo autor: **26 usuários, 538 jogadores no catálogo, 8.945 cartas, 23 times** (README:13). É pequeno: a base ativa é de dezenas de pessoas.
- **Estado da migração:** login (Discord/Google/e-mail), painel, coleção, escalação, inicial, diário, drops, ranqueada com replay, loja de packs, desafios e Road to Major tiers estão no ar ou implementados (README:5, 89-111). **Faltam lobbies, trocas, vendas, recompensas do ranking e admin** (README:9). O processo do bot ainda não foi desligado (README:73). Sem recuperação/troca de senha nem confirmação de e-mail (README:79).
- Histórico git: 50 commits entre 03/03/2026 e 22/10/2026. Sem arquivo LICENSE e sem campo `license` em `package.json`.

## 2. Arquitetura

- **Stack:** Node 22, funções serverless Vercel em `api/` (JS ESM puro, sem framework), Prisma Client sobre PostgreSQL do Supabase (o Supabase é só Postgres; não usam Supabase Auth nem Data API, `database/web.sql:38`). Front em HTML/JS vanilla (`index.html` landing, `game.html` app, `web/*.js`). Build: `scripts/build.mjs` + `scripts/build-core.mjs` removem tipos do `core/*.ts` e geram `dist/` (README:71). `vercel.json` aponta funções e `dist/`.
- **Pastas:**
  - `api/` — 4 endpoints: `auth.js` (OAuth e sessão), `email.js` (cadastro/login por senha), `game.js` (leituras: painel, coleção, ranking, time), `play.js` (todas as mutações).
  - `server/` — regras: `progression.js` (inicial, diário, drops), `shop.js`, `matches.js` (ranqueada/replay), `major.js` + `major-tiers.js` (Road to Major), `challenges.js`, `team.js`, `card-id.js`, `security.js`, `password.js`, `rate.js`, `db.js`.
  - `core/` — cópia TS do bot: `services/matchSimulation.ts`, `services/eloSystem.ts`, `services/matchStore.ts`, `config/simulationBalance.ts`, `data/tournaments.ts`, `utils/brtDate.ts`.
  - `web/` — UI, `card-assets.js` (manifesto gerado), CSS.
  - `database/` — `bootstrap.sql` (schema completo), `full-setup.sql` (com RLS/revoke nas 33 tabelas), `web.sql` (5 tabelas web), `complete-web-migration.sql`, `oauth-migration.sql`.
  - `scripts/` — `prepare-card-assets.py`, `prepare-backup-import.py`, `prepare-schema.mjs`, `migrate-web.mjs`, `inspect-db.mjs`.
  - `tests/` — 11 arquivos `node:test` (README cita 28→79 testes conforme os lotes).
- **Fluxo de request (mutação):** `api/play.js:11` lê a sessão do cookie → `:19` checa `Origin` igual a `APP_URL` → `:21` whitelist de ações → `:26` exige chave de idempotência UUID → `:27-46` transação **Serializable** com `pg_try_advisory_xact_lock(hashtext(userId))` + `SELECT … FOR UPDATE` no usuário → se a chave já existe em `web_actions`, devolve o resultado gravado (`:37-38`) → executa a ação → grava o resultado em `web_actions` (`:44`).
- **Autenticação:**
  - Sessão: token próprio `base64url(json).HMAC-SHA256` (`server/security.js:19-34`), cookie `csm_session` HttpOnly, SameSite=Lax, Secure em https, 7 dias (`security.js:41-43`, `api/email.js:39`, `api/auth.js:134`). ID aceito: ID numérico do Discord ou `web_<uuid>` (`security.js:46`).
  - OAuth Discord e Google com `state` assinado em cookie de 10 min (`api/auth.js:111-118`). Tabela `web_oauth_accounts` (provider, provider_id) → user (`database/web.sql:8-15`). Discord recupera a conta legada porque o `User.id` **é** o ID do Discord (`prisma/schema.prisma:16`).
  - E-mail: scrypt com salt (`server/password.js`), tentativas limitadas em `web_rate_limits`. Sem associação automática por e-mail (README:77).
- **Deploy:** Vercel (repo `krekPBI/CSManagerSite`), variáveis `APP_URL`, `DATABASE_URL`, `DIRECT_URL`, `DISCORD_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `SESSION_SECRET` (README:31-43). Banco acessado por uma role Postgres dedicada **com BYPASSRLS** (README:17).

## 3. Modelo de dados (`prisma/schema.prisma`, 606 linhas; 33 tabelas segundo README:69)

| Modelo | Papel | Campos-chave |
|---|---|---|
| `User` (:15) | conta; `id` = ID Discord ou `web_<uuid>` | `coins`, `elo`, `faceitElo`, `rankedWins/Losses`, `availableDrops`, `lastDropRefill`, `pityCounter`, `dailyStreak`, `hasClaimedStarter`, `lobbyEnergy` |
| `Player` (:71) | catálogo (538) | `name`, `baseName`, `version`/`versionName` (ex.: s12026, major1, eventos), `role` (IGL/Rifler/Awper), `overall`, `firepower`, `earlyRoundImpact`, `clutching`, `experience`, `rarity` 0-5, `isChallengeOnly`, `team`, `region`, `imageUrl` |
| `UserPlayer` (:102) | carta possuída (8.945) | `cardId` curto único, `originalOwnerId`, `serverId` (Discord), `dropMethod`, `locked`, ~20 contadores de estatística (kills, mvpCount, clutches…) |
| `Team` (:148) / `TeamSlot` | time salvo (23) | `slots` JSON legado + linhas relacionais |
| `Lineup` / `LineupSlot` (:165) | escalações alternativas (legado do bot) | |
| `Match` (:182), `MatchTeamSnapshot`, `MatchRound` | partida + snapshot + rounds | `events` JSON com rounds e bloco `ranked` |
| `Trade` / `TradeItem` (:211) | trocas (só no bot) | |
| `TournamentProgress` (+`State`) (:231) | Road to Major diário | `dailyAttemptsUsed`, `lastAttemptDayBrt` |
| `UserPack` (:252) | packs fechados no inventário | `packType` 70/75/80, `source` |
| `ChallengeDefinition`/`RewardOption`/`UserChallengeCompletion` (:264-309) | desafios de elenco (SBC) | |
| `Lobby`/`LobbyPlayer` (:315) | lobbies gc20/fpl/4k do Discord (guildId, channelId) | |
| `EventVersion` (:345) | edições de evento com cores e fundo | `replacesVersion` |
| `RankingDailySnapshot`/`Entry` (:359) | foto diária do ranking para recompensas | |
| web (`database/web.sql`) | `web_accounts`, `web_oauth_accounts`, `web_rate_limits`, `web_actions`, `web_drops` | |

Não existe **ledger** de moedas: `coins` é um inteiro mutado com `increment/decrement` (ex.: `server/shop.js:27`, `server/progression.js:51`). O único histórico de ações é `web_actions` (resultado por chave de idempotência).

## 4. Mecânicas (com arquivo:linha)

### Atributos e funções
- 4 atributos 0-99: **FPW** firepower, **ERI** earlyRoundImpact, **CLU** clutching, **EXP** experience; `overall` 50-99 armazenado, não derivado (`prisma/schema.prisma:78-83`). Funções: IGL, Rifler, Awper (`:78`).
- Força por jogador na simulação (`core/services/matchSimulation.ts:108-121`): AWPer = .55 FPW + .20 CLU + .15 EXP + .10 ERI; IGL = .35 EXP + .25 ERI + .20 CLU + .20 FPW; Rifler = .55 FPW + .20 ERI + .15 CLU + .10 EXP. O **OVR não entra** na simulação; só os 4 atributos.

### Raridades
- `rarity` int: 0 Starter, 1 Bronze, 2 Prata, 3 Ouro, 4 Diamante, 5 Legend (`schema.prisma:84`); "evento" é dado por `version` + `EventVersion` (`:345`), com edições BLAST R26, ESL 23, ESL MVP, Versus 1/2, Champions (docs/card-art-generation.md). Versões `versus1/versus2/eslmvp1` ficam fora do pool comum (`server/progression.js:24`); evento ativo substitui a versão base do mesmo jogador (`:26`).

### Pacote inicial
- `server/progression.js:35-46`: 5 cartas com OVR ≤ 75, raridade Prata/Ouro: 1 IGL prata, 1 Awper prata, 1 Ouro não IGL, 2 Pratas não IGL, nomes distintos. Uma vez por conta (`hasClaimedStarter`).

### Diário
- `progression.js:11-15`: dia BRT; streak sobe se o último foi ontem, até 5, senão volta a 1. `:47-53`: 1 carta OVR ≤ 70; no dia 5, 3 cartas (a primeira OVR > 70); + 0-200 moedas (`randomInt(201)`).

### Drops de 3 opções
- Estoque: 1 drop a cada 20 min, máximo 3 (`progression.js:5-10`; o schema diz "max 5", o web usa 3).
- Faixas de OVR por opção (`:54-55`): 85-99 0,01%; 81-84 1%; 76-80 5,99%; 71-75 10%; 61-70 28%; 1-60 55%. 3 opções distintas (`:79-83`).
- Janela de 30 s gravada em `web_drops`; ao expirar o servidor escolhe **aleatoriamente** (`automaticDropIndex = roll(length)`, `:72`, apesar de a mensagem e o README dizerem "a primeira carta", `:87` e README:67 — divergência texto × código). +0-50 moedas por drop (`:67`).
- `pityCounter` existe no schema (`schema.prisma:27`) mas não é usado no web.

### Packs (loja)
- `server/shop.js:6-10`: Pack 70+ = 500, 75+ = 1.000, 80+ = 2.000 moedas. 3 cartas distintas, 1 garantida ≥ mínimo; pesos por OVR: ≥89 → 2, ≥87 → 30, ≥84 → 150, ≥80 → 300, ≥75 → 400, resto 250 (`:32-36`). Débito condicional `coins >= price` (`:27`). Packs ficam em `UserPack` até abrir (`:44-58`).

### Química (no simulador)
- `simulationBalance.ts` + `matchSimulation.ts:177-245`: +2% por jogador em grupos de ≥2 do mesmo time real; −4% se nenhuma região tem ≥3 jogadores; penalidade de composição: sem IGL −30, IGL extra −20, sem AWPer −20, >2 AWPers −20 cada, rifler 0 → −25, 1 → −15, >3 → −15 cada, função desconhecida −15 (`:128-175`). Força do time = (soma − penalidade) × (1+bônus) × região × boost NPC (`:235-245`).

### Simulador "original"
- `matchSimulation.ts:699-809`: mapa aleatório entre 7; MR12, primeiro a 13; prorrogação MR3 em blocos de 6, primeiro a 4 no bloco; teto de 60 rounds e round de desempate.
- Por round (`:468-505`): força de cada lado × nerf de economia × forma da partida × bônus de match point; a diferença é comprimida (×0,48, ou ×0,35 se gap ≥ 30), soma ruído uniforme ±60, e o lado mais forte ganha +0,226 por ponto de gap. Vence quem tiver maior valor.
- Economia (`:250-262`): 1ª derrota seguida −10% (force), 2ª −22% (eco), 3ª+ compra cheia; OT sempre compra cheia.
- Forma da partida ±7% simétrica (`:745-747`); fechamento em 12-x ≤10 +4% (`:753-754`).
- Kill feed narrado: entry = rifler do lado T com maior ERI, nerf acumulado do entry até 20%, assistências 30%, tempos de kill (`:274-462`). MVP por (K−D) + 0,25·A + swing de K/D (`:102-106`, `:800-805`).
- Usa `Math.random` (não determinístico, sem seed) — o replay funciona porque os rounds são **persistidos** antes do playback, não re-simulados (README:71).

### Ranqueada / ELO
- `server/matches.js:20-58`: cooldown 1 min, 50 partidas/dia BRT, sem revanche imediata; adversário = time salvo de outro usuário com ELO dentro de 150, 300, 500 ou qualquer (`:30`). O adversário é passivo (assíncrono) mas **também ganha/perde ELO e moedas** (`:51`). Lock de advisory no adversário (`:34-36`).
- ELO (`core/services/eloSystem.ts:3-60`): K=32, vitória ×1,2 limitada a +10..+38, derrota ×0,85 limitada a −6..−26; "zebra" (vencedor com ≥150 a menos) aumenta a perda do favorito até −36 (gap 500). Recompensa: vitória 35-100, derrota 0-35 moedas (`:62-67`). `applyDailyCap` é no-op (`:82-84`): não há teto diário de moedas, embora o schema cite "cap 1500/dia" (`schema.prisma:48`).
- Estatísticas por carta acumuladas a cada partida (`matches.js:52-54`).

### Road to Major (deles)
- Tiers B/A/S escolhidos após "Lan do Beça"; 3 tentativas diárias compartilhadas; prêmios B 2.000 + Pack 75; A 3.000 + Pack 80; S 8.000 + 2 Packs 80 (`core/data/tournaments.ts:175-179`, README:95-101). Confronto preparado com token antes de jogar (README:103-107). NPCs com `awayNpcBoost` (`matchSimulation.ts:699`).

### Desafios de elenco (SBC)
- `server/challenges.js`: consome cartas escolhidas e dá carta/pack, conclusão única ou repetível com cooldown, tudo em transação (README:89-93). Em 22/10 só havia "6 cartas por uma 75+".

### Histórico / replay
- `api/play.js:12-16` lista as últimas 20; `matches.js:59-65` devolve rounds persistidos; reabrir não re-simula nem recompensa.

### Economia e autoridade
- Saldo, sorteios, preços, resultados e ELO são todos calculados no servidor; o cliente só manda `action` + `key` (+ índice/tipo/tier). `randomInt` de `node:crypto` nas recompensas. Idempotência por conta + Serializable + advisory locks. É **mais autoritativo que o nosso Ultimate hoje** (ver progress.md: "LOCAL VENCE", ranqueada desligada).

## 5. Arte

- `assets/` tem 714 WebP: `cards/backgrounds` (molduras por raridade/evento), `cards/events` (6 cenas de evento reconstruídas), `cards/players` (533 fotos), `cards/teams` (logos), `cards/trans`, além de `teams/` e `ui/`.
- `scripts/prepare-card-assets.py`: converte com Pillow os assets do bot (`--bot-root ..`) para WebP 83%, nome `slug-sha1[:8]`, e gera `web/card-assets.js` (`:1-40`). README:7: foto e moldura para os 538 jogadores.
- `docs/card-art-generation.md`: fundos de evento **gerados por IA** ("built-in image generation tool", 21/10/2026) a partir da arte original do bot, removendo logos de eventos (ESL, BLAST).
- **Licença/origem:** não há LICENSE, nem atribuição de fonte das fotos dos jogadores ou dos logos de times. Não consegui verificar de onde vêm as fotos (provavelmente HLTV/Liquipedia/redes, mas é só suposição). Nomes de evento (BLAST, ESL, EWC) e logos de times são marcas de terceiros. Tratar todo o pacote de arte como **sem direito de uso comprovado**.

## 6. O que não migrou

- **Lobbies** (gc20/fpl/4k; modelo preso a guild/channel Discord, `schema.prisma:315-341`).
- **Trocas** (`Trade`/`TradeItem` existem, sem endpoint web).
- **Vendas** (não há mercado nem quicksell no web; nenhum modelo de listagem).
- **Recompensas do ranking** (snapshots diários existem, `schema.prisma:359-380`, sem pagamento no web).
- **Admin** (sem painel; desafios/eventos são editados direto no banco).
- Também: recuperação de senha, confirmação de e-mail, energia de lobby (`lobbyEnergy`), alertas de drop, `faceitElo`, pity.

## 7. Comparativo lado a lado

| Área | CS Manager | Nosso Ultimate | Melhor |
|---|---|---|---|
| Cartas | 538 jogadores reais com várias versões; 4 atributos FPW/ERI/CLU/EXP; OVR armazenado | catálogo derivado do dataset (`buildCatalog`, `cards.ts:140`), 6 substats (tiro/mira/reflexo/visão/clutch/util, `cards.ts:13-20`), 5 funções (IGL/AWP/Entry/Support/Rifler/Lurker) | Nós em profundidade; eles em **versões históricas/evento** e comunidade |
| Raridades | 6 níveis int + edições de evento | 7 tiers por OVR + 5 specials curados (`rarities.ts:37-50`) | Nós (mais granular, valor/quicksell por tier) |
| Química | +2%/jogador do mesmo time, −4% sem 3 da mesma região, penalidades de composição | grafo de adjacência por formação: time 1, região .5, país .5, função no slot +1; multiplicador .9-1.1 (`chemistry.ts:32-58`) | Nós (visual e tática); a **penalidade de composição** deles é boa ideia |
| Formações | não há (5 livres, 1 IGL) | 3 formações com slots de função (`formations.ts:24-28`) | Nós |
| Packs | 3 packs simples, 3 cartas, pesos por OVR | 5 packs + Promo/TOTW/Ícone com garantias por bucket (`packs.ts:30-95`) | Nós |
| Ganho grátis | inicial, diário com streak, **drop de 3 opções a cada 20 min** | missões, diário, passe, eventos | Eles no **drop de escolha** (loop curto e viciante) |
| Economia | moedas int sem ledger; sem sink além de packs | coins com tx, quicksell, taxa de 5% queimada no mercado (`ultimate-market.ts:42`) | Nós (sinks e rastreio) |
| Mercado | não migrado | mercado com listagem/compra/cancelamento (`api/ultimate-economy.ts:161-238`) | Nós |
| Trocas diretas | só no bot | não temos | Eles (conceito) |
| SBC | desafios transacionais | `sbc.ts` | Empate; o deles é mais robusto no servidor |
| PvP | assíncrono contra time salvo, sem interação | duelo por beats, decisões simultâneas resolvidas no servidor (f2 `pvpMatch.ts`) | Nós em jogabilidade; eles em **simplicidade e volume** |
| Ranqueada | ligada, ELO com zebra, cooldown, 50/dia, sem revanche | desligada (`RANKED_QUEUE_ENABLED`), squad vinha do cliente | Eles hoje |
| Simulador | round a round com economia, entry, kill feed, MVP; `Math.random` | Sala determinística por seed, beats, minigames, odds explicadas | Nós (determinismo, interação); o kill feed/economia deles é bom para modo "auto" |
| Replay | rounds persistidos | precalculado + replay; PvP f2 no servidor | Empate |
| Auth | Discord + Google + e-mail, vínculo de métodos, cookie HMAC | conta por e-mail (Neon), sem Discord | Eles (Discord é o público deles) |
| Arte | fotos + molduras + logos, cenas de evento por IA | cartas desenhadas/sem foto (não verifiquei se usamos fotos) | Eles visualmente; **risco de direitos** maior |
| Anti-fraude | servidor autoritativo, Serializable, idempotência, advisory locks, Origin check | rate limit, carteira congelável (`isUltWalletFrozen`), mas "local vence" ainda aberto | Eles hoje, até a nossa Fase 1 fechar |

## 8. O melhor de cada um: o que trazer

Prioridade, esforço (P/M/G), risco:

1. **Padrão de mutação autoritativa** (chave de idempotência por conta + tabela de resultados + Serializable/advisory lock + Origin check) para `ultimate-economy` e a Fase 1. P-M, risco baixo. É exatamente o que nosso progress.md pede.
2. **Drop de 3 opções com estoque por tempo** (1/20 min, máx. 3, janela de escolha no servidor). M, risco baixo-médio (inflação: calibrar contra nossos packs).
3. **Login Discord + vínculo de métodos** (tabela provider/provider_id → conta, sem fusão automática por e-mail). M, risco médio (OAuth, LGPD). Necessário para importar a base deles.
4. **Ranqueada assíncrona contra time salvo** como modo "rápido" ao lado do PvP por beats: dá partida sempre, mesmo com fila vazia. M, risco médio (o adversário passivo perder ELO incomoda; sugerir que o defensor não perca ELO ou perca metade).
5. **Curva de ELO com zebra e limites** (`eloSystem.ts`). P, risco baixo.
6. **Versões de evento por jogador** (`version`/`EventVersion` substituindo a base) como fonte de specials. M, risco baixo.
7. **Penalidade de composição** (sem IGL/AWP) como aviso no montador. P, risco baixo.
8. **Stats por carta** (kills, MVPs, clutches por `cardId`) para "história da carta". P-M, risco baixo.
9. **Diário com streak de 5 dias** (carta melhor no 5º). P.
10. **IDs curtos de carta** (`card-id.js`) para compartilhamento. P.

**Não trazer:**
- O simulador com `Math.random` como motor de PvP (quebra nosso engine puro/seed). No máximo portar a narrativa de kill feed para seed.
- `coins` sem ledger, `BYPASSRLS`, lobbies amarrados a guild Discord, `slots` JSON duplicado com linhas relacionais.
- A arte de jogadores e logos sem licença comprovada.
- O tema "Road to Major" deles como produto separado (nós já temos o nome e o modo).
- O teto de moedas "fantasma" (`applyDailyCap` no-op).

## 9. Plano de fusão ("super Road to Major Ultimate")

### Fase 0 — Decisões do dono (bloqueiam tudo)
- **Acordo com o autor** (krekPBI): quem é dono do código e da base de jogadores, se é aquisição, parceria ou só migração da comunidade; contrato escrito. Sem LICENSE, o código é "todos os direitos reservados".
- **Marca:** "CS Manager" morre, vira modo ou coexiste? Domínio `csmanager.com.br` redireciona?
- **Arte:** usar fotos deles só com origem comprovada; senão, migrar cartas sem foto.
- **Auth Discord:** criamos nosso app Discord (recomendado) em vez de herdar o deles.
- **Valor de conversão** das moedas e do ELO deles.

### Fase 1 — Base técnica no nosso lado (2-3 semanas)
- Terminar a nossa Fase 1 (inventário autoritativo, fim do "local vence") usando o padrão de idempotência deles.
- Adicionar login Discord + tabela `auth_identities(provider, provider_id, account)`.
- Criar tabelas `legacy_csm_*` (staging) no Neon.

### Fase 2 — Mapeamento do catálogo
- Casar `Player` deles com nosso `playerId` por `baseName` normalizado (+ time/país). Esperar sobras: jogadores fora do nosso dataset viram cartas "legado" (já temos `legacySpecials.ts`).
- Atributos (proposta, a calibrar com amostra):
  - `tiro` ← FPW; `mira` ← 0,6 FPW + 0,4 EXP; `reflexo` ← 0,7 FPW + 0,3 ERI (+5 se entry); `visao` ← 0,55 EXP + 0,45 ERI (+4 IGL); `clutch` ← CLU; `util` ← 0,5 EXP + 0,5 ERI.
  - Na prática, se o jogador existe no nosso dataset, **use nossos stats** e só preserve a raridade/OVR relativo; o mapeamento acima é para os sem par.
  - Função: Awper → AWP; IGL → IGL; Rifler → Rifler (ou Entry se ERI for o maior atributo).
- Raridade: preferir recalcular por OVR (`rarityFromOvr`, `rarities.ts:69`). Tabela de referência: 1 Bronze → bronze; 2 Prata → silver; 3 Ouro → gold/rareGold por OVR; 4 Diamante → elite/legendary por OVR; 5 Legend → icon/histIcon (curado); 0 Starter → bronze; versões de evento → `promo` ou novo special "Edição CSM" (curado).
- OVR: manter o deles se ≤ nosso teto da raridade; caso contrário clamp à faixa do tier.

### Fase 3 — Migração das contas e 8.945 cartas
- Export do Supabase **pelo dono deles**, só tabelas necessárias (`users` sem e-mail/senha, `user_players`, `players`, `teams`), via dump cifrado.
- Importar em staging; gerar relatório (contas, cartas, moedas, ELO) e conferir totais (26/8.945/538).
- **Sem criar contas automaticamente.** Cada jogador reivindica: entra com Discord no nosso site → se o ID Discord bate com uma conta legada, mostra "importar seu progresso" com resumo → aceita → servidor cria as cartas no inventário autoritativo (tx com op_id `csm-import:<legacyId>`, idempotente, uma vez). Contas `web_<uuid>` (e-mail) e Google: reivindicação por código enviado ou vínculo feito no site antigo antes do corte.
- Moedas: converter pela taxa decidida (sugestão: aplicar teto por conta para não inflar o mercado). ELO: semente da nossa ranqueada ou só exibição como "ELO CS Manager".
- Cartas `locked`/escaladas: importar com o time ativo virando o squad inicial.
- Estatísticas por carta e histórico de partidas: importar como somente leitura (opcional).
- Prazo de reivindicação + exclusão do staging depois.

### Fase 4 — Corte
- Congelar o site deles (modo leitura) → último export → reivindicação aberta → redirecionar domínio → desligar bot e Supabase deles → apagar dados legados após o prazo.

### Fase 5 — Conteúdo
- Drop de 3 opções, ranqueada assíncrona, versões de evento e stats por carta entram como features do Ultimate.

## 10. Riscos

- **Segurança:** o backend deles usa uma role Postgres com **BYPASSRLS** (README:17); o RLS é decorativo para esse caminho e um vazamento da `DATABASE_URL` expõe tudo. Na fusão: nunca receber essa credencial; pedir dump. Pedir que rotacionem a credencial e o `SESSION_SECRET` após o export. O README publica identificadores de infraestrutura (IDs de projeto Supabase/Google/app Discord); não são segredos, mas facilitam reconhecimento. O código não tem segredos commitados no que li (`.env.example` só tem nomes) — não varri o histórico git inteiro.
- **Senha sem recuperação** e sem confirmação de e-mail: contas por e-mail deles não têm prova de posse; reivindicação por e-mail precisa de verificação nossa.
- **LGPD:** a migração transfere dados pessoais (IDs Discord, usernames, e-mails, hashes) entre controladores. Precisa de base legal (consentimento na reivindicação), aviso de privacidade atualizado, mínimo necessário (não importar hash de senha nem e-mail sem consentimento), prazo de retenção e exclusão do staging. A política deles (`privacidade.html`) não prevê transferência.
- **Direitos de imagem e marca:** fotos de jogadores reais, logos de times e de eventos (ESL, BLAST, EWC) e cenas derivadas por IA da arte original, tudo sem licença indicada. Uso comercial (nosso jogo tem pagamento) aumenta o risco. Mitigação: não migrar arte; ou obter acordo/licença.
- **Propriedade intelectual do código:** sem LICENSE. Não copiar código deles sem acordo escrito; reimplementar ideias é mais seguro.
- **Economia:** importar moedas/cartas sem teto pode inflar o mercado; usar teto e cartas intransferíveis por um período.
- **Comunidade:** 26 contas, poucas pessoas; o valor é social (Discord), não de volume. A comunicação do corte importa mais que a técnica.

## O que não consegui verificar

- Não rodei o projeto, testes nem build; os números (538/26/8.945, 79 testes, logins em produção) são **afirmações do README**.
- Não li o repositório do bot original (Discord), só a cópia em `core/`; regras de lobbies, trocas e vendas no bot não foram vistas.
- Li `server/major.js`, `server/challenges.js`, `core/data/tournaments.ts` e o front `web/*` só por cima (grep), não linha a linha.
- Origem/licença das fotos e logos: sem indicação no repositório.
- Do nosso lado, li `rarities.ts`, `cards.ts`, `chemistry.ts`, `packs.ts`, `formations.ts`, o cabeçalho de `pvpMatch.ts` (f2), `api/ultimate-economy.ts` (ações) e os progress docs; não li `matchSession.ts`, `server/ultimate-*.ts` e `api/lobby.ts` em detalhe, nem confirmei se o nosso Ultimate usa fotos de jogadores.
- Não varri o histórico git do projeto externo em busca de segredos já removidos.
