# Stats do Major (scripts/stats)

Tudo local, só leitura de dados. Saída em `/workspace/major-cs/stats/` (`--out-dir` muda).

## 1. Monte Carlo de título (um comando)
```
npm run stats:major-titulo                              # lista atual, 10.000 sims
npm run stats:major-titulo -- --lista oficial.json      # 02/11: valida, faz backup, troca src/data/major-singapore-2026.json e roda
```
Opções: `--sims 10000 --seed 20261124 --workers N --status OFICIAL|PROVISORIO`.
O status sai de `listStatus` do JSON ("provisoria" → PROVISORIO). Gera `major-titulo-<STATUS>-<sims>sims.json/.csv`
(título, semis, final, playoffs = passar do Stage 3, passar do Stage 1 e 2, margem ±pp IC95). ~4 min com 7 workers.
O JSON oficial precisa ter `listStatus: "oficial"` pra sair como OFICIAL; fazer o ajuste de stand-ins (`standIns`) no próprio JSON antes.

## 2. Probabilidade por jogo
```
npm run stats:prob-jogo -- --a FURIA --b paiN [--n 5000] [--seed 20261124] [--json]
npm run stats:prob-jogo -- --brs --n 2000               # BRs da lista x (BRs + 10 mais fortes) → .json/.csv
```
Motor: `autoVeto` + `simulateSeries` (corpo de `simulateAiSeries`), elencos da lista do Major, Bo1/Bo3/Bo5, seed fixa,
metade das séries com a ordem do veto invertida. Erro típico com n=2000: ±2 pp.

## 3. Runs da galera (somente leitura)
```
READONLY_DATABASE_URL=... npm run stats:runs            # só roda se o papel for realmente somente leitura
npm run stats:runs -- --print-sql
```
Nunca usa `DATABASE_URL`. Aborta se o papel tiver escrita em qualquer tabela de `public`, privilégios elevados ou CREATE no schema.
Ver cabeçalho de `runs-agregado.sql` pro que existe (e não existe) no banco.
