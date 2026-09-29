// [fase 4 · frente CIRCUITO] Telas do circuito real: a escolha de campeonato
// (rota por tier, convite pelo VRS ou qualificatório; LAN × online; visto e
// bootcamp), a página do evento ("Circuito": formato, participantes, resultado,
// premiação, VRS, edições anteriores) e a rota até o Major. Padrão da interface
// universal (components/ds + styles/circuito.css).
import { useMemo, useState } from 'react';
import { ArrowRight, Award, CalendarDays, Globe, Lock, Mail, MapPin, Plane, Swords, Ticket, Trophy, Users, Wifi } from 'lucide-react';
import { Panel, Table, Tag, Button, Alert, EmptyState, Stat, type Column, type TagTone } from '../../components/ds/index';
import { Flag, TeamBadge } from '../../components/ui';
import { ct } from '../../state/career-i18n';
import type { CalendarEvent, VrsEntry, WorldEventResult } from '../../engine/mundo/model';
import type { VrsTable } from '../../engine/mundo/vrs';
import { shareOf } from '../../engine/mundo/vrs';
import {
  calendarVenue, entryRoute, parseEventId, qualifierPlan, visaRisk, bootcampPlan, RMR_LABEL, RMR_SLOTS, MAJOR_S1, MAJOR_S2, MAJOR_S3,
  WEEKS_PER_ETAPA, type EntryRoute, type MajorRoute, type RmrRegion,
} from '../../engine/mundo/circuito';
import { MACRO_REGION_LABELS, type MacroRegion } from '../../data/regions';
import type { TeamSeason } from '../../types';
import { formatMoney } from '../../engine/ratings';
import '../../styles/circuito.css';

export interface TeamLite { id: string; name: string; tag: string; colors: [string, string]; logoUrl?: string; country?: string }

export const fmtPool = (usd: number): string =>
  usd >= 1_000_000 ? `$${(usd / 1_000_000).toFixed(usd % 1_000_000 === 0 ? 0 : 2)}M` : usd >= 1000 ? `$${Math.round(usd / 1000)}k` : `$${Math.round(usd)}`;
const TIER_TONE: Record<number, TagTone> = { 1: 'achievement', 2: 'accent', 3: 'neutral' };
export function TierTag({ tier }: { tier: number }) {
  return <Tag tone={TIER_TONE[tier] ?? 'neutral'}>T{tier}</Tag>;
}
export function LanTag({ lan }: { lan: boolean }) {
  return lan
    ? <Tag tone="win" icon={<MapPin size={11} aria-hidden />}>LAN</Tag>
    : <Tag icon={<Wifi size={11} aria-hidden />}>{ct('Online')}</Tag>;
}
export function Venue({ venue, cc }: { venue: string; cc: string | null }) {
  const city = cc ? venue.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F310}]/gu, '').trim() : ct('online');
  return <span className="ci-venue">{cc ? <Flag cc={cc} /> : <Globe size={12} aria-hidden />} {city}</span>;
}
export function TeamCell({ t, me }: { t: TeamLite; me?: boolean }) {
  return (
    <span className={`ci-team${me ? ' ci-team--me' : ''}`}>
      <TeamBadge tag={t.tag} colors={t.colors} size={20} logoUrl={t.logoUrl} />
      {t.country && <Flag cc={t.country} />}
      <span>{t.name}</span>
    </span>
  );
}
export const KIND_LABEL: Record<string, string> = {
  gsl: 'Grupos GSL + playoffs', qualifier: 'Qualificatório', rmr: 'RMR (suíço)', major: 'Major', league: 'Liga', swiss: 'Suíço', playoffs: 'Playoffs',
};
export const REGION_TXT = (r: string): string => (r === 'global' ? ct('Mundial') : ct(MACRO_REGION_LABELS[r as MacroRegion] ?? r));
/** Formato por extenso (o mesmo que a simulação roda). */
export function formatText(ev: Pick<CalendarEvent, 'kind' | 'slots' | 'qualifier'>): string {
  if (ev.kind === 'major') return ct('32 times: Stage 1 (16, VRS 17–24 + RMRs) → Stage 2 (+ VRS 9–16) → Stage 3 (+ VRS 1–8), suíços de 16 (3 vitórias classificam, 3 derrotas eliminam; MD1 nas duas primeiras rodadas, MD3 depois) → Champions Stage com 8 (MD3, final MD5).');
  if (ev.kind === 'rmr') return ct('Suíço de 16 (3 vitórias classificam, 3 derrotas eliminam). Os melhores pela campanha vão ao Stage 1 do Major.');
  if (ev.kind === 'qualifier') return ev.qualifier === 'closed'
    ? ct('Qualificatório FECHADO (online): só quem está perto no ranking VRS disputa. Uma série MD3 pela vaga.')
    : ct('Qualificatório ABERTO (online): qualquer time do tier de baixo entra. Duas séries (MD1 e MD3) pela vaga.');
  return ct('16 times em 4 grupos GSL (dupla eliminação, abertura MD1, resto MD3); os 2 melhores de cada grupo vão aos playoffs de 8 (MD3, final MD5).');
}

