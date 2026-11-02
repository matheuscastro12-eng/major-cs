# checks

- [x] 32 times num JSON fácil de editar → `src/data/major-singapore-2026.json` (validado em `test-major-singapore.mts`)
- [x] Suíço em 3 stages + playoffs MD3/final MD5 → `simulateMajor`, testes de 8 classificados por stage
- [x] Pick'em de classificados + campeão → aba Pick'em, `normalizePicks`/`scorePicks`
- [x] Chave compartilhável: link `?p=` (ida e volta testada) e PNG (`majorShareCard.ts`)
- [x] Identidade visual (marinho, dourado, Oswald/Barlow) → `major.css` usa os tokens; screenshots 1440 em /tmp
- [x] i18n pt/en/es → `majorStrings.ts`
- [x] Elencos 2026 com fontes → `teams.json` e `docs/elencos-2026-fontes.md`
- [x] Build ok · `npm test` 269/269 · `test:sim` 800 ok, 1 falha antiga só local (design-tokens)
- [ ] Mobile em aparelho real: não testado (o Chrome headless não renderiza abaixo de ~500px)

## v2 (branch feat/modo-major-v2, 27/10/2026)

- [x] Jogar as séries de um time na Sala → `engine/majorCampaign.ts` (replay do Major com `SeriesPlayer`; usa `createRoom`/`finishCircuitMatch`, sem regra duplicada). `test-major-campaign.mts`: série pendente no stage certo, campanha jogada pela Sala até o fim, replay determinístico, rng das séries de IA intacto
- [x] Resultado jogado alimenta suíço e playoffs → teste "o resultado jogado está no Major"
- [x] Visto no navegador (dev, 1440): aba Play → Start → Sala abre com scorebug FURIA × FaZe Clan (bug do tag do fixture corrigido); 1 lock-in + pular → série registrada (1–0, rating 1.37) e próxima série "FURIA × Wildcard"
- [x] Pick'em 3-0/0-3 por stage, pontuação (2 pts cada, máximo 65) e resumo por stage; link antigo continua válido (teste)
- [x] Persistência local com try/catch (palpite, campanha, ligas, id do membro)
- [x] Liga com amigos → `api/major-league.ts` + `server/major-league.ts` (DDL idempotente, `rateLimitHit` por IP e ação, nick + código, token opcional). `server/major-league.test.ts` 7/7
- [ ] Liga ponta a ponta: não testada contra o Neon (o `vite` dev não serve `/api`; a tela mostrou o erro "Could not reach the server", como esperado)
- [x] Chave com placar por lado e seu time marcado, stages, estatísticas por time, MVP da campanha, card PNG da campanha, 3-0/0-3 no card do Pick'em
- [x] Largura de telefone: iframe de 390px em todas as abas e visões → `scrollWidth` 386 (sem rolagem horizontal; abas e tabela rolam dentro do próprio contêiner). Seletor de visão saiu do cabeçalho porque cortava o título do campeão
- [x] `npm run build` ok · `npm test` 275/276 · `npm run test:sim` 809/810
- [ ] `npm test`: falha `esm-imports` (todos os handlers, "Cannot find package '@neondatabase/serverless'"): a worktree não tem `node_modules` próprio, o teste copia api/ para /tmp. Nenhum erro específico de `api/major-league.ts`
- [ ] `test:sim`: falha só `test-design-tokens.mts` (espaço no caminho, antiga)
