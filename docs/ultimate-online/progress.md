# progress — Ultimate online de verdade + evolução do Modo Major

- **Tarefa:** (1) elenco autoritativo no servidor e religar a ranqueada; (2) PvP com decisões simultâneas por beat resolvidas no servidor; (3) Modo Major: jogar partidas, pick'em, Major com amigos, polimento.
- **Restrições:** não mexer em preço/pagamentos/Stripe/Woovi. Engine puro (sem Math.random/Date.now). PR sem merge até o Matheus aprovar.
- **Estágio:** Fase 1 em `feat/ultimate-online-f1`; Fase 2 implementada em `feat/ultimate-online-f2` (a partir da F1, sem push/PR). Próximo: revisar, deploy, teste com dois aparelhos reais.

## Diagnóstico (27/10/2026)
- Duelo PvP: os dois clientes simulam com o mesmo `run_seed`; servidor não guarda round nem placar (`api/lobby.ts`).
- Ranqueada desligada (`RANKED_QUEUE_ENABLED`): squad vem do cliente com `ovr` e `chem` declarados (`api/lobby.ts` ação `pick`, clamp 0.8–1.2).
- Fila (`mm_queue`) identifica por **nick**, não por conta.
- Inventário no servidor (`rtm_ult_cards`) só existe para conta paga (espelho `ultimateShadow.ts`), e o `reconcileFlip` é "LOCAL VENCE": o cliente consegue empurrar cartas para o servidor. Posse no servidor ainda não é prova.

## Plano
### Fase 1 — elenco autoritativo
1. Ranqueada/evento exigem token de conta; fila e sala por e-mail.
2. `pick` recebe `cardIds` + formação; servidor confere posse em `rtm_ult_cards`, calcula OVR (catálogo + boost do meta) e química (`computeChemistry`) e grava o snapshot. Cliente não declara mais ovr/chem.
3. Fechar o "local vence": ganho de cartas/coins só por tx que o servidor valoriza (packs, mercado, recompensas com op_id do servidor).
4. Religar `RANKED_QUEUE_ENABLED` atrás de flag.
### Fase 2 — partida no servidor
- Tabela `ult_match` (code, seed, beat, placar, decisões por lado, prazo). Ações `matchState` e `decide`; servidor resolve o beat com o engine da Sala quando os dois decidem ou o prazo vence (escolha neutra). Abandono = W.O. após carência. Resultado vem do servidor (sem report pareado).
### Fase 3 — Modo Major
- Jogar séries do Major na Sala; pick'em com pontuação; liga privada com amigos; polimento.

## Decisões (Matheus, 27/10/2026)
- Inventário no servidor para TODAS as contas (grátis também); ranqueada aberta a todos com conta.
- Fim do "local vence": migração única que aceita o local uma última vez (guard anti-wipe + teto de sanidade); depois só o servidor cria carta.
- PvP: decisões simultâneas por beat, resolvidas no servidor (polling, sem WebSocket).
- Modo Major: jogar partidas, pick'em, Major com amigos, polimento — depois do Ultimate.

