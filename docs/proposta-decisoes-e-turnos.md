# Proposta: decisões do jogador + Modo Major online por turnos

> Só proposta. Sem código de jogo, preço, env ou banco. Base: master `47ecd1f` (27/10/2026).

## 0. Como o resultado é decidido hoje (medido)

- Swiss/Major (`swiss.ts`): `autoVeto` + `simulateSeries` de ponta a ponta. **O jogador não decide nada** na partida; só a força do elenco + veto da IA + sorte.
- Round (`match.ts`/`match2`): `pA = sigmoid(diff / ROUND_DIV)` + ajustes (economia, momentum, timeout, stance, call, leitura de site, tática).
- Ultimate online (`ultimate/matchSession.ts`, `/api/lobby`): já roda round a round (`createMapSim.step()`), sync por polling com ETag (2–60 s).

Medição (motor v2 padrão; espelho = mesmo elenco dos 2 lados, só a decisão muda; 4.000 mapas Bo1, erro ±0,8 pp; tática 3.000 mapas):

| O que muda | Vitória de mapa do lado A |
|---|---|
| Nada (controle) | 50,6% |
| 1 timeout no round 8 | 51,0% (+0,4) |
| Stance agressiva o mapa todo | 51,6% (+1,0) |
| Force sempre que estaria em eco | 51,3% (+0,7) |
| Save quando < $3.000 | 52,2% (+1,6) |
| Call "rush" todo round | 53,7% (+3,1) |
| Stack de site aleatório no CT | 55,3% (+4,7) |
| Tática treinada (familiaridade 90 vs 10) | 62,6% (+12) |
| Papéis embaralhados (erro) | 33,7% (−17) |
| Veto: jogar o melhor mapa vs o pior (times parecidos) | 70,0% vs 34,7% (35 pp) |

Força do elenco (top 80, strength 93,1→72,9; times diferentes, veto da IA, 6.000 séries):

| Diferença de strength | Favorito vence Bo1 | Bo3 |
|---|---|---|
| 0–2 | 52,6% | 55,6% |
| 2–5 | 61,0% | 65,2% |
| 5–10 | 71,2% | 82,7% |
| 10+ | 87,6% | 96,4% |

**Leitura:** decisões *dentro do round* (timeout, stance, eco, call) valem 0,5–3 pp cada, e algumas ganham sem pensar ("rush sempre" +3, stack aleatório +5 = bug de design: não exigem leitura do rival). O que já pesa é **veto** e **tática/papéis**, mas no Major ninguém mexe neles. Hoje, entre favorito claro e azarão (gap 5–10), o elenco decide ~80% e as decisões ~0%.

## 1. Decisões que passam a mudar o resultado

Meta (**aprovada pelo Matheus em 27/10**): **entre times parecidos (gap ≤ 5), decisões boas vs ruins = 65–70% de vitória no Bo3; entre gap 10+, o azarão bem jogado chega a 25–30% no Bo3 (hoje 3,6%)**. Elenco continua mandando (≈60% do resultado), decisões ≈30%, sorte ≈10–15%.

| Decisão | Quando | Peso alvo (espelho, mapa) | Regra anti-sorte |
|---|---|---|---|
| Veto de mapa (ban/pick) | antes da série | até ±15 pp por mapa | já existe; abrir pro jogador com o histórico do rival visível |
| Lado inicial | quem não escolheu o mapa | ±2–3 pp | depende do mapa (CT-sided/T-sided) |
| Tática por bloco de 3 rounds (setup CT / execução T) | início de cada turno (~7×/mapa) | ±6–8 pp | pedra-papel-tesoura com *counter*: só vale se ler o rival; o histórico do half anterior é revelado |
| Economia (full / force / save) | rounds de decisão econômica (pós-pistol, ~5/mapa) | ±2–3 pp no mapa | sem estratégia dominante: "force sempre" e "save sempre" devem dar ≤ +0,5 pp |
| Timeout | 2 por mapa | +3–4 pp no round seguinte (hoje +0,4 no mapa) | só reseta momentum do rival; não ganha sozinho |
| Troca de papel / sub | entre mapas | ±3–5 pp | erro de papel continua punido (hoje −17) |

Como medir (CI): `scripts/measure-decisoes.mts` (novo, fase 1) roda espelho com 3 bots — **aleatório**, **dominante fixo** (rush/force/stack sempre) e **leitor** (escolhe o counter do half anterior). Critérios: leitor − aleatório ≥ +15 pp/mapa; dominante fixo − aleatório ≤ +1 pp; e a tabela de força acima não pode mudar mais que ±2 pp quando os dois lados jogam igual (neutralidade).

## 2. Modo Major online por turnos (2 jogadores)

Decisão do Matheus (27/10): turno curto, a cada poucos rounds. **Proposta: turno = bloco de 3 rounds.**

Por que 3:
- 12 rounds por half = 4 turnos exatos; a OT do CS2 já é MR3, então 1 bloco de OT = 1 turno. Nenhum turno atravessa troca de lado ou reset de dinheiro.
- 3 rounds = um ciclo econômico (compra → resultado → force/save). A decisão de eco tem efeito visível no próprio turno.
- 1 round por turno dá 21–24 cliques por mapa (Bo3 > 30 min); 6 rounds volta a ser "meio half". Com 3: ~7–8 turnos por mapa, ~20 por Bo3.