// ─── rota do usuário na escolha de campeonato ───────────────────────────────
export const ROUTE_LABEL: Record<EntryRoute, string> = {
  direct: 'Seu tier', invite: 'Convite pelo VRS', closed: 'Qualificatório fechado', open: 'Qualificatório aberto', below: 'Um tier abaixo', locked: 'Fora de alcance',
};
const ROUTE_TONE: Record<EntryRoute, TagTone> = { direct: 'neutral', invite: 'achievement', closed: 'warn', open: 'warn', below: 'neutral', locked: 'loss' };

export interface PickOption {
  id: string; name: string; desc: string; tier: number; region?: 'global' | 'sa' | 'eu' | 'asia';
  teams: TeamSeason[]; invited?: string[]; eventId?: string; lan?: boolean; venue?: string; host?: string | null; prize?: number;
  prizeMult: number; vrsWeight: number;
}
export function CircuitPicker<T extends PickOption>({
  circuits, split, etapa, playerTier, worldRank, qualifiers, userRegion, squadCountries, relocate, onRelocate, onPick, onQualifier, onBack,
}: {
  circuits: T[];
  split: number;
  etapa: number;
  playerTier: number;
  worldRank: number;
  qualifiers: Record<string, 'won' | 'lost'>;
  userRegion: MacroRegion | null;
  squadCountries: string[];
  relocate: { from: MacroRegion; to: MacroRegion } | null;
  onRelocate: () => void;
  onPick: (c: T) => void;
  onQualifier: (c: T, route: 'closed' | 'open') => void;
  onBack: () => void;
}) {
  const userRegionTags = useMemo(() => {
    const set = new Set<string>(['global']);
    if (userRegion === 'americas') set.add('sa');
    if (userRegion === 'europe' || userRegion === 'cis') set.add('eu');
    if (userRegion === 'asia' || userRegion === 'oceania') set.add('asia');
    return set;
  }, [userRegion]);
  const REGION_LABEL: Record<string, string> = { sa: 'SA', eu: 'EU', asia: 'Ásia' };
  const routeOf = (o: PickOption): EntryRoute => (userRegionTags.has(o.region ?? 'global') ? entryRoute(o.tier, playerTier, worldRank) : 'locked');
  const statusOf = (o: PickOption): { route: EntryRoute; canPlay: boolean; canQualify: boolean; note: string } => {
    const route = routeOf(o);
    const q = o.eventId ? qualifiers[o.eventId] : undefined;
    if (route === 'closed' || route === 'open') {
      if (q === 'won') return { route, canPlay: true, canQualify: false, note: ct('Classificado pelo qualificatório') };
      if (q === 'lost') return { route, canPlay: false, canQualify: false, note: ct('Eliminado no qualificatório desta etapa') };
      // um qualificatório por etapa (são na mesma semana)
      if (Object.keys(qualifiers).some((k) => k.startsWith(`ev:${split}:${etapa}:`))) return { route, canPlay: false, canQualify: false, note: ct('Você já disputou um qualificatório nesta etapa') };
      return { route, canPlay: false, canQualify: true, note: route === 'closed' ? ct('Uma série MD3 pela vaga (online)') : ct('MD1 + MD3 pela vaga (online)') };
    }
    if (route === 'locked') {
      const regional = !userRegionTags.has(o.region ?? 'global');
      return { route, canPlay: false, canQualify: false, note: regional ? `${ct('Regional exclusivo')} (${REGION_LABEL[o.region ?? ''] ?? ''})` : o.tier < playerTier ? ct('Suba pelo ranking VRS (tier 1: qualificatório fechado só pra top 48)') : ct('Fora da sua divisão') };
    }
    return { route, canPlay: true, canQualify: false, note: route === 'invite' ? ct('Seu ranking VRS garantiu o convite') : route === 'below' ? ct('Opcional: menos VRS e prêmio') : '' };
  };
  const first = circuits.find((o) => statusOf(o).canPlay) ?? circuits[0];
  const [sel, setSel] = useState(first?.id ?? '');
  const c = circuits.find((o) => o.id === sel) ?? first;
  const st = c ? statusOf(c) : null;
  const risk = c?.lan ? Math.max(0, ...squadCountries.map((cc) => visaRisk(cc, c.host))) : 0;
  const boot = c ? bootcampPlan({ lan: !!c.lan, tier: c.tier, host: c.host }, userRegion) : null;
  const invited = new Set(c?.invited ?? []);
  return (
    <div className="ci-pick">
      <Panel icon={<CalendarDays size={16} />} title={`${ct('Split')} ${split} · ${ct('Etapa')} ${etapa}`}
        actions={<Button size="sm" variant="ghost" onClick={onBack}>{ct('← Mercado')}</Button>}>
        {relocate && (
          <Alert tone="info" title={ct('Core do elenco mudou de região')}>
            {ct('Agora é da')} <b>{ct(MACRO_REGION_LABELS[relocate.to])}</b>{ct(', mas você compete na')} <b>{ct(MACRO_REGION_LABELS[relocate.from])}</b>.{' '}
            <Button size="sm" onClick={onRelocate}>{ct('Mudar para')} {ct(MACRO_REGION_LABELS[relocate.to])}</Button>
          </Alert>
        )}
        <p className="ci-note">
          <b>{ct('Escolha o campeonato.')}</b>{' '}{ct('Oito eventos acontecem ao mesmo tempo nesta etapa. Você joga o do seu tier, um abaixo, ou um acima: por convite (top do ranking VRS) ou pelo qualificatório (fechado no tier 1, aberto no tier 2). LAN pesa a pressão (oculto de jogo grande) e pede visto; online não.')}
          {' '}{ct('Você está em')} <b>#{worldRank < 999 ? worldRank : '—'}</b> {ct('no VRS')} · Tier {playerTier}.
        </p>
      </Panel>
      <div className="ci-cards">
        {circuits.map((o) => {
          const s = statusOf(o);
          const locked = !s.canPlay && !s.canQualify;
          return (
            <button key={o.id} type="button" className={`ci-card${c?.id === o.id ? ' ci-card--on' : ''}${locked ? ' ci-card--locked' : ''}`} onClick={() => setSel(o.id)} aria-pressed={c?.id === o.id}>
              <span className="ci-tags">
                <TierTag tier={o.tier} />
                <LanTag lan={!!o.lan} />
                {o.region && o.region !== 'global' && <Tag>{REGION_LABEL[o.region]}</Tag>}
                <Tag tone={ROUTE_TONE[s.route]} icon={s.route === 'invite' ? <Ticket size={11} aria-hidden /> : s.route === 'locked' ? <Lock size={11} aria-hidden /> : undefined}>{ct(ROUTE_LABEL[s.route])}</Tag>
              </span>
              <span className="ci-card__name">{o.name}</span>
              <span className="ci-card__meta">
                <span>💰 {fmtPool(o.prize ?? 0)}</span>
                {o.venue && <Venue venue={o.venue} cc={o.host ?? null} />}
                <span>{ct('prêmio')} ×{o.prizeMult}</span>
              </span>
              {s.note && <span className="ci-card__route">{s.note}</span>}
            </button>
          );
        })}
      </div>
      {c && st && (
        <Panel icon={<Users size={16} />} title={`${ct('Field do')} ${c.name}`} flush>
          <p className="ci-note ci-pad">{c.desc}</p>
          {c.lan && (risk > 0 || boot?.available) && (
            <p className="ci-note ci-pad" style={{ paddingTop: 0 }}>
              {risk > 0 && <><Plane size={12} aria-hidden /> {ct('LAN fora da região de parte do elenco: risco de visto negado de até')} <b>{Math.round(risk * 100)}%</b> {ct('por jogador (o stand-in entra).')} </>}
              {boot?.available && <>{ct('Bootcamp antes da LAN')}: <b>{formatMoney(boot.cost)}</b>{boot.travel ? ` (${ct('viagem')})` : ''} {ct('em Treinos e scrims.')}</>}
            </p>
          )}
          <div className="ci-field">
            {c.teams.map((t) => (
              <div key={t.id} className="ci-field__team">
                <TeamBadge tag={t.tag} colors={t.colors} size={24} logoUrl={t.logoUrl} />
                <Flag cc={t.country} />
                <b>{t.team}</b>
                {invited.has(t.id)
                  ? <Tag tone="achievement" title={ct('Convite pelo VRS')} icon={<Mail size={11} aria-label={ct('Convite pelo VRS')} />} />
                  : <Tag title={ct('Veio do qualificatório')} icon={<Ticket size={11} aria-label={ct('Veio do qualificatório')} />} />}
              </div>
            ))}
          </div>
          <div className="ci-cta">
            {st.canPlay && <Button variant="primary" icon={<Swords size={14} aria-hidden />} onClick={() => onPick(c)}>{ct('Disputar o')} {c.name}</Button>}
            {st.canQualify && (st.route === 'closed' || st.route === 'open') && (
              <Button variant="primary" icon={<Ticket size={14} aria-hidden />} onClick={() => onQualifier(c, st.route as 'closed' | 'open')}>
                {st.route === 'closed' ? ct('Jogar o qualificatório fechado') : ct('Jogar o qualificatório aberto')} ({qualifierPlan(st.route).map((x) => `MD${x.bo}`).join(' + ')})
              </Button>
            )}
            {!st.canPlay && !st.canQualify && <span className="ci-dim"><Lock size={12} aria-hidden /> {st.note}</span>}
          </div>
        </Panel>
      )}
    </div>
  );
}