## Fase 1 — feito (27/10/2026, branch `feat/ultimate-online-f1`)
- `server/ultimate-squad.ts`: `buildServerSquad(sql, email, {cardIds, formationId}, lookup)` confere posse em `rtm_ult_cards`, cartas distintas e formação; OVR = catálogo do servidor + `meta.boost` (clamp 0..3); química = `computeChemistry` + adjacência da formação × bônus de duelo (`squadDuelBonus` com `meta.style`), clamp 0.8–1.2. Snapshot no formato de sempre, `v: 3`, `auth: true`.
- `server/ultimate-pack.ts`: `serverSquadLookup()` (mês corrente, cai pra qualquer mês do snapshot).
- `api/lobby.ts`: `queueJoin`/`queuePoll` exigem token (401 com `needAccount`); colunas `email` em `mm_queue` e `lobby_players` (ALTER idempotente); 1 ticket por conta; a mesma conta não se pareia; sala pareada nasce com o e-mail dos dois. `pick` em sala ranqueada ou de evento: exige token, vaga presa à conta (sala de evento por código vincula no 1º pick), squad montado no servidor com `cardIds`+`formationId`; `ovr`/`chem` do cliente ignorados; a regra do evento é checada com o squad do servidor. Amistoso por código segue sem conta, snapshot com `auth: false`.
- `server/ultimate-import.ts` + ação `ultImport` em `/api/ultimate-economy`: migração 1× por conta (`rtm_ult_wallet.imported_at` + ledger `import:<email>`, kind `grant`). Só card_key do catálogo do servidor, cardId livre, boost 0..3, `ed` 1..99, `style` da allowlist; tetos: 400 cartas, por raridade (histIcon 3, icon 6, major 8, tots 10, promo/totw 12, legendary 20, elite 40); excedente recusado e logado (console + meta do ledger). Créditos: sobe até min(local, 50.000), nunca desce. Carteira congelada bloqueia.
- Cliente: `lobbyApi` manda o token quando existe; pick manda `cardIds`+`formationId`; erro de squad aparece em PT-BR e não re-tenta em loop (trocar o squad re-envia); `importLocalOnce()` roda no boot do espelho (antes do reconcile), marca por e-mail no aparelho.
- Prêmio pelo servidor (forma mínima): `server/ultimate-pvp-reward.ts` credita 500 créditos por vitória ranqueada quando o report pareado é consistente (`api/ranking.ts`, laço do `claimed`), op_id `pvp-ranked:<code>`, kind `reward`. O MMR segue no report pareado (Fase 2 troca pelo resultado do servidor).

## Como ligar a ranqueada
Depois do deploy desta branch: definir `RANKED_QUEUE_ENABLED=true` na Vercel (produção) e redeployar. NÃO foi alterado por este trabalho.

## Pendências reais (Fase 1)
- Fontes de prêmio ainda só locais (não chegam ao servidor depois do import, então essas cartas/créditos não valem na ranqueada): Draft, objetivos/missões, carta inicial, eventos locais, daily/streak, meta, passe, recompensas de temporada, SBC (entrada de carta), evolução (`boost`) e estilo aplicados depois do import, Pacote da Temporada (`ed` é só local).
- Bônus de edição (`ed`, +2 OVR "em forma") não entra no OVR do servidor: o servidor não conhece `season.n` (é do save). O OVR do servidor fica até 2 abaixo do que o cliente mostra para essas cartas.
- O crédito do prêmio da ranqueada no servidor e o `recordMatch` local somam em saldos separados (local vs servidor) até a economia migrar de vez.
- `elo` e `name` do snapshot ainda vêm do cliente (clamp). O MMR real é do `rtm_ranking`.
- Cliente só chama `ultImport` no boot (login no meio da sessão importa no próximo boot).

## Próximo passo
- Revisar e mergear `feat/ultimate-online-f1` e `feat/ultimate-online-f2`, deploy, ligar `RANKED_QUEUE_ENABLED=true`, jogar um duelo com dois aparelhos, observar logs de `[ultImport]` e `[ult-match]`. Depois: pendências da Fase 2 (evento/rivalidade no fechamento) e Fase 3.

