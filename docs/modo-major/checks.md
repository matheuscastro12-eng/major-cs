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