// ─── rota até o Major ───────────────────────────────────────────────────────
export interface MajorRouteInfo {
  majorName: string;
  majorSplit: number;
  splitsLeft: number;
  route: MajorRoute | null;
  rank: number;
  points: number;
  cutPoints: number;        // pontos do #24 (convite direto)
  regionRank?: number;      // sua posição entre os do RMR da sua região
  region?: RmrRegion;
}
export function MajorRoutePanel({ info }: { info: MajorRouteInfo }) {
  const r = info.route;
  const gap = Math.max(0, info.cutPoints - info.points);
  const steps: { k: string; title: string; sub: string; state: 'on' | 'done' | 'out' | '' }[] = [
    { k: 'vrs', title: `#${info.rank < 999 ? info.rank : '—'} VRS`, sub: `${info.points} ${ct('pts')}`, state: 'done' },
    r?.kind === 'stage'
      ? { k: 'inv', title: `${ct('Convite')} · Stage ${r.stage}`, sub: r.stage === 3 ? `${ct('top')} ${MAJOR_S3}` : r.stage === 2 ? `${ct('top')} ${MAJOR_S2}` : `${ct('top')} ${MAJOR_S1}`, state: 'on' }
      : r?.kind === 'rmr'
        ? { k: 'rmr', title: `RMR ${ct(RMR_LABEL[r.region])}`, sub: `${RMR_SLOTS[r.region]} ${ct('vagas em 16')}${info.regionRank ? ` · ${ct('você é o')} ${info.regionRank}º` : ''}`, state: 'on' }
        : { k: 'out', title: ct('Fora do Major'), sub: gap > 0 ? `${ct('faltam')} ${gap} ${ct('pts pro top')} ${MAJOR_S1}` : ct('suba no ranking'), state: 'out' },
    { k: 's1', title: 'Stage 1', sub: ct('suíço de 16'), state: r?.kind === 'stage' && r.stage > 1 ? 'done' : '' },
    { k: 's2', title: 'Stage 2', sub: ct('suíço de 16'), state: r?.kind === 'stage' && r.stage > 2 ? 'done' : '' },
    { k: 's3', title: 'Stage 3', sub: ct('suíço de 16'), state: '' },
    { k: 'po', title: ct('Playoffs'), sub: ct('8 times · final MD5'), state: '' },
  ];
  return (
    <Panel icon={<Trophy size={16} />} title={`${ct('Rota até o')} ${info.majorName}`}
      actions={<span className="ci-dim">{info.splitsLeft === 0 ? ct('neste split') : `${ct('Split')} ${info.majorSplit} · ${info.splitsLeft} ${info.splitsLeft === 1 ? ct('split') : ct('splits')}`}</span>}>
      <div className="ci-route">
        {steps.map((s, i) => (
          <span key={s.k} style={{ display: 'contents' }}>
            {i > 0 && <ArrowRight size={14} className="ci-route__arrow" aria-hidden />}
            <span className={`ci-route__step${s.state ? ` ci-route__step--${s.state}` : ''}`}>
              <small>{i === 0 ? ct('Hoje') : i === 1 ? ct('Vaga') : ct('Major')}</small>
              <b>{s.title}</b>
              <span>{s.sub}</span>
            </span>
          </span>
        ))}
      </div>
      <p className="ci-note" style={{ marginTop: 'var(--sp-3)' }}>
        {ct('Pelo ranking VRS publicado depois da última etapa do split de Major: 1–8 entram no Stage 3, 9–16 no Stage 2, 17–24 no Stage 1; os próximos de cada região disputam o RMR (Europa 4 vagas, Américas 2, Ásia-Pacífico 2).')}
      </p>
    </Panel>
  );
}

