# Ultimate — registro de continuidade

Última atualização: 12/09/2026 (U00–U07 concluídos; U06 PvP pendente).
Plano: `docs/ultimate-development-plan.md`.
Base da inspeção: `74de16f` (`master`).

## Estado real

U00 (baseline e contratos) concluído em 11/09/2026 — ver seção abaixo. Nenhuma mudança de gameplay, economia, UI ou pagamento foi implementada por este lote. Não houve deploy, migração, compra de teste nem leitura de métricas de produção.

**Atenção — trabalho de outro agente em curso neste checkout (não commitado, preservado):** `api/ultimate-economy.ts`, `server/ultimate-pack.ts` (+ `server/ultimate-pack.test.ts`), `src/components/ultimate/UltimateSquadScreen.tsx`, `src/engine/ultimate/totw.ts`, `src/state/ultimate.ts`, `src/state/ultimateShadow.ts` e o novo `src/engine/ultimate/packPool.ts` (`weeklyPackPool`: pool elegível do TOTW ≠ catálogo de propriedade; pool vazio → `null`). Parece o início de U01. Havia um `vite --host 127.0.0.1` (porta 5173) rodando nesta pasta durante o U00. Quem retomar U01 deve partir desse diff, não reescrevê-lo.

## Backlog

| Lote | Estado | Dependência/nota |
|---|---|---|
| U00 Baseline e contratos | Concluído (11/09) | Baseline verde; contratos e riscos documentados abaixo |
| U01 Loja/pools | Implementado e verificado (11/09) | Branch `ult/u01-loja-pools`; ver seção U01 |
| U02 Funil | Implementado e verificado (11/09) | Branch `ult/u02-funil`; baseline começa a contar após o deploy |
| U03 Elenco/táticas | Implementado e verificado (11/09) | Branch `ult/u03-elenco-taticas`; evolução em PvP e dupla contagem ficam documentadas, não alteradas |
| U04 Pós-jogo | Implementado e verificado (11/09) | Branch `ult/u04-pos-jogo`; comparação do reforço fica para U07 |
| U05 Primeira sessão | Implementado e verificado (11/09) | Branch `ult/u05-primeira-sessao`; mobile pendente |
| U06 Timeout real | **Casual implementado e verificado (11/09)**; PvP pendente | Branch `ult/u06-timeout-casual`; Rivals/Gauntlet/Draft seguem pré-calculados |
| U07 Alvo e estreia | Implementado e verificado (12/09) | Branch `ult/u07-alvo-estreia` |
| U08 Compra/oferta inicial | Pendente — **próximo** | U01/U02/U07 feitos; levantamento em andamento |
| U09 Passe | Pendente | U02/U08; U10 para cosméticos novos |
| U10 Identidade/coleções | Pendente | U07/U08 para produtos pagos |
| U11 Rivalidades | Pendente | Contrato de partidas estabilizado |
| U12 Eventos | Pendente | U03/U11 e economia validada |

## Próxima ação exata

Executar U08 (compra contextual e oferta inicial com escolha): (1) intenção de compra persistida (produto + aba + origem) para retomar após login/cadastro e voltar ao contexto no cancelamento — sem cobrar antes da confirmação; (2) saldo insuficiente na Loja com "quanto falta" e opções ganhar/comprar (já existe `missingCredits` do U07); (3) especificar a oferta inicial (conteúdo conhecido, escolha entre reforços equilibrados e cosmético, preço CONFIGURÁVEL ainda a definir — não ativar venda sem decisão do proprietário); (4) elegibilidade única por conta no servidor (reusar dup-check por `tier`/`correlation_id` de `rtm_coin_orders`), versão/conteúdo/preço registrados no pedido; (5) matriz de falhas (webhook repetido, atraso, sessão expirada, duas abas, estorno) definida antes de ativar. Sandbox apenas; nenhum pagamento real.

**PvP do U06 fica registrado como PENDENTE** (não concluído): exige checkpoint autoritativo no servidor, decisões ordenadas com prazo comum e escolha padrão neutra por ausência, tratamento de desconexão/abandono/expiração da sala e protocolo habilitado só para pares compatíveis. Hoje o PvP é reexecução idêntica com seed canônico e sem estado de partida no servidor (`lobbies`/`lobby_players` não têm round/placar).

## Descoberta que não pode ser esquecida

O Ultimate pré-calcula a partida e registra resultado antes do replay. Timeout clicável durante replay não altera resultado. Implementação interativa precisa de checkpoints, persistência e, no PvP, sincronização autoritativa. Táticas pré-jogo podem ser entregues antes dessa migração.

## Decisões ainda abertas

- Preço/conteúdo da oferta inicial e compensação/eligibilidade de veteranos.
- Tema, benefício imediato e eventual preço novo do passe.
- Fórmulas/tetos de tática após baseline; sem percentuais já aprovados.
- Custo e contrato de sessão incremental PvP; comportamento de ausência/abandono.
- Fonte autoritativa atual de saldo/inventário e migrações necessárias.
- Baseline comercial, tamanho da população e métricas disponíveis.

## U00 — baseline e contratos atuais — 11/09/2026

