-- Consulta AGREGADA das runs da galera no Road to Major. SOMENTE LEITURA, SOMENTE SELECT.
-- Nenhuma coluna de pessoa sai daqui (sem email, nick, player, sid, ip). Só contagens e nomes de
-- time/jogador PROFISSIONAL. Grupos com menos de 3 runs são agrupados em 'outros' (anti-reidentificação).
-- Rodar com: npm run stats:runs   (precisa de READONLY_DATABASE_URL; ver runs-agregado.mts)
--
-- O que existe no banco (conferido no código do repo):
--   events(type,sid,data,created_at): telemetria anônima. game_start {pool,difficulty,mode}, game_end {champion:boolean = o usuário foi campeão}.
--   campaigns(...): runs enviadas ao Hall da Fama (opt-in, com login): champion = time campeão do torneio, placement, pool, roster, season.
--   rtm_pickem_picks(stage,pick jsonb): pick'em do Major Singapore (PR #114; só existe depois do deploy).
-- NÃO existe no servidor: runs do modo Major Singapore (PR #111) ficam só no navegador. Hoje não há evento delas.

-- name: total_runs
SELECT
  COUNT(*) FILTER (WHERE type = 'game_start')                                            AS runs_iniciadas,
  COUNT(*) FILTER (WHERE type = 'game_end')                                              AS runs_concluidas,
  COUNT(*) FILTER (WHERE type = 'game_end' AND COALESCE((data->>'champion')::boolean, false)) AS runs_com_titulo_do_usuario,
  (SELECT COUNT(*) FROM campaigns)                                                       AS runs_no_hall_da_fama,
  MIN(created_at) FILTER (WHERE type = 'game_start')                                     AS primeira_run,
  MAX(created_at) FILTER (WHERE type = 'game_start')                                     AS ultima_run
FROM events
WHERE type IN ('game_start', 'game_end');

-- name: runs_por_pool_e_dificuldade
SELECT COALESCE(data->>'pool', 'world') AS pool, COALESCE(data->>'difficulty', 'normal') AS dificuldade,
       COUNT(*) FILTER (WHERE type = 'game_start') AS iniciadas,
       COUNT(*) FILTER (WHERE type = 'game_end')   AS concluidas,
       COUNT(*) FILTER (WHERE type = 'game_end' AND COALESCE((data->>'champion')::boolean, false)) AS titulos_do_usuario
FROM events WHERE type IN ('game_start', 'game_end')
GROUP BY 1, 2 ORDER BY 3 DESC;

-- name: campeoes_mais_frequentes
-- Times campeões das runs registradas no Hall da Fama (campaigns.champion).
WITH c AS (SELECT left(champion, 60) AS campeao, COUNT(*) AS n FROM campaigns WHERE COALESCE(champion, '') <> '' GROUP BY 1)
SELECT CASE WHEN n >= 3 THEN campeao ELSE 'outros (<3 runs)' END AS campeao, SUM(n)::int AS runs,
       ROUND(100.0 * SUM(n) / NULLIF((SELECT SUM(n) FROM c), 0), 1) AS pct
FROM c GROUP BY 1 ORDER BY 2 DESC LIMIT 15;

-- name: colocacao_no_hall
SELECT left(placement, 20) AS colocacao, COUNT(*)::int AS runs
FROM campaigns GROUP BY 1 ORDER BY 2 DESC LIMIT 15;

-- name: jogadores_mais_escolhidos_no_elenco
-- "Times mais escolhidos" no draft = jogadores PROFISSIONAIS mais montados nos elencos das runs do Hall (roster[].nick).
WITH j AS (
  SELECT left(e->>'nick', 24) AS jogador
  FROM campaigns, LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(roster) = 'array' THEN roster ELSE '[]'::jsonb END) AS e
)
SELECT jogador, COUNT(*)::int AS runs FROM j WHERE COALESCE(jogador, '') <> ''
GROUP BY 1 HAVING COUNT(*) >= 3 ORDER BY 2 DESC LIMIT 20;

-- name: pickem_campeao_mais_escolhido   (opcional: só roda se a tabela rtm_pickem_picks existir)
SELECT left(pick->>'champion', 40) AS time_campeao_palpitado, COUNT(*)::int AS palpites
FROM rtm_pickem_picks WHERE stage = 'playoffs' AND COALESCE(pick->>'champion', '') <> ''
GROUP BY 1 HAVING COUNT(*) >= 3 ORDER BY 2 DESC LIMIT 15;

-- name: pickem_times_mais_escolhidos_pra_avancar   (opcional)
SELECT stage, left(t, 40) AS time, COUNT(*)::int AS palpites
FROM rtm_pickem_picks, LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(pick->'advance') = 'array' THEN pick->'advance' ELSE '[]'::jsonb END) AS t
WHERE stage IN ('s1', 's2', 's3')
GROUP BY 1, 2 HAVING COUNT(*) >= 3 ORDER BY 3 DESC LIMIT 30;
