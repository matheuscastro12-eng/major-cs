# CS Manager: especificações portáveis (8 features)

Complemento de `mapa-csmanager.md` (não repete o mapa, aprofunda). Leitura em 27/10/2026, só estática; nada do projeto externo foi instalado nem executado. Caminhos do CS Manager são relativos ao clone `ext/CSManagerSite`. Sem segredos e sem dados de usuários.

**Método.** REA `analyze_javascript_application` (modo diretório, `source_paths` = `api/play.js`, `server/progression.js`, `server/matches.js`) recuperou o grafo semântico desses 3 arquivos: 3.700 nós AST, 91 relações de call-flow, 1.716 de data-flow, cobertura "partial" (51 arquivos fora do escopo pedido; os `.ts` de `core/` não entram no analisador JS). O REA confirmou a estrutura de chamadas (play → progression/matches) mas não extrai regras de negócio. **Todas as regras, números e linhas abaixo foram lidas à mão** com `sed`/`grep` nos fontes.

Convenção para o nosso lado: engine puro em `src/engine/ultimate/*` usando `makeRng(seed)`, `pick`, `weightedIndex` de `src/engine/rng.ts`; servidor sorteia a seed (`randomSeed()` só no servidor) e grava; toda mudança de saldo/cartas passa por `applyUltTx` em `server/ultimate-economy.ts` (ledger `rtm_ult_ledger`, `UNIQUE(email, op_id)`).

---

## 1. Drop de 3 opções

**Origem:** `server/progression.js:5-10, 54-88`; `api/play.js:33-41`; tabela `web_drops` em `database/web.sql:29-34`.

### Estoque
- `DROP_MS = 20*60*1000` (`:5`).
- `dropStock(user, now)` (`:6-10`):
  - `base = lastDropRefill ?? lastDrop ?? now`
  - `count = floor(max(0, now - base) / DROP_MS)`
  - `available = min(3, availableDrops + count)`
  - `base' = base + count*DROP_MS` (preserva o resto da fração; o tempo não "vaza")
  - `nextAt = base + (count+1)*DROP_MS`
- Ao sacar (`:86`): `availableDrops = available - 1`, `lastDrop = now`, `lastDropRefill = base'`.
- **Borda:** com estoque cheio (3) o relógio continua andando (`base'` avança mesmo sem caber), então o tempo acumulado acima do teto é perdido. É o comportamento desejado (não acumula).
- **Divergência:** `schema.prisma` comenta "max 5"; o código usa 3.

### Sorteio das ofertas (`:54-55, 78-83`)
| Faixa OVR | Peso (%) |
|---|---|
| 85-99 | 0,01 |
| 81-84 | 1 |
| 76-80 | 5,99 |
| 71-75 | 10 |
| 61-70 | 28 |
| 1-60 | 55 |

- `n = randomInt(1_000_000)/10_000` (resolução 0,0001%); soma acumulada; primeira faixa com soma > n.
- Por opção: até 6 tentativas de (rolar faixa → escolher uniforme no pool da faixa excluindo IDs já ofertados). Se as 6 falharem, erro 409 "Não há cartas elegíveis… nenhum recurso consumido" (a transação aborta).
- Opções distintas por `Player.id` (não por `baseName`: dois "donk" de versões diferentes podem aparecer juntos).
- Pool = `eligiblePool` (seção 2), cache de 60 s em memória do processo.
- **Pity:** `User.pityCounter` existe ("drops desde o último 65+", `schema.prisma:27`) mas **não é lido nem escrito** no web. Não há pity.

### Janela e expiração
- Linha única por usuário em `web_drops(user_id PK, options jsonb, expires_at)`; `expires_at = now + 30 s` (`:84`).
- `draw` com drop pendente não sorteia: devolve o pendente (`:74-75`).
- `choose(index)`: valida `0 <= index < options.length` (400). Se já expirou, **ignora o índice** e usa `automaticDropIndex = randomInt(length)` (`:66, 72`).
- Liquidação de expirado: no `sync` (`play.js:34`) e antes de um novo `drop` (`play.js:40`) chama `chooseDrop(..., requireExpired=true)`. Não há cron; conta offline só é creditada quando volta.
- Recompensa extra: `+randomInt(51)` moedas (0-50) por drop (`:67`).
- **Divergência:** mensagem `:87` e README:79 dizem "a primeira opção será atribuída"; o código atribui **aleatória**. O teste `automaticDropIndex(length, roll)` permite injetar o roll.
- `sync` não exige chave de idempotência e não grava em `web_actions`; a liquidação do expirado é idempotente porque apaga a linha de `web_drops` na mesma transação.