- Estado: **concluído** (documentação e verificação; sem código).
- Branch/commit: `master` @ `74de16f`, checkout `~/Documents/claude projects/major-cs` (sujo, ver "Estado real"). Baseline executado numa worktree limpa em `74de16f` para separar falhas antigas do trabalho em curso.
- Mudanças e arquivos: só este registro.
- Comandos/testes e resultados reais (worktree limpa, node 26, `node_modules` deste checkout):
  - `npm run build` → **verde** (tsc -b + vite; aviso de chunk >500KB pré-existente).
  - `npm run lint` → **vermelho pré-existente**: 189 problemas (179 erros, 10 avisos). 138 são `react-hooks/set-state-in-effect`, 59 `react-refresh/only-export-components`, 6 `no-useless-assignment`. Regra para os lotes: comparar contra esta baseline, não exigir zero.
  - `npm test` → **128/128 verdes**.
  - `npm run test:sim` → **320/320 verdes**.
- Verificação visual (desktop 1456px, vite próprio na worktree limpa, sem backend `/api`; **mobile não verificado** — o resize da janela não se aplicou no ambiente de automação, fica para o próximo lote):
  - Entrada: `/ultimate` direto redireciona para a landing com o modal "Novidades"; convidado precisa criar Manager (`/criar-manager`) antes do hub (`/jogar`); no hub, o card Ultimate abre o `UltimateGate` (R$20 vs "Jogar como convidado").
  - Onboarding: formação → "Get my starter team" → reveal carta a carta → modal "5 cards · best 79 OVR" com **Close / View collection**. Não há CTA para jogar, escalar ou ajustar. Hub após o starter: 6.000 coins, 5 cartas, Bronze III 1000 RP.
  - Loja (reproduzido): nota fixa **"30,000 opens one TOTS pack or 2 Gold Packs; 120,000 gets you 3 Premium or 4 TOTS"** enquanto TOTS custa **38.000** e Premium **40.000**. Packs sem saldo aparecem com cadeado e sem caminho para obter saldo. Clique em "R$ 10" como convidado mostra o toast **"Log into your account (home screen) to buy coins."** e não preserva a intenção.
  - Aba Ranked: **texto "500 win / 150 loss" no Friendly**, enquanto `recordMatch` paga 90/25 (`src/state/ultimate.ts:543`); Gauntlet anuncia "800 → 6.000" contra a tabela `GAUNTLET_WIN_CREDITS`.
  - Partida Friendly vs IA: tela de pré-jogo com caster e "0.98× strength"; durante o replay já existe o botão **"See result"** (resultado pré-calculado) e o botão ⚡ na barra de velocidade não altera a partida. **"Skip" fechou o replay e voltou para a aba Ranked sem exibir o modal de resultado** (confirmar se é comportamento esperado ou bug).
- Contratos documentados (auditoria de código em `74de16f`, referências arquivo:linha):
  - **Carteira local**: `UltimateState` em `src/engine/ultimate/state.ts:99-104`; `profile.credits` e `inventory[]`; chave `rtm-ultimate-v1` (`src/state/ultimate.ts:86`), backup `.bak`, `ULTIMATE_VERSION = 1` nunca incrementada — `migrateUltimate` (`state.ts:438-551`) é só coerção com defaults; não há registry de migrações do Ultimate (`saveMigrations.ts` é da Carreira).
  - **Espelhamento** (`src/state/ultimateShadow.ts`): `mirrorUltimateChange` (`:244-271`) envia o **delta** de credits e de cartas por `opId` gerado no enqueue; fila persistida, cap 500. Só com `cloudEnabled()` (= conta paga). `reconcileFlip` (`:485-547`) é **"LOCAL VENCE"**: enfileira tx `admin` levando o servidor até o local; único freio é o guard anti-wipe (≥10 remoções ou ≤ −20k coins). Ganhos não têm limiar.
  - **Servidor valida**: abertura de pack server-side (`server/ultimate-pack.ts:104-157`, roll + débito em statement único com `UNIQUE(email, op_id)`, replay devolve as mesmas cartas) — mas o cliente debita o **custo**, não o saldo devolvido, e em timeout/5xx cai no roll local (`ultimateShadow.ts:454-462`); mercado P2P totalmente autoritativo (`server/ultimate-market.ts:160-338`, escrow, locks, `mkt-buy:<id>`); pagamentos: só webhook assinado marca `paid` (`api/stripe-webhook.ts:32`, `api/woovi-webhook.ts:57`), `coinsClaim` (`api/account.ts:568-574`) marca `claimed` e **o cliente credita** (`addCredits`), com `coinsRestore` como rede para coins; passe premium: `passClaim` server + flag **local** (`unlockPremiumPaid`, `ultimate.ts:948-971`), sem estado no servidor.
  - **Cloud save**: blob inteiro do save, gzip, debounce 2,5s/30s, LWW por timestamp **do cliente** (`src/state/cloud.ts:146,155-192`); tombstone apaga local e `.bak`; gate paid (`api/cloud-save.ts:79-81`).
  - **Campos que o cliente altera sem o servidor perceber**: `profile.credits`, `inventory[]` (cópias, boost, style), `pass.*`, elo/RP/season, `objectivesClaimed`, missões, daily, gauntlet, draft e o `.cloudts` que decide o LWW (comentário "sem anti-cheat" em `state.ts:139`). **Servidor recomputa**: custo/odds/seed/saldo do pack, tudo do mercado, `paid` dos pedidos, forma da tx (`server/ultimate-economy.ts:77-105`).
