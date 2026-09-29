# Realismo FM — Fase 1: fundação

Objetivo: o Road to Major simular CS com o realismo do Football Manager. Brainstorm completo:
`~/orca/workspaces/major-cs/super-atualizacao-docs/BRAINSTORM-REALISMO-FM.md`.

Decisões do Matheus (29/09/2026):
1. UM motor de partida para todos os modos (Carreira, Road to Pro, Ultimate, Draft, Online, Diário quando simula), só adaptado por modo.
2. Migração de saves aceita, mesmo mudando levemente o desempenho.
3. Base da cena atual expandida com atributos calibrados a partir de estatísticas públicas.
4. Tudo visível como no FM (exceto os atributos ocultos, que no FM também só aparecem por relatório).

Princípio: **a simulação decide, a interface mostra.** Todo número exibido pesa na simulação.

## Contrato (já no branch base `motor/base`)

`src/engine/attrs/model.ts`:
- `PlayerAttrs { v: 1; a: Record<AttrKey,1..20>; h: Record<HiddenKey,1..20>; ca: 1..200; pa: ca..200 }`
- `attrsOf(p)` — ÚNICA porta de leitura. `p.attrs` vence; sem ele, deriva dos 5 legados.
- `deriveAttrs(p)`, `caFromAttrs(a, role)`, `legacyFromAttrs(x)` (ponte para código que lê aim/awp/igl/clutch/consistency).
- `Player.attrs?` e `TPlayer.attrs?` em `src/types.ts`.
- Teste do contrato: `scripts/test-attrs-contract.mts`.

Assinaturas são contrato. Precisou mudar? Registre em "Mudanças de contrato" no fim deste arquivo e avise no relatório.

## Três frentes em paralelo

### A. Dados (`motor/dados`)
- Pipeline reprodutível que busca estatísticas públicas da cena atual no bo3.gg (`https://api.bo3.gg/api/v1/players/<slug>` e `/general_stats`, e os endpoints de estatística avançada que existirem: opening kills/deaths, clutches, KAST, headshot %, AWP kills, multi-kills, por lado/mapa) com cache em disco, throttle educado e `User-Agent` identificado. Nada de scraping da HLTV.
- Todos os jogadores de `src/data/bo3-2026.json` + expansão para a cena atual (tier 1–3, meta: 1.000+ jogadores ativos, com time, função, país e idade), PRESERVANDO os ids existentes (saves guardam ids; ver regras em `scripts/import-rosters-xlsx.py`).
- Mapeamento determinístico e auditável estatística → 28 atributos + ocultos + CA/PA (idade influi no PA). Documente a fórmula de cada atributo e a fonte.
- Saídas: `src/data/player-stats-2026.json` (estatística bruta resumida), `src/data/player-attrs-2026.json` (`{ [playerId]: PlayerAttrs & { src } }`), `scripts/fetch-bo3-stats.mts`, `scripts/stats-to-attrs.mts`.
- **Alvos de calibração** para o motor: `docs/calibration-targets.json` com distribuições reais de CS2 recente e a fonte de cada número (CT/T por mapa, conversão do pistol, vitória em eco/force, conversão 5v4 e 4v5, clutch 1v1/1v2/1v3, distribuição do rating 2.x por função, ADR e KAST por função, % de opening kills do entry, % de kills do AWP). Onde não houver dado público confiável, marque como estimativa e explique.

### B. Atributos e progressão (`motor/atributos`)
- Atributos viram fonte da verdade: `deriveAttrs` calibrado (usa idade para PA; atributos ocultos plausíveis), carregamento da base de `player-attrs-2026.json` quando existir (a frente A entrega; até lá, derive).
- Migração de TODOS os saves (Carreira, Road to Pro, Ultimate/coleção, Draft em andamento) para gravar `attrs` estáveis; versão de save sobe e `test-save-migration` cobre. Idempotente.
- OVR e os 5 números legados passam a SAIR dos atributos (`legacyFromAttrs`) em todo lugar que hoje os lê — sem quebrar telas, share cards e economia do Ultimate (preço de carta, OVR da carta).
- Evolução por atributo: envelhecimento por classe de atributo (reflexos/reação caem cedo; game sense/liderança crescem até ~30), treino e partidas jogadas movem atributos específicos, teto no PA, profissionalismo acelera. Substitui o `aging.ts` atual sem perder as regras de aposentadoria.
- Telas: tudo que mostra atributo lê `attrsOf`. Perfil do jogador ganha CA/PA em estrelas (PA como faixa, como relatório de olheiro).