### Como encaixar no nosso
- Engine novo `src/engine/ultimate/drops.ts` (puro): `dropStock(state, nowMs)` recebendo `nowMs` por parâmetro; `rollDropOffers(rng, pool, bands)` com `weightedIndex`; `autoPickIndex(rng, n)`. Pesos em inteiros por milhão para não depender de float.
- Calibrar faixas contra `packOdds.ts`/`rarities.ts` (nossos tiers são por OVR; mapear faixas para `rarityFromOvr`).
- Servidor `server/ultimate-drops.ts`: tabela `rtm_ult_drop_pending(email PK, seed bigint, offers jsonb, expires_at, created_op_id)`; seed sorteada no servidor e gravada (auditável e reproduzível).
- Crédito via `applyUltTx` com `op_id = drop:<pendingId>` (o mesmo para escolha manual e auto-liquidação, assim nunca credita duas vezes). Moedas extras como `credits_delta`.
- Rotas no `api/ultimate-economy.ts` (`action=drop-draw|drop-choose`), seguindo a seção 8.
- Corrigir a divergência: decidir "primeira" ou "aleatória por seed" e escrever na UI o que o código faz. Se quiser pity, implementar no engine (ex.: garantir faixa ≥76 após N drops) e gravar o contador no estado do servidor.

---

## 2. Versões de evento por jogador

**Origem:** `prisma/schema.prisma:71-98` (`Player`), `:345-356` (`EventVersion`); `server/progression.js:19-29`; `web/card.js:12-50`.

### Modelo
- `Player` é uma linha por (`baseName`, `version`), `@@unique([baseName, version])`. `version` ex.: `base`, `s12025`, `s12026`, `major1`, `ewc`, `blastr26`, `esl23`, `esl23ch`, `esl23s2`, `eslmvp1`, `versus1`, `versus2`. `versionName` é o rótulo. Cada versão tem seus próprios atributos, OVR e `rarity`.
- `EventVersion(version PK, name, active, replacesVersion default 's12026', bgFile, primaryColor, footerColor, textSecondaryColor, createdAt)`.
- `Player.isChallengeOnly`: só sai como recompensa de desafio.

### Regra de elegibilidade (`eligiblePool`, `:19-29`)
Base: `rarity > 0` e `isChallengeOnly = false`. Depois exclui `p` se:
1. `version` ∈ {`versus1`, `versus2`, `eslmvp1`} (hardcoded, fora do pool comum);
2. existe `EventVersion` com `version = p.version` e `active = false` (evento encerrado sai dos drops);
3. existe `EventVersion` **ativo** `e` com `e.replacesVersion = p.version` **e** existe outro `Player` com `version = e.version` e mesmo `baseName` (case-insensitive). Ou seja: enquanto o evento está ativo, a versão base daquele jogador é substituída pela de evento; jogadores sem carta do evento continuam com a base.
- Usado em: diário e drops. **Packs** (`server/shop.js`) e **inicial** (`:37`, que exclui só `versus1/2`) não usam `eligiblePool`; divergência a considerar (packs podem dar versão base de jogador substituído e versões de evento inativas). Confirmei apenas pelo filtro em `progression.js`; não reli o filtro exato de `shop.js` nesta passada.
- Cartas já possuídas não mudam quando o evento muda; a substituição é só na geração.

### Arte por versão (`web/card.js:36-50`)
- `editionThemes[version]` vence `rarityThemes[rarity]`; versão de evento ganha cena de fundo `/assets/cards/events/<version>-scene-v1.webp` (`esl23s2` reutiliza `esl23`).
- Foto: `photos["<version>/<baseName>"]` antes de `photos[baseName]`.
- As cores de `EventVersion` (`primaryColor` etc.) existem no banco mas a UI web usa a tabela fixa em `card.js` (divergência: banco não é a fonte).