- Modos e persistência (quando resultado e recompensa são gravados):
  - **Confirmado**: a série inteira é simulada de uma vez (`simulateSeries`, `src/engine/match.ts:786`) e **registrada antes do replay** — `recordMatch`/`gauntletRecord`/`draftRecord` em `UltimateSquadScreen.tsx:1248-1254`, `:1336`, `:1461`, cada um chamando `persist`; `finishMatch` (`:1365`) só fecha o replay. Timeout clicável no replay é placebo (base do U06).
  - Casual/Friendly: só cliente, seed `Math.random()` (`:1219`), zero rede, 90/25 credits. Gauntlet: idem, gate diário local. Draft: idem; Draft do Dia usa seed global da data e reporta `ultDraftReport` ao fim do run (servidor só clampa `wins`/`ovr`, não revalida). Duelo privado e Ranqueada: **os dois clientes simulam** com `run_seed` do lobby (`api/lobby.ts:297,540`), servidor valida 5 pids e clampa `chem` 0.8–1.2 (`api/lobby.ts:1046`), **não recebe placar**; ranqueada reporta `won` e o MMR sai do pareamento (`api/_reportPairing.ts:23`, grace 10 min). Major da Semana reusa a ranqueada e paga só no fechamento (`wlClaim`, que **não tem chamador no cliente**).
  - Onboarding: `claimStarter` (`ultimate.ts:603-619`) não checa `onboarded` — a única proteção contra duplicar é o gate de render (`:1542`) + o flag persistido.
  - Multiplicadores: IA aplica `chem` × evolução (`1 + 0.01·boost`) × `duel` só se `duel.total > 0` (`:1198-1201`); PvP envia `chem × duel` fundidos num campo (`:1279`) e **não** leva evolução (`buildOnlineTeam` ignora `ovr` do snapshot); Draft aplica só química.
  - Telemetria do Ultimate hoje: apenas `paywall_view` (`home-ultimate`, `ultimate-guest`, `mkt-lock`). `share_card` e `presence` são descartados pelo filtro de `src/state/track.ts:39-41`. **Nenhum evento de partida.**
- Riscos reproduzidos/evidenciados (sem correção neste lote): (1) rota `tx` aceita `grant` positivo arbitrário de qualquer conta logada e essa carteira paga o mercado P2P (`api/ultimate-economy.ts:110-134`); (2) claim de coins/passe/prêmios marca `claimed` antes do save persistir, sem restore para passe e prêmios; (3) passe pago evapora no rollover (`state.ts:746`); (4) fallback de pack em timeout pode gerar dois débitos; (5) duas abas abrindo pack geram dois `op_id`; (6) LWW de blob com relógio do cliente (incidente Coala documentado em `ultimateShadow.ts:520-528`); (7) webhooks não conferem valor pago com `cents` do pedido e a tabela de tiers do Woovi é duplicada hardcoded.
- Compatibilidade/migração/flag: nada alterado.
- Pendências: inspeção mobile; fluxo de retorno do checkout não exercitado (sem backend no ambiente de teste); nenhuma compra real.
- Próxima ação exata: ver "Próxima ação exata" acima (retomar U01 sobre o diff existente; U02 pode iniciar em paralelo).

## U01 — confiança da loja e pools de packs — 11/09/2026

- Estado: **implementado e verificado** (não publicado; PR aberto e mergeado no `master` do GitHub — ver commit).
- Branch/commit: `ult/u01-loja-pools` (a partir de `74de16f`). Autoria dividida: o núcleo do pool (packPool.ts, servidor, UTC, unavailable) veio do diff não commitado de outro agente encontrado no checkout; o coordenador completou e verificou.
- Mudanças e arquivos:
  - `src/engine/ultimate/packPool.ts` (novo): `weeklyPackPool(catalog, now)` — pool ELEGÍVEL do TOTW ≠ catálogo de propriedade; snapshot incompleto → `null` (nunca troca a garantia em silêncio).
  - `server/ultimate-pack.ts`: `rollPackServer` usa o pool por produto/data; `openPack` devolve `pack_unavailable` **sem debitar**; retry de op já paga replay das cartas mesmo com pool expirado; `ULT_PACK_ENGINE_VERSION = 'ult-pack-v2-weekly'`. `api/ultimate-economy.ts`: 409 `pack_unavailable`.
  - `src/engine/ultimate/totw.ts`: âncora da semana em **UTC** (segunda 00:00 UTC) — mesmo índice no navegador e no servidor.
  - `src/state/ultimate.ts` / `ultimateShadow.ts`: roll local do TOTW usa o mesmo pool; `reason: 'unavailable'` propagado; UI mostra "Pacote temporariamente indisponível. Nenhum coin foi gasto."
  - `src/engine/ultimate/packOdds.ts` (novo): `packOdds`/`packOddsLine` — garantia + P(≥1 carta) por raridade derivadas de `weights`+`guaranteed`, reproduzindo a conta do `rollPack` (garantidas dentro do bucket + restantes pelos pesos). Peso bruto não é exibido como chance.
  - `UltimateSquadScreen.tsx`: nota da coinshop derivada de `COIN_PACKS` × `PACK_DEFS` com `Math.floor` (fim do "30k abre um TOTS"); linha de odds em todos os packs (grid, TOTW, Promo, Ícone); TOTW mostra "segunda-feira, 00:00 UTC"; textos do Friendly e do Gauntlet derivam de `FRIENDLY_CREDITS` (novo em `engine/ultimate/state.ts`, 90/25) e `GAUNTLET_WIN_CREDITS` (800→4.500) — antes diziam 500/150 e 800→6.000.
