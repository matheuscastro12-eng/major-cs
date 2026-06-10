import { useState, type ReactNode } from 'react';

const KEY = 'major-admin-unlocked-v1';

export function isAdminUnlocked(): boolean {
  return localStorage.getItem(KEY) === '1';
}

export function lockAdmin(): void {
  localStorage.removeItem(KEY);
}

// Em produção valida contra /api/admin-login (ADMIN_PASSWORD na Vercel).
// Em desenvolvimento local (sem backend) aceita a senha de desenvolvimento.
async function checkPassword(password: string): Promise<boolean> {
  try {
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 200) return true;
    if (res.status === 401) return false;
  } catch {
    /* backend indisponível (dev local) */
  }
  if (import.meta.env.DEV || location.hostname === 'localhost') {
    return password === 'dev';
  }
  return false;
}

export function AdminGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(isAdminUnlocked());
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (unlocked) return <>{children}</>;

  const submit = async () => {
    if (busy || !password) return;
    setBusy(true);
    setError('');
    const ok = await checkPassword(password);
    setBusy(false);
    if (ok) {
      localStorage.setItem(KEY, '1');
      setUnlocked(true);
    } else {
      setError('Senha incorreta.');
      setPassword('');
    }
  };

  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 440, margin: '60px auto' }}>
        <div className="panel-head">🔒 Área administrativa</div>
        <div className="panel-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            A base de dados só pode ser gerenciada pelo administrador. Digite a senha para continuar.
          </p>
          <div className="field">
            <label>Senha</label>
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          {error && (
            <div className="neg small" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={submit} disabled={busy || !password}>
              {busy ? 'Verificando…' : 'Entrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
