# progress — Modo Major (PGL Major Singapore 2026) + elencos 2026

- **Tarefa:** modo Major com os 32 times vindos de JSON, suíço em stages + playoffs, chave compartilhável (PNG + link) e pick'em; elencos 2026.
- **Restrições:** não mexer em preço, pagamentos, Stripe, Woovi, PIX_PRICE_CENTS nem nos textos de R$20. Fazer o PR sem merge.
- **Saídas:** `src/engine/majorSingapore.ts`, `src/components/major/*`, `src/styles/major.css`, `src/data/major-singapore-2026.json`, rota `/major-singapore`, `scripts/test-major-singapore.mts`, entradas 2026 em `teams.json`, `docs/elencos-2026-fontes.md`.
- **Estágio:** implementado, com build e testes rodados. PR aberto.
- **Decisões:** até 02/11 a lista é uma projeção: ranking bo3.gg de 29/09 com as cotas 18 Europa, 9 Américas e 5 Ásia. A região vem do país da org, o que é aproximado (ex.: FaZe contou como Américas). O rating sai dos números do bo3-2026.json. O auto-open de Novidades foi desligado em /major-singapore.
- **Falhas:** `scripts/test-design-tokens.mts` falha só localmente por causa do espaço no caminho ("claude projects"). Já acontecia antes desta mudança.
- **Próximo passo:** em 02/11, trocar `teams` do JSON pela lista oficial (seeds 1..32, `confirmed: true`, `status: "oficial"`). Confirmar MD1/MD3 e a disputa de 3º lugar. Criar `wildcard2026` e revisar Astralis, MIBR, VP e HEROIC.
