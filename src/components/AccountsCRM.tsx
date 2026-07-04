// CRM de contas pagas (admin): lista contas, concede/remove o acesso vitalício e
// consulta o pagamento real no Stripe por e-mail. Protegido pela senha de admin.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { adminPassword } from './AdminGate';
import { AdminNav } from './AdminNav';
import { ct } from '../state/career-i18n';
import {
  listAccounts, grantAccess, revokeAccess, lookupStripe, setUserPassword, getRankingIntegrity,
  type AccountsList, type AdminAccount, type StripeLookup, type TrendPoint, type IntegrityData,
} from '../state/adminAccounts';

const fmtDate = (v: string) => { try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return '—'; } };
const fmtDay = (v: string) => { try { return new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch { return v; } };
const fmtMoney = (cents?: number | null, currency?: string | null) => {
  if (cents == null) return '—';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: (currency || 'brl').toUpperCase() }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency ?? ''}`; }
};

type SortKey = 'email' | 'created_at' | 'status';
type SortDir = 'asc' | 'desc';

function StatCard({ value, label, tone, children }: { value: ReactNode; label: string; tone?: 'gold' | 'green' | 'blue'; children?: ReactNode }) {
  return (
    <div className={`acc-stat${tone ? ` ${tone}` : ''}`}>
      <span className="cs-val">{value}</span>
      <span className="cs-lbl">{label}</span>
      {children}
    </div>
  );
}

// barra de progresso fundadores/limite (a Edição Fundador é numerada e tem teto)
function FoundersProgress({ total, limit }: { total: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((total / limit) * 100)) : 0;
  return <div className="acc-progress" title={`${total}/${limit} (${pct}%)`}><div className="acc-progress-fill" style={{ width: `${pct}%` }} /></div>;
}

// tendência dos últimos 30 dias (cadastros x vendas): barras CSS puras, sem lib de gráfico
function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <div className="acc-trend"><span className="acc-trend-empty">{ct('Sem dados de tendência ainda.')}</span></div>;
  const max = Math.max(1, ...data.flatMap((p) => [p.signups, p.sales]));
  return (
    <div className="acc-trend">
      {data.map((p) => (
        <div key={p.day} className="acc-trend-col" title={`${fmtDay(p.day)}: +${p.signups} ${ct('contas')} · +${p.sales} ${ct('vendas')}`}>
          <div className="acc-trend-bar acc-trend-bar-signup" style={{ height: `${(p.signups / max) * 100}%` }} />
          <div className="acc-trend-bar acc-trend-bar-sale" style={{ height: `${(p.sales / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

function SortableTh({ label, sortKey, active, dir, onSort }: { label: string; sortKey: SortKey; active: boolean; dir: SortDir; onSort: (k: SortKey) => void }) {
  return <th className="sortable" onClick={() => onSort(sortKey)}>{label}{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>;
}

const fmtWhen = (v: string) => { try { return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };
const STATUS_LABEL: Record<string, string> = { pending: 'Pendentes', applied: 'Aplicadas', 'applied-solo': 'Aplicadas (solo)', conflict: 'Em conflito' };

// ── Integridade do ranking PvP: conflitos de report (fraude/bug) e reports órfãos ──
// `conflict` = os dois jogadores reclamaram o MESMO resultado; a partida não conta.
// Reincidência é o sinal forte de fraude — por isso a lista de reincidentes.
function RankingIntegrity({ data }: { data: IntegrityData | null }) {
  if (!data) return <div className="muted small" style={{ padding: '6px 0' }}>{ct('Carregando integridade do ranking…')}</div>;
  const statusOf = (s: string) => data.byStatus.find((r) => r.status === s);
  const conflictPct = data.matches.total > 0 ? Math.round((data.matches.conflicts / data.matches.total) * 100) : 0;
  const reportLabel = (won: boolean) => (won ? ct('reportou VITÓRIA') : ct('reportou derrota'));
  return (
    <>
      <div className="acc-stats">
        <StatCard value={data.matches.conflicts7} label={ct('Conflitos 7d')} />
        <StatCard value={`${conflictPct}%`} label={ct('Partidas em conflito')} />
        <StatCard value={data.stalePending} label={ct('Pendentes >1h (órfãos)')} />
        <StatCard tone="blue" value={data.matches.total} label={ct('Partidas reportadas')} />
        <StatCard tone="green" value={(statusOf('applied')?.total ?? 0) + (statusOf('applied-solo')?.total ?? 0)} label={ct('Reports aplicados')} />
      </div>

      {/* reports por status (7 dias x total) */}
      <div className="crm-bars">
        {data.byStatus.map((r) => (
          <div key={r.status} className="crm-bar-row">
            <span className="crm-bar-label">{ct(STATUS_LABEL[r.status] ?? r.status)}</span>
            <div className="crm-bar-track">
              <div className="crm-bar-fill" style={{ width: `${(r.total / Math.max(1, ...data.byStatus.map((x) => x.total))) * 100}%`, background: r.status === 'conflict' ? '#dc2626' : r.status === 'pending' ? '#caa53a' : '#16a34a' }} />
            </div>
            <span className="crm-bar-sub">{r.total} {ct('total')} · {r.last7} {ct('em 7d')}</span>
          </div>
        ))}
        {data.byStatus.length === 0 && <div className="muted small" style={{ padding: '6px 0' }}>{ct('Nenhum report de partida ainda.')}</div>}
      </div>

      {/* últimas partidas em conflito: quem reportou o quê */}
      <div className="muted small section-label" style={{ marginTop: 14, marginBottom: 6 }}>{ct('Partidas em conflito recentes')} ({data.conflicts.length})</div>
      {data.conflicts.length === 0 ? (
        <div className="muted small" style={{ marginBottom: 8 }}>{ct('Nenhum conflito de report — ranking saudável.')}</div>
      ) : (
        <table className="acc-table">
          <thead><tr><th>{ct('Quando')}</th><th>{ct('Sala')}</th><th>{ct('Jogador A')}</th><th>{ct('Jogador B')}</th></tr></thead>
          <tbody>
            {data.conflicts.map((c) => (
              <tr key={c.code}>
                <td style={{ color: 'var(--rtm-dim)' }}>{fmtWhen(c.at)}</td>
                <td><code>{c.code}</code></td>
                {c.reports.slice(0, 2).map((r, i) => (
                  <td key={i}>
                    <b style={{ color: 'var(--rtm-text-strong)' }}>{r.nick}</b>
                    <span className="muted small" title={r.email}> · {r.email}</span>
                    <div className={r.won ? 'neg small' : 'muted small'}>{reportLabel(r.won)}</div>
                  </td>
                ))}
                {c.reports.length < 2 && <td className="muted small">{ct('report do oponente ausente')}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* reincidentes: jogadores com mais conflitos */}
      {data.offenders.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="muted small section-label" style={{ marginBottom: 6 }}>{ct('Reincidentes (mais conflitos)')}</div>
          <table className="acc-table">
            <thead><tr><th>{ct('Jogador')}</th><th>{ct('Conflitos')}</th><th>{ct('Aplicadas')}</th><th>{ct('Último conflito')}</th></tr></thead>
            <tbody>
              {data.offenders.map((o) => (
                <tr key={o.email}>
                  <td><b style={{ color: 'var(--rtm-text-strong)' }}>{o.nick}</b><span className="muted small" title={o.email}> · {o.email}</span></td>
                  <td className={o.conflicts >= 3 ? 'neg' : undefined} style={{ textAlign: 'center', fontWeight: 700 }}>{o.conflicts}</td>
                  <td style={{ textAlign: 'center' }}>{o.applied}</td>
                  <td style={{ color: 'var(--rtm-dim)' }}>{o.lastConflict ? fmtWhen(o.lastConflict) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function AccountsCRM({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<AccountsList | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [grantEmail, setGrantEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [stripe, setStripe] = useState<Record<string, StripeLookup | 'loading'>>({});
  const [filter, setFilter] = useState<'all' | 'paid' | 'free'>('all');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [integrity, setIntegrity] = useState<IntegrityData | null>(null);

  const rows = (data?.accounts ?? []).filter((a) => filter === 'all' || (filter === 'paid' ? a.paid : !a.paid));
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    const rank = (a: AdminAccount) => (a.isFounder ? 2 : a.paid ? 1 : 0);
    return [...rows].sort((a, b) => {
      if (sortKey === 'email') return a.email.localeCompare(b.email) * dir;
      if (sortKey === 'created_at') return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      return (rank(a) - rank(b)) * dir;
    });
  }, [rows, sortKey, sortDir]);
  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  const conv = data && data.total ? Math.round((data.paidTotal / data.total) * 100) : 0;
  const refPct = data && data.total ? Math.round(((data.withRefTotal ?? 0) / data.total) * 100) : 0;
  const revenue = (data?.paidTotal ?? 0) * 20; // conta vitalícia = R$20

  const load = useCallback(async (q = '') => {
    setErr('');
    // integridade do ranking carrega em paralelo, sem travar a lista de contas
    void getRankingIntegrity(adminPassword()).then((i) => { if (i) setIntegrity(i); });
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
      <div className="panel" style={{ maxWidth: 1080, margin: '24px auto' }}>
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
          {data === null && !err && <div className="muted">{ct('Carregando…')}</div>}

          {data && (
            <>
              {/* visão geral: métricas principais da base de contas */}
              <div className="acc-stats">
                <StatCard value={data.total} label={ct('Contas')} />
                <StatCard tone="gold" value={data.paidTotal} label={ct('Vitalícias')} />
                <StatCard tone="gold" value={`${data.foundersTotal ?? 0}${data.founderLimit ? `/${data.founderLimit}` : ''}`} label={ct('Fundadores')}>
                  {data.founderLimit ? <FoundersProgress total={data.foundersTotal ?? 0} limit={data.founderLimit} /> : null}
                </StatCard>
                <StatCard tone="green" value={`R$ ${revenue.toLocaleString('pt-BR')}`} label={ct('Receita')} />
                <StatCard value={`${conv}%`} label={ct('Conversão')} />
                <StatCard tone="blue" value={`${refPct}%`} label={ct('Vinculadas ao Stripe')} />
                <StatCard value={`+${data.new7 ?? 0}`} label={ct('Novas 7d')} />
                <StatCard value={`+${data.new30 ?? 0}`} label={ct('Novas 30d')} />
                <StatCard tone="blue" value={data.paid30 ?? 0} label={ct('Vendas 30d')} />
                <StatCard value={data.orphanTotal ?? data.orphanPaid.length} label={ct('Pagas s/ conta')} />
              </div>

              {/* tendência: cadastros e vendas dos últimos 30 dias */}
              <div className="muted small section-label" style={{ marginTop: 0 }}>{ct('Tendência (30 dias)')}</div>
              <div className="acc-trend-legend">
                <span className="sig"><i />{ct('Cadastros/dia')}</span>
                <span className="sal"><i />{ct('Vendas/dia')}</span>
              </div>
              <TrendChart data={data.trend ?? []} />

              {/* conceder acesso manual */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
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

              {/* busca + filtros */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  placeholder={ct('buscar por e-mail ou nick…')}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); }}
                  onKeyDown={(e) => e.key === 'Enter' && load(query)}
                  onBlur={() => load(query)}
                  style={{ flex: 1, minWidth: 200 }}
                />
                <div className="acc-filters">
                  {([['all', ct('Todas')], ['paid', ct('Vitalícias')], ['free', ct('Grátis')]] as const).map(([f, lbl]) => (
                    <button key={f} className={`acc-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{lbl}</button>
                  ))}
                </div>
              </div>

              <table className="acc-table">
                <thead><tr>
                  <SortableTh label={ct('Conta')} sortKey="email" active={sortKey === 'email'} dir={sortDir} onSort={onSort} />
                  <SortableTh label={ct('Cadastro')} sortKey="created_at" active={sortKey === 'created_at'} dir={sortDir} onSort={onSort} />
                  <SortableTh label={ct('Status')} sortKey="status" active={sortKey === 'status'} dir={sortDir} onSort={onSort} />
                  <th>{ct('Stripe')}</th>
                  <th>{ct('Ação')}</th>
                </tr></thead>
                <tbody>
                  {sortedRows.map((a) => (
                    <tr key={a.email}>
                      <td>
                        <b style={{ color: 'var(--rtm-text-strong)' }}>{a.email}</b>
                        {a.nick && <span className="muted small"> · {a.nick}</span>}
                        <span className={`acc-ref-dot${a.hasRef ? ' on' : ''}`} title={a.hasRef ? ct('Vinculado a um pagamento Stripe') : ct('Sem referência Stripe (conta manual ou pagamento ainda não vinculado)')} />
                      </td>
                      <td style={{ color: 'var(--rtm-dim)' }}>{fmtDate(a.created_at)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {a.paid
                          ? <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#06121d', background: 'var(--rtm-gold)', padding: '2px 8px', borderRadius: 999 }}>★ {ct('Vitalícia')}</span>
                              {a.isFounder && <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-gold)', border: '1px solid var(--rtm-gold)', padding: '1px 7px', borderRadius: 999 }}>{ct('Fundador')}{a.founderNo != null ? ` #${String(a.founderNo).padStart(3, '0')}` : ''}</span>}
                            </div>
                          : <span className="muted small">{ct('Grátis')}</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}><StripeCell email={a.email} /></td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                          {a.paid
                            ? <button className="btn danger small" disabled={busy} onClick={() => doRevoke(a.email)}>✕ {ct('Remover')}</button>
                            : <button className="btn gold small" disabled={busy} onClick={() => doGrant(a.email)}>★ {ct('Conceder')}</button>}
                          <button className="btn ghost small" disabled={busy} title={ct('Resetar a senha deste usuário')} onClick={() => doSetPassword(a.email)}>🔑 {ct('Senha')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedRows.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>{ct('Nenhuma conta encontrada.')}</td></tr>}
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

              {/* integridade do ranking PvP: conflitos de report e reports órfãos */}
              <h3 className="crm-fin-sub">🛡 {ct('Integridade do ranking (PvP)')}</h3>
              <div className="muted small" style={{ marginBottom: 10 }}>{ct('Conflito = os dois jogadores reclamaram o mesmo resultado (fraude ou bug); a partida não conta no MMR.')}</div>
              <RankingIntegrity data={integrity} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