## Fase 2 — feito (27/10/2026, branch `feat/ultimate-online-f2`)
- Motor puro `src/engine/ultimate/pvpMatch.ts`: estado da partida a partir de (seed, squads do servidor); plano de beats = `buildBeatPlan` (MD1, 7 beats); Ponte = `bridgeToBeat`; fechamento = mesma regra do `lockIn` (último beat decide; 12-x vencido fecha 13-x) + `closeMapFromLive`. `resolvePvpBeat(state, a, b, rng)` aplica as duas decisões. Contra-jogo PvP: pedra-papel-tesoura (Agressivo > Passivo > Setup > Agressivo) com peso `COUNTER_DELTA × 1,5` = 18 pontos; força (OVR médio + química) até ±12; embalo até ±5; chance limitada a 10–90%. A tabela da Postura (`STYLE_VS_POSTURE`) não serve para dois humanos (não é antissimétrica: a diferença líquida dá zero em todos os pares), por isso o ciclo próprio. `beatsLeftInMap` extraído de `room.ts` para `roundModel.ts`; imports `.js` em `roundModel`/`moments`/`attributes` (cadeia do servidor).
- Servidor `server/ult-match.ts` + ações `matchStart`/`matchState`/`decide` em `api/lobby.ts` (sem rota nova): tabela `ult_match` (DDL idempotente, 1× por instância) com seed, estado jsonb, beat, decisão pendente por lado, prazo, presença, beats perdidos, versão, status (live/done/abandoned), vencedor, motivo (played/wo), `settled_at`. Toda escrita é `UPDATE ... WHERE version = $v`; quem perde a corrida relê (nenhum beat resolve 2×). Prazo 20s por beat; sem decisão, escolha automática por sorteio uniforme semeado (imprevisível = neutra em média). W.O.: 3 beats seguidos sem decidir, ou 60s sem poll; os dois ausentes = `abandoned` sem vencedor. Ranqueada: lado pela conta (token) e só com squads `auth: true`; amistoso: lado pelo nick. Revanche do amistoso (novo `run_seed`) recria a partida no mesmo código.
- Fechamento: ao virar `done` com vencedor, quem ganha o claim `settled_at IS NULL → now()` aplica MMR (`rankedDelta`, mesma régua; constantes e temporada extraídas para `server/rankedSeason.ts`) e o prêmio (`creditRankedPvpReward`, op_id `pvp-ranked:<code>`). Se o report legado já aplicou a partida, não aplica de novo. `api/ranking.ts` `report`: código com linha em `ult_match` responde `serverMatch: true` sem aplicar nada.
- Cliente: `UltimatePvpLive.tsx` (beat, situação, 3 opções com odds contra cada escolha do rival, contagem do prazo, "o rival já decidiu", resultado do último beat, placar, W.O.); poll 1,5s com backoff até 12s; reconexão = `matchStart` idempotente + `matchState`. Squad marcado `live: true`; só quando os DOIS snapshots têm a marca a partida vai para o servidor (cliente antigo segue no replay local + report pareado). Fim: `finishServerPvp` registra o espelho local 1× (ledger `rtm-ult-pvp-rec`) e abre o modal, sem `reportResult`.

## Pendências reais (Fase 2)
- Não testado com dois aparelhos nem contra o Neon real (só lógica com store em memória e FakeDb). O SQL de `sqlMatchStore`/`sqlRankedSettler` não tem teste com banco.
- Fechamento pelo servidor ainda não faz o que o report fazia além de MMR e prêmio: rivalidade (`rtm_rivalries`), contagem da sala de evento (`rtm_event_entries`), meta comunitária (`bumpCommunityContrib`) e aviso de ultrapassagem. Partidas de evento jogadas no servidor não contam no evento até isso migrar.
- MMR de conta com linha de temporada antiga não é aplicado no servidor (o reset lazy com arquivo é do `me` do ranking); fica log `[ult-match] temporada antiga`.
- A abordagem pré-jogo (`approach`) e as traits não entram no duelo do servidor (só OVR + química).
- Sala mista (um cliente novo e um antigo) segue no fluxo antigo inteiro; o servidor só resolve quando os dois são novos.
- Sem limpeza de linhas antigas de `ult_match`.
- `noteMatchStart` do PvP no servidor é marcado no fim da partida (não no início).

