// CRM financeiro (admin): mede as contas vitalícias POR MÉTODO DE PAGAMENTO
// (cartão/Stripe · Pix · concedido) e contabiliza as compras de coins do Ultimate
// (pedidos, receita, coins vendidos, por método, por pacote, recentes, tendência).
// Protegido pela senha de admin — mesmo padrão do AccountsCRM.
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { adminPassword } from './AdminGate';
import { AdminNav } from './AdminNav';
import { ct } from '../state/career-i18n';
import { getFinance, type FinanceData } from '../state/adminAccounts';

const money = (cents: number) => {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100); }
  catch { return `R$ ${(cents / 100).toFixed(2)}`; }
};
const num = (n: number) => n.toLocaleString('pt-BR');
const fmtDay = (v: string) => { try { return new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch { return v; } };
const fmtWhen = (v: string) => { try { return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };

const METHOD_LABEL: Record<string, string> = { stripe: 'Cartão (Stripe)', pix: 'Pix', admin: 'Concedido (admin)', desconhecido: 'Não identificado' };
const methodLabel = (m: string) => ct(METHOD_LABEL[m] ?? m);
const methodTone = (m: string) => (m === 'stripe' ? '#635bff' : m === 'pix' ? '#16a34a' : m === 'admin' ? '#caa53a' : '#8a99ab');
const TIER_LABEL: Record<string, string> = { p10: 'Arsenal', p15: 'Elite', p30: 'Lendário' };
const tierLabel = (t: string) => TIER_LABEL[t] ?? t;

function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: 'gold' | 'green' | 'blue' }) {
  return <div className={`acc-stat${tone ? ` ${tone}` : ''}`}><span className="cs-val">{value}</span><span className="cs-lbl">{label}</span></div>;
}

interface BarRow { key: string; label: string; value: number; tone: string; sub: string; }
function MethodBars({ rows, total }: { rows: BarRow[]; total: number }) {
  if (rows.length === 0) return <div className="muted small" style={{ padding: '6px 0' }}>{ct('Sem dados ainda.')}</div>;
  const max = Math.max(1, ...rows.map((r) => r.value), total);
  return (
    <div className="crm-bars">
      {rows.map((r) => (
        <div key={r.key} className="crm-bar-row">
          <span className="crm-bar-label">{r.label}</span>
          <div className="crm-bar-track"><div className="crm-bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.tone }} /></div>
          <span className="crm-bar-sub">{r.sub}</span>
        </div>
      ))}
    </div>
  );
}

