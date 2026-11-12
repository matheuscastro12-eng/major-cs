// [paywall v2] Pix em 1 passo: cadastro PENDENTE só com e-mail, sem senha.
//
// O pass_hash (NOT NULL) do pendente guarda "setup:" + hash de uma CHAVE DE
// CONFIGURAÇÃO aleatória gerada no navegador que iniciou o pagamento. Ninguém
// entra com senha numa conta assim (verifyPw nunca casa o prefixo). Depois que
// o pagamento confirma (webhook → conta paga), só quem tem a chave (o mesmo
// navegador) define a senha pela action 'setPassword'; de outro aparelho, o
// caminho é o reset por código no e-mail (resetConfirm), que prova a posse do
// e-mail. Sem coluna nova: tudo cabe no pass_hash que já existe.

export const SETUP_PREFIX = 'setup:';
/** janela em que um pendente sem senha de OUTRO navegador não pode ser sobrescrito */
export const SETUP_LOCK_SEC = 2 * 3600;

export function isSetupHash(stored: unknown): boolean {
  return typeof stored === 'string' && stored.startsWith(SETUP_PREFIX);
}

/** chave gerada no cliente: 32–128 hex (crypto.getRandomValues) */
export function setupKeyValid(key: unknown): key is string {
  return typeof key === 'string' && /^[a-f0-9]{32,128}$/.test(key);
}

export function makeSetupHash(key: string, hashPw: (s: string) => string): string {
  return SETUP_PREFIX + hashPw(key);
}

export function setupKeyMatches(stored: unknown, key: unknown, verifyPw: (pw: string, stored: string) => boolean): boolean {
  if (!isSetupHash(stored) || !setupKeyValid(key)) return false;
  return verifyPw(key, String(stored).slice(SETUP_PREFIX.length));
}

export type EmailSignupDecision = 'ok' | 'login' | 'busy';

/** Pode criar/renovar o pendente só com e-mail?
 *  - e-mail já tem conta (paga ou não) ou já pagou → 'login' (nunca cria conta
 *    sem senha por cima de um pagamento/conta de outra pessoa);
 *  - pendente sem senha de OUTRO navegador, recente → 'busy' (não deixa um
 *    terceiro trocar a chave no meio do pagamento de alguém);
 *  - resto → 'ok' (upsert do pendente). */
export function emailSignupDecision(s: {
  hasAccount: boolean;
  paidEmail: boolean;
  pending: { setup: boolean; sameKey: boolean; ageSec: number } | null;
}): EmailSignupDecision {
  if (s.hasAccount || s.paidEmail) return 'login';
  const p = s.pending;
  if (p && p.setup && !p.sameKey && p.ageSec < SETUP_LOCK_SEC) return 'busy';
  return 'ok';
}