Fluxo:
1. **Veto** no formato Valve (Bo1/Bo3/Bo5). 25 s por ação.
2. **Lado:** quem não pickou escolhe. 15 s.
3. **Turno (3 rounds, simultâneo e às cegas):** cada um envia `{tática do bloco (setup CT ou execução T), economia (full/force/save), timeout neste bloco? (2/mapa)}`. **20 s.** Commit-reveal: o servidor guarda até os dois enviarem (ou acabar o tempo), revela, roda os 3 rounds com seed fixa e mostra o replay curto (~10–15 s, pulável).
4. Entre mapas: troca de papel/sub. 30 s.

Duração estimada do Bo3: ~20 turnos × (20 s + ~12 s de replay) + veto/intervalos ≈ **13–15 min**.

Ausência:
- Tempo do turno esgotado ⇒ a IA (`aiTactics`) decide aquele turno.
- **3 turnos seguidos** sem enviar ⇒ W.O. do mapa.
- **3 min** sem heartbeat ⇒ W.O. da série.
- Volta antes disso ⇒ retoma no próximo turno, sem penalidade.

Anti-trapaça: as escolhas e a seed ficam no servidor, que recalcula o resultado (o motor é determinístico, como no Ultimate). O cliente não declara o vencedor.

**Sincronização (opção barata): polling com ETag/304 na `/api/lobby` que já existe.** Poll de 2 s só enquanto se espera o rival no turno; parado durante o replay; 15–60 s fora de partida. Realtime (Pusher/Ably) só se o volume pedir.

Gravações e custo no Neon, por Bo3:

| Item | Writes |
|---|---|
| Veto + lado (~9 ações) | ~9 |
| ~20 turnos × (2 envios + 1 resolução) | ~60 |
| Heartbeat (só a cada 30 s, junto do poll) | ~0 extra (vai no mesmo request) |
| **Total** | **~70 writes** |

- Reads: ~10 polls por turno por jogador × 20 turnos × 2 ≈ 400 requests; com ETag e cache por versão (`updated_at`) antes do banco, a maioria nem chega no Neon.
- Ordem de grandeza: 1.000 Bo3/dia ≈ 70 mil writes pequenos + algumas centenas de milhares de requests HTTP (Vercel). O compute do Neon fica acordado nas horas com partida; o risco é o mesmo do `game_start` se o poll tocar o banco toda vez. Por isso o cache antes do banco é obrigatório já no MVP.
- **Sem migration:** o estado do turno vai em `lobbies.state` (JSONB), que já existe.

## 3. Cronograma até 23/11 (solo e online, os dois antes de 24/11)

Decisão do Matheus (27/10): os dois saem antes de 24/11.

Plano de PRs (todos draft; merge só com o ok do Matheus):

| PR | Escopo | Depende de | Pronto pra revisão |
|---|---|---|---|
| A — chave por modo + medidor | `decisoes` por modo (todas desligadas) no motor; `scripts/measure-decisoes.mts` (bot aleatório / repetidor / leitor) com números antes e depois | — | 31/10 |
| B — rebalanceamento | Tira as escolhas dominantes (rush/stack sempre), timeout +3–4 pp, eco sem escolha dominante, tática por bloco de 3 com counter. Só com a chave ligada; neutralidade ±2 pp com ela desligada | A | 05/11 |
| C — motor por turnos | `playTurn(estado, escolhasA, escolhasB)` determinístico e serializável (3 rounds por chamada), usado pelo solo e pelo online | B | 08/11 |
| D — **solo** no Modo Major | UI de veto, lado e turno (tática/eco/timeout) contra a IA na Singapore; liga a chave só no Major | C | 13/11 |
| E — online: servidor | Ações novas na `/api/lobby` (veto, envio do turno com commit-reveal, resolução no servidor, ausência/W.O.), ETag + cache antes do Neon, sem migration | C | 16/11 |
| F — online: cliente | Sala 1v1 por código, timers, replay curto, reconexão, poll adaptativo | E, D | 20/11 |
| G — QA e carga | Teste com 2 contas, medição de writes/requests por Bo3, ajustes | F | 22/11 |
| — | Merge final (com ok) | G | 23/11 |

Não cabe até 23/11 (vai pra depois do Major): ranqueado/MMR, histórico de partidas (precisa de migration), realtime, espectador, Bo5 online, troca de papel no meio do mapa.

Corte se atrasar (nesta ordem):
1. Online só Bo1 (Bo3 fica pro solo).
2. Sem replay animado: placar dos 3 rounds + resumo em texto.
3. Sem troca de papel/sub entre mapas.
4. Último recurso: o online fica atrás de flag pra beta fechado e o solo sai pra todos.

Riscos:
- **Rebalancear o motor muda todos os modos** (Carreira, Ultimate, Swiss). Mitigação: chave por modo desligada por padrão; neutralidade ±2 pp medida no CI.
- **Virar sorte:** se as táticas forem pedra-papel-tesoura puro, quem lê o rival não ganha mais. Mitigação: revelar o bloco anterior e o histórico do rival; meta do bot leitor ≥ +15 pp.
- **Duração e abandono no online:** 20 decisões por Bo3. Mitigação: 20 s por turno, IA no lugar de quem some, W.O. após 3 turnos.
- **Custo no Neon:** se o poll tocar o banco toda vez, o problema do `game_start` volta. Mitigação: ETag + cache antes do banco, poll adaptativo, nenhuma gravação no poll, medição no PR G.
- **Prazo apertado** (4 semanas, com o Major no meio): os cortes acima estão definidos com antecedência; o PR C é o caminho crítico.