export function PaymentsCRM({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(''); setBusy(true);
    const r = await getFinance(adminPassword());
    setBusy(false);
    if (r) setData(r);
    else setErr(ct('Não foi possível carregar (login de admin necessário; só funciona no site publicado).'));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const life = data?.lifetime;
  const coins = data?.coins;
  const totalRevenue = (life?.revenueCents ?? 0) + (coins?.revenueCents ?? 0);
  const trendMax = Math.max(1, ...(coins?.trend ?? []).map((p) => p.cents));

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          💰 {ct('Financeiro — vitalícias & coins')}
          <span className="spacer" />
          <button className="btn ghost" onClick={() => void load()} disabled={busy}>{busy ? ct('Atualizando…') : '↻ ' + ct('Atualizar')}</button>
          <button className="btn" onClick={onExit}>← {ct('Voltar')}</button>
        </div>
        <div className="panel-body">
          <AdminNav current="/admin/financeiro" />
          {err && <div className="crm-save-msg err">{err}</div>}
          {!data ? (
            <div className="muted" style={{ padding: 16 }}>{busy ? ct('Carregando…') : err || ct('Sem dados.')}</div>
          ) : (
            <>
              {/* receita total */}
              <div className="acc-stats">
                <Stat value={money(totalRevenue)} label={ct('Receita total (bruta)')} tone="gold" />
                <Stat value={money(life?.revenueCents ?? 0)} label={ct('Contas vitalícias')} tone="green" />
                <Stat value={money(coins?.revenueCents ?? 0)} label={ct('Coins do Ultimate')} tone="blue" />
                <Stat value={num(life?.paid ?? 0)} label={ct('Contas pagas')} />
                <Stat value={num(coins?.buyers ?? 0)} label={ct('Compradores de coins')} />
              </div>

              {/* vitalícias por método */}
              <h3 className="crm-fin-sub">{ct('Contas vitalícias por método de pagamento')}</h3>
              <MethodBars
                total={life?.paid ?? 0}
                rows={(life?.byMethod ?? []).map((r) => ({ key: r.method, label: methodLabel(r.method), value: r.n, tone: methodTone(r.method), sub: `${num(r.n)} ${ct('contas')}` }))}
              />

              {/* coins: resumo */}
              <h3 className="crm-fin-sub">{ct('Compras de coins (Ultimate)')}</h3>
              <div className="acc-stats">
                <Stat value={num(coins?.paidOrders ?? 0)} label={ct('Pedidos pagos')} />
                <Stat value={num(coins?.coinsSold ?? 0)} label={ct('Coins vendidos')} />
                <Stat value={money(coins?.revenueCents ?? 0)} label={ct('Receita de coins')} />
                <Stat value={num(coins?.pendingOrders ?? 0)} label={ct('Pedidos pendentes')} />
              </div>

              {/* coins por método + por pacote */}
              <div className="crm-2col">
                <div>
                  <h4 className="crm-fin-sub s2">{ct('Coins por método')}</h4>
                  <MethodBars
                    total={coins?.revenueCents ?? 0}
                    rows={(coins?.byMethod ?? []).map((r) => ({ key: r.method, label: methodLabel(r.method), value: r.cents, tone: methodTone(r.method), sub: `${money(r.cents)} · ${num(r.orders)} ${ct('pedidos')}` }))}
                  />
                </div>
                <div>
                  <h4 className="crm-fin-sub s2">{ct('Coins por pacote')}</h4>
                  <MethodBars
                    total={coins?.revenueCents ?? 0}
                    rows={(coins?.byTier ?? []).map((r) => ({ key: r.tier, label: tierLabel(r.tier), value: r.cents, tone: '#caa53a', sub: `${money(r.cents)} · ${num(r.orders)} ${ct('pedidos')}` }))}
                  />
                </div>
              </div>

              {/* tendência de receita de coins (30 dias) */}
              <h4 className="crm-fin-sub s2">{ct('Receita de coins — últimos 30 dias')}</h4>
              {(coins?.trend ?? []).some((p) => p.cents > 0) ? (
                <div className="acc-trend">
                  {(coins?.trend ?? []).map((p) => (
                    <div key={p.day} className="acc-trend-col" title={`${fmtDay(p.day)}: ${money(p.cents)} · ${num(p.orders)} ${ct('pedidos')}`}>
                      <div className="acc-trend-bar acc-trend-bar-sale" style={{ height: `${(p.cents / trendMax) * 100}%` }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="acc-trend"><span className="acc-trend-empty">{ct('Sem compras de coins nos últimos 30 dias.')}</span></div>
              )}

              {/* pedidos recentes */}
              <h4 className="crm-fin-sub s2">{ct('Compras de coins recentes')}</h4>
              <table className="acc-table">
                <thead><tr><th>{ct('Quando')}</th><th>{ct('E-mail')}</th><th>{ct('Pacote')}</th><th>{ct('Coins')}</th><th>{ct('Valor')}</th><th>{ct('Método')}</th></tr></thead>
                <tbody>
                  {(coins?.recent ?? []).map((o, i) => (
                    <tr key={i}>
                      <td>{fmtWhen(o.at)}</td>
                      <td><span className="crm-fin-email" title={o.email}>{o.email}</span></td>
                      <td>{tierLabel(o.tier)}</td>
                      <td>{num(o.coins)}</td>
                      <td>{money(o.cents)}</td>
                      <td><b style={{ color: methodTone(o.method) }}>{methodLabel(o.method)}</b></td>
                    </tr>
                  ))}
                  {(coins?.recent ?? []).length === 0 && (
                    <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 16 }}>{ct('Nenhuma compra de coins ainda.')}</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
