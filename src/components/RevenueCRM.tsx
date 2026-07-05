// CRM de RECEITA unificado (/admin/receita): funde o antigo "Financeiro"
// (PaymentsCRM) e o "Contas pagas" (AccountsCRM) num fluxo só, com três abas:
//   · Receita — resumo do dia/7d/30d/total, vendas POR DIA (Pix × cartão ×
//     produto × visitantes × conversão) e PREVISÃO matemática de receita.
//   · Contas — todas as capacidades do antigo AccountsCRM (busca, conceder/
//     remover vitalícia, resetar senha, consulta Stripe, órfãos, Integridade
//     do ranking PvP).
//   · Pedidos — todas as capacidades do antigo PaymentsCRM (coins/passe por
//     método, por pacote, tendência, pedidos recentes).
// Protegido pela senha de admin; dinheiro chega em CENTAVOS e é formatado
// pt-BR aqui. Gráficos são barras CSS puras (padrão da casa, sem lib).
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { adminPassword } from './AdminGate';
import { AdminNav } from './AdminNav';
import { ct } from '../state/career-i18n';
import {
  getFinance, getRankingIntegrity, getRevenue, grantAccess, listAccounts, lookupStripe, revokeAccess, setUserPassword,
  type AccountsList, type AdminAccount, type FinanceData, type IntegrityData, type RevenueData, type RevenueDay, type StripeLookup, type TrendPoint,
} from '../state/adminAccounts';

// ── formatadores pt-BR ──────────────────────────────────────────────────────
const money = (cents: number) => {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100); }
  catch { return `R$ ${(cents / 100).toFixed(2)}`; }
};
const num = (n: number) => n.toLocaleString('pt-BR');
const pct = (v: number, digits = 1) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`;
const fmtDate = (v: string) => { try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return '—'; } };
// tolerante: aceita "YYYY-MM-DD", ISO completo ou até "Sun Jul 05 2026" (legado
// do String(Date) no servidor) — nunca renderiza "Invalid Date".
const fmtDay = (v: string) => {
  const iso = v.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};
const fmtWhen = (v: string) => { try { return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };
const fmtMoney = (cents?: number | null, currency?: string | null) => {
  if (cents == null) return '—';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: (currency || 'brl').toUpperCase() }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency ?? ''}`; }
};

const METHOD_LABEL: Record<string, string> = { stripe: 'Cartão (Stripe)', pix: 'Pix', admin: 'Concedido (admin)', desconhecido: 'Pix (legado)' };
const methodLabel = (m: string) => ct(METHOD_LABEL[m] ?? m);
const methodTone = (m: string) => (m === 'stripe' ? '#635bff' : m === 'pix' || m === 'desconhecido' ? '#16a34a' : m === 'admin' ? '#caa53a' : '#8a99ab');
const TIER_LABEL: Record<string, string> = { p10: 'Arsenal', p15: 'Elite', p30: 'Lendário' };
const tierLabel = (t: string) => (t.startsWith('pass-') ? `${ct('Passe')} ${t.slice(5).toUpperCase()}` : TIER_LABEL[t] ?? t);