### Como encaixar no nosso
- Nosso equivalente natural são specials curados (`promos.ts`, `seasonEdition.ts`, `legacySpecials.ts`). Criar `src/engine/ultimate/editions.ts`: `Edition { id, name, active, replaces: 'base' | editionId, theme }` e função pura `eligibleCards(catalog, editions)` com as 3 regras acima (sem hardcode; flag `excludeFromCommonPool` na edição).
- Aplicar a mesma função em **drops, diário e packs** (`packPool.ts`) para não repetir a divergência.
- O catálogo deve ter id estável por (playerId, editionId), como já fazemos com specials.

---

## 3. Estatísticas por carta

**Origem:** `prisma/schema.prisma:115-139` (`UserPlayer`), `server/matches.js:52-54`, `web/play.js:225-240`.

### Colunas em `user_players` (todas `Int default 0`)
`matchesWon, matchesLost, roundsWon, roundsLost, kills, deaths, assists, damage, headshotKills, firstKills, firstDeaths, clutchesWon, clutchesTotal, bombPlants, bombDefuses, gamesPlayed, mvpCount`, mais `lastPlayed DateTime?`.

### Quando são gravadas
Só na ranqueada (`matches.js:52-54`), na mesma transação, para **os dois lados** (inclusive o defensor assíncrono), `updateMany where {userId, cardId}`:
- `kills/deaths/assists += ` do resultado; `gamesPlayed += 1`; `matchesWon/Lost += 1` conforme o lado; `roundsWon/Lost += placar`; `mvpCount += 1` se `cardId == mvp.cardId`; `lastPlayed = now`.
- **Nunca incrementados no web:** `damage, headshotKills, firstKills, firstDeaths, clutchesWon, clutchesTotal, bombPlants, bombDefuses` (o simulador não gera esses dados). "Clutches por carta" pedidos no briefing **não existem de fato**: as colunas existem, ficam em 0. Não verifiquei se o Road to Major (`server/major.js`) grava stats.
- Se a carta saiu da coleção entre montar e gravar, o `updateMany` simplesmente atualiza 0 linhas (sem erro).

### O que é exibido
- No replay (`web/play.js:225-227`), derivado da partida e não das colunas: K-D, rating = `clamp(0.1, 2.5, 0.3 + 0.9·K/r + 0.25·A/r + 0.35·sobrevivência + 0.25·(KD-1) + 0.05·venceu)`, ADR estimado `(115·K + 35·A)/r`, KAST e swing `(rating-1)·10`. São números cosméticos, não de verdade.
- Não localizei UI de "história da carta" que leia as colunas acumuladas (grep em `web/*.js` só achou o replay).

### Como encaixar no nosso
- Tabela `rtm_ult_card_stats(email, card_uid, games, wins, losses, rounds_won, rounds_lost, kills, deaths, assists, mvps, clutches_won, clutches_faced, last_played_at)`, PK (email, card_uid). Gravar no servidor junto com o crédito de recompensa da partida (`server/ultimate-pvp-reward.ts` na f2), idempotente pelo mesmo código de partida (`op_id = stats:<matchCode>`; pode ser uma tabela `rtm_ult_match_applied(code, email)` para não somar duas vezes).
- Clutch de verdade: nosso `matchSession.ts`/`liveFrags.ts` devem emitir o evento (último vivo vs N) para alimentar `clutches_*`; não copiar colunas que ninguém preenche.
- Exibir só o que é medido. Rating derivado pode ir no engine (`matchEvidence.ts`) como função pura.

---

## 4. Pacote diário com streak de 5 dias

**Origem:** `server/progression.js:11-15, 47-53`; `core/utils/brtDate.ts`.

- Fuso: BRT fixo UTC-3 sem horário de verão (`BRT_OFFSET_MS = -3h`, `brtDate.ts:1`). Dia = `toISOString(t-3h).slice(0,10)`. Reset à 00:00 BRT = 03:00 UTC.
- `dailyStreak(user, now)`:
  - se `dateBRT(lastDaily) == hoje` → 409 "já recebeu";
  - se `dateBRT(lastDaily) == dateBRT(now - 24h)` **e** `dailyStreak < 5` → `streak+1`;
  - caso contrário → 1. **Atenção:** no dia seguinte ao dia 5 o streak volta para 1 (ciclo de 5, não fica travado em 5).
