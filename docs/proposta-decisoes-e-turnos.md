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

Meta: **entre times parecidos (gap ≤ 5), decisões boas vs ruins = 65–70% de vitória no Bo3; entre gap 10+, o azarão bem jogado chega a 25–30% no Bo3 (hoje 3,6%)**. Elenco continua mandando (≈60% do resultado), decisões ≈30%, sorte ≈10–15%.

| Decisão | Quando | Peso alvo (espelho, mapa) | Regra anti-sorte |
|---|---|---|---|
| Veto de mapa (ban/pick) | antes da série | até ±15 pp por mapa | já existe; abrir pro jogador com o histórico do rival visível |
| Lado inicial | quem não escolheu o mapa | ±2–3 pp | depende do mapa (CT-sided/T-sided) |
| Tática por meio (setup CT / execução T) | início de cada half (4×/mapa com OT) | ±6–8 pp | pedra-papel-tesoura com *counter*: só vale se ler o rival; o histórico do half anterior é revelado |
| Economia (full / force / save) | rounds de decisão econômica (pós-pistol, ~5/mapa) | ±2–3 pp no mapa | sem estratégia dominante: "force sempre" e "save sempre" devem dar ≤ +0,5 pp |
| Timeout | 2 por mapa | +3–4 pp no round seguinte (hoje +0,4 no mapa) | só reseta momentum do rival; não ganha sozinho |
| Troca de papel / sub | entre mapas | ±3–5 pp | erro de papel continua punido (hoje −17) |

Como medir (CI): `scripts/measure-decisoes.mts` (novo, fase 1) roda espelho com 3 bots — **aleatório**, **dominante fixo** (rush/force/stack sempre) e **leitor** (escolhe o counter do half anterior). Critérios: leitor − aleatório ≥ +15 pp/mapa; dominante fixo − aleatório ≤ +1 pp; e a tabela de força acima não pode mudar mais que ±2 pp quando os dois lados jogam igual (neutralidade).

## 2. Modo Major online por turnos (2 jogadores)

**Unidade de turno = meio do mapa (half), não round.** 24 rounds por clique é chato e caro; 4–6 turnos por mapa cabem em 10–15 min por Bo3.

Fluxo de uma série:
1. **Veto** alternado (Bo1: A ban, B ban, …; Bo3/Bo5 no formato Valve). 30 s por ação.
2. **Lado:** quem não pickou escolhe. 20 s.
3. **Turno de half (simultâneo, às cegas):** cada um envia `{setupCT|execT, postura eco (full/force/save padrão), timeouts reservados (rounds)}`. 45 s. Quando os dois enviaram (ou acabou o tempo), revela e o motor roda os 12 rounds com seed fixa → os dois veem o replay do half (resumo rápido, pulável).
4. Intervalo do mapa: troca de papel/sub. 30 s. Repete 3 no 2º half e no OT (turno de OT = 1 bloco MR3).

Se um sumir: tempo esgotado ⇒ **plano padrão da IA** (aiTactics) naquele turno; 2 turnos seguidos ausente ⇒ W.O. do mapa; 5 min sem heartbeat ⇒ W.O. da série. Desempate de quem envia primeiro não existe (escolhas simultâneas, commit-reveal: guarda hash até os dois enviarem).

Anti-trapaça: servidor guarda as escolhas e a seed; resultado é recalculado no servidor (motor determinístico, já é assim no Ultimate) — cliente não declara vencedor.

**Sincronização — opção barata (recomendada): polling com ETag/304 na mesma `/api/lobby`** (já existe). Poll 3 s só enquanto o rival ainda não enviou; parado durante o replay; 15–60 s fora de turno. Realtime (Pusher/Ably/WebSocket) só se o MVP pegar; Neon não tem push.

Custo Neon (estimativa): por série Bo3 ≈ 3 mapas × ~6 turnos + veto ≈ 25 turnos; ~20 polls/turno/jogador com 304 → ~1.000 requests, mas **só ~60 writes** e reads curtos. Para tirar o Neon do caminho do poll: o `GET` compara a versão do lobby num cache (Vercel Runtime Cache / ETag por `updated_at`) e só toca o banco quando mudou. Ordem de grandeza: 1.000 séries/dia ≈ 60 mil writes + poucas leituras reais ⇒ cabe com folga no compute pausável (autosuspend), bem abaixo do que o `game_start` gerava (1 insert por partida de cada usuário, todos os modos). Sem tabela nova no MVP: estado do turno em `lobbies.state` (JSONB) que já existe — **migration só se a gente quiser histórico (fase 3, precisa do ok)**.

## 3. Fases e riscos

| Fase | Entrega | Prazo |
|---|---|---|
| 0 | Esta proposta + ok do Matheus nos pesos | 28/10 |
| 1 — balanceamento (offline) | Corrigir dominantes (rush/stack), tática por half com counter, timeout +3 pp; `measure-decisoes.mts` no CI | até 07/11 |
| 2 — **MVP solo** | Modo Major (Singapore) com veto + tática por half + eco + timeout contra a IA; resultado ainda determinístico | até 16/11 |
| 3 — **MVP online** | Duelo 1v1 por turnos de half via `/api/lobby` (polling+ETag, IA no lugar de quem some), só amistoso por código | até 23/11 (antes de 24/11) |
| 4 | Ranqueado, histórico (migration Neon, com ok), realtime se o volume pedir | depois do Major |

Riscos:
- **Rebalancear o motor muda todos os modos** (Carreira, Ultimate, Swiss). Mitigação: pesos novos só com flag por modo; neutralidade ±2 pp medida no CI.
- **Virar sorte:** se as táticas forem pedra-papel-tesoura puro, o leitor não ganha. Mitigação: revelar o half anterior + histórico do rival; meta leitor ≥ +15 pp.
- **Duração/abandono online:** Bo3 por turnos ≈ 15 min. Mitigação: turno = half, timers curtos, IA substitui.
- **Custo Neon:** polling mal feito volta o problema do `game_start`. Mitigação: ETag + cache antes do banco, poll adaptativo, sem write em poll.
- **Prazo:** 4 semanas pra 3 fases com o Major rodando. Se apertar, o online (fase 3) vira pós-Major e sai só o solo.

Decisões pro Matheus: (a) meta 60/30/10 elenco/decisões/sorte; (b) turno = half; (c) polling barato no MVP; (d) online antes de 24/11 ou só o solo.