- Decisões tomadas e motivo: pool vazio = indisponível sem débito (princípio "não substituir a promessa em silêncio"); fuso explícito UTC porque é o único que o cliente e o servidor compartilham sem configuração; garantias rotuladas como "N Ouro ou melhor" porque `resolveGuaranteedRarity` sorteia dentro do bucket pelos pesos (não é "1 Ouro exato").
- Comandos/testes e resultados reais (este checkout, node 26): `npm run build` verde · `npm test` **131/131** (3 novos em `server/ultimate-pack.test.ts`: virada UTC/mês, TOTW incompleto indisponível, indisponível não debita + retry preserva) · `npm run test:sim` **324/324** (novo `scripts/test-ultimate-pack-odds.mts`, 4 testes) · `npm run lint` 189 problemas = **mesma baseline** (zero novos).
- Verificação visual e ambiente: não repetida após a mudança (a inspeção do U00 reproduziu os textos errados; a correção é derivada de constantes e coberta por teste). Pendente no próximo lote: conferir a linha de odds em mobile.
- Compatibilidade/migração/flag: sem campo novo em save; `ULT_PACK_ENGINE_VERSION` gravada no ledger distingue rolls antigos; catálogo de propriedade intocado (cartas TOTW antigas seguem indexáveis). Sem flag — comportamento anterior (TOTW sorteando semanas acumuladas) era o bug.
- Pendências ou falhas preexistentes: lint vermelho pré-existente (189); Promo continua roll local (nunca foi server-side); live-ops override de promo não altera o pool do TOTW (não há interseção).
- Próxima ação exata: U02.

## U02 — funil e baseline de negócio — 11/09/2026

- Estado: **implementado e verificado** (não publicado até o deploy do master; os degraus só contam depois).
- Branch/commit: `ult/u02-funil` (a partir de `c7f1fcc`).
- Mudanças e arquivos:
  - `src/state/track.ts`: tipo `ult_funnel` liberado no filtro do cliente + `trackUltFunnel(step, data)` com dedupe por sessão por degrau (e por `orderId` em `purchase_fulfilled`). Steps: `enter`, `starter_claimed`, `match_started`, `match_completed`, `squad_adjusted`, `second_match_started`, `offer_viewed`, `purchase_intent`, `purchase_fulfilled`. `product_kind` ∈ coins/pass; `mode` ∈ rivals/casual/gauntlet/draft/ranked/private; `method` ∈ pix/card; `src` ∈ store/passe. Nenhum e-mail, token ou valor.
  - `api/track.ts`: `ult_funnel` na allowlist. `api/account.ts`: `coinsClaim` devolve também `orders[{orderId, coins}]` (RETURNING correlation_id) para o dedupe por pedido.
  - `src/state/account.ts`: `purchase_fulfilled` disparado **só** quando o servidor confirma o claim (`claimPaidCoins`/`claimPaidPassOrders`), um evento por pedido — é a confirmação autoritativa; eventos de UI não contam como receita.
  - `UltimateSquadScreen.tsx`: `enter` no mount (com `guest`), `offer_viewed` ao abrir Loja/Passe, `purchase_intent` nos cliques de Pix/cartão de coins e passe (inclusive quando bloqueado por falta de conta — mede a intenção perdida), `starter_claimed`, `match_started`/`second_match_started`/`match_completed` em playMatch, startPvpMatch e playDraftMatch (contador de partidas da sessão), `squad_adjusted` ao trocar/remover carta do slot.
  - `api/metrics.ts` + `src/components/MetricsPanel.tsx`: bloco "Funil do ULTIMATE (30 dias)" — sids distintos por degrau, % contra `enter`; compras confirmadas contam pedidos distintos (sem %). Reutiliza o painel existente; nenhum painel novo.
- Decisões tomadas e motivo: um tipo só com `step` (padrão do `rtp_demo`) para caber na allowlist e nos índices por tipo; dedupe por sessão em vez de por partida (marcos, não volume — ≤ ~10 eventos/sessão); 1ª e 2ª partida como degraus distintos porque são os denominadores do plano; retenção segue a política atual da tabela `events` (30 dias na consulta). `target_selected` fica para o U07 (não há alvo ainda). D1/D7 por coorte: possível por `sid` (persistido em localStorage) mas não implementado no painel — consulta a fazer quando houver dados.
- Comandos/testes e resultados reais: `npm run build` verde · `npm test` 131/131 · `npm run test:sim` 324/324 · `npm run lint` 189 = baseline (zero novos; arquivos tocados sem novos erros).
- Verificação visual e ambiente: não exercitada com backend (sem `/api` local); o filtro do cliente e a allowlist foram conferidos por leitura e typecheck.
- Compatibilidade/migração/flag: sem save nem schema novos (tabela `events` já existe); resposta do `coinsClaim` é aditiva (`coins` preservado).
- Pendências: limitação de identificação — `sid` é por navegador (visitante anônimo ≠ conta); coorte D1/D7 e "recompra em 30 dias por comprador" ainda sem consulta; capturar baseline antes de comparar versões.
- Próxima ação exata: U03.