### C. Motor de partida por duelos (`motor/partida`)
- Novo motor em `src/engine/match2/` com a MESMA API pública de `createMapSim`/`simulateMap`/`simulateSeries` (e dos steps/eventos que a UI consome), para os modos só trocarem a implementação. Flag `MATCH_ENGINE` (v1/v2) para comparar e reverter.
- Round como cadeia de eventos, lendo só `attrsOf`: compra/utilitária → duelo de abertura (entry × quem segura o ângulo; AWP) → trades (teamwork/communication) → execução/retake (game sense, decisions, positioning; plano tático e calls atuais continuam valendo) → pós-plant e clutch (composure, clutch, concentration) → economia. Ocultos: bigMatch em partida grande, temperament em sequência ruim, consistencyHidden na variância. Fadiga em série longa (stamina).
- Estatísticas por jogador EMERGEM dos duelos (kills, mortes, ADR, KAST, opening, clutches, multi-kills) — nada de distribuir kills depois do resultado.
- Adaptação por modo: Carreira/Draft/Online (time contra time), Road to Pro (a decisão do jogador na Sala entra como modificador do duelo dele; "% mostrado = % rolado" continua verdade), Ultimate (cartas carregam `attrs`).
- **Harness de calibração**: `scripts/calibrate-engine.mts` simula milhares de mapas e compara com `docs/calibration-targets.json`; vira teste (`test-engine-calibration.mts`) com tolerâncias. Enquanto a frente A não entregar os alvos, use valores públicos amplamente conhecidos marcados como provisórios.
- Desempenho: medir ms por mapa simulado no Node; meta ≤ 5 ms (celular simula séries inteiras).

## Regras comuns
- Cada frente trabalha só na sua worktree/branch, a partir de `motor/base`. Commit por marco; sem push/PR/merge (o integrador junta).
- Não edite arquivos que são da outra frente sem necessidade; se precisar, descreva no relatório.
- Portões no fim: `npm run lint` (0), `npx tsc -b`, `npm test`, `npm run test:sim`, `npm run build`. Um comando pesado por vez (máquina compartilhada).
- Marca "Road to Major". Tokens de design: `src/styles/tokens.css` é a única fonte de cor.
- Ordem de integração prevista: A (dados) → B (atributos) → C (motor).

## Mudanças de contrato
`src/engine/attrs/model.ts` não mudou. A frente C (motor) só ACRESCENTOU campos opcionais à API de partida (nada que existia mudou de forma):
- `MapSimOpts` (engine/match.ts): `engine?: 'v1' | 'v2'`, `mapIndex?`, `bigMatch?`, `duelMods?: Record<playerId, pontos de atributo>`. O v1 ignora todos.
- `simulateMap(..., opts?)` e `simulateSeries(..., bestOf, opts?: SeriesOpts)`: 6º parâmetro opcional; a série numera `mapIndex` e marca `bigMatch` na MD5.
- `getMatchEngine()`/`setMatchEngine()` e `createMapSimV1` exportados de engine/match.ts; a flag lê `MATCH_ENGINE` (Node) e `VITE_MATCH_ENGINE` (build), padrão v2.
- `MatchSession.engine?` (Ultimate): a sessão casual replaya no motor em que nasceu; sem o campo = v1.
- `simulateSeriesForPlay(..., target, opts?)` e `heroSeriesOpts/heroDuelMod` (RtP).
- Economia, playbook, postura, IGL e elenco 5v5 saíram de match.ts para `src/engine/matchShared.ts` (re-exportados; v1 bit a bit igual).
- Formato de `docs/calibration-targets.json` definido pela frente C (valores provisórios); a frente A troca os números mantendo o formato: `targets.<chave> = { value, tol, unit, def, source, provisional, estimate?, by? }`.
