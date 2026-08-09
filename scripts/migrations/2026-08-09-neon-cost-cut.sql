-- CORTE DE CUSTO NEON (2026-08-09)
--
-- Diagnóstico (pg_stat_user_tables, acumulado desde 10/jun/2026):
--   events         seq_scan 150.576  seq_tup_read 41.223.008.328  ← 91% de todo o I/O
--   online_sessions seq_scan 799.511 seq_tup_read  2.603.204.558  ← 1 linha viva, 408 kB
--   client_errors  seq_scan  34.138  seq_tup_read    661.199.536
--   campaigns      seq_scan   7.780  seq_tup_read    118.652.096
--   TOTAL do banco: tup_returned 45.212.578.517 vs tup_fetched 279.844.920 (161:1)
--
-- Causa: os DELETEs de retenção iam grudados em TODO INSERT (api/track.ts,
-- api/error.ts) e não havia índice na coluna de tempo — full seq scan por
-- request pra apagar ZERO linha (a retenção é de 24 meses / 90 dias e a base
-- nasceu em jun/2026). O código já foi corrigido; estes índices garantem que a
-- retenção, quando finalmente rodar, seja index scan e não varredura.

CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_client_errors_ts ON client_errors (ts);
CREATE INDEX IF NOT EXISTS idx_online_sessions_last_seen ON online_sessions (last_seen);

-- online_sessions: 1 linha viva em 408 kB e último autovacuum em 20/jun.
-- O bloat vinha dos upserts de presence (heartbeat de 30s→90s, hoje desligado
-- no cliente). Recupera o espaço e reseta as estatísticas de planejamento.
VACUUM FULL online_sessions;

ANALYZE events;
ANALYZE client_errors;
ANALYZE online_sessions;
ANALYZE campaigns;