## U03 — avaliador de elenco e tática pré-jogo — 11/09/2026

- Estado: **implementado e verificado** (primeira versão, escopo delimitado abaixo).
- Branch/commit: `ult/u03-elenco-taticas` (a partir de `196b15f`).
- Mudanças e arquivos:
  - `src/engine/ultimate/squadAnalysis.ts` (novo, puro): **adaptador único** `prepareUltimateTeam` (buildUserTeam → × química × evolução `EVO_PCT` × estilos só se `duel.total>0` → `playbook` da abordagem); `effectiveMultiplier` (a UI mostra o MESMO número que o motor usa — o "×força" do pré-jogo omitia a evolução); `squadProfile` (4 eixos: abertura, suporte/troca, controle, fechamento) derivado só de `aim/clutch/consistency/igl/role/role2/playstyle`, com `basis` explicando a origem, até 2 forças (≥80) e 1 fragilidade (<72 ou 8 abaixo do topo); `buildAiOpponent` (janela em torno do alvo, 1 IGL + 1 AWP + 1 Entry + 1 Support/Lurker + 1 livre, sorteado pelo rng da partida, abordagem própria); contrato PvP `PVP_SNAPSHOT_VERSION = 2` + `pvpApproachesApply` (só aplica se os DOIS snapshots forem v≥2).
  - **Abordagens** `aggressive | control | adaptive` → `TTeam.playbook` (`aggressive | controlled | tactical`) com `APPROACH_FAM = 0.7`. O custo/benefício é o `playbookLean` que o motor já tinha (lado, pistol, eco, 2º half, mapa próprio): **nenhum percentual novo foi inventado**; a magnitude é ±1.7 × 0.7 pontos de força por round.
  - `UltimateSquadScreen.tsx`: playMatch e playDraftMatch usam o adaptador e a IA válida (a IA também joga com abordagem); seletor de abordagem + "LEITURA DO ELENCO" na aba Ranqueada, **antes** do botão de jogar (a escolha trava antes da simulação; preferência por navegador em `rtm-ult-approach-v1`); pré-jogo mostra a abordagem e o multiplicador honesto. PvP: snapshot v2 com `approach`; `startPvpMatch` aplica nos dois lados só quando ambos são v2.
  - `src/state/online.ts`: `UltimatePvpSquad.v?/approach?`. `api/lobby.ts`: clamp `v` 1..9 e whitelist de `approach` (fora dela = null).
  - `scripts/test-ultimate-squad-analysis.mts` (6 testes): determinismo do adaptador e igualdade UI×motor; perfil só de dados existentes (sem IGL → fragilidade de controle); IA com composição válida, |avg−alvo| ≤ 6, varia com o seed e repete com o mesmo seed; **matriz 3 confrontos × 40 seeds × 4 opções**: spread de win rate entre abordagens ≤ 25 pp e a melhor abordagem muda entre confrontos; PvP v2 só com os dois lados; ordem canônica preserva o vencedor.
- Decisões tomadas e motivo: ligar o playbook existente em vez de criar tabela nova de tática (reuso, sem balanceamento inventado); IA sem multiplicadores de química/estilo (como antes) mas com composição válida — muda a dificuldade efetiva um pouco para cima em Rivals porque a IA deixa de sofrer as penalidades de "sem IGL/AWP"; dificuldade continua explícita pelo `target` (elo/OVR); preferência de abordagem fora do save (não é patrimônio, não sincroniza).
- **Auditoria de dupla contagem (documentada, NÃO alterada neste lote):** sinergia entra 2× em `buildUserTeam` (`teamwork` e `+synergy*0.7`, `ratings.ts:336-338`, `refSynergy=0` no Ultimate); país e função contam em `draftSynergy` E em `computeChemistry`; AWP/IGL contam em stat, sinergia e penalidade de round; estilos/traits são multiplicador sobre atributos que já geraram a força (bounded ≤1.03). Mudar isso altera a força de todos os elencos existentes — fica para decisão explícita (plano §5 U03: "sem invalidar silenciosamente elencos").
- Comandos/testes e resultados reais: `npm run build` verde · `npm test` 131/131 · `npm run test:sim` **330/330** (+6) · `npm run lint` 189 = baseline.
- Verificação visual e ambiente: não exercitada nesta rodada (seletor e leitura do elenco cobertos por typecheck e testes de engine). Pendente: conferir a aba Ranqueada em mobile.
- Compatibilidade/migração/flag: sem campo novo em save; snapshot PvP aditivo e versionado; cliente antigo × novo simulam igual (abordagem ignorada por ambos). Draft: squad emprestado segue sem abordagem do usuário (só a IA).
- Pendências: **evolução não entra na força em PvP** (o `ovr` do snapshot é cosmético; `buildOnlineTeam` lê o `Player` cru) — precisa viajar `boost` por carta no snapshot v3 e ser clampado no servidor; identidade tática (`MapSimOpts.identity`) não exposta por `simulateSeries`; coach fixo 70/tactical; `AI_EDGE` não se aplica ao Ultimate porque a IA nasce `isUser:true`.
- Próxima ação exata: U04.

