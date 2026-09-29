// [fase 4 · frente CIRCUITO] Calendário da temporada (agenda estilo FM): os
// oito eventos de cada etapa (tiers 1/2/3, mundiais e regionais) com os
// qualificatórios abertos e fechados, o ciclo do Major (RMRs → Major), as
// pausas, LAN × online com a sede, a premiação real e quem ganhou o quê — os
// eventos que você não joga rodam em segundo plano. Filtros por tier e região,
// e a sua rota até o Major. Clique num evento pra abrir a página dele (Circuito).
import { useMemo, useState } from 'react';
import { CalendarDays, Coffee, Trophy } from 'lucide-react';
import { Panel, Segmented, Tag } from '../../components/ds/index';
import { TeamBadge } from '../../components/ui';
import { ct } from '../../state/career-i18n';
import type { CalendarEvent, WorldEventResult } from '../../engine/mundo/model';
import { calendarVenue, isMajorSplit, seasonBreaks, WEEKS_PER_ETAPA, EVENTS_PER_SPLIT } from '../../engine/mundo/circuito';
import { CircuitStats, LanTag, MajorRoutePanel, TierTag, Venue, fmtPool, REGION_TXT, type MajorRouteInfo, type TeamLite } from './CircuitoViews';
import '../../styles/circuito.css';

type TierF = 'all' | '1' | '2' | '3';
type RegF = 'all' | 'global' | 'americas' | 'europe' | 'asia';

interface Props {
  season: number;
  split: number;
  etapa: number;
  week: number;
  calendar: CalendarEvent[];              // a temporada inteira
  results: WorldEventResult[];
  myEventId: string | null;
  myLive: boolean;
  qualifiers: Record<string, 'won' | 'lost'>;
  route: MajorRouteInfo;
  userRank: number;
  userPoints: number;
  team: (id: string) => TeamLite;
  onOpenEvent: (id: string) => void;
}

const placeShort = (pl: number, field: number) => (pl === 1 ? '1º' : pl === 2 ? '2º' : pl <= 4 ? '3–4º' : pl <= 8 ? '5–8º' : field >= 32 ? (pl <= 16 ? '9–16º' : pl <= 24 ? '17–24º' : '25–32º') : pl <= 12 ? '9–12º' : '13–16º');

