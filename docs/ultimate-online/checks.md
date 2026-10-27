# checks — Ultimate online

- [x] Fila/sala ranqueada exige token e usa e-mail — `server/lobby-online.test.ts` ("[F1] fila ranqueada exige token", "[F1] queueJoin grava o e-mail", "[F1] pick ranqueado: sem token 401 ... vaga de outra conta 403")
- [x] `pick` rejeita carta que a conta não possui — `server/ultimate-squad.test.ts` ("carta que a conta não possui é negada", "buildServerSquad lê a posse") e `lobby-online.test.ts` (400 `not_owner`)
- [x] Carta duplicada no squad recusada — `ultimate-squad.test.ts` + `lobby-online.test.ts` (400 `duplicate_card`)
- [x] OVR/química do snapshot calculados no servidor ignorando o cliente — `ultimate-squad.test.ts` ("OVR e química vêm do servidor") e `lobby-online.test.ts` ("squad montado no servidor, ovr/chem do cliente ignorados")
- [x] Import 1× só e teto — `ultimate-squad.test.ts` ("ultImport: importa 1× só", "teto por raridade, teto total e teto de créditos", "créditos nunca descem")
- [x] Prêmio da ranqueada creditado no servidor, idempotente — `ultimate-squad.test.ts` ("prêmio da ranqueada")
- [x] Cliente não consegue criar carta via reconcile — já coberto desde o O0-02 (`ultimate-economy.test.ts`, "handler tx: rejeita grant/reward/admin positivo e carta forjada")
- [ ] Ranqueada religada atrás de flag — código pronto; falta `RANKED_QUEUE_ENABLED=true` na Vercel depois do deploy (não alterado aqui)
- [ ] Partida resolvida no servidor beat a beat; prazo e W.O. — Fase 2
- [x] build + npm test + npm run test:sim (27/10/2026, branch `feat/ultimate-online-f1`):
  - `npm run build`: ok (exit 0)
  - `npm test`: 286/286 com node_modules acessível; na worktree sem node_modules local, 285/286 (só `esm-imports` falha por "Cannot find package" em todos os handlers, inclusive os não tocados — ambiente)
  - `npm run test:sim`: 792/793; única falha `scripts/test-design-tokens.mts` (espaço no caminho, conhecida)