function Stat({ value, label, tone, children }: { value: ReactNode; label: string; tone?: 'gold' | 'green' | 'blue'; children?: ReactNode }) {
  return (
    <div className={`acc-stat${tone ? ` ${tone}` : ''}`}>
      <span className="cs-val">{value}</span>
      <span className="cs-lbl">{label}</span>
      {children}
    </div>
  );
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

// ── derivação por dia: contagens cruas → receita em centavos ────────────────
// Regra de receita da vitalícia: preço fixo (vitPriceCents = R$ 20). Contas
// 'admin' (concedidas) contam como conta mas NÃO geram receita. Método
// 'desconhecido' (legado sem trilha de método) conta como PIX no split —
// decisão do dono (2026-07-05): as vendas legadas sem sessão Stripe foram Pix.
interface DayRow {
  day: string;
  sold: number;        // contas vitalícias VENDIDAS no dia (pix + stripe + desconhecido)
  granted: number;     // concedidas pelo admin (sem receita)
  pixCents: number;    // vitalícia via Pix + pedidos Pix
  stripeCents: number; // vitalícia via cartão + pedidos cartão
  totalCents: number;  // pix + stripe + vitalícias de método desconhecido
  vitCents: number; coinsCents: number; passeCents: number;
  orders: number; visitors: number;
}
function deriveDays(data: RevenueData): DayRow[] {
  const p = data.vitPriceCents;
  return data.days.map((d: RevenueDay) => {
    const vitCents = (d.vitPix + d.vitStripe + d.vitOther) * p;
    // vitOther ('desconhecido') dobra no Pix — ver comentário acima.
    const pixCents = (d.vitPix + d.vitOther) * p + d.ordPixCents;
    const stripeCents = d.vitStripe * p + d.ordStripeCents;
    return {
      day: d.day,
      sold: d.vitPix + d.vitStripe + d.vitOther,
      granted: d.vitAdmin,
      pixCents, stripeCents,
      totalCents: pixCents + stripeCents,
      vitCents, coinsCents: d.coinsCents, passeCents: d.passeCents,
      orders: d.orders, visitors: d.visitors,
    };
  });
}
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const avg = (arr: number[]) => (arr.length ? sum(arr) / arr.length : 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── PREVISÃO: modelo de tração explicável ───────────────────────────────────
// Todas as fórmulas operam sobre os dias COMPLETOS (hoje, parcial, fica fora).
//
// 1) Visitantes: médias móveis v7 (últimos 7d) e v28 (últimos 28d).
// 2) Tendência: g = média(últimos 14d) / média(14d anteriores) − 1, LIMITADA a
//    ±50% por janela de 14 dias (evita explosão com base pequena). Taxa diária
//    composta: r = (1+g)^(1/14) − 1.
// 3) σ da tendência: desvio-padrão dos crescimentos janela-a-janela (janelas
//    de 14d dentro dos 60d). Sem histórico suficiente, assume 15% (incerteza
//    padrão de produto novo).
// 4) Conversão: contas vendidas 28d ÷ Σ visitantes únicos diários 28d (conv7
//    idem, pra ver o desvio recente). Caveat: Σ de únicos-por-dia conta o
//    mesmo visitante em dias diferentes — a conversão real por PESSOA é ≥ essa.
// 5) ARPU por conta nova: receita TOTAL 28d ÷ contas vendidas 28d — já embute
//    o attach de coins+passe por conta.
// 6) Projeção de H dias: Σ_{d=1..H} v28·(1+r)^d × conversão × ARPU.
//    · conservador: r = 0 (sem crescimento, só as médias de 28d)
//    · base:        r = tendência atual
//    · otimista:    r derivado de (g + 1σ), com o mesmo teto de ±50%/janela
export interface Forecast {
  v7: number; v28: number; g14: number; sigma: number;
  conv28: number; conv7: number; arpuCents: number;
  scenarios: { key: 'conservador' | 'base' | 'otimista'; label: string; g: number; horizons: { days: number; cents: number }[] }[];
  enough: boolean; // dados suficientes pra projetar? (precisa de visitantes e vendas em 28d)
}
export function computeForecast(all: DayRow[]): Forecast {
  const hist = all.slice(0, -1); // descarta hoje (dia parcial distorce média pra baixo)
  const vis = hist.map((d) => d.visitors);
  const v7 = avg(vis.slice(-7));
  const v28 = avg(vis.slice(-28));
  const prev14 = avg(vis.slice(-28, -14));
  const last14 = avg(vis.slice(-14));
  const g14 = prev14 > 0 ? clamp(last14 / prev14 - 1, -0.5, 0.5) : 0;
  // σ: crescimento entre janelas consecutivas de 14d ao longo do histórico
  const growths: number[] = [];
  for (let end = vis.length; end - 28 >= 0; end -= 14) {
    const a = avg(vis.slice(end - 28, end - 14));
    const b = avg(vis.slice(end - 14, end));
    if (a > 0) growths.push(clamp(b / a - 1, -0.5, 0.5));
  }
  const sigma = growths.length >= 2
    ? Math.sqrt(avg(growths.map((x) => (x - avg(growths)) ** 2)))
    : 0.15; // incerteza padrão sem histórico (produto novo)
  const sold28 = sum(hist.slice(-28).map((d) => d.sold));
  const vis28 = sum(vis.slice(-28));
  const vis7 = sum(vis.slice(-7));
  const sold7 = sum(hist.slice(-7).map((d) => d.sold));
  const conv28 = vis28 > 0 ? sold28 / vis28 : 0;
  const conv7 = vis7 > 0 ? sold7 / vis7 : 0;
  const rev28 = sum(hist.slice(-28).map((d) => d.totalCents));
  const arpuCents = sold28 > 0 ? rev28 / sold28 : 0;
  const project = (g: number, horizon: number) => {
    const r = Math.pow(1 + g, 1 / 14) - 1; // taxa diária composta da janela de 14d
    let v = v28, total = 0;
    for (let d = 1; d <= horizon; d++) { v *= 1 + r; total += v * conv28 * arpuCents; }
    return Math.round(total);
  };
  const mk = (key: Forecast['scenarios'][number]['key'], label: string, g: number) => ({
    key, label, g, horizons: [7, 30, 90].map((days) => ({ days, cents: project(g, days) })),
  });
  return {
    v7, v28, g14, sigma, conv28, conv7, arpuCents,
    scenarios: [
      mk('conservador', ct('Conservador'), 0),
      mk('base', ct('Base'), g14),
      mk('otimista', ct('Otimista'), clamp(g14 + sigma, -0.5, 0.5)),
    ],
    enough: v28 > 0 && sold28 > 0,
  };
}

// ── barra proporcional embutida em célula de tabela ─────────────────────────
function CellBar({ value, max, tone }: { value: number; max: number; tone?: string }) {
  return <div className="rev-cellbar"><i style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: tone }} /></div>;
}

