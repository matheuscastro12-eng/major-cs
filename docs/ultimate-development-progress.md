# Ultimate — registro de continuidade

Última atualização: 11/09/2026 (U00, U01 e U02 concluídos).
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
| U03 Elenco/táticas | Pendente — **próximo** | U00/U02 feitos; mapeamento técnico em andamento |
| U04 Pós-jogo | Pendente | U03 |
| U05 Primeira sessão | Pendente | U03/U04 |
| U06 Timeout real | Pendente | U03/U04; novo contrato de execução |
| U07 Alvo e estreia | Pendente | U03/U05 |
| U08 Compra/oferta inicial | Pendente | U01/U02/U07 |
| U09 Passe | Pendente | U02/U08; U10 para cosméticos novos |
| U10 Identidade/coleções | Pendente | U07/U08 para produtos pagos |
| U11 Rivalidades | Pendente | Contrato de partidas estabilizado |
| U12 Eventos | Pendente | U03/U11 e economia validada |

## Próxima ação exata

Executar U03 (avaliador de elenco e tática pré-jogo): (1) adaptador único do Ultimate para preparar times (`squadAnalysis.ts`), mapeando a cadeia atributos → strength e os multiplicadores (química, evolução, estilos/traits) sem dupla contagem; (2) perfil de elenco só com dados existentes (aim/clutch/consistency/awp/igl/role/playstyle/traits) — até 2 pontos fortes e 1 fragilidade com causa; (3) três abordagens iniciais (agressividade/controle/adaptação) como opção explícita do `createMapSim`, com teto definido após simular baseline em `scripts/`; (4) IA com perfis variados e composição válida; (5) PvP: snapshot versionado com a escolha, validado no servidor, sem esconder bônus novo em `chem`. Aceite: mesmo seed/versão ⇒ mesmo resultado; inverter perspectiva preserva vencedor; nenhuma tática vence em todos os cenários da bateria.

Depois do deploy do U02, ler o funil no MetricsPanel por alguns dias ANTES de comparar versões (baseline).

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