- Recompensa:
  - dias 1-4: 1 carta OVR ≤ 70 do `eligiblePool`;
  - dia 5: 3 cartas: a 1ª OVR > 70, as outras 2 OVR ≤ 70 (cartas podem se repetir entre si; não há filtro de distinção);
  - sempre `randomInt(201)` moedas (0-200), independentemente do dia.
- Grava `lastDaily = now`, `dailyStreak = streak`, `coins += x`. Idempotente pela chave de ação (seção 8) e pela regra "mesmo dia BRT".
- Divergência: mapa e README falam "carta melhor no 5º"; o código dá 3 cartas, só uma > 70.

### Como encaixar no nosso
- Já temos `src/engine/ultimate/daily.ts` (`DAILY_TABLE`, `dateKey`, `DailyStatus`). Estender com `cycleLength = 5` e recompensa de carta por dia (`{ day, credits, cards: [{ minOvr?, maxOvr?, count }] }`), sorteio por `makeRng(seed)`.
- `dateKey` deve receber o instante e aplicar BRT fixo (igual ao deles) e ser alimentado pelo servidor, nunca pelo relógio do cliente.
- `op_id = daily:<dateKeyBRT>` no ledger: garante uma vez por dia sem precisar de coluna `lastDaily` (o UNIQUE resolve corrida).
- Moedas fixas por dia (nossa tabela) em vez de 0-200 aleatório, para economia previsível.

---

## 5. ELO, cooldown, limite diário e ranqueada assíncrona

**Origem:** `core/services/eloSystem.ts:1-84`; `server/matches.js:20-58`.

### Fórmula ELO (`calculateElo(winnerElo, loserElo)`)
```
expW = 1/(1+10^((L-W)/400)); expL = 1/(1+10^((W-L)/400))
winBase  = round(32*(1-expW))
lossBase = round(32*(0-expL))
winΔ  = clamp(round(winBase*1.2),  +10, +38)
lossΔ = clamp(round(lossBase*0.85), -26, -6)
se W < L e gap=|W-L| >= 150:          # zebra
   t = clamp((gap-150)/350, 0, 1)
   zebra = round(-12 + t*(-36 - -12))  # -12 em 150, -36 em 500+
   lossΔ = min(lossΔ, zebra)
novo = max(0, elo + Δ)
```
Casos: iguais (1000×1000) → +19/−14. Zebra 500 de gap → favorito perde −36 (abaixo do piso normal de −26). Note o arredondamento duplo (base e multiplicador).

### Moedas
`calculateReward(won)`: vitória `35 + floor(rand*66)` (35-100), derrota `floor(rand*36)` (0-35); **usa Math.random**. `applyDailyCap` é no-op; não há teto (schema cita 1.500/dia, divergência).

### Regras da fila (`ranked`)
1. Cooldown: `now - lastRanked < 60 000 ms` → 409. `lastRanked` só é gravado para quem desafia.
2. Limite: partidas `RANKED` no dia BRT (`getBrtDayRange`) em que o usuário é home **ou** away ≥ 50 → 409. Ser desafiado conta no limite do defensor.
3. Time próprio válido (`currentTeam`, `:11-19`): exatamente 5 `cardId` distintos, todos possuídos, 5 `baseName` distintos; senão 409.
4. Sem revanche imediata: exclui o adversário da última ranqueada do usuário.
5. Candidatos: usuários com time salvo de 5 slots, ordenados por id; janelas de |ΔELO| ≤ 150, 300, 500, ∞; usa a primeira janela não vazia; escolha uniforme `randomInt`.
6. Lock do adversário: `pg_try_advisory_xact_lock(hashtext(oppId))` (falha → 409, não espera) + `SELECT … FOR UPDATE`; relê o adversário (ELO fresco). Revalida o time do adversário (se ele quebrou o time, a partida inteira falha com 409 e o usuário recebe "monte um time…", bug de mensagem).
7. Simula; empate → 503 e nada é gravado.
8. ELO aplicado aos **dois**; moedas para os **dois** (`calculateReward(!won)` para o defensor); W/L dos dois; stats das cartas dos dois.
9. Grava `Match` (home/away, placar, mapa, MVP, snapshots de time, rounds) + `persistStructuredMatchData` (tabelas `match_rounds`, `match_round_kills`) e o bloco `ranked { home/away: eloBefore, eloAfter, delta, rankBefore, rankAfter }`; posição = 1 + count(elo maior ou elo igual com id menor).