## U04 — pós-jogo com evidências — 11/09/2026

- Estado: **implementado e verificado**.
- Branch/commit: `ult/u04-pos-jogo` (a partir de `122a99f`).
- Mudanças e arquivos:
  - `src/engine/ultimate/matchEvidence.ts` (novo, puro): `buildMatchEvidence(series, teams, myIdx, mods)` lê **só o MapResult** (roundLog, killFeed, stats por jogador) e devolve `observed` (placar, halves, pistols, aberturas, mortes trocadas, headshots, melhor/pior do seu squad, clutches, melhor deles), `modeled` (química, evolução, estilos, sua abordagem, abordagem da IA — "efeito modelado, não prova de causa") e até 3 `insights`, cada um com `evidence` numérica e uma ação (`ajuste` | `tatica` | `colecao`). Regras: aberturas perdidas (≤1/3 de ≥6), pistols 0/2, domínio do 1º half e queda no 2º, química ≤6/15, pior jogador ≥6 K-D abaixo da média com ≥12 rounds, trocas <25% com ≥10 mortes; vitória sem padrão elogia o melhor; sem padrão diz que não há padrão.
  - `UltimateSquadScreen.tsx`: `LiveResult.evidence` calculado **junto com a simulação** nos três executores (casual/gauntlet, PvP, draft) — reabrir a partida mostra o mesmo relatório; modal de resultado ganha o bloco "RELATÓRIO · o que aconteceu" (insights) com `<details>` "ver evidências e modificadores" (observado e modelado separados). No PvP o `chem` do snapshot embute química×estilos e as abordagens só entram se os dois lados forem v2.
  - `scripts/test-ultimate-match-evidence.mts` (3 testes): relatório idêntico para a mesma série; números batem com o MapResult (placar, pistols, aberturas) e a perspectiva invertida troca o placar sem mudar o fato; fallback sem killFeed (sem insight de duelo/troca; "nenhum aplicado" sem modificadores).
- Auditoria da transmissão (`liveDrama.ts`, `liveFrags.ts`, `showtime.ts`): falas do caster, "momento de estrela" e "craque do duelo" são derivados de roundLog + **traits das cartas** (apresentação), não de eventos do motor; `liveFrags` usa o killFeed real. Por isso o relatório não lê `DramaScript`/`MatchStar` — a cerimônia continua no modal, mas separada do relatório.
- Decisões tomadas e motivo: sem frases contrafactuais ("teria vencido com…"); insights de tática só apontam o que cada abordagem favorece (texto derivado das regras do `playbookLean`); relatório não é persistido no histórico (`MatchRecord` guarda só placar) — reabrir na sessão usa o objeto da partida.
- Comandos/testes e resultados reais: `npm run build` verde · `npm test` 131/131 · `npm run test:sim` **333/333** (+3) · `npm run lint` 189 = baseline.
- Verificação visual e ambiente: não exercitada (bloco novo no modal coberto por typecheck; layout pendente de conferência em mobile).
- Compatibilidade/migração/flag: campo opcional em `LiveResult` (estado de sessão, não save).
- Pendências: comparação de desempenho do reforço (depende do alvo do U07); relatório de séries MD3+ lê só o 1º mapa (o Ultimate joga MD1); persistir o relatório no histórico se um dia "reabrir partida antiga" existir.
- Próxima ação exata: U05.

## U05 — primeira sessão guiada — 11/09/2026

- Estado: **implementado e verificado**.
- Branch/commit: `ult/u05-primeira-sessao` (a partir de `495c4ab`).
- Mudanças e arquivos:
  - `src/engine/ultimate/firstSession.ts` (novo, puro): jornada `starter → strength → training → report → adjust → second → goal`, cada etapa marcada por um FATO (recebeu o time, abriu a leitura do elenco, concluiu a 1ª partida, chegou ao relatório, trocou um slot, concluiu a 2ª, abriu Loja/Coleção). `completeStep` só avança em ordem (idempotente), `nextStep`, `dismissJourney`, `normalizeJourney` (refresh retoma), `seedFromProfile` (onboarded começa em `strength`; veterano com ≥3 partidas é dispensado sozinho). Estado em `localStorage` `rtm-ult-journey-v1` — não é patrimônio, não sincroniza.
  - `src/state/ultimate.ts`: **guarda em `claimStarter`** — quem já está `onboarded` não recebe starter de novo (antes a única defesa era o gate de render); devolve as cartas escaladas para o reveal não quebrar.
  - `UltimateSquadScreen.tsx`: card "PRIMEIRA SESSÃO · n/7" no topo do hub com título, dica, CTA da etapa e "Pular"; barra de 7 etapas. CTA pós-reveal do time inicial vira "Conhecer a força e treinar →" (abre a Ranqueada em Amistoso, onde está a leitura do elenco/abordagem do U03) com "Ver coleção" secundário. Etapas avançam por eventos: `journeyDone('training'|'second')` em `noteMatchDone`, `'report'` em `finishMatch`, `'adjust'` ao trocar slot, `'strength'`/`'goal'` no `go()` (handler, não effect — regra `set-state-in-effect`). Treino e 2ª partida usam o Amistoso vs IA (identificado como IA, não conta no ladder).
  - `scripts/test-ultimate-first-session.mts` (3 testes): ordem/idempotência, normalização (refresh), veterano/novato/convidado.