// ─── página do evento (Circuito) ────────────────────────────────────────────
export interface CircuitoProps {
  season: number;
  calendar: CalendarEvent[];                                  // a temporada inteira
  results: WorldEventResult[];
  vrs: Record<string, VrsEntry>;
  table: VrsTable | null;                                     // composição (contribuição por evento)
  fields: Record<string, { teams: string[]; invited: string[] }>; // field dos eventos da etapa em curso
  myEventId: string | null;
  myLive: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  team: (id: string) => TeamLite;
  onOpenTeam: (id: string) => void;
  onOpenBracket?: () => void;
  onOpenCalendar: () => void;
}
export function CircuitoTab(p: CircuitoProps) {
  const eventsForSelect = useMemo(() => {
    const done = new Set(p.results.map((r) => r.eventId));
    const cur = p.calendar.filter((e) => e.kind !== 'qualifier');
    const past = p.results.filter((r) => !cur.some((e) => e.id === r.eventId) && r.kind !== 'qualifier')
      .sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
    return [
      ...cur.map((e) => ({ id: e.id, label: `${e.name} · S${e.split}${e.etapa ? `/E${e.etapa}` : ''}${done.has(e.id) ? ' ✓' : ''}` })),
      ...past.map((r) => ({ id: r.eventId, label: `${r.name ?? r.eventId} · S${r.split} ✓` })),
    ];
  }, [p.calendar, p.results]);
  const id = p.selected ?? p.myEventId ?? eventsForSelect[0]?.id ?? null;
  const cal = p.calendar.find((e) => e.id === id) ?? null;
  const res = p.results.find((r) => r.eventId === id) ?? null;
  const parsed = id ? parseEventId(id) : null;
  const meta: CalendarEvent | null = cal ?? (res ? {
    id: res.eventId, name: res.name ?? res.eventId, tier: res.tier ?? 3, kind: res.kind ?? 'gsl', lan: !!res.lan, region: 'global', split: res.split,
    week: 0, slots: res.field ?? res.placements.length, prize: res.prizePool ?? 0, vrsWeight: 0, etapa: parsed?.etapa,
  } : null);
  if (!meta || !id) {
    return <div className="em-tab ci-tab"><Panel title={ct('Circuito')}><EmptyState icon={<CalendarDays size={20} />} title={ct('Nenhum evento')}>{ct('O calendário da temporada aparece quando o mundo é semeado.')}</EmptyState></Panel></div>;
  }
  const venue = calendarVenue(meta);
  const field = p.fields[id];
  const contrib = (teamId: string) => p.table?.entries[teamId]?.rows.find((r) => r.eventId === id)?.contribution ?? 0;
  const mine = id === p.myEventId;
  // edições anteriores: resultados com o mesmo nome
  const editions = p.results.filter((r) => r.name === meta.name && r.eventId !== id && r.kind === meta.kind).sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
  const weekTxt = meta.kind === 'qualifier' ? `${ct('semana')} ${meta.week}`
    : meta.kind === 'major' ? `${ct('semanas')} ${meta.week}–${meta.week + 3}`
      : meta.kind === 'rmr' ? `${ct('semana')} ${meta.week}`
        : meta.week ? `${ct('semanas')} ${meta.week}–${meta.week + WEEKS_PER_ETAPA - 2}` : '—';
  type Row = { teamId: string; place: number };
  const placeTxt = (pl: number, n: number) => (pl === 1 ? '1º' : pl === 2 ? '2º' : n >= 32 ? (pl <= 4 ? '3–4º' : pl <= 8 ? '5–8º' : pl <= 16 ? '9–16º' : pl <= 24 ? '17–24º' : '25–32º')
    : meta.kind === 'rmr' ? `${pl}º` : pl <= 4 ? '3–4º' : pl <= 8 ? '5–8º' : pl <= 12 ? '9–12º' : '13–16º');
  const nField = res?.field ?? meta.slots;
  const resultCols: Column<Row>[] = [
    { key: 'pl', header: '#', width: 64, cell: (r) => <span className={`ci-place${r.place === 1 ? ' ci-place--1' : ''}`}>{placeTxt(r.place, nField)}</span>, sort: (r) => r.place },
    { key: 'team', header: ct('Time'), cell: (r) => <TeamCell t={p.team(r.teamId)} me={r.teamId === 'user'} /> },
    { key: 'prize', header: ct('Prêmio'), num: true, cell: (r) => fmtPool(Math.round((res?.prizePool ?? meta.prize) * shareOf(r.place, nField))), sort: (r) => -r.place },
    { key: 'vrs', header: 'VRS', num: true, cell: (r) => { const c = contrib(r.teamId); return c ? `+${c}` : '—'; }, sort: (r) => contrib(r.teamId) },
  ];
  type FRow = { teamId: string; invited: boolean };
  const fieldRows: FRow[] = field ? field.teams.map((t) => ({ teamId: t, invited: field.invited.includes(t) })) : [];
  const fieldCols: Column<FRow>[] = [
    { key: 'team', header: ct('Time'), cell: (r) => <TeamCell t={p.team(r.teamId)} me={r.teamId === 'user'} /> },
    { key: 'vrs', header: ct('VRS'), num: true, cell: (r) => (p.vrs[r.teamId]?.rank ? `#${p.vrs[r.teamId].rank}` : '—'), sort: (r) => p.vrs[r.teamId]?.rank ?? 999 },
    { key: 'pts', header: ct('Pontos'), num: true, cell: (r) => p.vrs[r.teamId]?.points ?? 0, sort: (r) => -(p.vrs[r.teamId]?.points ?? 0) },
    { key: 'acc', header: ct('Acesso'), cell: (r) => (r.teamId === 'user' ? <Tag tone="accent">{ct('Você')}</Tag> : r.invited ? <Tag tone="achievement">{ct('Convite (VRS)')}</Tag> : <Tag>{ct('Qualificatório')}</Tag>) },
  ];
  const shares = nField >= 32
    ? [[1, '1º'], [2, '2º'], [3, '3–4º'], [5, '5–8º'], [9, '9–16º'], [17, '17–24º'], [25, '25–32º']] as const
    : [[1, '1º'], [2, '2º'], [3, '3–4º'], [5, '5–8º'], [9, '9–12º'], [13, '13–16º']] as const;
  return (
    <div className="em-tab ci-tab">
      <Panel icon={<Award size={16} />} title={meta.name} flush
        actions={<Button size="sm" variant="ghost" onClick={p.onOpenCalendar}>{ct('Calendário')}</Button>}>
        <div className="ci-pad ci-filters" style={{ paddingBottom: 0 }}>
          <select className="ci-select" aria-label={ct('Evento')} value={id} onChange={(e) => p.onSelect(e.target.value)}>
            {!eventsForSelect.some((x) => x.id === id) && <option value={id}>{meta.name}</option>}
            {eventsForSelect.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
        <div className="ci-facts">
          <div className="ci-fact"><small>{ct('Nível')}</small><b className="ci-tags"><TierTag tier={meta.tier} /> {ct(KIND_LABEL[meta.kind] ?? meta.kind)}</b></div>
          <div className="ci-fact"><small>{ct('Sede')}</small><b className="ci-tags"><LanTag lan={venue.lan} /> <Venue venue={venue.venue} cc={venue.cc} /></b></div>
          <div className="ci-fact"><small>{ct('Quando')}</small><b>{ct('Split')} {meta.split}{meta.etapa ? ` · ${ct('etapa')} ${meta.etapa}` : ''} · {weekTxt}</b></div>
          <div className="ci-fact"><small>{ct('Premiação real')}</small><b className="ci-num">{meta.prize ? fmtPool(meta.prize) : '—'}</b></div>
          <div className="ci-fact"><small>{ct('Região')}</small><b>{REGION_TXT(String(meta.region))}</b></div>
          <div className="ci-fact"><small>{ct('Times')}</small><b className="ci-num">{meta.slots}</b></div>
        </div>
        <p className="ci-format">{formatText(meta)}{meta.qualifier ? '' : venue.lan ? ` ${ct('LAN: a pressão pesa (oculto de jogo grande) e jogador de fora da região precisa de visto.')}` : ` ${ct('Online: sem pressão de palco nem visto.')}`}</p>
      </Panel>

      {mine && p.myLive && (
        <Alert tone="info" title={ct('Você está jogando este evento')}>
          {ct('A chave ao vivo está em Classificação e chave.')} {p.onOpenBracket && <Button size="sm" onClick={p.onOpenBracket}>{ct('Abrir a chave')}</Button>}
        </Alert>
      )}

      <div className="ci-grid">
        <Panel icon={<Trophy size={16} />} title={res ? ct('Resultado') : ct('Participantes')} flush>
          {res ? (
            <Table<Row> columns={resultCols} rows={res.placements} rowKey={(r) => r.teamId} isMe={(r) => r.teamId === 'user'} onRowClick={(r) => r.teamId !== 'user' && p.onOpenTeam(r.teamId)} caption={ct('Resultado do evento')} />
          ) : fieldRows.length ? (
            <Table<FRow> columns={fieldCols} rows={fieldRows} defaultSort={{ key: 'vrs', dir: 'asc' }} rowKey={(r) => r.teamId} isMe={(r) => r.teamId === 'user'} onRowClick={(r) => r.teamId !== 'user' && p.onOpenTeam(r.teamId)} caption={ct('Participantes')} />
          ) : (
            <EmptyState icon={<Users size={20} />} title={ct('Field ainda não definido')}>
              {meta.kind === 'major' || meta.kind === 'rmr'
                ? ct('Sai do ranking VRS publicado depois da última etapa do split de Major.')
                : ct('Os convites saem do ranking VRS perto do evento; o resto das vagas vem do qualificatório.')}
            </EmptyState>
          )}
          {res && res.placements.length < (res.field ?? 0) && <p className="ci-note ci-pad">{ct('Resultado antigo: o save guarda só o pódio do que saiu da janela do VRS.')}</p>}
        </Panel>
        <div className="ci-tab">
          <Panel icon={<Award size={16} />} title={ct('Premiação')} flush>
            <Table<(typeof shares)[number]>
              columns={[
                { key: 'p', header: ct('Colocação'), cell: (r) => r[1] },
                { key: 's', header: '%', num: true, cell: (r) => `${(shareOf(r[0], nField) * 100).toFixed(1)}%` },
                { key: 'v', header: ct('Valor'), num: true, cell: (r) => fmtPool(Math.round(meta.prize * shareOf(r[0], nField))) },
              ]}
              rows={[...shares]} rowKey={(r) => String(r[0])} caption={ct('Premiação por colocação')}
            />
            <p className="ci-note ci-pad">{ct('O VRS conta o dinheiro REAL ganho (fator premiação), os times que você deixou pra trás (rede de adversários) e o desempenho em LAN. O caixa da Carreira paga a régua da economia do jogo.')}</p>
          </Panel>
          <Panel icon={<CalendarDays size={16} />} title={ct('Edições anteriores')} flush>
            {editions.length ? (
              <ul className="ci-agenda" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {editions.slice(0, 6).map((r) => {
                  const ch = r.placements.find((x) => x.place === 1)?.teamId;
                  const ru = r.placements.find((x) => x.place === 2)?.teamId;
                  return (
                    <li key={r.eventId} className="ci-break" style={{ borderTop: 0 }}>
                      <span className="ci-dim">S{r.split}</span>
                      {ch ? <TeamCell t={p.team(ch)} me={ch === 'user'} /> : '—'}
                      {ru && <span className="ci-dim">{ct('vice')}: {p.team(ru).tag}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="ci-note ci-pad">{ct('Sem edição anterior no histórico do mundo.')}</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// estatística compacta reaproveitada pelas telas
export function CircuitStats({ items }: { items: { label: string; value: string | number; hint?: string }[] }) {
  return <div className="ci-stats">{items.map((x) => <Stat key={x.label} label={x.label} value={x.value} hint={x.hint} />)}</div>;
}