### O que o defensor perde
ELO pela mesma fórmula (inclusive zebra) sem ter jogado nem sido avisado; ganha moedas mesmo perdendo (0-35). Não há limite de quantas vezes um mesmo defensor é escolhido por dia além do teto de 50 que o atinge.

### Como encaixar no nosso
- `src/engine/ultimate/elo.ts` puro: copiar a fórmula (são constantes, não código com RNG). Testes com os casos acima.
- Recompensa: usar nossa constante (`RANKED_WIN_CREDITS = 500`, `RANKED_LOSS_CREDITS = 0` em `server/ultimate-pvp-reward.ts` da f2) via ledger com `op_id = ranked:<code>` (já existe `rankedRewardOpId`).
- Modo assíncrono contra time salvo como "Ranqueada rápida" ao lado do PvP por beats: snapshot do squad salvo no servidor (`server/ultimate-squad.ts`), nunca do cliente. Escolha do adversário por `makeRng(seed)` com as janelas 150/300/500/∞ e exclusão de revanche.
- **Defensor:** recomendação: não perde ELO (ou perde 50%) e não recebe moedas sem jogar; registrar a defesa num feed ("Seu time foi desafiado por X"). Limitar defesas por dia por defensor.
- Cooldown e limite contados no servidor por dia BRT (`dateKey`); limite em `rtm_ult_ranked_daily(email, day, count)` atualizado na mesma transação.
- Empate impossível: nosso simulador por seed deve garantir desempate (seção 6), sem 503.

---

## 6. Simulador (kill feed, economia, MVP) — algoritmo para reescrever com seed

**Origem:** `core/services/matchSimulation.ts` (linhas abaixo), constantes em `core/config/simulationBalance.ts`. Toda chamada aleatória abaixo vira `rng()` de `makeRng(seed)`; a ordem das chamadas deve ser fixa e documentada para o replay bater.

### Constantes (`SIMULATION_BALANCE`)
maxRounds 60; roundTimeSeconds 115; firstKillMin 10 s, firstKillMax 25 s; noise ±60; gapImpact 0,48 (0,35 se gap ≥ 30); bônus 0,226 por ponto de gap; force −10%, eco −22%; forma ±7%; fechamento +4%; química +2%/jogador em grupo ≥2 do mesmo time; −4% se nenhuma região ≥3; assist 30%; nerf do entry até 0,20 por kill; 2-14 s entre kills; mapas: Dust2, Mirage, Inferno, Nuke, Overpass, Vertigo, Ancient.

### Força
- Por jogador (`:108-121`): AWPer .55F+.20C+.15E+.10R; IGL .35E+.25R+.20C+.20F; Rifler .55F+.20R+.15C+.10E.
- Time (`:235-245`): (Σ − penalidade de composição) × (1 + química) × fator região × boost NPC (só lado away no Road to Major).

### Partida (`simulateMatch`, `:699-809`)
1. `map = pick(MAPS)`.
2. `formSwing = (rng*2-1)*0.07`; home ×(1+s), away ×(1−s) (simétrico, soma constante).
3. Loop enquanto `round < 60` e não acabou:
   - fim: 13 com o outro ≤ 11; na prorrogação (total > 24) bloco `b = floor((total-25)/6)`, base `12+3b`, vence quem tiver ≥4 no bloco e mais que o outro.
   - economia por lado (`:250-262`): round > 24 → compra cheia; 1 derrota seguida → −10%; 2 → eco −22% (flag `isEco`); 3+ → cheia. **Não há reset no round 13 (pistol) nem estado de dinheiro**, só contador de derrotas.
   - closeout: lado com 12 e outro ≤ 10 ganha +4%.
   - `simulateRound`; atualiza placar e derrotas seguidas.
4. Se empatou (teto de 60), um round extra de desempate sem closeout.
5. MVP (`:102-106`): maior `(K−D) + 0,25·A + 0,30·swing(KD)`; `swing` = interpolação linear de KD (`kdToSwingPercent`, `:91-100`; tabela de pontos não transcrita aqui, ler no arquivo). Empate: o primeiro na ordem home→away.