## Features do CS Manager — feito (27/10/2026, branch `feat/ultimate-csm-features`)
Origem: `docs/csmanager/specs-portaveis.md` (seções 1, 2, 3 e 8).
- **Drop de escolha [CSM-1]**: engine puro `src/engine/ultimate/drops.ts` (estoque 1/20 min, máx. 3, excedente perdido; 3 opções por seed; pity Ouro+ a cada 15 drops sem Ouro; vencimento entrega a opção de MENOR valor). Servidor `server/ultimate-drops.ts`: linha por conta `rtm_ult_drops` (CAS por versão, DDL idempotente), seed sorteada e gravada no servidor, janela de 30 min, carta entregue por `applyUltTransaction` com op_id `drop:<dropId>` (o mesmo para escolha e liquidação automática). Ações `dropStatus`/`dropOpen`/`dropPick` em `api/ultimate-economy.ts` (carteira congelada bloqueia abrir/escolher). Calibração em `docs/ultimate-online/drops-calibracao.md`. UI: `UltimateDropPanel` no hub (contador, 3 cartas, regra do vencimento e qual carta seria entregue); a carta entra no save com o uuid do servidor (`serverCardGrant`, sem espelho).
- **Versões de evento [CSM-2]**: `src/engine/ultimate/eventVersions.ts`. O fim de semana [URG-2] declara 5 jogadores Ouro Raro/Elite (seed da semana) com +3 OVR/atributos e rótulo do evento; raridade nova `evento` (special). Durante o evento, a versão substitui a base no pool de packs (`openingPool`, cliente e servidor) e do drop, na MESMA vaga de raridade (`poolRarity`): as odds dos packs não mudam. Chave `<playerId>:evento@<eventId>`; o `CardIndex` deriva a carta da chave + base do jogador, então ela resolve depois do evento (squad, quick-sell, import). Engine do pack v3 (`ult-pack-v3-evento`) grava `eventId` no meta do ledger.
- **História da carta [CSM-3]**: no fechamento ranqueado (`settleIfNeeded`), o servidor grava por cópia (`rtm_ult_card_stats`, DDL idempotente) jogos, vitórias, derrotas, rounds e clutches (beat `clutch` jogado/vencido) das 5 cartas autoritativas de cada lado (`cardIds` do squad montado no servidor; coluna nova `ult_match.card_ids`). Marca por partida (`rtm_ult_card_stats_applied`) no mesmo statement: não soma 2×; só cópias ainda possuídas. Kills e MVP NÃO foram criados: o duelo por beats não os produz. Ação `cardStats` e bloco "história da carta" na coleção (botão "história", modal).
- **Mutação autoritativa [CSM-4]**: `server/origin.ts` checa Origin em toda mutação de `api/ultimate-economy.ts` e no POST de `api/lobby.ts` (oficial + www, VERCEL_URL/BRANCH_URL, APP_ORIGINS, mesma origem do Host, localhost fora de produção; sem Origin passa, salvo `ORIGIN_REQUIRE=1`; `Sec-Fetch-Site: cross-site` recusa). Idempotência: hash do pedido em `meta.reqHash` (tx do cliente e packOpen); replay com outro payload = 409 `op_conflict`; coluna `credits_after` no ledger e `recorded.creditsAfter` no replay da tx.

## Pendências reais (CS Manager)
- Nada disso rodou contra o Neon real nem num navegador: SQL de `sqlDropStore`, o upsert de `recordCardStats` e `credits_after` só têm teste com fakes.
- Estoque/pity/prazo do drop fora da telemetria; sem limpeza de `rtm_ult_card_stats_applied`.
- História da carta só conta ranqueada fechada pelo servidor (amistoso e IA não entram).
- Versões de evento: só o evento automático de fim de semana declara versões; item de live-ops manual ainda não tem campo `versions` (`applyEventVersions` aceita qualquer `EventVersionDecl`). A carta `evento` usa o visual de special do componente de carta (não tocado; tema próprio fica com quem cuida da arte).
- Origin: domínio de front fora do oficial/deploy/mesma origem precisa entrar em `APP_ORIGINS`.
