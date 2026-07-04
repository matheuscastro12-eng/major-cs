// CRM de LIVE-OPS do Ultimate: agenda promos/SBCs/avisos com janela de exibição
// SEM deploy. Lista tudo (ativos, agendados, expirados), cria/edita por kind e
// exclui com confirmação. Erros de validação do servidor chegam como
// { field, error } e são exibidos AO LADO do input correspondente.
// Mesmo padrão de senha/fetch/estilo do AccountsCRM/PaymentsCRM.
import { useCallback, useEffect, useState } from 'react';
import { adminPassword } from './AdminGate';
import { AdminNav } from './AdminNav';
import { ct } from '../state/career-i18n';
import {
  adminDeleteLiveop,
  adminListLiveops,
  adminUpsertLiveop,
  LIVEOPS_PROMO_FILTER_KEYS,
  type LiveopsNoticePayload,
  type LiveopsPromoPayload,
  type LiveopsRow,
  type LiveopsSbcPayload,
} from '../state/liveops';

type Kind = 'promo' | 'sbc' | 'notice';

const KIND_LABEL: Record<Kind, string> = { promo: 'Promo', sbc: 'SBC', notice: 'Aviso' };
const KIND_TONE: Record<Kind, string> = { promo: '#f472b6', sbc: '#c792ea', notice: '#7aa2f7' };

// espelha LIVEOPS_RARITIES do servidor (raridades válidas de recompensa de SBC)
const RARITY_OPTIONS = ['bronze', 'silver', 'gold', 'rareGold', 'elite', 'legendary', 'icon', 'tots', 'major', 'promo'] as const;
const FILTER_LABEL: Record<string, string> = {
  br: 'Craques BR', eu: 'Estrelas EU', cis: 'Feras da CIS', americas: 'Força das Américas',
  awp: 'Snipers de Elite (AWP)', igl: 'Mentes Brilhantes (IGL)', entry: 'Linha de Frente (Entry)',
};

