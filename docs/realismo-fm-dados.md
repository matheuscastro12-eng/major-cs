# Realismo FM — Frente A: dados da cena 2026

Como a base de jogadores do Road to Major sai de estatística pública. Tudo aqui é
reprodutível: os scripts são determinísticos e toda requisição passa por cache em disco.

## Pipeline

```
BO3_CACHE_DIR=/caminho/do/cache npx tsx scripts/fetch-bo3-stats.mts   # rede (ou cache) → player-stats + calibration-targets
npx tsx scripts/stats-to-attrs.mts                                     # offline → player-attrs
npx tsx scripts/update-rosters-2026.mts                                # offline → bo3-2026.json + docs/elencos-set-2026.md
npm run gen:ult-catalog                                                # snapshot do catálogo do Ultimate (servidor)
```

- **Fonte única:** API pública do bo3.gg (`https://api.bo3.gg/api/v1`). Nada de HLTV.
- **Educação com a API:** `scripts/lib/bo3-client.mts` — no máximo ~2 req/s (intervalo mínimo
  de 520 ms), backoff exponencial em 429/5xx/erro de rede (respeita `Retry-After`),
  `User-Agent: RoadToMajor-DataPipeline/1.0 (...)`, cache por URL (sha1) com a data da coleta.
  `BO3_OFFLINE=1` roda só do cache.
- **Janela:** 6 meses (`2026-03-28 → 2026-09-28`) para a estatística principal; 12 meses como
  fallback quando o jogador tem menos de 200 rounds na janela.
- **Ids:** a base anterior (commit `a46d0cc`) é a referência de ids. Jogador existente mantém o id;
  novo vira `bo3_<id do bo3>`; time novo vira `bo3_team_<id do bo3>`. Ver `docs/elencos-set-2026.md`.

### Endpoints usados

| Endpoint | Para quê |
|---|---|
| `players/stats_list` (filtros `game_begin_at`, `tournament_tier_rank`, `min_games_count`) | taxas por round de todo jogador ativo (kills, mortes, dano, abertura, trade, precisão, HS, flash assist, utilitária, multi-kill, clutches ganhos por 1vN) |
| `players?filter[id][in]` / `players?filter[team_id][in]` | cadastro: time atual, status (0 inativo, 1 ativo, 2 banco), técnico, nascimento, país, `joined_team_at`, premiação |
| `players/<slug>/player_roles` | papel por round (awper, entry_fragger, lurker, trader, anchor, rotator, play_maker) — vida toda no CS2 (o endpoint ignora filtro de data) |
| `players/<slug>/advanced_stats` (janela) | tentativas e vitórias de clutch, pistol, abertura com vitória do round |
| `players/<slug>/matches_list_stats/general` (janela) | rating partida a partida (últimas até 30): consistência, jogo grande, tilt |
| `player_transfers` | datas das mudanças de elenco |
| `teams?filter[teams.id][in]` | ranking, sigla, país e logo dos times |
| `tournaments`, `matches`, `games?filter[games.match_id][in]`, `games/<id>?with=rounds`, `games/<id>/players_stats`, `matches/<slug>/clutches_stats`, `tournaments/<slug>/map_pool` | amostra tier S para os alvos de calibração |

## Estatística → atributos (`scripts/stats-to-attrs.mts`)

Notação: `z(x)` = z-score **ajustado ao nível** da métrica `x`: resíduo de uma regressão linear
de `x` contra a força do time (`ts`), dividido pelo desvio do resíduo, cortado em ±2,5. Assim um
jogador de tier 3 que amassa tier 3 não parece o ZywOo, e um titular de top 5 não parece fraco só
por enfrentar o top 5. Antes do z, cada taxa é encolhida para a média da população com peso de
250 rounds (`(x·n + média·250)/(n + 250)`), então amostra pequena não gera extremo.

### Nível e base