- Decisões tomadas e motivo: jornada fora do save (compatibilidade e zero migração); "escolher objetivo" nesta versão = abrir Loja/Coleção (o alvo persistente é o U07 — a etapa passará a ser "selecionar alvo" quando ele existir); Amistoso como treino porque já é vs IA e sem RP; não dependemos de adversário online.
- Comandos/testes e resultados reais: `npm run build` verde (2×, após o ajuste do lint) · `npm test` 131/131 · `npm run test:sim` **336/336** (+3) · `npm run lint` **189 = baseline** (um `set-state-in-effect` novo foi introduzido e removido antes do commit).
- Verificação visual e ambiente: não exercitada (card, barra e CTA cobertos por typecheck). **Pendente: completar em mobile sem instrução externa** — critério de aceite do plano ainda não demonstrado.
- Compatibilidade/migração/flag: sem campo em save; veterano é dispensado automaticamente; "Pular" persiste.
- Pendências: mobile; a etapa `goal` deve apontar para o alvo do U07; refresh **durante** uma partida ainda perde o replay (o resultado já está registrado — é o U06 que muda isso).
- Próxima ação exata: U06 (casual).

## U06 — timeout interativo real (casual) — 11/09/2026

- Estado: **casual implementado e verificado**; **PvP pendente** (registrado, não concluído). Rivals (PvP), Gauntlet e Draft continuam no executor pré-calculado (commit-on-start) até decisão explícita.
- Branch/commit: `ult/u06-timeout-casual` (a partir de `6860bcf`).
- Descoberta confirmada no levantamento: `simulateSeries` rodava a série inteira e `recordMatch` era chamado ANTES do replay (`COMMIT-ON-START`); o ⚡ do replay é só velocidade 8×; `liveDrama`/`liveFrags` semeiam pelo hash do roundLog/killFeed COMPLETOS (não incrementais); `makeRng` não é retomável por tick; `createMapSim` já é round a round (`step(boostTeam,…)`, `peekWinProb`, `done`, `result`) e o boost de timeout (+2.0) já existe no motor (`match.ts`).
- Mudanças e arquivos:
  - `src/engine/ultimate/matchSession.ts` (novo, puro): `MatchSession` persistível (versão, matchId, seed, times travados, mapa, cursor, decisões, status). Como o RNG não retoma por tick, `viewSession`/`advanceSession` **reexecutam do zero até o cursor** (≤30 rounds, barato) — mesma seed + mesmas decisões ⇒ mesmos rounds. `callTimeout` só entre rounds, a partir do próximo, `TIMEOUTS_PER_SIDE = 1` e `TIMEOUT_ROUNDS = 3`; dois lados no mesmo intervalo anulam (simétrico, sem vantagem por ordem). `aiWantsTimeout`: regra explícita (3 derrotas seguidas após o 4º round ou 4 atrás). `skipToEnd`, `sessionSeries` (MD1 no formato do resto do jogo), `normalizeSession` (versão estranha → null).
  - `src/components/ultimate/UltimateLiveSession.tsx` (novo): palco round a round — placar, bolinhas, leitura pré-round (`peekWinProb`), botão ⏸ TIMEOUT (real), velocidade, killfeed do último round, "Pular pro fim". Sem caster (a transmissão exige roundLog completo — fica para uma versão incremental do drama).
  - `UltimateSquadScreen.tsx`: `playMatch('casual')` cria a sessão (nada simulado nem gravado) e persiste em `rtm-ult-live-match-v1`; `finalizeSession` monta mvp/relatório/cerimônia do `MapResult` completo e grava a recompensa **uma vez por matchId** (ledger `rtm-ult-match-done-v1`, cap 50); banner "PARTIDA EM ANDAMENTO · Retomar" no hub; CTA do Amistoso vira "RETOMAR PARTIDA"; `startMatch('casual')` retoma em vez de abrir outra. Seed/matchId nascem fora do escopo de render (`freshSessionIds`) pela regra do React Compiler.
  - `scripts/test-ultimate-match-session.mts` (5 testes): reprodução determinística; avançar 1 a 1 = correr até o fim; **timeout altera apenas o futuro** (rounds já resolvidos idênticos) e a retomada por JSON dá a mesma continuação; limite 1 por lado; dois lados anulam; IA determinística; `normalizeSession`.