// ═════════ ABA RECEITA: resumo · por dia · previsão ═════════════════════════
function RevenueSection({ data }: { data: RevenueData }) {
  const days = useMemo(() => deriveDays(data), [data]);
  const forecast = useMemo(() => computeForecast(days), [days]);
  const today = days[days.length - 1];
  const win = (n: number, f: (d: DayRow) => number) => sum(days.slice(-n).map(f));
  // all-time: série de 60d + agregados históricos da API
  const p = data.vitPriceCents;
  const vitAllSold = data.allTime.vitByMethod.filter((m) => m.method !== 'admin').reduce((a, m) => a + m.n, 0);
  const allTimeCents = vitAllSold * p + data.allTime.orders.reduce((a, o) => a + o.cents, 0);
  // 'desconhecido' dobra no Pix também no all-time (mesma regra do por-dia).
  const allPix = data.allTime.vitByMethod
    .filter((m) => m.method === 'pix' || m.method === 'desconhecido')
    .reduce((a, m) => a + m.n, 0) * p
    + data.allTime.orders.filter((o) => o.method === 'pix').reduce((a, o) => a + o.cents, 0);
  const allStripe = (data.allTime.vitByMethod.find((m) => m.method === 'stripe')?.n ?? 0) * p
    + data.allTime.orders.filter((o) => o.method !== 'pix').reduce((a, o) => a + o.cents, 0);
  const rows30 = days.slice(-30).slice().reverse();
  const max30 = Math.max(1, ...rows30.map((d) => d.totalCents));
  const maxVis30 = Math.max(1, ...rows30.map((d) => d.visitors));
  return (
    <>
      {/* HOJE / RESUMO */}
      <h3 className="crm-fin-sub" style={{ marginTop: 0 }}>{ct('Hoje & resumo')}</h3>
      <div className="acc-stats">
        <Stat tone="gold" value={num(today?.sold ?? 0)} label={ct('Vendas hoje')} />
        <Stat tone="green" value={money(today?.totalCents ?? 0)} label={ct('Receita hoje')} />
        <Stat value={money(today?.pixCents ?? 0)} label={ct('Pix hoje')} />
        <Stat value={money(today?.stripeCents ?? 0)} label={ct('Cartão hoje')} />
        <Stat value={money(win(7, (d) => d.totalCents))} label={ct('Receita 7d')} />
        <Stat value={money(win(30, (d) => d.totalCents))} label={ct('Receita 30d')} />
        <Stat tone="gold" value={money(allTimeCents)} label={ct('Receita total')} />
      </div>
      <div className="crm-2col">
        <div>
          <h4 className="crm-fin-sub s2">{ct('Split por método — 30 dias')}</h4>
          <MethodBars total={win(30, (d) => d.totalCents)} rows={[
            { key: 'pix', label: methodLabel('pix'), value: win(30, (d) => d.pixCents), tone: methodTone('pix'), sub: money(win(30, (d) => d.pixCents)) },
            { key: 'stripe', label: methodLabel('stripe'), value: win(30, (d) => d.stripeCents), tone: methodTone('stripe'), sub: money(win(30, (d) => d.stripeCents)) },
          ]} />
        </div>
        <div>
          <h4 className="crm-fin-sub s2">{ct('Split por método — desde o início')}</h4>
          <MethodBars total={allTimeCents} rows={[
            { key: 'pix', label: methodLabel('pix'), value: allPix, tone: methodTone('pix'), sub: money(allPix) },
            { key: 'stripe', label: methodLabel('stripe'), value: allStripe, tone: methodTone('stripe'), sub: money(allStripe) },
          ]} />
          {allTimeCents > allPix + allStripe && (
            <div className="muted small" style={{ marginTop: 6 }}>
              {money(allTimeCents - allPix - allStripe)} {ct('de vitalícias legadas sem método identificado (antes da trilha de pagamento existir).')}
            </div>
          )}
        </div>
      </div>

      {/* POR DIA */}
      <h3 className="crm-fin-sub">{ct('Por dia — últimos 30 dias')}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="acc-table">
          <thead><tr>
            <th>{ct('Dia')}</th><th>{ct('Contas')}</th><th>{ct('R$ total')}</th><th>{ct('R$ Pix')}</th><th>{ct('R$ cartão')}</th>
            <th>{ct('Vitalícia · coins · passe')}</th><th>{ct('Visitantes')}</th><th>{ct('Conv.')}</th>
          </tr></thead>
          <tbody>
            {rows30.map((d) => (
              <tr key={d.day}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(d.day)}</td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{d.sold > 0 ? d.sold : <span className="muted">0</span>}{d.granted > 0 && <span className="muted small" title={ct('concedidas pelo admin (sem receita)')}> +{d.granted}</span>}</td>
                <td style={{ minWidth: 110 }}>{money(d.totalCents)}<CellBar value={d.totalCents} max={max30} /></td>
                <td style={{ color: methodTone('pix') }}>{d.pixCents > 0 ? money(d.pixCents) : '—'}</td>
                <td style={{ color: methodTone('stripe') }}>{d.stripeCents > 0 ? money(d.stripeCents) : '—'}</td>
                <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{money(d.vitCents)} · {money(d.coinsCents)} · {money(d.passeCents)}</td>
                <td style={{ minWidth: 90 }}>{num(d.visitors)}<CellBar value={d.visitors} max={maxVis30} tone="var(--blue-bright)" /></td>
                <td style={{ textAlign: 'center' }}>{d.visitors > 0 && d.sold > 0 ? pct(d.sold / d.visitors) : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.visitorsAvailable && <div className="muted small" style={{ marginTop: 6 }}>{ct('Telemetria de visitas indisponível — funil e previsão ficam sem visitantes.')}</div>}

      {/* PREVISÃO */}
      <h3 className="crm-fin-sub">{ct('Previsão de receita')}</h3>
      {!forecast.enough ? (
        <div className="muted small">{ct('Ainda não há tração suficiente (28 dias com visitantes e vendas) pra projetar receita.')}</div>
      ) : (
        <>
          <div className="acc-stats">
            <Stat value={num(Math.round(forecast.v28))} label={ct('Visitantes/dia (28d)')} />
            <Stat value={num(Math.round(forecast.v7))} label={ct('Visitantes/dia (7d)')} />
            <Stat tone={forecast.g14 >= 0 ? 'green' : undefined} value={`${forecast.g14 >= 0 ? '+' : ''}${pct(forecast.g14)}`} label={ct('Tendência (14d vs 14d)')} />
            <Stat value={pct(forecast.conv28, 2)} label={ct('Conversão 28d')} />
            <Stat value={pct(forecast.conv7, 2)} label={ct('Conversão 7d')} />
            <Stat tone="gold" value={money(Math.round(forecast.arpuCents))} label={ct('ARPU/conta (28d)')} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="acc-table">
              <thead><tr><th>{ct('Cenário')}</th><th>{ct('Crescimento/14d')}</th><th>{ct('Próx. 7 dias')}</th><th>{ct('Próx. 30 dias')}</th><th>{ct('Próx. 90 dias')}</th></tr></thead>
              <tbody>
                {forecast.scenarios.map((s) => (
                  <tr key={s.key}>
                    <td style={{ fontWeight: 700, color: s.key === 'base' ? 'var(--rtm-text-strong)' : undefined }}>{s.label}</td>
                    <td>{`${s.g >= 0 ? '+' : ''}${pct(s.g)}`}</td>
                    {s.horizons.map((h) => <td key={h.days} style={{ fontWeight: s.key === 'base' ? 700 : 400 }}>{money(h.cents)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* como calculamos — o modelo precisa ser auditável pelo admin */}
          <div className="muted small" style={{ marginTop: 10, lineHeight: 1.5 }}>
            <b>{ct('Como calculamos:')}</b> {ct('projeção diária = visitantes previstos × conversão × ARPU.')}{' '}
            {ct('Visitantes partem da média de 28d')} ({num(Math.round(forecast.v28))}/{ct('dia')}) {ct('crescendo à taxa do cenário (tendência = média dos últimos 14d ÷ 14d anteriores − 1, limitada a ±50% por janela; otimista soma 1σ do histórico de crescimento')} (σ = {pct(forecast.sigma)}).{' '}
            {ct('Conversão 28d')} = {pct(forecast.conv28, 2)} ({ct('contas vendidas ÷ soma de visitantes únicos diários — visitante recorrente conta de novo, então a conversão por pessoa é maior')}).{' '}
            {ct('ARPU 28d')} = {money(Math.round(forecast.arpuCents))} ({ct('receita total ÷ contas novas; já embute coins e passe')}). {ct('Hoje (dia parcial) fica fora das médias.')}
          </div>
        </>
      )}
    </>
  );
}

// ═════════ ABA CONTAS: ex-AccountsCRM completo (busca/grant/revoke/senha/Stripe/integridade) ═════════
type SortKey = 'email' | 'created_at' | 'status';
type SortDir = 'asc' | 'desc';

function FoundersProgress({ total, limit }: { total: number; limit: number }) {
  const p = limit > 0 ? Math.min(100, Math.round((total / limit) * 100)) : 0;
  return <div className="acc-progress" title={`${total}/${limit} (${p}%)`}><div className="acc-progress-fill" style={{ width: `${p}%` }} /></div>;
}

function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <div className="acc-trend"><span className="acc-trend-empty">{ct('Sem dados de tendência ainda.')}</span></div>;
  const max = Math.max(1, ...data.flatMap((pt) => [pt.signups, pt.sales]));
  return (
    <div className="acc-trend">
      {data.map((pt) => (
        <div key={pt.day} className="acc-trend-col" title={`${fmtDay(pt.day)}: +${pt.signups} ${ct('contas')} · +${pt.sales} ${ct('vendas')}`}>
          <div className="acc-trend-bar acc-trend-bar-signup" style={{ height: `${(pt.signups / max) * 100}%` }} />
          <div className="acc-trend-bar acc-trend-bar-sale" style={{ height: `${(pt.sales / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

function SortableTh({ label, sortKey, active, dir, onSort }: { label: string; sortKey: SortKey; active: boolean; dir: SortDir; onSort: (k: SortKey) => void }) {
  return <th className="sortable" onClick={() => onSort(sortKey)}>{label}{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>;
}

const STATUS_LABEL: Record<string, string> = { pending: 'Pendentes', applied: 'Aplicadas', 'applied-solo': 'Aplicadas (solo)', conflict: 'Em conflito' };

// Integridade do ranking PvP (painel da iter7 — preservado na fusão).
// `conflict` = os dois jogadores reclamaram o MESMO resultado; a partida não conta.
function RankingIntegrity({ data }: { data: IntegrityData | null }) {
  if (!data) return <div className="muted small" style={{ padding: '6px 0' }}>{ct('Carregando integridade do ranking…')}</div>;
  const statusOf = (s: string) => data.byStatus.find((r) => r.status === s);
  const conflictPct = data.matches.total > 0 ? Math.round((data.matches.conflicts / data.matches.total) * 100) : 0;
  const reportLabel = (won: boolean) => (won ? ct('reportou VITÓRIA') : ct('reportou derrota'));
  return (
    <>
      <div className="acc-stats">
        <Stat value={data.matches.conflicts7} label={ct('Conflitos 7d')} />
        <Stat value={`${conflictPct}%`} label={ct('Partidas em conflito')} />
        <Stat value={data.stalePending} label={ct('Pendentes >1h (órfãos)')} />
        <Stat tone="blue" value={data.matches.total} label={ct('Partidas reportadas')} />
        <Stat tone="green" value={(statusOf('applied')?.total ?? 0) + (statusOf('applied-solo')?.total ?? 0)} label={ct('Reports aplicados')} />
      </div>
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

function AccountsSection() {
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
  // reset de senha (suporte: pagou e esqueceu). O servidor hasheia (scrypt).
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
    <>
      {err && (
        <div className="neg small" style={{ marginBottom: 10 }}>
          {err} <button className="btn ghost small" onClick={() => void load(query)}>↻ {ct('Tentar de novo')}</button>
        </div>
      )}
      {msg && <div className="pos small" style={{ marginBottom: 10 }}>{msg}</div>}
      {data === null && !err && <div className="muted">{ct('Carregando…')}</div>}
      {data && (
        <>
          <div className="acc-stats">
            <Stat value={data.total} label={ct('Contas')} />
            <Stat tone="gold" value={data.paidTotal} label={ct('Vitalícias')} />
            <Stat tone="gold" value={`${data.foundersTotal ?? 0}${data.founderLimit ? `/${data.founderLimit}` : ''}`} label={ct('Fundadores')}>
              {data.founderLimit ? <FoundersProgress total={data.foundersTotal ?? 0} limit={data.founderLimit} /> : null}
            </Stat>
            <Stat tone="green" value={`R$ ${revenue.toLocaleString('pt-BR')}`} label={ct('Receita')} />
            <Stat value={`${conv}%`} label={ct('Conversão')} />
            <Stat tone="blue" value={`${refPct}%`} label={ct('Vinculadas ao Stripe')} />
            <Stat value={`+${data.new7 ?? 0}`} label={ct('Novas 7d')} />
            <Stat value={`+${data.new30 ?? 0}`} label={ct('Novas 30d')} />
            <Stat tone="blue" value={data.paid30 ?? 0} label={ct('Vendas 30d')} />
            <Stat value={data.orphanTotal ?? data.orphanPaid.length} label={ct('Pagas s/ conta')} />
          </div>

          <div className="muted small section-label" style={{ marginTop: 0 }}>{ct('Tendência (30 dias)')}</div>
          <div className="acc-trend-legend">
            <span className="sig"><i />{ct('Cadastros/dia')}</span>
            <span className="sal"><i />{ct('Vendas/dia')}</span>
          </div>
          <TrendChart data={data.trend ?? []} />

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
              {data.orphanPaid.map((o) => (
                <div key={o.email} className="access-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', borderBottom: '1px solid var(--rtm-border-soft)' }}>
                  <span style={{ flex: 1 }}>{o.email}</span>
                  <span className="muted small">{fmtDate(o.created_at)}</span>
                  <StripeCell email={o.email} />
                  <button className="btn danger small" disabled={busy} onClick={() => doRevoke(o.email)}>✕ {ct('Remover')}</button>
                </div>
              ))}
            </div>
          )}

          <h3 className="crm-fin-sub">🛡 {ct('Integridade do ranking (PvP)')}</h3>
          <div className="muted small" style={{ marginBottom: 10 }}>{ct('Conflito = os dois jogadores reclamaram o mesmo resultado (fraude ou bug); a partida não conta no MMR.')}</div>
          <RankingIntegrity data={integrity} />
        </>
      )}
    </>
  );
}

// ═════════ ABA PEDIDOS: ex-PaymentsCRM (coins/passe por método, pacote, recentes) ═════════
function OrdersSection() {
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
  const trendMax = Math.max(1, ...(coins?.trend ?? []).map((pt) => pt.cents));
  if (err) return <div className="crm-save-msg err">{err} <button className="btn ghost small" onClick={() => void load()}>↻ {ct('Tentar de novo')}</button></div>;
  if (!data) return <div className="muted" style={{ padding: 16 }}>{busy ? ct('Carregando…') : ct('Sem dados.')}</div>;
  return (
    <>
      <div className="acc-stats">
        <Stat value={num(coins?.paidOrders ?? 0)} label={ct('Pedidos pagos')} />
        <Stat value={num(coins?.coinsSold ?? 0)} label={ct('Coins vendidos')} />
        <Stat tone="green" value={money(coins?.revenueCents ?? 0)} label={ct('Receita de pedidos')} />
        <Stat value={num(coins?.pendingOrders ?? 0)} label={ct('Pedidos pendentes')} />
        <Stat value={num(coins?.buyers ?? 0)} label={ct('Compradores')} />
      </div>

      <h4 className="crm-fin-sub s2">{ct('Contas vitalícias por método de pagamento')}</h4>
      <MethodBars
        total={life?.paid ?? 0}
        rows={(life?.byMethod ?? []).map((r) => ({ key: r.method, label: methodLabel(r.method), value: r.n, tone: methodTone(r.method), sub: `${num(r.n)} ${ct('contas')}` }))}
      />

      <div className="crm-2col" style={{ marginTop: 14 }}>
        <div>
          <h4 className="crm-fin-sub s2">{ct('Pedidos por método')}</h4>
          <MethodBars
            total={coins?.revenueCents ?? 0}
            rows={(coins?.byMethod ?? []).map((r) => ({ key: r.method, label: methodLabel(r.method), value: r.cents, tone: methodTone(r.method), sub: `${money(r.cents)} · ${num(r.orders)} ${ct('pedidos')}` }))}
          />
        </div>
        <div>
          <h4 className="crm-fin-sub s2">{ct('Pedidos por pacote')}</h4>
          <MethodBars
            total={coins?.revenueCents ?? 0}
            rows={(coins?.byTier ?? []).map((r) => ({ key: r.tier, label: tierLabel(r.tier), value: r.cents, tone: '#caa53a', sub: `${money(r.cents)} · ${num(r.orders)} ${ct('pedidos')}` }))}
          />
        </div>
      </div>

      <h4 className="crm-fin-sub s2">{ct('Receita de pedidos — últimos 30 dias')}</h4>
      {(coins?.trend ?? []).some((pt) => pt.cents > 0) ? (
        <div className="acc-trend">
          {(coins?.trend ?? []).map((pt) => (
            <div key={pt.day} className="acc-trend-col" title={`${fmtDay(pt.day)}: ${money(pt.cents)} · ${num(pt.orders)} ${ct('pedidos')}`}>
              <div className="acc-trend-bar acc-trend-bar-sale" style={{ height: `${(pt.cents / trendMax) * 100}%` }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="acc-trend"><span className="acc-trend-empty">{ct('Sem pedidos nos últimos 30 dias.')}</span></div>
      )}

      <h4 className="crm-fin-sub s2">{ct('Pedidos recentes (coins & passe)')}</h4>
      <table className="acc-table">
        <thead><tr><th>{ct('Quando')}</th><th>{ct('E-mail')}</th><th>{ct('Pacote')}</th><th>{ct('Coins')}</th><th>{ct('Valor')}</th><th>{ct('Método')}</th><th>{ct('Status')}</th></tr></thead>
        <tbody>
          {(coins?.recent ?? []).map((o, i) => (
            <tr key={i}>
              <td>{fmtWhen(o.at)}</td>
              <td><span className="crm-fin-email" title={o.email}>{o.email}</span></td>
              <td>{tierLabel(o.tier)}</td>
              <td>{o.coins > 0 ? num(o.coins) : '—'}</td>
              <td>{money(o.cents)}</td>
              <td><b style={{ color: methodTone(o.method) }}>{methodLabel(o.method)}</b></td>
              <td className="muted small">{o.status}</td>
            </tr>
          ))}
          {(coins?.recent ?? []).length === 0 && (
            <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 16 }}>{ct('Nenhum pedido pago ainda.')}</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

// ═════════ TELA: /admin/receita ═════════════════════════════════════════════
type Tab = 'receita' | 'contas' | 'pedidos';

export function RevenueCRM({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<Tab>('receita');
  const [rev, setRev] = useState<RevenueData | null>(null);
  const [revErr, setRevErr] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRevenue = useCallback(async () => {
    setRevErr(''); setBusy(true);
    const r = await getRevenue(adminPassword());
    setBusy(false);
    if (r) setRev(r);
    else setRevErr(ct('Não foi possível carregar (login de admin necessário; só funciona no site publicado).'));
  }, []);
  useEffect(() => { void loadRevenue(); }, [loadRevenue]);

  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 1080, margin: '24px auto' }}>
        <div className="panel-head">
          💰 {ct('Receita & Contas')}
          <span className="spacer" />
          {tab === 'receita' && <button className="btn ghost" onClick={() => void loadRevenue()} disabled={busy}>{busy ? ct('Atualizando…') : '↻ ' + ct('Atualizar')}</button>}
          <button className="btn" onClick={onExit}>← {ct('Voltar')}</button>
        </div>
        <div className="panel-body">
          <AdminNav current="/admin/receita" />
          <div className="acc-filters" style={{ marginBottom: 16 }}>
            {([['receita', ct('Receita & previsão')], ['contas', ct('Contas')], ['pedidos', ct('Pedidos')]] as const).map(([t, lbl]) => (
              <button key={t} className={`acc-chip${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{lbl}</button>
            ))}
          </div>
          {tab === 'receita' && (
            revErr ? <div className="crm-save-msg err">{revErr} <button className="btn ghost small" onClick={() => void loadRevenue()}>↻ {ct('Tentar de novo')}</button></div>
            : !rev ? <div className="muted" style={{ padding: 16 }}>{ct('Carregando…')}</div>
            : <RevenueSection data={rev} />
          )}
          {tab === 'contas' && <AccountsSection />}
          {tab === 'pedidos' && <OrdersSection />}
        </div>
      </div>
    </div>
  );
}