- `ts` (força do time) = `1 − ln(rank)/ln(400)` com o ranking do bo3.gg (#1 → 1; #10 → 0,62; #50 → 0,35); sem time → 0,12.
- `perf` = z do rating; com ≥ 300 rounds em tier S/A, média entre esse z e o z do rating **só em tier S/A**.
- `nívelEstat` = 0,35·ts + 0,30·(fração dos rounds em tier S/A) + 0,35·Φ(perf).
- Jogador que já estava na base: `nível` = 0,5·nívelEstat + 0,5·nívelLegado, com
  nívelLegado = (OVR legado − 55)/41 (o OVR curado dos 5 números). Novato: só nívelEstat.
- `B` (base dos atributos) = 3,5 + 13·nível. `S` (spread) = 2,4. Atributo = `B + S·sinal + ajuste de função`, arredondado e cortado em 1..20.
- `exp` (experiência 0..1) = 0,5·(idade−17)/13 + 0,5·premiação (log, US$ 2,5 mi = 1). `expZ` = (exp − 0,45)·3.

### Mecânicos

| Atributo | Sinal |
|---|---|
| aim | 0,35 z(KPR) + 0,25 z(ADR) + 0,2 z(rating) + 0,2 z(precisão) |
| aimMovement | 0,4 z(abertura/round) + 0,3 z(KPR) + 0,3 z(multi-kill/round) |
| tap | 0,5 z(% kills de HS) + 0,3 z(precisão) + 0,2 z(KPR) |
| spray | 0,4 z(multi-kill) + 0,3 z(ADR) + 0,3 z(precisão) |
| awp | AWP titular (função AWP ou awper ≥ 40% dos rounds): B + 1,2 + S·(0,4 z(KPR) + 0,3 z(% duelos de abertura ganhos) + 0,3 z(rating)), com z **dentro dos AWPers**. Não-AWP: 2 + 7·nível + 6·min(1, fração awper/0,4) |
| headshot | 0,7 z(% kills de HS) + 0,3 z(% acertos na cabeça) |
| crosshair | 0,4 z(precisão) + 0,3 z(% HS) + 0,3 z(% abertura ganha) |
| preAim | 0,5 z(% abertura ganha) + 0,3 z(trade kills) + 0,2 z(precisão) |
| offAngles | 0,35 z(% abertura ganha) + 0,35 z(% clutch) − 0,3 z(DPR) |

### Mentais

| Atributo | Sinal |
|---|---|
| gameSense | −0,35 z(DPR) + 0,25 z(rating) + 0,2 z(% clutch) + 0,2 expZ |
| decisions | −0,35 z(DPR) + 0,3 z(% rounds ganhos) + 0,35 expZ |
| anticipation | 0,4 z(% abertura ganha) + 0,3 z(trade kills) − 0,3 z(DPR) |
| composure | 0,5 z(% clutch) + 0,25 z(clutch ponderado/round) + 0,25 z(rating vs top-20 − resto) |
| concentration | 0,5 consZ + 0,3 z(rating) + 0,2 expZ |
| positioning | −0,45 z(DPR) + 0,3 z(% mortes trocadas) + 0,25 expZ |
| clutch | 0,6 z(% clutch) + 0,4 z(clutch ponderado/round: 1v1=1 … 1v5=5) |
| teamwork | 0,35 z(trade kills) + 0,25 z(% mortes trocadas) + 0,25 z(flash assists) + 0,15 z(assists) |
| communication | IGL: 12 + 4·exp + 2·nível. Outros: B − 2 + S·(0,4 z(flash assists) + 0,3 z(assists) + 0,3 expZ) |
| leadership | IGL: 12,5 + 4·exp + 1,5·nível + 0,8 z(% rounds ganhos). Outros: 3 + 6·exp + 2·nível |
| adaptability | 0,5 z(versatilidade de papéis) + 0,25 z(rating) + 0,25 expZ |
| vision | IGL: 11,5 + 4·exp + 2,5·nível + 0,5 z(% rounds ganhos). Outros: B − 1 + S·(0,4 z(% rounds ganhos) − 0,3 z(DPR) + 0,3 expZ) |

### Físicos/profissionais

| Atributo | Sinal |
|---|---|
| reflexes | 0,5 z(abertura/round) + 0,3 z(% abertura ganha) + 0,2 idadeRápida |
| reaction | 0,4 z(% abertura ganha) + 0,3 z(trade kills) + 0,3 idadeRápida |
| stamina | 0,5 z(mapas jogados) + 0,5 idadeFôlego — **estimativa parcial** (não há dado de fadiga) |
| discipline | −0,4 z(mortes de abertura) + 0,3 consZ + 0,3 expZ |
| coordination | 0,4 z(flash assists) + 0,3 z(dano de utilitária) + 0,3 z(trade kills) |
| apm | 0,5 z(multi-kill) + 0,5 z(abertura/round) |
| consistency | 0,7 consZ + 0,3 z(rating) |

- `consZ` = −z(desvio do rating partida a partida, encolhido com peso de 8 partidas).
- `idadeRápida`: ≤22 → +1; 23–25 → +0,4; 26–28 → −0,3; 29–31 → −0,9; ≥32 → −1,5.
- `idadeFôlego`: ≤27 → +0,3; 28–31 → 0; ≥32 → −0,8.
- Ajuste por função: AWP spray −1, aimMovement −0,5; Entry aimMovement +0,5, reflexes +0,5, discipline +1;
  Support teamwork +1, coordination +0,5; IGL teamwork +0,5, decisions +1; Lurker offAngles +0,5, anticipation +0,5.

### Ocultos

| Oculto | Fórmula | Dado |
|---|---|---|
| bigMatch | 10,5 + 3 z(rating vs top-20 − rating vs resto) + 2·(premiação − 0,4) | real (encolhido) |
| temperament | 10,5 + 3 z(rating depois de derrota − depois de vitória) + idade (≥27 +1, ≤20 −1) | real (encolhido) |
| consistencyHidden | 10,5 + 3,5 consZ | real |
| versatility | 5 + 12·entropia dos papéis por round | real |
| loyalty | 7 + 2,2·anos no time atual (máx. 7) − 1 se não está ativo, ± ruído 2 | tempo de casa real; escala **estimativa** |
| professionalism | 11 + 1,3 expZ + 1,2 consZ ± ruído 2 | **estimativa** |
| ambition | 11,5 + 3·(nível − 0,5) + idade (≤24 +1,5, ≥30 −1,5) ± ruído 3 | **estimativa** |
| injuryProneness | 7 + 0,35·max(0, idade − 26) ± ruído 3 | **estimativa** |

O ruído é determinístico (hash FNV-1a de `id + chave`), igual em toda execução.

### CA e PA

- **CA** = `caFromAttrs(a, função)` do contrato (`src/engine/attrs/model.ts`): OVR por função dos 28 atributos → 1..200.
- **PA** = CA + margem por idade × (0,8 + 0,4·Φ(perf)) × (1 ± 15% de ruído determinístico), limitado a 200.
  Margem: 16 → 60, 17 → 55, 18 → 48, 19 → 40, 20 → 33, 21 → 26, 22 → 20, 23 → 14, 24 → 9, 25 → 6, 26 → 4, 27 → 2, 28+ → 0.
- Sem estatística pública (aposentado, fictício "regen", não achado no bo3): `deriveAttrs` do contrato
  a partir dos 5 legados, com a mesma margem de PA por idade. O `src` diz qual caminho foi usado.

## Função (role)

- Jogador que já estava na base: mantém a função curada, salvo se a API trouxer função (o campo
  `role` do bo3.gg veio vazio para todos nesta coleta).
- Novato: inferida pelos papéis por round (`scripts/lib/roles.mts`): AWP (awper ≥ 40%), Entry
  (entry ≥ 35% dos rounds de T), Lurker (lurker ≥ 35% de T), Support (âncora ≥ 45% de CT e trader ≥ 35% de T),
  senão Rifler. O bo3.gg não publica IGL, então nenhum novato vira IGL por inferência. Toda inferência
  está listada em `docs/elencos-set-2026.md`.
- 5 números legados dos novatos (para o código que ainda os lê): `legacyFromAttrs` levado à escala
  curada por uma regressão linear ajustada nos jogadores que já estavam na base.

## Conferência contra jogadores conhecidos (coleta de 2026-09-29, UTC)

| Jogador | Time / função / idade | Estatística (bo3.gg, 6m) | Atributos-chave | CA / PA |
|---|---|---|---|---|
| ZywOo | Vitality, AWP, 25 | rating 6,81; KPR 0,85; awper 39% dos rounds | awp 20, aim 20, clutch 20, gameSense 20, liderança 9 | 185 / 192 |
| apEX | Vitality, IGL, 33 | rating 5,63; KPR 0,61 | liderança 18, comunicação 17, aim 10, reflexes 11 | 135 / 135 |
| donk | Spirit, Entry, 19 | rating 6,81; 0,20 opening kill/round (maior entre os Entry com 500+ rounds) | aimMovement 20, reflexes 20, aim 20, headshot 20, awp 9 | 182 / 200 |
| m0NESY | Falcons, AWP, 21 | rating 6,97; awper 51%; 37% dos abates de HS | awp 20, aim 20, consistency 19 | 178 / 200 |
| karrigan | Falcons, IGL, 36 | rating 5,07; KPR 0,48 | liderança 17, comunicação 17, aim 6 | 113 / 113 |

O teste `scripts/test-data-2026.mts` trava esses casos: ZywOo com AWP ≥ 18, apEX com liderança ≥ 17 e
mira entre 8 e 13, o Entry que mais abre round com aimMovement e reflexes ≥ 15, e IGLs com liderança
média pelo menos 5 pontos acima do resto.

## O que é estimativa

- Ocultos `professionalism`, `ambition`, `injuryProneness` (sem dado público); a escala de `loyalty`
  (o tempo de casa é real). `stamina` é metade estimativa (idade).
- Liderança, comunicação e visão dos IGLs: o bo3.gg não publica quem é IGL; vale a função curada da base.
- Novatos sem amostra (< 20 rounds na janela): perfil neutro no nível do time (`src` avisa).
- Jogadores sem estatística pública (aposentados, fictícios "regen", não achados): `deriveAttrs` dos 5 legados.
- Função dos novatos: inferida pelos papéis por round (ou, sem papéis, por % de HS e duelos de abertura).
- Em `docs/calibration-targets.json` nenhum alvo ficou como estimativa: todos foram medidos na amostra.
  Ressalvas: `awpKillShare` é a fatia de abates do AWPer de função (a API não separa por arma) e
  `ratingRelByRole` usa o rating do bo3.gg, não o Rating 2.x da HLTV.
