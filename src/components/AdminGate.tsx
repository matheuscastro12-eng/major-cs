import { useEffect, useState, type ReactNode } from 'react';
import { fetchAdminKey, type Account } from '../state/account';

const KEY = 'major-admin-unlocked-v1';
const PASS_KEY = 'major-admin-key-v1';

export function isAdminUnlocked(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

// Chave do CRM usada pelos endpoints de admin já existentes (enviada como body.password).
// Agora é preenchida AUTOMATICAMENTE pela conta admin (via fetchAdminKey), não digitada.
export function adminPassword(): string {
  try { return localStorage.getItem(PASS_KEY) ?? ''; } catch { return ''; }
}

export function lockAdmin(): void {
  try { localStorage.removeItem(KEY); localStorage.removeItem(PASS_KEY); } catch { /* sem storage */ }
}

// Acesso ao CRM é por CONTA (account.admin) — não mais por senha/rota secreta. Conta
// admin destrava sozinha (troca o token pela chave do CRM). Não-admin vê "acesso
// restrito". Em dev local (sem backend) libera pra poder testar a UI do CRM.
export function AdminGate({
  account,
  ready = true,
  onExit,
  children,
}: {
  account?: Account | null;
  ready?: boolean;
  onExit?: () => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<'checking' | 'ok' | 'denied'>(() => (isAdminUnlocked() ? 'ok' : 'checking'));

  useEffect(() => {
    if (!ready) { setState((s) => (s === 'ok' ? 'ok' : 'checking')); return; }
    let on = true;
    const isDev = import.meta.env.DEV || location.hostname === 'localhost';
    if (account?.admin) {
      void fetchAdminKey().then((key) => {
        if (!on) return;
        if (key) {
          try { localStorage.setItem(KEY, '1'); localStorage.setItem(PASS_KEY, key); } catch { /* sem storage */ }
          setState('ok');
        } else if (isDev) {
          try { localStorage.setItem(KEY, '1'); localStorage.setItem(PASS_KEY, 'dev'); } catch { /* sem storage */ }
          setState('ok');
        } else setState('denied');
      });
    } else if (isDev && !account) {
      // dev local sem /api: /me falha → sem conta. Libera pra testar a UI do CRM.
      try { localStorage.setItem(KEY, '1'); localStorage.setItem(PASS_KEY, 'dev'); } catch { /* sem storage */ }
      setState('ok');
    } else {
      lockAdmin();
      setState('denied');
    }
    return () => { on = false; };
  }, [account, ready]);

  if (state === 'ok') return <>{children}</>;

  if (state === 'checking') {
    return <div className="fade-in muted" style={{ padding: 60, textAlign: 'center' }}>Verificando acesso…</div>;
  }

  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 460, margin: '60px auto' }}>
        <div className="panel-head">🔒 Área administrativa</div>
        <div className="panel-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Esta área é exclusiva de contas administradoras. A sua conta não tem esse acesso.
          </p>
          {onExit && (
            <button className="btn" onClick={onExit} style={{ marginTop: 14 }}>← Voltar</button>
          )}
        </div>
      </div>
    </div>
  );
}
