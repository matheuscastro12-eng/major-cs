-- =============================================================================
-- Varredura do ledger do Ultimate — O0-02 (SEGU-01 / ECON-01 / ENGA-M01)
-- =============================================================================
-- SÓ LEITURA. Todas as consultas abaixo são SELECT: nada é gravado, nada é
-- congelado. Quem roda é o Matheus (console do Neon, de preferência numa role
-- só-leitura ou num branch do banco). O código NUNCA roda isto sozinho.
--
-- Contexto: até o O0-02 a action `tx` aceitava do cliente kind 'grant',
-- 'reward' e 'admin' com qualquer creditsDelta e op:'add' com qualquer
-- cardKey. Esta varredura procura quem usou isso para cunhar coins/cartas.
--
-- "Crédito vindo da rota tx" = linha de rtm_ult_ledger com
--   kind IN ('grant','reward','admin') AND credits_delta > 0
-- EXCLUINDO os opIds que só o SERVIDOR grava (ou que o backlog manda ignorar):
--   'migrate-v1:%' (migração v1 do próprio cliente — excluída pelo backlog),
--   'coins:%' / 'pass:%' (O0-46: compra paga creditada pelo servidor),
--   'wl:%' (Major da Semana, settle do admin), 'ev:%' (eventClaim do servidor).
-- O que sobra tem opId aleatório (uuid ou 'sh-…') gerado pelo espelho do
-- cliente — inclusive o legítimo (coins pagos espelhados como 'grant' com
-- meta.src='credit', reconciliação 'admin' com meta.src='reconcile-3b',
-- prêmios de daily/streak/missões como 'reward'). Por isso as consultas
-- marcam a origem provável e o CRITÉRIO decide, não a mera presença.
--
-- Critérios de suspeita (BACKLOG O0-02):
--   (A) crédito do cliente acima de 200.000 coins num mesmo dia (fuso SP),
--       descontando o que casa com uma compra paga ou um restore;
--   (B) carta special/ícone adicionada pelo cliente (sufixo do card_key =
--       raridade: tots, major, promo, totw, histIcon, icon);
--   (C) compra no mercado P2P financiada por esse crédito.
--
-- Depois da triagem (fora deste arquivo, decisão do Matheus):
--   congelar = preencher rtm_ult_wallet.frozen_at da conta (coluna criada pelo
--   O0-02 no DDL idempotente da rota). Congelada, a conta não lista, não
--   compra no mercado e não abre pack no servidor; o jogo mostra a mensagem
--   padrão com 7 dias para contestar pelo e-mail de suporte (env
--   SUPPORT_EMAIL). Registrar a decisão final no CRM.
-- Nomes de coluna conferidos em server/ultimate-economy.ts,
-- server/ultimate-market.ts e api/account.ts (2026-09-23).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (A) Crédito do cliente acima de 200k num dia
-- -----------------------------------------------------------------------------
WITH client_credit AS (
  SELECT l.id, l.email, l.op_id, l.kind, l.credits_delta, l.meta, l.created_at,
         (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
  FROM rtm_ult_ledger l
  WHERE l.kind IN ('grant', 'reward', 'admin')
    AND l.credits_delta > 0
    AND l.op_id NOT LIKE 'migrate-v1:%'
    AND l.op_id NOT LIKE 'coins:%'
    AND l.op_id NOT LIKE 'pass:%'
    AND l.op_id NOT LIKE 'wl:%'
    AND l.op_id NOT LIKE 'ev:%'
),
classified AS (
  SELECT c.*,
         CASE
           -- coins pagos espelhados pelo cliente: mesmo valor de um pedido
           -- claimado da mesma conta com até 1 dia de distância
           WHEN c.kind = 'grant' AND EXISTS (
             SELECT 1 FROM rtm_coin_orders o
             WHERE o.email = c.email AND o.status = 'claimed' AND o.coins = c.credits_delta
               AND o.claimed_at BETWEEN c.created_at - interval '1 day' AND c.created_at + interval '1 day'
           ) THEN 'compra paga (provável)'
           WHEN c.kind = 'grant' AND EXISTS (
             SELECT 1 FROM rtm_coin_restores r
             WHERE r.email = c.email AND r.coins = c.credits_delta
               AND r.created_at BETWEEN c.created_at - interval '1 day' AND c.created_at + interval '1 day'
           ) THEN 'Recuperar compras (restore)'
           WHEN c.kind = 'admin' AND c.meta->>'src' = 'reconcile-3b' THEN 'reconcile LOCAL VENCE'
           ELSE 'cliente'
         END AS origem
  FROM client_credit c
)
SELECT email,
       dia,
       SUM(credits_delta) FILTER (WHERE origem NOT IN ('compra paga (provável)'))            AS credito_suspeito,
       SUM(credits_delta)                                                                     AS credito_total_cliente,
       COUNT(*)                                                                               AS n_tx,
       MAX(credits_delta)                                                                     AS maior_tx,
       array_agg(DISTINCT origem)                                                             AS origens,
       array_agg(DISTINCT kind || ':' || COALESCE(meta->>'src', '-'))                         AS kinds_src,
       MIN(created_at)                                                                        AS primeira,
       MAX(created_at)                                                                        AS ultima
FROM classified
GROUP BY email, dia
HAVING COALESCE(SUM(credits_delta) FILTER (WHERE origem NOT IN ('compra paga (provável)')), 0) > 200000
ORDER BY credito_suspeito DESC;


-- -----------------------------------------------------------------------------
-- (B) Cartas special/ícone adicionadas pelo cliente
-- -----------------------------------------------------------------------------
-- Toda op 'add' em tx que NÃO nasceu no servidor: kinds grant/reward/admin
-- (com os mesmos opIds de servidor excluídos) + 'pack' rolado no cliente
-- (fallback local; o packOpen do servidor grava meta.engineVersion).
-- Mercado ('escrow'/'trade') fica de fora: é sempre do servidor.
WITH client_adds AS (
  SELECT l.id, l.email, l.op_id, l.kind, l.meta, l.created_at,
         c->>'cardId'  AS card_id,
         c->>'cardKey' AS card_key
  FROM rtm_ult_ledger l
  CROSS JOIN LATERAL jsonb_array_elements(l.cards) c
  WHERE c->>'op' = 'add'
    AND l.op_id NOT LIKE 'wl:%'
    AND l.op_id NOT LIKE 'ev:%'
    AND l.op_id NOT LIKE 'coins:%'
    AND l.op_id NOT LIKE 'pass:%'
    AND (
      l.kind IN ('grant', 'reward', 'admin')
      OR (l.kind = 'pack' AND NOT (l.meta ? 'engineVersion'))
    )
)
SELECT email,
       COUNT(*)                                                           AS n_cartas_special,
       array_agg(DISTINCT split_part(card_key, ':', 2))                   AS raridades,
       array_agg(DISTINCT kind || ':' || COALESCE(meta->>'src', meta->>'via', '-')) AS kinds_src,
       bool_or(op_id LIKE 'migrate-v1:%')                                 AS veio_da_migracao_v1,
       MIN(created_at)                                                    AS primeira,
       MAX(created_at)                                                    AS ultima,
       (array_agg(card_key ORDER BY created_at DESC))[1:10]               AS amostra_card_keys
FROM client_adds
WHERE split_part(card_key, ':', 2) IN ('tots', 'major', 'promo', 'totw', 'histIcon', 'icon')
GROUP BY email
ORDER BY n_cartas_special DESC;
-- Nota: SBC, passe, temporada e coleção dão special legítima como 'reward';
-- volume alto num dia só, ou special sem partidas/packs que a justifiquem, é
-- o sinal. A migração v1 subiu a coleção antiga inteira como 'grant'
-- (veio_da_migracao_v1 = true) — olhar com calma antes de suspeitar.


-- -----------------------------------------------------------------------------
-- (C) Compras no mercado financiadas por crédito do cliente
-- -----------------------------------------------------------------------------
-- Para cada conta com crédito do cliente fora do padrão (critério A ou B),
-- quanto ela gastou comprando no mercado DEPOIS do primeiro crédito suspeito,
-- contra o que ela tinha de fonte legítima do servidor até ali. Mostra também
-- quem vendeu (jogadores afetados) — dá a dimensão do dano.
WITH client_credit AS (
  SELECT l.email, l.credits_delta, l.created_at
  FROM rtm_ult_ledger l
  WHERE l.kind IN ('grant', 'reward', 'admin')
    AND l.credits_delta > 0
    AND l.op_id NOT LIKE 'migrate-v1:%'
    AND l.op_id NOT LIKE 'coins:%'
    AND l.op_id NOT LIKE 'pass:%'
    AND l.op_id NOT LIKE 'wl:%'
    AND l.op_id NOT LIKE 'ev:%'
    AND NOT EXISTS (   -- descarta coins pagos espelhados (mesma regra do A)
      SELECT 1 FROM rtm_coin_orders o
      WHERE o.email = l.email AND o.status = 'claimed' AND o.coins = l.credits_delta
        AND o.claimed_at BETWEEN l.created_at - interval '1 day' AND l.created_at + interval '1 day'
    )
),
suspects AS (
  SELECT email, MIN(created_at) AS desde, SUM(credits_delta) AS credito_cliente
  FROM client_credit
  GROUP BY email
  HAVING MAX(credits_delta) > 200000
      OR SUM(credits_delta) > 200000
),
buys AS (
  SELECT s.email, s.desde, s.credito_cliente,
         li.id AS listing_id, li.seller_email, li.card_key, li.price, li.sold_at
  FROM suspects s
  JOIN rtm_ult_listings li ON li.buyer_email = s.email AND li.status = 'sold' AND li.sold_at >= s.desde
),
legit AS (   -- fontes legítimas do servidor da conta (total, para comparar com o gasto)
  SELECT s.email,
         COALESCE(SUM(l.credits_delta) FILTER (
           WHERE l.credits_delta > 0 AND (
             l.op_id LIKE 'coins:%' OR l.op_id LIKE 'wl:%' OR l.op_id LIKE 'ev:%'
             OR l.kind = 'trade'                               -- proceeds de venda
           )), 0) AS fonte_servidor
  FROM suspects s
  LEFT JOIN rtm_ult_ledger l ON l.email = s.email
  GROUP BY s.email
)
SELECT b.email,
       b.credito_cliente,
       lg.fonte_servidor,
       COUNT(*)                                      AS compras_no_mercado,
       SUM(b.price)                                  AS gasto_no_mercado,
       COUNT(DISTINCT b.seller_email)                AS vendedores_afetados,
       array_agg(DISTINCT b.seller_email)            AS vendedores,
       (array_agg(b.card_key ORDER BY b.price DESC))[1:10] AS cartas_mais_caras,
       MIN(b.sold_at)                                AS primeira_compra,
       MAX(b.sold_at)                                AS ultima_compra,
       (SUM(b.price) > lg.fonte_servidor)            AS gasto_maior_que_fonte_legitima
FROM buys b
JOIN legit lg ON lg.email = b.email
GROUP BY b.email, b.credito_cliente, lg.fonte_servidor
ORDER BY gasto_no_mercado DESC;


-- -----------------------------------------------------------------------------
-- (D) Resumo por conta para a decisão (junta A, B e C) + estado atual
-- -----------------------------------------------------------------------------
WITH client_credit AS (
  SELECT l.email, l.credits_delta, l.created_at,
         (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
  FROM rtm_ult_ledger l
  WHERE l.kind IN ('grant', 'reward', 'admin')
    AND l.credits_delta > 0
    AND l.op_id NOT LIKE 'migrate-v1:%'
    AND l.op_id NOT LIKE 'coins:%'
    AND l.op_id NOT LIKE 'pass:%'
    AND l.op_id NOT LIKE 'wl:%'
    AND l.op_id NOT LIKE 'ev:%'
    AND NOT EXISTS (
      SELECT 1 FROM rtm_coin_orders o
      WHERE o.email = l.email AND o.status = 'claimed' AND o.coins = l.credits_delta
        AND o.claimed_at BETWEEN l.created_at - interval '1 day' AND l.created_at + interval '1 day'
    )
),
crit_a AS (
  SELECT email, MAX(soma_dia) AS maior_dia
  FROM (SELECT email, dia, SUM(credits_delta) AS soma_dia FROM client_credit GROUP BY email, dia) d
  WHERE soma_dia > 200000
  GROUP BY email
),
crit_b AS (
  SELECT l.email, COUNT(*) AS n_special
  FROM rtm_ult_ledger l
  CROSS JOIN LATERAL jsonb_array_elements(l.cards) c
  WHERE c->>'op' = 'add'
    AND l.op_id NOT LIKE 'migrate-v1:%'
    AND l.op_id NOT LIKE 'wl:%' AND l.op_id NOT LIKE 'ev:%'
    AND l.op_id NOT LIKE 'coins:%' AND l.op_id NOT LIKE 'pass:%'
    AND (l.kind IN ('grant', 'reward', 'admin') OR (l.kind = 'pack' AND NOT (l.meta ? 'engineVersion')))
    AND split_part(c->>'cardKey', ':', 2) IN ('tots', 'major', 'promo', 'totw', 'histIcon', 'icon')
  GROUP BY l.email
),
crit_c AS (
  SELECT li.buyer_email AS email, COUNT(*) AS compras, SUM(li.price) AS gasto
  FROM rtm_ult_listings li
  JOIN (SELECT email, MIN(created_at) AS desde FROM client_credit GROUP BY email) cc
    ON cc.email = li.buyer_email AND li.sold_at >= cc.desde
  WHERE li.status = 'sold'
  GROUP BY li.buyer_email
),
accounts AS (
  SELECT email FROM crit_a
  UNION SELECT email FROM crit_b
)
SELECT a.email,
       acc.nick,
       acc.paid,
       ca.maior_dia                    AS criterio_a_maior_dia,
       cb.n_special                    AS criterio_b_cartas_special,
       cc.compras                      AS criterio_c_compras_mercado,
       cc.gasto                        AS criterio_c_gasto_mercado,
       w.credits                       AS saldo_servidor_hoje,
       w.frozen_at                     AS congelada_em,
       (SELECT COUNT(*) FROM rtm_ult_cards uc WHERE uc.email = a.email) AS cartas_no_servidor
FROM accounts a
LEFT JOIN crit_a ca ON ca.email = a.email
LEFT JOIN crit_b cb ON cb.email = a.email
LEFT JOIN crit_c cc ON cc.email = a.email
LEFT JOIN rtm_accounts acc ON acc.email = a.email
LEFT JOIN rtm_ult_wallet w ON w.email = a.email
ORDER BY COALESCE(ca.maior_dia, 0) DESC, COALESCE(cb.n_special, 0) DESC;
-- Obs.: w.frozen_at só existe depois que a rota /api/ultimate-economy rodar
-- uma vez com o O0-02 no ar (DDL idempotente). Antes disso, remova as linhas
-- de w.frozen_at desta consulta.