- Decisões tomadas e motivo: casual primeiro (plano §U06); reexecução em vez de snapshot do sim (não há `snapshot/restore` no `MapSim` e a reexecução é determinística e barata); recompensa no fim com ledger em vez de commit-on-start (F5 retoma da mesma seed — não há re-roll possível); abandono = sessão fica guardada e retoma na próxima entrada (não há expiração por tempo nesta versão); sem caster no palco incremental para não "tremer" as falas.
- Comandos/testes e resultados reais: `npm run build` verde (2×) · `npm test` 131/131 · `npm run test:sim` **341/341** (+5) · `npm run lint` **189 = baseline** (3 `impure function during render` novos foram eliminados antes do commit).
- Verificação visual e ambiente: não exercitada (palco novo coberto por typecheck e pelos testes do motor). Pendente: conferir o palco em mobile e o fluxo de retomada após F5 no navegador.
- Compatibilidade/migração/flag: sem campo em save; sessão só em localStorage; sessão de versão diferente é descartada (`normalizeSession` → null). Sem flag: casual pré-calculado deixou de existir; os outros modos não mudam.
- Pendências: **PvP** (checkpoint autoritativo, decisões ordenadas no servidor, prazo/ausência, desconexão/abandono, pares compatíveis, orçamento de tráfego); Gauntlet/Draft incrementais; caster incremental; expiração de sessão abandonada; medição de custo por partida (não há servidor envolvido no casual — custo zero de rede).
- Próxima ação exata: U07.

## U07 — jogador dos sonhos e estreia do reforço — 12/09/2026

- Estado: **implementado e verificado**.
- Branch/commit: `ult/u07-alvo-estreia` (a partir de `075cc92`).
- Mudanças e arquivos:
  - `src/engine/ultimate/dreamTarget.ts` (novo, puro): `targetPaths(card, ctx)` — circulação (`sempre` para base; `agora`/`fora` para TOTW da semana e Promo do mês; nota para TOTS/Major/Ícone), packs cujo `weights` contém a raridade **e** cuja pool contém a carta, cada um com **P(≥1 carta da raridade)** do `packOdds` e o **tamanho do pool da raridade** — dois números, nunca multiplicados como "chance da carta" (regra do plano); recompensas por raridade (SBCs) marcadas "não específica"; `missingCredits`; `slotSwapPreview`/`bestSlotFor` (preview de química e função via `computeChemistry`/`roleFitsSlot`, sem consumir nada).
  - Save: `UltimateProfile.target?: { cardKey, setAt } | null` (opcional, default `null` no `migrateUltimate`); store `setTarget`. Sobrevive a reload; sincroniza com o save (cloud/espelho não tratam como economia).
  - `UltimateSquadScreen.tsx`: painel "⭐ JOGADOR DOS SONHOS" no hub — escolher/trocar/remover alvo (modal com busca por nick sobre o catálogo completo, até 60 por OVR, com contador de cópias), circulação, packs com custo/P/pool, recompensas por raridade, mercado (listagens e menor preço via `mktBrowse` só com conta vitalícia; convidado vê "conta necessária"), "faltam N coins pro caminho mais barato" (mín. entre pack e mercado) com atalhos Loja/Mercado; quando possui cópia livre: **"Escalar e estrear"** com preview do melhor slot (função ✔/✖, química antes→depois, OVR antes→depois, quem sai) — não substitui carta travada no squad (usa cópia `locked !== 'squad'`) nem lista. Etapa `goal` da jornada (U05) agora abre o seletor de alvo; evento de funil `target_selected` (U02).
  - `scripts/test-ultimate-dream-target.mts` (4 testes): base sempre em circulação e packs só com a raridade; TOTW da semana `agora` vs fora `fora` (sem pack); preview bate com `computeChemistry` e escolhe slot que aceita a função; `normalizeTarget`.
- Decisões tomadas e motivo: chance por carta NÃO é exibida (o roll sorteia a raridade e depois uma carta uniformemente na pool — exibir P×1/N seria coerente com o motor, mas o plano proíbe "chance individual" sem garantia; mostramos os dois fatores separados); alvo indisponível continua visível com o status correto; troca de alvo não mexe em patrimônio; comparação de desempenho do reforço em partida (U04 pendência) segue pendente — só o preview de escalação.
- Comandos/testes e resultados reais: `npm run build` verde · `npm test` 131/131 · `npm run test:sim` **345/345** (+4) · `npm run lint` 189 = baseline.
- Verificação visual e ambiente: não exercitada (painel e modal cobertos por typecheck); mercado só testável com conta paga e backend.
- Compatibilidade/migração/flag: campo opcional no save com default; sem schema no servidor.
- Pendências: comparação de desempenho do reforço após a estreia (cruzar `matchEvidence` com o alvo); alvo em rotação pode ficar sem caminho de pack — mostrado como "só mercado".
- Próxima ação exata: U08.

## Modelo de atualização por lote

### UXX — título — data

- Estado: em andamento / implementado / validado / publicado / bloqueado.
- Branch/commit:
- Mudanças e arquivos:
- Decisões tomadas e motivo:
- Comandos/testes e resultados reais:
- Verificação visual e ambiente:
- Compatibilidade/migração/flag:
- Pendências ou falhas preexistentes:
- Próxima ação exata:

Nunca preencher teste como aprovado sem executar. Se interrompido, registrar alterações não commitadas e processos/servidores iniciados para o próximo agente retomar com segurança.
