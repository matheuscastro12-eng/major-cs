-- [SEC 2026-10-22] Auditoria de segurança. NÃO aplicado automaticamente:
-- rodar no Neon ANTES do deploy do código (as rotas também criam essas colunas
-- com ADD COLUMN IF NOT EXISTS, mas a ordem segura é migration primeiro).
-- Idempotente.

-- Revogação do token de conta (server/auth.ts verifyAccountSession): a versão
-- sobe no cadastro pendente repetido, na ativação (pagamento/grant) e no reset
-- de senha. Linhas existentes ficam em 0 = tokens atuais (versão 0) seguem
-- válidos até a troca de APP_SECRET.
ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS token_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE rtm_pending_signups ADD COLUMN IF NOT EXISTS token_version BIGINT NOT NULL DEFAULT 0;

-- Major da Semana: a conta (do token) de quem entra na fila ranqueada e de cada
-- jogador da sala pareada pelo servidor. wlReport só aceita sala com as duas
-- contas como participantes.
ALTER TABLE mm_queue ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE lobby_players ADD COLUMN IF NOT EXISTS email TEXT;
