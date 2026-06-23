// CRM de contas pagas (admin): lista contas, concede/remove o acesso vitalício e
// consulta o pagamento real no Stripe por e-mail. Protegido pela senha de admin.
import { useCallback, useEffect, useState } from 'react';
import { adminPassword } from './AdminGate';
import { AdminNav } from './AdminNav';
import { ct } from '../state/career-i18n';
import {
  listAccounts, grantAccess, revokeAccess, lookupStripe, setUserPassword,
  type AccountsList, type StripeLookup,
} from '../state/adminAccounts';

const fmtDate = (v: string) => { try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return '—'; } };
const fmtMoney = (cents?: number | null, currency?: string | null) => {
  if (cents == null) return '—';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: (currency || 'brl').toUpperCase() }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency ?? ''}`; }
};

export function AccountsCRM({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<AccountsList | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [grantEmail, setGrantEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [stripe, setStripe] = useState<Record<string, StripeLookup | 'loading'>>({});

  const load = useCallback(async (q = '') => {
    setErr('');
    const r = await listAccounts(adminPassword(), q);
    if (r) setData(r);
    else setErr(ct('Não foi possível carregar (login de admin necessário; só funciona no site publicado).'));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const doGrant = async (email: string) => {
    if (!email.trim()) return;
    setBusy(true); setMsg('');
    const ok = await grantAccess(adminPassword(), email.trim());
    setMsg(ok ? `✓ ${ct('Acesso vitalício concedido a')} ${email.trim()}.` : ct('Falhou ao conceder.'));
    setGrantEmail('');
    await load(query);
    setBusy(false);
  };
  const doRevoke = async (email: string) => {
    if (!confirm(`${ct('Remover o acesso vitalício de')} ${email}? ${ct('A conta volta a ser grátis.')}`)) return;
    setBusy(true); setMsg('');
    const ok = await revokeAccess(adminPassword(), email);
    setMsg(ok ? `✓ ${ct('Acesso removido de')} ${email}.` : ct('Falhou ao remover.'));
    await load(query);
    setBusy(false);
  };
  // reset de senha (suporte: pagou e esqueceu a senha). O admin digita a nova
  // senha; o servidor hasheia (scrypt) e grava. Nunca guarda em texto puro.
  const doSetPassword = async (email: string) => {
    const np = window.prompt(`${ct('Nova senha para')} ${email} ${ct('(mínimo 6 caracteres). Passe essa senha ao jogador e peça pra ele trocar depois.')}`);
    if (np == null) return;
    if (np.trim().length < 6) { setMsg(ct('Senha muito curta (mínimo 6).')); return; }
    setBusy(true); setMsg('');
    const r = await setUserPassword(adminPassword(), email, np.trim());
    setMsg(r.ok && r.applied ? `✓ ${ct('Senha redefinida para')} ${email}.`
      : r.ok ? `⚠ ${ct('E-mail sem conta criada ainda (atualizado no cadastro pendente).')}`
      : `${ct('Falhou:')} ${r.error ?? ''}`);
    setBusy(false);
  };
  const checkStripe = async (email: string) => {
    setStripe((s) => ({ ...s, [email]: 'loading' }));
    const r = await lookupStripe(adminPassword(), email);
    setStripe((s) => ({ ...s, [email]: r }));
  };

  const StripeCell = ({ email }: { email: string }) => {
    const info = stripe[email];
    if (!info) return <button className="btn ghost small" disabled={busy} onClick={() => checkStripe(email)}>{ct('Ver Stripe')}</button>;
    if (info === 'loading') return <span className="muted small">{ct('consultando…')}</span>;
    if (info.error) return <span className="neg small" title={info.error}>{ct('erro')}</span>;
    if (!info.found) return <span className="muted small">{ct('sem pagamento')}</span>;
    return <span className="pos small" title={info.sessionId}>✓ {fmtMoney(info.amount, info.currency)}{info.created ? ` · ${fmtDate(new Date(info.created * 1000).toISOString())}` : ''}</span>;
  };

  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 920, margin: '24px auto' }}>
        <div className="panel-head">
          {ct('Contas pagas')}
          <span className="spacer" />
          <button className="btn ghost" onClick={() => load(query)} disabled={busy}>↻ {ct('Atualizar')}</button>
          <button className="btn" onClick={onExit}>← {ct('Sair')}</button>
        </div>
        <div className="panel-body">
          <AdminNav current="/admin/acessos" />

          {err && <div className="neg small" style={{ marginBottom: 10 }}>{err}</div>}
          {msg && <div className="pos small" style={{ marginBottom: 10 }}>{msg}</div>}

          {data && (
            <div className="muted small" style={{ marginBottom: 14 }}>
              <b style={{ color: 'var(--rtm-text-strong)' }}>{data.total}</b> {ct('contas')} · <b style={{ color: 'var(--rtm-gold)' }}>{data.paidTotal}</b> {ct('vitalícias')}
            </div>
          )}

          {/* conceder acesso manual */}
          <div className="form-row" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              type="email"
              placeholder={ct('e-mail pra conceder acesso vitalício')}
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doGrant(grantEmail)}
              style={{ flex: 1, minWidth: 240, background: 'var(--rtm-bg-deep)', border: '1px solid var(--rtm-border-soft)', borderRadius: 'var(--rtm-radius)', color: 'var(--rtm-text)', padding: '9px 12px', fontSize: 14 }}
            />
            <button className="btn gold" disabled={busy || !grantEmail.trim()} onClick={() => doGrant(grantEmail)}>★ {ct('Conceder acesso')}</button>
          </div>

          {/* busca */}
          <div className="field" style={{ marginBottom: 10 }}>
            <input
              placeholder={ct('buscar por e-mail ou nick…')}
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
              onKeyDown={(e) => e.key === 'Enter' && load(query)}
              onBlur={() => load(query)}
            />
          </div>

          {data === null && !err && <div className="muted">{ct('Carregando…')}</div>}

          {data && (
            <>
              <table className="acct-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead><tr>
                  {['Conta', 'Cadastro', 'Status', 'Stripe', 'Ação'].map((h, i) => (
                    <th key={h} style={{ textAlign: i >= 2 ? 'center' : 'left', padding: '8px 10px', color: 'var(--rtm-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--rtm-border-soft)' }}>{ct(h)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {data.accounts.map((a, i) => (
                    <tr key={a.email} style={{ background: i % 2 ? 'var(--rtm-row-b)' : 'var(--rtm-row-a)' }}>
                      <td style={{ padding: '9px 10px' }}><b style={{ color: 'var(--rtm-text-strong)' }}>{a.email}</b>{a.nick && <span className="muted small"> · {a.nick}</span>}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--rtm-dim)' }}>{fmtDate(a.created_at)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                        {a.paid
                          ? <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#06121d', background: 'var(--rtm-gold)', padding: '2px 8px', borderRadius: 999 }}>★ {ct('Vitalícia')}</span>
                          : <span className="muted small">{ct('Grátis')}</span>}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'center' }}><StripeCell email={a.email} /></td>
                      <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                          {a.paid
                            ? <button className="btn danger small" disabled={busy} onClick={() => doRevoke(a.email)}>✕ {ct('Remover')}</button>
                            : <button className="btn gold small" disabled={busy} onClick={() => doGrant(a.email)}>★ {ct('Conceder')}</button>}
                          <button className="btn ghost small" disabled={busy} title={ct('Resetar a senha deste usuário')} onClick={() => doSetPassword(a.email)}>🔑 {ct('Senha')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.accounts.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>{ct('Nenhuma conta encontrada.')}</td></tr>}
                </tbody>
              </table>

              {data.orphanPaid.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="muted small section-label" style={{ marginBottom: 6 }}>{ct('E-mails pagos sem conta ainda')} ({data.orphanPaid.length})</div>
                  <div className="muted small" style={{ marginBottom: 8 }}>{ct('Pagaram mas ainda não criaram a conta — ao se cadastrar com esse e-mail, já entram pagos.')}</div>
                  {data.orphanPaid.map((p) => (
                    <div key={p.email} className="access-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', borderBottom: '1px solid var(--rtm-border-soft)' }}>
                      <span style={{ flex: 1 }}>{p.email}</span>
                      <span className="muted small">{fmtDate(p.created_at)}</span>
                      <StripeCell email={p.email} />
                      <button className="btn danger small" disabled={busy} onClick={() => doRevoke(p.email)}>✕ {ct('Remover')}</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