### Round (`simulateRound`, `:468-660`)
1. `rawH = forçaTime(H) × (1−nerfEco) × forma × (1+closeout)`; idem A.
2. `gap = |rawH−rawA|`; `k = gap>=30 ? .35 : .48`; comprime em torno da média: `b = avg + (raw−avg)·k`.
3. `strX = bX + U(−60, 60)` (duas chamadas, H depois A); o mais forte em `raw` ganha `+gap·0,226`. Vence `strH >= strA` (empate favorece home).
4. Kills do perdedor alvo: perdedor em eco → 70% 1 kill, senão 0; normal → 65% 2, senão 1.
5. Lado T: home é T nos rounds 1-12; na prorrogação alterna a cada 3 (`floor((r-25)/3)%2==0` → home T); 13-24 home CT.
6. Entry = rifler do lado T com maior ERI (sem rifler, sem entry).
7. Tempo: primeiro kill em `U_int[10, 25]` s decorridos; depois `+U_int[2, 14]`, teto 114.
8. Enquanto houver perdedor vivo:
   - `canLoserKill = vencedoresVivos > 1`.
   - **Primeiro duelo com entry:** `eriDiff = ERI_entry − média ERI dos perdedores vivos`; tenta com `clamp(.35,.80, .55+.006·diff)`; se tenta, abre com `clamp(.45,.80, .60+.006·diff)`: abre → entry mata vítima uniforme do outro lado; falha → entry morre para `pickKiller` do outro lado. Se não tenta → duelo padrão.
   - **Duelo padrão:** `p = canLoserKill ? .70 : 1`; se faltam kills do perdedor: `p = max(.45, p − (.08 + .12·faltam + .15·(5−perdedoresVivos)/5))`. Com prob `p` o vencedor mata (killer ponderado, vítima uniforme), senão o perdedor mata.
   - Peso do matador (`buildKillWeights`, `:281-297`): `max(.05, roleMod · clamp(.45,1.55, força/média)^1.9 · clamp(.65,1.45, FPW/médiaFPW)^3.4 − nerfEntry)`, roleMod IGL .58, AWP .74, outros .66; médias sobre os vivos do lado.
   - Nerf do entry: a cada kill do entry no lado vencedor, `+= U(0, .20)`, subtraído do peso dele.
   - Assistência (`:421-435`): 30%; entre vivos do time do matador exceto ele; IGL peso 2.
   - Kill registra `killerName, victimName, assistName, killerSide, roundTime ("m:ss" restante), roundSecond`.
9. Narração em PT-BR por templates (entry abriu/caiu, 3k+, etc.), `:299-405`, também com sorteio de frase.

### Pontos a corrigir ao portar
- Vencedor do round é decidido antes dos kills; o kill feed é "narração coerente", não causa. Manter (é barato e estável).
- Vítima uniforme (AWP/IGL morrem igual): opcional ponderar.
- Sem pistol, sem dinheiro real: se quisermos economia, modelar `money` por lado no engine.
- Empate de força favorece home: trocar por `rng() < .5`.

### Como encaixar no nosso
- `src/engine/ultimate/autoSim.ts`: `simulateAutoMatch(seed, home, away, opts) → { map, rounds[], score, mvp, stats }` usando apenas `makeRng(seed)`; ordem das chamadas: mapa, forma, e por round [noiseH, noiseA, alvoPerdedor, tFirstKill, por duelo: (entryTenta, entryAbre | pVencedor), killer, vítima, assist?, nerf?, gap].
- Adaptar atributos: nossos 6 substats → F/R/C/E (F=tiro/mira, R=reflexo, C=clutch, E=visão/util) ou reescrever pesos para nossas 5 funções (Entry ganha o papel de entry fragger no lugar de "rifler com maior ERI").
- Usar como modo "auto"/ranqueada assíncrona e como gerador de kill feed para `liveFrags.ts`; o PvP por beats (`matchSession.ts`, f2) continua sendo o modo principal.
- Persistir `seed` + versão do algoritmo; o replay re-simula em vez de guardar rounds (mas guardar resultado/placar para auditoria).
- Teste de ouro: mesma seed → mesmo JSON; distribuição de placares sob 10k seeds dentro de faixas.

---

## 7. Pipeline de arte

**Origem:** `scripts/prepare-card-assets.py:1-72`; `web/card-assets.js` (gerado); `web/card.js:1-160`; `web/card.css`.