// ISO ↔ input datetime-local (o input trabalha em hora LOCAL, sem timezone)
function isoToLocalInput(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function localInputToIso(v: string): string {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}
const fmtWhen = (v: string) => { try { return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };

// status da janela + countdown legível ("ativo · termina em 2d 4h")
function windowStatus(r: LiveopsRow): { label: string; tone: string } {
  const now = Date.now();
  const start = Date.parse(r.startsAt);
  const end = Date.parse(r.endsAt);
  const span = (ms: number) => {
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  };
  if (!r.enabled) return { label: ct('desativado'), tone: '#8a99ab' };
  if (now < start) return { label: `${ct('agendado')} · ${ct('começa em')} ${span(start - now)}`, tone: '#7aa2f7' };
  if (now >= end) return { label: ct('expirado'), tone: '#8a99ab' };
  return { label: `${ct('ativo')} · ${ct('termina em')} ${span(end - now)}`, tone: '#16a34a' };
}

interface FormState {
  isNew: boolean;
  id: string;
  kind: Kind;
  startsAt: string; // valor do input datetime-local
  endsAt: string;
  enabled: boolean;
  // promo
  name: string; desc: string; color: string; filterKey: string; ovrBoost: string; packCost: string;
  // sbc
  count: string; sameOrg: boolean; sameCountry: boolean; sameRegion: boolean; minOvrAvg: string; minTier: string; rewardCredits: string; rewardCard: string;
  // notice
  title: string; body: string;
}

function emptyForm(kind: Kind): FormState {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 86_400_000); // janela padrão: 7 dias
  return {
    isNew: true, id: '', kind,
    startsAt: isoToLocalInput(start.toISOString()), endsAt: isoToLocalInput(end.toISOString()), enabled: true,
    name: '', desc: '', color: '#f472b6', filterKey: 'br', ovrBoost: '2', packCost: '25000',
    count: '3', sameOrg: false, sameCountry: false, sameRegion: false, minOvrAvg: '', minTier: '', rewardCredits: '', rewardCard: '',
    title: '', body: '',
  };
}

function formFromRow(r: LiveopsRow): FormState {
  const f = { ...emptyForm(r.kind), isNew: false, id: r.id, enabled: r.enabled, startsAt: isoToLocalInput(r.startsAt), endsAt: isoToLocalInput(r.endsAt) };
  if (r.kind === 'promo') {
    const p = r.payload as LiveopsPromoPayload;
    return { ...f, name: p.name, desc: p.desc, color: p.color, filterKey: p.filterKey, ovrBoost: String(p.ovrBoost), packCost: String(p.packCost) };
  }
  if (r.kind === 'sbc') {
    const p = r.payload as LiveopsSbcPayload;
    return {
      ...f, name: p.name, desc: p.desc, count: String(p.req.count),
      sameOrg: !!p.req.sameOrg, sameCountry: !!p.req.sameCountry, sameRegion: !!p.req.sameRegion,
      minOvrAvg: p.req.minOvrAvg != null ? String(p.req.minOvrAvg) : '', minTier: p.req.minTier != null ? String(p.req.minTier) : '',
      rewardCredits: p.reward.credits != null ? String(p.reward.credits) : '', rewardCard: p.reward.card ?? '',
    };
  }
  const p = r.payload as LiveopsNoticePayload;
  return { ...f, title: p.title, body: p.body };
}

// payload no formato exato do kind (campos numéricos opcionais só entram se preenchidos)
function payloadFromForm(f: FormState): unknown {
  if (f.kind === 'promo') {
    return { name: f.name, desc: f.desc, color: f.color, filterKey: f.filterKey, ovrBoost: Number(f.ovrBoost), packCost: Number(f.packCost) };
  }
  if (f.kind === 'sbc') {
    const req: Record<string, unknown> = { count: Number(f.count) };
    if (f.sameOrg) req.sameOrg = true;
    if (f.sameCountry) req.sameCountry = true;
    if (f.sameRegion) req.sameRegion = true;
    if (f.minOvrAvg.trim() !== '') req.minOvrAvg = Number(f.minOvrAvg);
    if (f.minTier.trim() !== '') req.minTier = Number(f.minTier);
    const reward: Record<string, unknown> = {};
    if (f.rewardCredits.trim() !== '') reward.credits = Number(f.rewardCredits);
    if (f.rewardCard) reward.card = f.rewardCard;
    return { name: f.name, desc: f.desc, req, reward };
  }
  return { title: f.title, body: f.body };
}

export function LiveopsCRM({ onExit }: { onExit: () => void }) {
  const [rows, setRows] = useState<LiveopsRow[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  // erro de validação do servidor: { field, error } — destacado no input certo
  const [fieldErr, setFieldErr] = useState<{ field: string; error: string } | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setErr('');
    const r = await adminListLiveops(adminPassword());
    if (r) setRows(r);
    else setErr(ct('Não foi possível carregar (login de admin necessário; só funciona no site publicado).'));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const upd = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  // erro do campo `name` (ou de um sub-campo dele) — pinta a mensagem sob o input
  const errFor = (...names: string[]) => {
    if (!fieldErr || !names.includes(fieldErr.field)) return null;
    return <span className="neg small" style={{ display: 'block', marginTop: 3 }}>{fieldErr.error}</span>;
  };
  const errStyle = (...names: string[]) =>
    fieldErr && names.includes(fieldErr.field) ? { borderColor: '#b42318', outline: '1px solid #b42318' } : undefined;

  const save = async () => {
    if (!form || busy) return;
    setBusy(true); setFieldErr(null); setMsg('');
    const r = await adminUpsertLiveop(adminPassword(), {
      id: form.id.trim().toLowerCase(),
      kind: form.kind,
      payload: payloadFromForm(form),
      startsAt: localInputToIso(form.startsAt),
      endsAt: localInputToIso(form.endsAt),
      enabled: form.enabled,
    });
    setBusy(false);
    if (r.ok) {
      setMsg(`✅ ${ct('Evento salvo:')} ${r.item.id}`);
      setForm(null);
      void load();
    } else if (r.field) {
      setFieldErr({ field: r.field, error: r.error });
    } else {
      setMsg(`❌ ${r.error}`);
    }
  };

  const remove = async (r: LiveopsRow) => {
    if (!confirm(`${ct('Excluir o evento')} "${r.id}"? ${ct('Ele some do jogo em até 5 minutos (cache).')}`)) return;
    setBusy(true);
    const ok = await adminDeleteLiveop(adminPassword(), r.id);
    setBusy(false);
    setMsg(ok ? `🗑 ${ct('Evento excluído:')} ${r.id}` : `❌ ${ct('Não foi possível excluir.')}`);
    void load();
  };

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          📅 {ct('Live-ops — promos, SBCs e avisos agendados')}
          <span className="spacer" />
          <button className="btn ghost" onClick={() => { setFieldErr(null); setForm(emptyForm('promo')); }}>+ {ct('Novo evento')}</button>
          <button className="btn ghost" onClick={() => void load()} disabled={busy}>↻ {ct('Atualizar')}</button>
          <button className="btn" onClick={onExit}>← {ct('Voltar')}</button>
        </div>
        <div className="panel-body">
          <AdminNav current="/admin/liveops" />
          {err && <div className="crm-save-msg err">{err}</div>}
          {msg && <div className={`crm-save-msg${msg.startsWith('✅') || msg.startsWith('🗑') ? ' ok' : ' err'}`}>{msg}</div>}
          <p className="muted small" style={{ marginTop: 0 }}>
            {ct('O jogo lê os eventos ATIVOS (habilitados e dentro da janela) com cache de 5 minutos. Promo agendada sobrepõe a promo mensal; SBCs agendadas aparecem junto das fixas; avisos viram banner dispensável no Ultimate.')}
          </p>

          {/* ── lista ── */}
          {rows === null && !err ? (
            <div className="muted">{ct('Carregando…')}</div>
          ) : (
            <table className="acc-table">
              <thead>
                <tr><th>ID</th><th>{ct('Tipo')}</th><th>{ct('Conteúdo')}</th><th>{ct('Janela')}</th><th>{ct('Habilitado')}</th><th>{ct('Status')}</th><th /></tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => {
                  const st = windowStatus(r);
                  const title = r.kind === 'notice'
                    ? (r.payload as LiveopsNoticePayload).title
                    : (r.payload as LiveopsPromoPayload | LiveopsSbcPayload).name;
                  return (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'monospace' }}>{r.id}</td>
                      <td>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: `${KIND_TONE[r.kind]}22`, border: `1px solid ${KIND_TONE[r.kind]}66`, color: KIND_TONE[r.kind] }}>
                          {ct(KIND_LABEL[r.kind])}
                        </span>
                      </td>
                      <td>{title}</td>
                      <td className="muted small">{fmtWhen(r.startsAt)} → {fmtWhen(r.endsAt)}</td>
                      <td style={{ textAlign: 'center' }}>{r.enabled ? '✅' : '—'}</td>
                      <td><b style={{ color: st.tone }}>{st.label}</b></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn ghost" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => { setFieldErr(null); setMsg(''); setForm(formFromRow(r)); }}>✏ {ct('Editar')}</button>{' '}
                        <button className="btn danger" style={{ padding: '3px 10px', fontSize: 11 }} disabled={busy} onClick={() => void remove(r)}>✕ {ct('Excluir')}</button>
                      </td>
                    </tr>
                  );
                })}
                {(rows ?? []).length === 0 && (
                  <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 16 }}>{ct('Nenhum evento agendado ainda.')}</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* ── formulário criar/editar ── */}
          {form && (
            <div className="panel" style={{ marginTop: 16 }}>
              <div className="panel-head">
                {form.isNew ? `+ ${ct('Novo evento')}` : `✏ ${ct('Editar')} "${form.id}"`}
                <span className="spacer" />
                <button className="btn ghost" onClick={() => { setForm(null); setFieldErr(null); }}>{ct('Cancelar')}</button>
              </div>
              <div className="panel-body">
                {fieldErr && ['payload', 'kind'].includes(fieldErr.field) && <div className="crm-save-msg err">{fieldErr.error}</div>}
                <div className="form-grid">
                  <div className="field">
                    <label>{ct('ID (slug, sem espaços)')}</label>
                    <input value={form.id} disabled={!form.isNew} placeholder="promo-julho" style={errStyle('id')} onChange={(e) => upd({ id: e.target.value.toLowerCase() })} />
                    {errFor('id')}
                  </div>
                  <div className="field">
                    <label>{ct('Tipo')}</label>
                    <select value={form.kind} disabled={!form.isNew} onChange={(e) => upd({ kind: e.target.value as Kind })}>
                      <option value="promo">{ct('Promo (pacote temático)')}</option>
                      <option value="sbc">{ct('SBC (desafio)')}</option>
                      <option value="notice">{ct('Aviso (banner)')}</option>
                    </select>
                    {errFor('kind')}
                  </div>
                  <div className="field">
                    <label>{ct('Início')}</label>
                    <input type="datetime-local" value={form.startsAt} style={errStyle('startsAt')} onChange={(e) => upd({ startsAt: e.target.value })} />
                    {errFor('startsAt')}
                  </div>
                  <div className="field">
                    <label>{ct('Fim (máx. 45 dias)')}</label>
                    <input type="datetime-local" value={form.endsAt} style={errStyle('endsAt')} onChange={(e) => upd({ endsAt: e.target.value })} />
                    {errFor('endsAt')}
                  </div>
                  <div className="field">
                    <label>{ct('Habilitado')}</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.enabled} onChange={(e) => upd({ enabled: e.target.checked })} />
                      {form.enabled ? ct('sim — entra no ar na janela') : ct('não — fica guardado')}
                    </label>
                  </div>
                </div>

                {/* campos por tipo */}
                {form.kind === 'promo' && (
                  <>
                    <div className="form-grid" style={{ marginTop: 10 }}>
                      <div className="field" style={{ gridColumn: 'span 2' }}>
                        <label>{ct('Nome (card da Loja)')}</label>
                        <input value={form.name} maxLength={40} placeholder="Craques BR" style={errStyle('name')} onChange={(e) => upd({ name: e.target.value })} />
                        {errFor('name')}
                      </div>
                      <div className="field" style={{ gridColumn: 'span 2' }}>
                        <label>{ct('Descrição')}</label>
                        <input value={form.desc} maxLength={140} style={errStyle('desc')} onChange={(e) => upd({ desc: e.target.value })} />
                        {errFor('desc')}
                      </div>
                      <div className="field">
                        <label>{ct('Cor de destaque')}</label>
                        <input type="color" value={form.color} style={errStyle('color')} onChange={(e) => upd({ color: e.target.value })} />
                        {errFor('color')}
                      </div>
                      <div className="field">
                        <label>{ct('Tema (filtro de jogadores)')}</label>
                        <select value={form.filterKey} style={errStyle('filterKey')} onChange={(e) => upd({ filterKey: e.target.value })}>
                          {LIVEOPS_PROMO_FILTER_KEYS.map((k) => <option key={k} value={k}>{FILTER_LABEL[k] ?? k}</option>)}
                        </select>
                        {errFor('filterKey')}
                      </div>
                      <div className="field">
                        <label>{ct('Boost de OVR (1-3)')}</label>
                        <input type="number" min={1} max={3} value={form.ovrBoost} style={errStyle('ovrBoost')} onChange={(e) => upd({ ovrBoost: e.target.value })} />
                        {errFor('ovrBoost')}
                      </div>
                      <div className="field">
                        <label>{ct('Custo do pack (5.000-100.000)')}</label>
                        <input type="number" min={5000} max={100000} step={500} value={form.packCost} style={errStyle('packCost')} onChange={(e) => upd({ packCost: e.target.value })} />
                        {errFor('packCost')}
                      </div>
                    </div>
                    {/* preview do card da Loja */}
                    <div className="field" style={{ marginTop: 8 }}>
                      <label>{ct('Prévia do card')}</label>
                      <div style={{ maxWidth: 320, borderRadius: 14, padding: '14px 16px', color: '#fff', background: `linear-gradient(155deg, ${form.color} 0%, ${form.color}dd 55%, ${form.color}aa 100%)` }}>
                        <div style={{ fontWeight: 900 }}>✨ {ct('Pacote Promo')} · {form.name || '—'}</div>
                        <div style={{ fontSize: '0.78rem', opacity: 0.92, marginTop: 4 }}>{form.desc || ct('(descrição)')}</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, marginTop: 6 }}>🪙 {Number(form.packCost || 0).toLocaleString('pt-BR')} · +{form.ovrBoost || '?'} OVR</div>
                      </div>
                    </div>
                  </>
                )}

                {form.kind === 'sbc' && (
                  <>
                    <div className="form-grid" style={{ marginTop: 10 }}>
                      <div className="field" style={{ gridColumn: 'span 2' }}>
                        <label>{ct('Nome do desafio')}</label>
                        <input value={form.name} maxLength={40} style={errStyle('name')} onChange={(e) => upd({ name: e.target.value })} />
                        {errFor('name')}
                      </div>
                      <div className="field" style={{ gridColumn: 'span 2' }}>
                        <label>{ct('Descrição (o que o jogador vê)')}</label>
                        <input value={form.desc} maxLength={140} style={errStyle('desc')} onChange={(e) => upd({ desc: e.target.value })} />
                        {errFor('desc')}
                      </div>
                      <div className="field">
                        <label>{ct('Nº de cartas (3-5)')}</label>
                        <input type="number" min={3} max={5} value={form.count} style={errStyle('req.count', 'req')} onChange={(e) => upd({ count: e.target.value })} />
                        {errFor('req.count')}
                      </div>
                      <div className="field">
                        <label>{ct('Restrições')}</label>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 4 }}>
                          <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.sameOrg} onChange={(e) => upd({ sameOrg: e.target.checked })} /> {ct('mesma org')}</label>
                          <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.sameCountry} onChange={(e) => upd({ sameCountry: e.target.checked })} /> {ct('mesmo país')}</label>
                          <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.sameRegion} onChange={(e) => upd({ sameRegion: e.target.checked })} /> {ct('mesma região')}</label>
                        </div>
                        {errFor('req.sameOrg', 'req.sameCountry', 'req.sameRegion', 'req')}
                      </div>
                      <div className="field">
                        <label>{ct('OVR médio mín. (60-95, opcional)')}</label>
                        <input type="number" min={60} max={95} value={form.minOvrAvg} placeholder="—" style={errStyle('req.minOvrAvg')} onChange={(e) => upd({ minOvrAvg: e.target.value })} />
                        {errFor('req.minOvrAvg')}
                      </div>
                      <div className="field">
                        <label>{ct('Tier mínimo (1-7, opcional)')}</label>
                        <input type="number" min={1} max={7} value={form.minTier} placeholder="—" style={errStyle('req.minTier')} onChange={(e) => upd({ minTier: e.target.value })} />
                        {errFor('req.minTier')}
                      </div>
                      <div className="field">
                        <label>{ct('Recompensa: credits (0-30.000)')}</label>
                        <input type="number" min={0} max={30000} step={500} value={form.rewardCredits} placeholder="—" style={errStyle('reward.credits', 'reward')} onChange={(e) => upd({ rewardCredits: e.target.value })} />
                        {errFor('reward.credits')}
                      </div>
                      <div className="field">
                        <label>{ct('Recompensa: carta (opcional)')}</label>
                        <select value={form.rewardCard} style={errStyle('reward.card', 'reward')} onChange={(e) => upd({ rewardCard: e.target.value })}>
                          <option value="">{ct('nenhuma')}</option>
                          {RARITY_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {errFor('reward.card', 'reward')}
                      </div>
                    </div>
                    {/* preview do card de SBC */}
                    <div className="field" style={{ marginTop: 8 }}>
                      <label>{ct('Prévia do desafio')}</label>
                      <div style={{ maxWidth: 320, borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(199,146,234,0.5)', background: 'rgba(199,146,234,0.08)' }}>
                        <div style={{ fontWeight: 900 }}>{form.name || '—'} <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#d1447f' }}>· {ct('POR TEMPO LIMITADO')}</span></div>
                        <div className="muted small" style={{ marginTop: 3 }}>{form.desc || ct('(descrição)')}</div>
                        <div className="small" style={{ marginTop: 6, fontWeight: 700 }}>
                          {ct('Recompensa')}: {form.rewardCredits ? `🪙 ${Number(form.rewardCredits).toLocaleString('pt-BR')}` : ''}
                          {form.rewardCredits && form.rewardCard ? ' + ' : ''}
                          {form.rewardCard ? `${ct('carta')} ${form.rewardCard}` : ''}
                          {!form.rewardCredits && !form.rewardCard ? ct('(defina credits e/ou carta)') : ''}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {form.kind === 'notice' && (
                  <div className="form-grid" style={{ marginTop: 10 }}>
                    <div className="field" style={{ gridColumn: 'span 2' }}>
                      <label>{ct('Título (até 60)')}</label>
                      <input value={form.title} maxLength={60} style={errStyle('title')} onChange={(e) => upd({ title: e.target.value })} />
                      {errFor('title')}
                    </div>
                    <div className="field" style={{ gridColumn: 'span 4' }}>
                      <label>{ct('Corpo (até 280 — texto puro, sem HTML)')}</label>
                      <input value={form.body} maxLength={280} style={errStyle('body')} onChange={(e) => upd({ body: e.target.value })} />
                      {errFor('body')}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
                  <button className="btn gold" onClick={() => void save()} disabled={busy || !form.id.trim()}>
                    {busy ? ct('Salvando…') : '💾 ' + ct('Salvar evento')}
                  </button>
                  <span className="muted small">{ct('Entra no ar sozinho quando a janela abrir (cache de até 5 min no jogo).')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
