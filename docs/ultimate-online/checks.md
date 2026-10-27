# checks — Ultimate online

- [x] Fila/sala ranqueada exige token e usa e-mail — `server/lobby-online.test.ts` ("[F1] fila ranqueada exige token", "[F1] queueJoin grava o e-mail", "[F1] pick ranqueado: sem token 401 ... vaga de outra conta 403")
- [x] `pick` rejeita carta que a conta não possui — `server/ultimate-squad.test.ts` ("carta que a conta não possui é negada", "buildServerSquad lê a posse") e `lobby-online.test.ts` (400 `not_owner`)
- [x] Carta duplicada no squad recusada — `ultimate-squad.test.ts` + `lobby-online.test.ts` (400 `duplicate_card`)
- [x] OVR/química do snapshot calculados no servidor ignorando o cliente — `ultimate-squad.test.ts` ("OVR e química vêm do servidor") e `lobby-online.test.ts` ("squad montado no servidor, ovr/chem do cliente ignorados")
- [x] Import 1× só e teto — `ultimate-squad.test.ts` ("ultImport: importa 1× só", "teto por raridade, teto total e teto de créditos", "créditos nunca descem")
- [x] Prêmio da ranqueada creditado no servidor, idempotente — `ultimate-squad.test.ts` ("prêmio da ranqueada")
- [x] Cliente não consegue criar carta via reconcile — já coberto desde o O0-02 (`ultimate-economy.test.ts`, "handler tx: rejeita grant/reward/admin positivo e carta forjada")
- [ ] Ranqueada religada atrás de flag — código pronto; falta `RANKED_QUEUE_ENABLED=true` na Vercel depois do deploy (não alterado aqui)
- [x] Motor do PvP: determinismo, estado sobrevive a JSON, placar só sobe, nenhum beat antes do último fecha o mapa, placar final válido no CS2 (300 seeds), odds espelhadas, nenhum estilo domina (600 partidas por estilo contra rival uniforme: 42–58%), contra-jogo pesa (>75%) — `scripts/test-ult-pvp-match.mts` (8/8)
- [x] Decisões simultâneas (beat só resolve com as duas; escolha do rival não vaza), decisão travada, beat passado ignorado — `server/ult-match.test.ts`
- [x] Prazo vencido = escolha automática para quem não decidiu — `server/ult-match.test.ts`
- [x] Sem dupla resolução com requests concorrentes (CAS por versão, conflito real exercitado) — `server/ult-match.test.ts`
- [x] W.O. por 3 beats sem decidir, por 60s sem poll; os dois ausentes = abandonada — `server/ult-match.test.ts`
- [x] MMR e prêmio pelo resultado do servidor, uma vez só; amistoso não fecha; report legado já aplicado bloqueia; prêmio idempotente no ledger (FakeDb) — `server/ult-match.test.ts`
- [ ] Duelo com dois aparelhos reais contra o Neon — não feito (sem ambiente)
- [x] build + npm test + npm run test:sim (27/10/2026, branch `feat/ultimate-online-f1`):
  - `npm run build`: ok (exit 0)
  - `npm test`: 286/286 com node_modules acessível; na worktree sem node_modules local, 285/286 (só `esm-imports` falha por "Cannot find package" em todos os handlers, inclusive os não tocados — ambiente)
  - `npm run test:sim`: 792/793; única falha `scripts/test-design-tokens.mts` (espaço no caminho, conhecida)
- [x] build + npm test + npm run test:sim (27/10/2026, branch `feat/ultimate-online-f2`, com node_modules por link):
  - `npm run build`: ok (exit 0)
  - `npm test`: 296/296
  - `npm run test:sim`: 800/801; única falha `scripts/test-design-tokens.mts` (espaço no caminho, conhecida)

## Features do CS Manager (branch `feat/ultimate-csm-features`, 27/10/2026)
- [x] Drop: estoque 1/20 min, teto 3, excedente perdido, fração preservada — `server/ultimate-drops.test.ts`
- [x] Drop: sorteio determinístico pela seed, 3 opções distintas, ordem do pool irrelevante; pity garante Ouro+ (300 seeds) — `server/ultimate-drops.test.ts`
- [x] Drop: abrir de novo devolve o mesmo pendente; escolha entra pelo ledger (`drop:<id>`); replay com outro índice devolve o gravado; vencido entrega o menor valor uma vez só; índice inválido 400; pool insuficiente não consome — `server/ultimate-drops.test.ts`
- [x] Drop: calibração (melhor opção 86,7 ≤ 1,25 × carta do Pacote Bronze 69,9; 24 drops < diário médio) — `server/ultimate-drops.test.ts`
- [x] Versões de evento: chave, substituição na mesma vaga, +OVR, rótulo; DRIFT cliente (engine) × servidor (snapshot) em declaração, pool, roll de 4 packs × 4 seeds e drop; resolve depois do evento — `server/ultimate-event-versions.test.ts`
- [x] História da carta: delta só com o que o motor produz; gravada para os dois lados uma vez; idempotente por partida; só cópias possuídas; DDL sem colunas mortas — `server/ultimate-card-stats.test.ts`
- [x] Origin: oficial/www/preview/APP_ORIGINS/mesma origem passam; terceiro, sufixo e http recusam; localhost só fora de produção; sem Origin passa (ou exige com ORIGIN_REQUIRE=1); rotas respondem 403 antes do banco — `server/origin.test.ts`
- [x] Hash do pedido: quicksell e packOpen com o mesmo op_id e outro payload = 409 sem efeito; replay igual devolve `recorded.creditsAfter` — `server/ultimate-economy.test.ts`, `server/ultimate-pack.test.ts`
- [ ] Neon real e navegador — não feito (sem ambiente)
- [x] build + npm test + npm run test:sim (node_modules por link):
  - `npm run build`: ok
  - `npm test`: 321/321
  - `npm run test:sim`: 800/801; única falha `scripts/test-design-tokens.mts` (espaço no caminho, conhecida)