### Geração (`prepare-card-assets.py`)
- Entrada: `<bot-root>/assets/{backgrounds,players,trans,teams}/**/*.png` (exige `backgrounds/bronze.png`).
- Tamanhos máximos (thumbnail LANCZOS, mantém proporção): backgrounds 600×900; players e trans 650×566 (ambos vão para o grupo `photos`); teams 160×160.
- WebP qualidade 83, `method=3`. Não sobrescreve se o destino existir.
- **Nome:** `<slug>-<sha1(caminho relativo)[:8]>.webp`, `slug = stem.casefold()` com `[^a-z0-9]+ → "-"`, aparado; vazio → `image`.
- **Chave do manifesto:** caminho relativo sem extensão em casefold (permite `versao/nome`); para teams remove tudo que não for `[a-z0-9]`. Primeira ocorrência vence (ordem alfabética casefold), então `players/x` vence `trans/x` só se vier antes na varredura (players é varrido antes de trans).
- Saída: `web/card-assets.js` = `export const cardAssets = {"backgrounds":{…},"photos":{…},"teams":{…}}` (JSON ordenado, compacto).

### Molduras disponíveis (`assets/cards/backgrounds`)
`bronze, prata, ouro, diamante, blastr26, esl23, esl23ch, esl23s2, eslmvp1, s12025-bg, versus1, versus2` (todas `<chave>-<hash8>.webp`) + `tactical-v2.webp` (sem hash, feita à mão). Cenas de evento (`assets/cards/events`): `blastr26, esl23, esl23ch, eslmvp1, versus1, versus2` com sufixo `-scene-v1.webp` (geradas por IA segundo `docs/card-art-generation.md`). Não há moldura "lenda" própria.

