-- Gerado por scripts/pickem-seed.mts. NÃO rodado em produção.
-- s2/s3 começam só com os convidados; os 8 que avançam do Stage anterior entram
-- automaticamente quando o admin confirma o resultado (api/pickem.ts).
INSERT INTO rtm_pickem_stages (stage, teams, locks_at) VALUES ('s1', '["xls_team_bc","bo3_team_594","bo3_team_787","bo3_team_8171","bo3_team_1539","bo3_team_22218","bo3_team_637","bo3_team_791","bo3_team_757","bo3_team_785","bo3_team_696","bo3_team_756","bo3_team_6062","bo3_team_476","bo3_team_200","bo3_team_751"]'::jsonb, '2026-11-24T10:00:00+08:00')
  ON CONFLICT (stage) DO UPDATE SET teams = EXCLUDED.teams, locks_at = EXCLUDED.locks_at, updated_at = now();
INSERT INTO rtm_pickem_stages (stage, teams, locks_at) VALUES ('s2', '["bo3_team_324","bo3_team_20832","bo3_team_7498","bo3_team_794","bo3_team_759","bo3_team_755","bo3_team_7430","bo3_team_790"]'::jsonb, '2026-11-28T10:00:00+08:00')
  ON CONFLICT (stage) DO UPDATE SET teams = EXCLUDED.teams, locks_at = EXCLUDED.locks_at, updated_at = now();
INSERT INTO rtm_pickem_stages (stage, teams, locks_at) VALUES ('s3', '["bo3_team_667","bo3_team_765","bo3_team_654","bo3_team_3598","bo3_team_2713","bo3_team_648","bo3_team_8118","bo3_team_793"]'::jsonb, '2026-12-02T10:00:00+08:00')
  ON CONFLICT (stage) DO UPDATE SET teams = EXCLUDED.teams, locks_at = EXCLUDED.locks_at, updated_at = now();
INSERT INTO rtm_pickem_stages (stage, teams, locks_at) VALUES ('playoffs', '[]'::jsonb, '2026-12-10T10:00:00+08:00')
  ON CONFLICT (stage) DO UPDATE SET teams = EXCLUDED.teams, locks_at = EXCLUDED.locks_at, updated_at = now();