export function CalendarTab(p: Props) {
  const [tier, setTier] = useState<TierF>('all');
  const [reg, setReg] = useState<RegF>('all');
  const [qualis, setQualis] = useState<'hide' | 'show'>('hide');
  const resultOf = useMemo(() => new Map(p.results.map((r) => [r.eventId, r])), [p.results]);
  const breaks = useMemo(() => seasonBreaks(p.season), [p.season]);
  const splits = useMemo(() => [...new Set(p.calendar.map((e) => e.split))].sort((a, b) => a - b), [p.calendar]);
  const pass = (e: CalendarEvent) =>
    (tier === 'all' || String(e.tier) === tier)
    && (reg === 'all' || String(e.region) === reg)
    && (e.kind !== 'qualifier' || qualis === 'show');

  const statusOf = (e: CalendarEvent) => {
    const r = resultOf.get(e.id);
    const mineRes = r?.placements.find((x) => x.teamId === 'user');
    if (e.kind === 'qualifier') {
      const q = e.qualifiesTo ? p.qualifiers[e.qualifiesTo] : undefined;
      return <>{q === 'won' ? <Tag tone="win">{ct('Você passou')}</Tag> : q === 'lost' ? <Tag tone="loss">{ct('Você caiu')}</Tag> : null}<Tag tone="warn">{e.qualifier === 'closed' ? ct('Fechado') : ct('Aberto')}</Tag></>;
    }
    if (r) {
      const champ = r.placements.find((x) => x.place === 1)?.teamId;
      const t = champ ? p.team(champ) : null;
      return (
        <>
          {mineRes && <Tag tone={mineRes.place <= 2 ? 'achievement' : 'accent'}>{ct('Você')} {placeShort(mineRes.place, r.field ?? 16)}</Tag>}
          {t && <><Trophy size={12} aria-hidden /> <TeamBadge tag={t.tag} colors={t.colors} size={16} logoUrl={t.logoUrl} /> <b>{t.tag}</b></>}
        </>
      );
    }
    if (e.id === p.myEventId && p.myLive) return <Tag tone="accent">{ct('Você joga')}</Tag>;
    if (e.split === p.split && (e.etapa ?? 99) === p.etapa) return <Tag tone="warn">{ct('Em andamento')}</Tag>;
    return <span className="ci-dim">{ct('a seguir')}</span>;
  };
  const row = (e: CalendarEvent) => {
    const v = calendarVenue(e);
    const mine = e.id === p.myEventId || !!resultOf.get(e.id)?.placements.some((x) => x.teamId === 'user');
    return (
      <button key={e.id} type="button" className={`ci-ev${mine ? ' ci-ev--mine' : ''}`} onClick={() => p.onOpenEvent(e.kind === 'qualifier' && e.qualifiesTo ? e.qualifiesTo : e.id)}>
        <span className="ci-tags" style={{ paddingLeft: 'var(--sp-3)' }}><TierTag tier={e.tier} /></span>
        <span className="ci-ev__name">
          {e.kind === 'qualifier' ? `${ct('Qualificatório')} · ${e.name}` : e.name}
          <small>{e.kind === 'major' ? ct('Major · 32 times') : e.kind === 'rmr' ? ct('RMR · 16 times') : e.kind === 'qualifier' ? `${e.slots} ${ct('times · vaga no evento')}` : `${REGION_TXT(String(e.region))} · 16 ${ct('times')}`}</small>
        </span>
        <span className="ci-tags"><LanTag lan={v.lan} /> <Venue venue={v.venue} cc={v.cc} /></span>
        <span className="ci-ev__prize">{e.prize ? fmtPool(e.prize) : '—'}</span>
        <span className="ci-ev__status">{statusOf(e)}</span>
      </button>
    );
  };

  return (
    <div className="em-tab ci-tab">
      <CircuitStats items={[
        { label: ct('Temporada'), value: p.season },
        { label: ct('Agora'), value: `S${p.split} · E${p.etapa}`, hint: `${ct('semana')} ${p.week}` },
        { label: ct('Ranking VRS'), value: p.userRank < 999 ? `#${p.userRank}` : '—', hint: `${p.userPoints} ${ct('pts')}` },
        { label: ct('Próximo Major'), value: `S${p.route.majorSplit}`, hint: p.route.majorName },
      ]} />
      <MajorRoutePanel info={p.route} />
      <Panel icon={<CalendarDays size={16} />} title={`${ct('Calendário da temporada')} ${p.season}`} flush
        actions={(
          <span className="ci-filters">
            <Segmented<TierF> label={ct('Tier')} value={tier} onChange={setTier} items={[
              { value: 'all', label: ct('Todos') }, { value: '1', label: 'T1' }, { value: '2', label: 'T2' }, { value: '3', label: 'T3' },
            ]} />
            <Segmented<RegF> label={ct('Região')} value={reg} onChange={setReg} items={[
              { value: 'all', label: ct('Todas') }, { value: 'global', label: ct('Mundial') }, { value: 'americas', label: ct('Américas') }, { value: 'europe', label: ct('Europa') }, { value: 'asia', label: ct('Ásia') },
            ]} />
            <Segmented<'hide' | 'show'> label={ct('Qualificatórios')} value={qualis} onChange={setQualis} items={[
              { value: 'hide', label: ct('Eventos') }, { value: 'show', label: ct('+ Qualificatórios') },
            ]} />
          </span>
        )}>
        <div className="ci-agenda">
          {splits.map((sp) => {
            const evs = p.calendar.filter((e) => e.split === sp);
            const br = breaks.find((b) => b.split === sp);
            const majorList = isMajorSplit(sp) ? evs.filter((e) => (e.kind === 'rmr' || e.kind === 'major') && pass(e)) : [];
            return (
              <section key={sp} className="ci-split" aria-label={`Split ${sp}`}>
                <div className={`ci-split__head${sp === p.split ? ' ci-split__head--now' : ''}`}>
                  <b>Split {sp}</b>
                  {isMajorSplit(sp) && <Tag tone="achievement">{ct('Split de Major')}</Tag>}
                  {sp === p.split && <Tag tone="accent">{ct('agora')}</Tag>}
                </div>
                {Array.from({ length: EVENTS_PER_SPLIT }, (_, i) => i + 1).map((et) => {
                  const list = evs.filter((e) => e.etapa === et && pass(e));
                  const w0 = (et - 1) * WEEKS_PER_ETAPA + 1;
                  return (
                    <div key={et} className={`ci-etapa${sp === p.split && et === p.etapa ? ' ci-etapa--now' : ''}`}>
                      <div className="ci-etapa__when"><b>{ct('Etapa')} {et}</b><small>{ct('sem.')} {w0}–{w0 + WEEKS_PER_ETAPA - 1}</small></div>
                      <div className="ci-events">
                        {list.length ? list.map(row) : <div className="ci-empty">{ct('Nenhum evento com esses filtros.')}</div>}
                      </div>
                    </div>
                  );
                })}
                {majorList.length > 0 && (
                  <div className="ci-etapa">
                    <div className="ci-etapa__when"><b>Major</b><small>{ct('sem.')} {majorList[0].week}–{majorList[0].week + 4}</small></div>
                    <div className="ci-events">{majorList.map(row)}</div>
                  </div>
                )}
                {br && (
                  <div className="ci-break">
                    <Coffee size={13} aria-hidden />
                    {br.major ? ct('Férias pós-Major') : ct('Pausa entre splits')} · {br.weeks} {br.weeks > 1 ? ct('semanas') : ct('semana')} ·{' '}
                    {ct('mercado, renovações e evolução; o elenco descansa (condição se recupera).')}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