### Composição de uma carta (`card.js`)
- **Divergência importante:** o web **não usa as molduras por raridade** do manifesto. Usa sempre `tactical-v2.webp` e tinge com `filter` CSS por tema:
  - rarity 0/1 bronze `none` (#c98d68); 2 prata `grayscale(1) brightness(1.28)` (#d4e1e8); 3 ouro `hue-rotate(22deg) saturate(1.55) brightness(1.12)` (#f4ce71); 4 diamante `hue-rotate(165deg) …` (#78dcfa); 5 lenda `hue-rotate(232deg) …` (#e9aaff).
  - edições: blastr26 `hue-rotate(325deg)` #ff7279; esl23 70deg #ceef75; esl23ch 22deg #f2cf75; esl23s2 85deg #a6df76; eslmvp1 62deg #d9fc65; versus1 95deg #a4d289; versus2 55deg #dbdc86.
- Camadas (ordem do DOM): cena de evento (se edição) → moldura tingida → foto (`photos["versão/nome"]` ou `photos[nome]`, senão placeholder "Foto indisponível") → bloco OVR (rótulo "OVR", número, função) → nome + logo do time (`teams[time sem não alfanuméricos]`) + selo de região (AM/EU/AS) → atributos FPW/ERI/CLU/EXP → ID curto copiável e cadeado se `locked`. Posições exatas estão em `web/card.css` (não transcritas).
- `aria-label`: "<nome>, <OVR> de overall, <função>, carta #<id>".

### Como encaixar no nosso
- Antes de qualquer uso: confirmar no contrato de cessão que fotos de jogadores e logos estão cobertos (o mapa marcou risco; a cessão do autor não cobre direito de imagem de terceiros nem marcas ESL/BLAST).
- Script nosso `scripts/prepare-ult-card-art.py` com o mesmo esquema (hash do caminho → nomes estáveis e cacheáveis), saída em `public/ultimate/cards/` e manifesto `src/engine/ultimate/cardArt.generated.ts` (só dados, importável pelo front).
- Reaproveitar a ideia de **uma moldura + filtro por tier**: mapear nossos 7 tiers + specials para filtros/acentos, em vez de 12 PNGs.
- Chave da foto por `playerId` nosso (não por `baseName`) com fallback por edição.

---

## 8. Padrão de mutação autoritativa

**Origem:** `api/play.js:9-49`; `server/security.js:6-13, 51-53`; `database/web.sql:21-28`.

### Sequência exata
1. `session(req)`: cookie `csm_session` HMAC-SHA256 com `purpose='session'`, `exp`, comparação `timingSafeEqual`; id deve casar `^(\d{10,25}|web_[a-f0-9-]{36})$` (401).
2. GET → só leituras (histórico 20, detalhe com dono checado).
3. Não-POST → 405.
4. `sameOrigin`: `req.headers.origin === new URL(APP_URL).origin` estrito; `APP_URL` precisa ser https (ou http://localhost) senão 503. Sem Origin → 403.
5. Whitelist de `action` (400).
6. Validação de forma antes do banco (tier, packType, payload do desafio).
7. `key` obrigatória (exceto `sync`): `^[a-f0-9-]{36}$` (UUID gerado pelo cliente por clique) → 400.
8. `$transaction(…, { isolationLevel: 'Serializable', timeout: 30000 })`:
   1. `pg_try_advisory_xact_lock(hashtext(userId))`; falso → 409 "outra ação em andamento" (não enfileira).
   2. `SELECT id FROM users WHERE id=$1 FOR UPDATE`; relê o usuário.
   3. `SELECT action,result FROM web_actions WHERE user_id=$1 AND request_key=$2`. Se existir: confere que é a mesma ação e os mesmos parâmetros (tier, matchToken, packType, request do desafio); diferente → 409 "Identificador já utilizado"; igual → devolve `result` gravado (replay sem efeito).
   4. Executa a ação (todas recebem `tx` e o usuário travado).
   5. `INSERT INTO web_actions(user_id, request_key, action, result jsonb)`; PK (user_id, request_key).
9. Erro → `failure` com `HttpError.status`; qualquer exceção aborta a transação inteira (sem crédito parcial). Falha de serialização vira 500 genérico (não há retry automático no servidor).
- Locks em segunda conta (adversário) usam o mesmo `try` para evitar deadlock cíclico (`matches.js:33-36`).
- Tabela `web_actions` não tem limpeza/TTL.
- `Cache-Control: no-store` em toda resposta.

### Como encaixar no nosso
- Já temos o equivalente mais forte em `server/ultimate-economy.ts`: ledger append-only `rtm_ult_ledger` com `UNIQUE(email, op_id)` e aplicação atômica (`applyUltTx`). Falta trazer:
  1. **Verificação de parâmetros no replay:** guardar `kind` + hash do payload no ledger e recusar (409) o mesmo `op_id` com payload diferente.
  2. **Resultado gravado:** coluna `result jsonb` no ledger (ou `rtm_ult_actions(email, op_id, result)`) para devolver exatamente a mesma resposta no replay, incluindo cartas sorteadas.
  3. **Lock por conta:** `pg_advisory_xact_lock(hashtext(email))` no início da transação Neon (no Neon serverless isso exige transação interativa/`Pool`, não o `sql` HTTP de uma só instrução; ver como `applyUltTx` monta o CTE — se for uma instrução única com CTE, o UNIQUE + `WHERE saldo>=` já cobre corrida de saldo e o lock só é necessário para ações multi-instrução como ranqueada e drop).
  4. **Origin check** em `api/ultimate-economy.ts` e nas mutações de `api/lobby.ts` (hoje não há; o grep por "origin" só achou comentário de CDN): comparar com a origem de produção e das previews permitidas.
  5. `op_id` derivado do servidor quando possível (`daily:<dia>`, `drop:<id>`, `ranked:<code>`), e UUID do cliente só para compras.
- Serializable não é necessário se cada ação for uma instrução atômica com condições no `WHERE`; usar Serializable só nas ações com leitura-decisão-escrita em várias instruções, com retry em `40001`.

---

## Divergências README × código (resumo)
| Tema | Texto | Código |
|---|---|---|
| Drop expirado | "primeira carta" (README:79, `progression.js:87`) | aleatória (`:66,72`) |
| Máx. de drops | schema "max 5" | 3 (`:9`) |
| Pity | `pityCounter` no schema | não usado |
| Diário dia 5 | "carta melhor" | 3 cartas, só a 1ª > 70 |
| Teto de moedas ranqueada | schema "cap 1500/dia" | `applyDailyCap` no-op |
| Economia do simulador | comentário "force −8%, eco −15%" (`:257`) | constantes −10% / −22% |
| Molduras por raridade | README fala nas molduras do bot | web usa `tactical-v2` + filtro CSS |
| Cores de evento | colunas em `event_versions` | tabela fixa em `card.js` |
| Stats avançadas por carta | 8 colunas (clutch, HS, dano…) | nunca incrementadas |
