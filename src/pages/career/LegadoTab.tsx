// [super atualização 2 · LEGADO E DINASTIA] Clube › Legado.
// A história da carreira no padrão FM "History": linha do tempo por temporada,
// prêmios da cena (Top 20 do ano, MVPs, revelação, técnico, time ideal),
// lendas do clube e camisas aposentadas, recordes do clube e individuais,
// números all-time por jogador e o Hall da Fama do manager. Tudo derivado do
// save (engine/legado); a cerimônia e os cards compartilháveis saem daqui.
import { useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';

// visão compacta da tabela no celular (as colunas `views: ['full']` somem)
const NARROW_Q = '(max-width: 720px)';
function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(NARROW_Q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(NARROW_Q).matches,
    () => false,
  );
}
import { Award, Crown, Flag as FlagIcon, Medal, Share2, Shirt, Sparkles, Star, Trophy, UserRoundPlus, UserRoundMinus, Clapperboard, Download, Lock } from 'lucide-react';
import { Panel, Table, Segmented, Stat, Tag, Button, EmptyState, RoleChip, type Column } from '../../components/ds/index';
import { Flag } from '../../components/ui';
import { ct } from '../../state/career-i18n';
import type { LegadoView, ClubPlayerLine, ClubLegend, TimelineEntry, ManagerBadge, RecordRow } from '../../engine/legado/historia';
import { entryOf, userHonorsOfYear } from '../../engine/legado/premios';
import type { LegadoState, SceneYearAwards } from '../../engine/legado/model';
import { type LegadoCardData, type CardRosterRow, legadoCardDataUrl, legadoCardFileName, shareLegadoCard, downloadLegadoCard, legadoXText, LEGADO_URL } from '../../state/legadoShareCard';
import { postOnX } from '../../state/shareX';
import { trackShare } from '../../state/track';
import { reputationLabel } from '../../engine/coachCareer';
import '../../styles/legado.css';

type Section = 'timeline' | 'scene' | 'legends' | 'records' | 'hall' | 'cards';

export interface LegadoTabProps {
  view: LegadoView;
  legado: LegadoState;
  split: number;
  orgName: string;
  tag: string;
  colors: [string, string];
  logo?: string;
  roster: CardRosterRow[];               // elenco atual (titulares primeiro)
  coachNick?: string;
  onOpenCeremony: (year: number) => void;
  onRetireShirt: (l: ClubLegend) => void;
  onOpenPlayer: (id: string) => void;
  initialSection?: Section;
}

const MAJOR_PLACE: Record<string, string> = {
  champion: 'Campeão', runnerup: 'Vice', semi: 'Semifinal', quarters: 'Quartas', playoffs: 'Playoffs', swiss: 'Fase suíça',
};

function entryText(e: TimelineEntry): string {
  switch (e.kind) {
    case 'founded': return `${ct('Fundação da')} ${e.a}`;
    case 'title': return `${ct('Campeão do')} ${e.a}`;
    case 'major': return ct('CAMPEÃO DO MAJOR');
    case 'majorRun': return `Major: ${ct(MAJOR_PLACE[e.b ?? ''] ?? e.b ?? '')}`;
    case 'signing': return `${ct('Chegada de')} ${e.a}${e.n ? ` (OVR ${e.n})` : ''}`;
    case 'legendLeft': return `${ct('Despedida de')} ${e.a}${e.n ? ` · ${e.n} ${e.n === 1 ? ct('título') : ct('títulos')}` : ''}`;
    case 'scene': return `${e.a}: #${e.n} ${ct('do Top 20 do ano')}`;
    case 'sceneMvp': return `${e.a}: MVP ${ct('do')} ${e.b}`;
    case 'sceneCoach': return `${e.a}: ${ct('melhor técnico do ano')}`;
    case 'shirt': return `${ct('Camisa de')} ${e.a} ${ct('aposentada')}`;
    default: return e.a ?? '';
  }
}

function EntryIcon({ e }: { e: TimelineEntry }) {
  const p = { size: 15, 'aria-hidden': true } as const;
  if (e.kind === 'title' || e.kind === 'major') return <Trophy {...p} />;
  if (e.kind === 'majorRun') return <Medal {...p} />;
  if (e.kind === 'signing') return <UserRoundPlus {...p} />;
  if (e.kind === 'legendLeft') return <UserRoundMinus {...p} />;
  if (e.kind === 'scene' || e.kind === 'sceneMvp') return <Star {...p} />;
  if (e.kind === 'sceneCoach') return <Award {...p} />;
  if (e.kind === 'shirt') return <Shirt {...p} />;
  return <FlagIcon {...p} />;
}

const RECORD_LABEL: Record<string, string> = {
  titles: 'Títulos', majors: 'Majors vencidos', bestMajor: 'Melhor Major', titleStreak: 'Títulos seguidos', top4Streak: 'Splits seguidos no top 4',
  mostWins: 'Mais vitórias num split', prize: 'Maior premiação num split', unbeaten: 'Campanha invicta',
  mostMaps: 'Mais mapas pelo clube', mostKills: 'Mais abates pelo clube', bestRating: 'Maior rating (20+ mapas)', bestEvent: 'Maior rating num evento',
  mostTitles: 'Mais títulos', peakOvr: 'Maior OVR', longest: 'Mais splits no clube',
};
function recordValue(r: RecordRow): string {
  if (r.id === 'bestMajor') return ct(MAJOR_PLACE[r.detail ?? ''] ?? '');
  if (r.id === 'prize') return `$${Math.round(r.value / 1000)}k`;
  if (r.id === 'bestRating' || r.id === 'bestEvent') return r.value.toFixed(2);
  if (r.id === 'mostWins') return r.detail ?? String(r.value);
  return r.value.toLocaleString('pt-BR');
}
function recordDetail(r: RecordRow): string {
  if (r.id === 'titleStreak' || r.id === 'top4Streak') return `splits ${r.detail}`;
  if (r.id === 'bestRating') return `${r.detail} ${ct('mapas')}`;
  if (r.id === 'bestEvent') return `${r.detail} · split ${r.split}`;
  return r.split ? `split ${r.split}` : '';
}

const BADGE: Record<string, [string, string]> = {
  firstTitle: ['Primeira taça', 'Vença um campeonato'],
  majorDebut: ['Estreia no Major', 'Dispute um Major'],
  fiveTitles: ['Colecionador', 'Vença 5 campeonatos'],
  majorFinal: ['Final de Major', 'Chegue a uma final de Major'],
  unbeaten: ['Invicto', 'Feche um split com 5+ vitórias e nenhuma derrota'],
  topOfWorld: ['Elite mundial', 'Seja campeão jogando no tier 1'],
  starFactory: ['Fábrica de craques', 'Coloque 3 jogadores no Top 20 do ano'],
  majorChampion: ['Campeão do Major', 'Vença um Major'],
  dynasty: ['Dinastia', 'Vença 3 splits seguidos'],
  coachOfYear: ['Técnico do ano', 'Ganhe o prêmio de melhor técnico da cena'],
  legendsHouse: ['Casa de lendas', 'Tenha 3 lendas do clube'],
  playerOfYear: ['Dono do mundo', 'Tenha o #1 do Top 20 do ano'],
  multiMajor: ['Tricampeão', 'Vença 3 Majors'],
  decade: ['Uma década', 'Complete 40 splits na carreira'],
};
const RARITY: Record<ManagerBadge['rarity'], { label: string; tone: 'neutral' | 'accent' | 'epic' | 'achievement' }> = {
  comum: { label: 'Comum', tone: 'neutral' }, rara: { label: 'Rara', tone: 'accent' }, epica: { label: 'Épica', tone: 'epic' }, lendaria: { label: 'Lendária', tone: 'achievement' },
};
const RANK_LABEL: Record<ClubLegend['rank'], string> = { idolo: 'Ídolo', lenda: 'Lenda', imortal: 'Imortal' };

export function LegadoTab(p: LegadoTabProps) {
  const [sec, setSec] = useState<Section>(p.initialSection ?? 'timeline');
  const { view, legado } = p;
  const lastYear = legado.years[legado.years.length - 1] ?? null;
  const [yearSel, setYearSel] = useState<number | null>(null);
  const year = legado.years.find((y) => y.year === yearSel) ?? lastYear;
  const seasons = Math.max(1, Math.ceil(Math.max(1, p.split - 1) / 4));

  return (
    <div className="lg-tab">
      <header className="lg-hero">
        <div className={`lg-hero__crest${p.logo ? ' lg-hero__crest--logo' : ''}`} style={{ '--c1': p.colors[0], '--c2': p.colors[1] } as CSSProperties} aria-hidden>
          {p.logo ? <img src={p.logo} alt="" /> : <Crown size={26} />}
        </div>
        <div className="lg-hero__id">
          <p className="lg-hero__kicker">{ct('Legado e dinastia')}</p>
          <h1 className="lg-hero__name">{p.tag && p.tag.toUpperCase() !== p.orgName.toUpperCase() ? <span className="lg-hero__tag">[{p.tag}]</span> : null} {p.orgName}</h1>
          <p className="lg-hero__sub">{seasons} {seasons === 1 ? ct('temporada') : ct('temporadas')} · {view.hall.splits} splits · {ct('reputação')} {view.hall.reputation} ({ct(reputationLabel(view.hall.reputation))})</p>
        </div>
        <div className="lg-hero__stats">
          <Stat label={ct('Títulos')} value={view.hall.titles} />
          <Stat label="Majors" value={view.hall.majors} />
          <Stat label={ct('Lendas')} value={view.legends.length} />
          <Stat label={ct('Aproveitamento')} value={`${Math.round(view.hall.winRate * 100)}%`} />
        </div>
        <div className="lg-hero__actions">
          {lastYear && <Button variant="achievement" onClick={() => p.onOpenCeremony(lastYear.year)}><Clapperboard size={16} aria-hidden /> {ct('Cerimônia')} {ct('Temporada')} {lastYear.year}</Button>}
          <Button variant="secondary" onClick={() => setSec('cards')}><Share2 size={16} aria-hidden /> {ct('Compartilhar')}</Button>
        </div>
      </header>

      <Segmented<Section>
        label={ct('Seções do legado')}
        className="lg-seg"
        value={sec}
        onChange={setSec}
        items={[
          { value: 'timeline', label: ct('Linha do tempo') },
          { value: 'scene', label: ct('Prêmios da cena') },
          { value: 'legends', label: ct('Lendas'), count: view.legends.length || undefined },
          { value: 'records', label: ct('Recordes') },
          { value: 'hall', label: ct('Hall do manager') },
          { value: 'cards', label: ct('Cards') },
        ]}
      />

      {sec === 'timeline' && <TimelineSection view={view} />}
      {sec === 'scene' && <SceneSection years={legado.years} year={year} onYear={setYearSel} onCeremony={p.onOpenCeremony} onOpenPlayer={p.onOpenPlayer} />}
      {sec === 'legends' && <LegendsSection view={view} shirts={legado.shirts} onRetire={p.onRetireShirt} onOpenPlayer={p.onOpenPlayer} />}
      {sec === 'records' && <RecordsSection view={view} onOpenPlayer={p.onOpenPlayer} />}
      {sec === 'hall' && <HallSection view={view} />}
      {sec === 'cards' && <CardsSection {...p} />}
    </div>
  );
}

// ─── linha do tempo ────────────────────────────────────────────────────────
function TimelineSection({ view }: { view: LegadoView }) {
  if (!view.timeline.length) return <EmptyState title={ct('A história começa no primeiro split')}>{ct('Feche um split para ver a linha do tempo da carreira.')}</EmptyState>;
  return (
    <ol className="lg-tl" aria-label={ct('Linha do tempo da carreira')}>
      {view.timeline.map((s) => (
        <li key={s.year} className="lg-tl__season">
          <div className="lg-tl__year">
            <span className="lg-tl__ylabel">{ct('Temporada')} {s.year}</span>
            <span className="lg-tl__yrange">splits {s.fromSplit}–{s.toSplit}</span>
            {(s.titles > 0 || s.majors > 0) && (
              <span className="lg-tl__ycount">
                {s.majors > 0 && <Tag tone="achievement" icon={<Trophy size={12} aria-hidden />}>{s.majors} Major</Tag>}
                {s.titles > 0 && <Tag tone="win">{s.titles} {s.titles === 1 ? ct('título') : ct('títulos')}</Tag>}
              </span>
            )}
          </div>
          <ul className="lg-tl__list">
            {s.entries.map((e, i) => (
              <li key={i} className={`lg-tl__item lg-tl__item--${e.kind}${e.gold ? ' is-gold' : ''}`}>
                <span className="lg-tl__dot"><EntryIcon e={e} /></span>
                <span className="lg-tl__split">S{e.split}</span>
                <span className="lg-tl__text">{entryText(e)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

// ─── prêmios da cena ───────────────────────────────────────────────────────
function SceneSection({ years, year, onYear, onCeremony, onOpenPlayer }: {
  years: SceneYearAwards[]; year: SceneYearAwards | null; onYear: (y: number) => void; onCeremony: (y: number) => void; onOpenPlayer: (id: string) => void;
}) {
  const narrow = useNarrow();
  if (!year) {
    return (
      <EmptyState title={ct('A primeira cerimônia sai no fim da temporada')}>
        {ct('A cada 4 splits a cena elege o Top 20 do ano, os MVPs dos eventos, a revelação, o melhor técnico e o time ideal, com base nos resultados e nas estatísticas da simulação.')}
      </EmptyState>
    );
  }
  const rev = entryOf(year, year.revelation);
  const hon = userHonorsOfYear(year);
  const cols: Column<SceneYearAwards['top20'][number]>[] = [
    { key: 'r', header: '#', num: true, width: 44, cell: (_e, i) => <b className={i < 3 ? 'lg-rank lg-rank--top' : 'lg-rank'}>{i + 1}</b> },
    { key: 'n', header: ct('Jogador'), cell: (e) => (
      <button type="button" className="lg-plink" onClick={() => onOpenPlayer(e.id)}>
        <Flag cc={e.country} /> <b>{e.nick}</b>
      </button>
    ) },
    { key: 't', header: ct('Time'), cell: (e) => <span className={e.teamId === 'user' ? 'lg-mine' : undefined}>{e.team}</span> },
    { key: 'f', header: ct('Função'), views: ['full'], cell: (e) => <RoleChip role={e.role} /> },
    { key: 'rt', header: 'Rating', num: true, cell: (e) => (e.maps > 0 ? e.rating.toFixed(2) : '—') },
    { key: 'm', header: ct('Mapas'), num: true, views: ['full'], cell: (e) => e.maps || '—' },
    { key: 'ti', header: ct('Títulos'), num: true, views: ['full'], cell: (e) => e.titles || '—' },
    { key: 'o', header: 'OVR', num: true, views: ['full'], cell: (e) => e.ovr },
  ];
  return (
    <div className="lg-grid">
      <Panel
        title={`Top 20 · ${ct('Temporada')} ${year.year}`}
        icon={<Star size={16} />}
        actions={(
          <div className="lg-yearpick">
            {years.length > 1 && (
              <select aria-label={ct('Temporada')} value={year.year} onChange={(e) => onYear(Number(e.target.value))} className="lg-select">
                {[...years].reverse().map((y) => <option key={y.year} value={y.year}>{ct('Temporada')} {y.year}</option>)}
              </select>
            )}
            <Button size="sm" variant="achievement" onClick={() => onCeremony(year.year)}><Clapperboard size={14} aria-hidden /> {ct('Rever cerimônia')}</Button>
          </div>
        )}
        flush
      >
        <Table rows={year.top20} rowKey={(e) => e.id} columns={cols} isMe={(e) => e.teamId === 'user'} caption={`Top 20 ${ct('Temporada')} ${year.year}`} className="lg-top20" view={narrow ? 'compact' : 'full'} />
        <p className="lg-note">{ct('Régua: nível (OVR) no fim do ano, rating HLTV 2.0 nos mapas simulados (com peso pela amostra) e títulos do time no circuito, com peso por tier, LAN e Major.')}</p>
      </Panel>
      <div className="lg-side">
        <Panel title={ct('Prêmios do ano')} icon={<Award size={16} />} tone="achievement">
          <dl className="lg-awards">
            <div><dt>{ct('Jogador do ano')}</dt><dd><b>{year.top20[0]?.nick}</b> <span>{year.top20[0]?.team}</span></dd></div>
            <div><dt>{ct('Revelação do ano')}</dt><dd>{rev ? <><b>{rev.nick}</b> <span>{rev.team} · {rev.age} {ct('anos')}</span></> : '—'}</dd></div>
            <div><dt>{ct('Melhor técnico')}</dt><dd>{year.coach ? <><b>{year.coach.nick}</b> <span>{year.coach.team} · {year.coach.titles} {year.coach.titles === 1 ? ct('título') : ct('títulos')}</span></> : '—'}</dd></div>
          </dl>
        </Panel>
        <Panel title={ct('Time ideal')} icon={<Sparkles size={16} />}>
          <ul className="lg-ideal">
            {year.ideal.map((id) => {
              const e = entryOf(year, id);
              return e ? <li key={id} className={e.teamId === 'user' ? 'is-mine' : undefined}><RoleChip role={e.role} /> <b>{e.nick}</b> <span>{e.team}</span></li> : null;
            })}
          </ul>
        </Panel>
        <Panel title={ct('MVPs dos eventos')} icon={<Medal size={16} />}>
          {year.mvps.length ? (
            <ul className="lg-mvps">
              {year.mvps.map((m) => (
                <li key={m.eventId} className={m.teamId === 'user' ? 'is-mine' : undefined}>
                  <span className="lg-mvps__ev">{m.major ? <Tag tone="achievement">Major</Tag> : <Tag>Tier {m.tier}</Tag>} {m.event}</span>
                  <span><b>{m.nick}</b> · {m.team}</span>
                </li>
              ))}
            </ul>
          ) : <p className="lg-note">{ct('Nenhum evento grande decidido nesta temporada.')}</p>}
        </Panel>
        {(hon.top20.length > 0 || hon.mvps.length > 0 || hon.coach || hon.revelation) && (
          <Panel title={ct('Seu clube na cerimônia')} icon={<Crown size={16} />}>
            <ul className="lg-mvps">
              {hon.top20.map((e) => <li key={e.id} className="is-mine"><span><b>{e.nick}</b></span><span>#{year.top20.findIndex((x) => x.id === e.id) + 1} Top 20</span></li>)}
              {hon.mvps.map((m) => <li key={m.eventId} className="is-mine"><span><b>{m.nick}</b></span><span>MVP · {m.event}</span></li>)}
              {hon.revelation && rev && <li className="is-mine"><span><b>{rev.nick}</b></span><span>{ct('Revelação do ano')}</span></li>}
              {hon.coach && year.coach && <li className="is-mine"><span><b>{year.coach.nick}</b></span><span>{ct('Melhor técnico')}</span></li>}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ─── lendas e camisas ──────────────────────────────────────────────────────
function LegendsSection({ view, shirts, onRetire, onOpenPlayer }: { view: LegadoView; shirts: LegadoState['shirts']; onRetire: (l: ClubLegend) => void; onOpenPlayer: (id: string) => void }) {
  return (
    <div className="lg-legends">
      {shirts.length > 0 && (
        <Panel title={ct('Camisas aposentadas')} icon={<Shirt size={16} />} tone="achievement">
          <ul className="lg-shirts">
            {shirts.map((s) => (
              <li key={s.playerId} className="lg-shirt">
                <span className="lg-shirt__jersey" aria-hidden><Shirt size={40} strokeWidth={1.4} /></span>
                <b className="lg-shirt__nick">{s.nick}</b>
                <span className="lg-shirt__meta">{s.maps} {ct('mapas')} · {s.titles} {s.titles === 1 ? ct('título') : ct('títulos')}</span>
                <span className="lg-shirt__meta">{ct('aposentada no split')} {s.split}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title={ct('Lendas do clube')} icon={<Crown size={16} />}>
        {view.legends.length === 0 ? (
          <EmptyState title={ct('Nenhuma lenda ainda')}>{ct('Títulos, Majors, longevidade, pico de nível e prêmios da cena fazem um jogador virar ídolo, lenda ou imortal do clube.')}</EmptyState>
        ) : (
          <ul className="lg-legend-cards">
            {view.legends.map((l) => (
              <li key={l.id} className={`lg-legend lg-legend--${l.rank}`}>
                <div className="lg-legend__head">
                  <Tag tone={l.rank === 'imortal' ? 'achievement' : l.rank === 'lenda' ? 'epic' : 'accent'}>{ct(RANK_LABEL[l.rank])}</Tag>
                  {l.inSquad && !l.retired && <Tag tone="win">{ct('no elenco')}</Tag>}
                  {l.retired && <Tag>{ct('aposentado')}</Tag>}
                </div>
                <button type="button" className="lg-legend__name" onClick={() => onOpenPlayer(l.id)}>
                  {l.country && <Flag cc={l.country} />} <b>{l.nick}</b>
                </button>
                <dl className="lg-legend__nums">
                  <div><dt>{ct('Mapas')}</dt><dd>{l.maps}</dd></div>
                  <div><dt>{ct('Títulos')}</dt><dd>{l.titles}</dd></div>
                  <div><dt>Majors</dt><dd>{l.majors}</dd></div>
                  <div><dt>Rating</dt><dd>{l.rating ? l.rating.toFixed(2) : '—'}</dd></div>
                  <div><dt>{ct('Pico')}</dt><dd>{l.peakOvr || '—'}</dd></div>
                  <div><dt>Top 20</dt><dd>{l.sceneTop20 ? `${l.sceneTop20}× (#${l.bestRank})` : '—'}</dd></div>
                </dl>
                <div className="lg-legend__foot">
                  {l.shirtRetired ? (
                    <Tag tone="achievement" icon={<Shirt size={12} aria-hidden />}>{ct('Camisa aposentada')}</Tag>
                  ) : l.canRetireShirt ? (
                    <Button size="sm" variant="achievement" onClick={() => onRetire(l)}><Shirt size={14} aria-hidden /> {ct('Aposentar a camisa')}</Button>
                  ) : (
                    <span className="lg-note lg-note--tight">{l.rank === 'idolo' ? ct('Camisa: só para lendas e imortais') : ct('Camisa: depois que ele sair ou parar')}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ─── recordes + all-time ───────────────────────────────────────────────────
function RecordsSection({ view, onOpenPlayer }: { view: LegadoView; onOpenPlayer: (id: string) => void }) {
  const narrow = useNarrow();
  const cols: Column<ClubPlayerLine>[] = [
    { key: 'n', header: ct('Jogador'), cell: (l) => (
      <button type="button" className="lg-plink" onClick={() => onOpenPlayer(l.id)}>
        {l.country && <Flag cc={l.country} />} <b>{l.nick}</b>
      </button>
    ), sort: (l) => l.nick.toLowerCase() },
    { key: 'f', header: ct('Função'), views: ['full'], cell: (l) => (l.role ? <RoleChip role={l.role} /> : '—') },
    { key: 'p', header: ct('Período'), views: ['full'], cell: (l) => (l.firstSplit ? `S${l.firstSplit}–${l.lastSplit == null ? ct('hoje') : `S${l.lastSplit}`}` : '—') },
    { key: 's', header: 'Splits', num: true, cell: (l) => l.splits || '—', sort: (l) => l.splits },
    { key: 'm', header: ct('Mapas'), num: true, cell: (l) => l.maps || '—', sort: (l) => l.maps },
    { key: 'k', header: 'K', num: true, views: ['full'], cell: (l) => l.kills || '—', sort: (l) => l.kills },
    { key: 'r', header: 'Rating', num: true, cell: (l) => (l.rating ? l.rating.toFixed(2) : '—'), sort: (l) => l.rating },
    { key: 'a', header: 'ADR', num: true, views: ['full'], cell: (l) => l.adr || '—', sort: (l) => l.adr },
    { key: 't', header: ct('Títulos'), num: true, cell: (l) => l.titles || '—', sort: (l) => l.titles },
    { key: 'o', header: ct('Pico'), num: true, views: ['full'], cell: (l) => l.peakOvr || '—', sort: (l) => l.peakOvr },
  ];
  const rec = (rows: RecordRow[]) => (
    <ul className="lg-records">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="lg-records__label">{ct(RECORD_LABEL[r.id] ?? r.id)}</span>
          <b className="lg-records__value">{recordValue(r)}</b>
          <span className="lg-records__who">{r.holder}{recordDetail(r) ? ` · ${recordDetail(r)}` : ''}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="lg-records-wrap">
      <div className="lg-grid lg-grid--even">
        <Panel title={ct('Recordes do clube')} icon={<Trophy size={16} />} tone="achievement">{view.records.club.length ? rec(view.records.club) : <p className="lg-note">{ct('Sem recordes ainda.')}</p>}</Panel>
        <Panel title={ct('Recordes individuais')} icon={<Medal size={16} />}>{view.records.individual.length ? rec(view.records.individual) : <p className="lg-note">{ct('Sem recordes ainda.')}</p>}</Panel>
      </div>
      <Panel title={ct('Números all-time no clube')} icon={<Star size={16} />} flush>
        <Table rows={view.lines} rowKey={(l) => l.id} columns={cols} isMe={(l) => l.inSquad} caption={ct('Números all-time no clube')} view={narrow ? 'compact' : 'full'} defaultSort={{ key: 'm', dir: 'desc' }} />
      </Panel>
    </div>
  );
}

// ─── Hall do manager ───────────────────────────────────────────────────────
function HallSection({ view }: { view: LegadoView }) {
  const h = view.hall;
  const unlocked = h.badges.filter((b) => b.unlocked).length;
  const order: ManagerBadge['rarity'][] = ['lendaria', 'epica', 'rara', 'comum'];
  const badges = [...h.badges].sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || order.indexOf(a.rarity) - order.indexOf(b.rarity));
  return (
    <div className="lg-hall">
      <Panel title={ct('Hall da Fama do manager')} icon={<Crown size={16} />} tone="achievement">
        <div className="lg-rep">
          <div className="lg-rep__dial" style={{ '--rep': `${h.reputation}` } as CSSProperties} role="img" aria-label={`${ct('Reputação')} ${h.reputation}`}>
            <b>{h.reputation}</b><span>{ct(reputationLabel(h.reputation))}</span>
          </div>
          <div className="lg-rep__stats">
            <Stat label="Splits" value={h.splits} />
            <Stat label={ct('Títulos')} value={h.titles} />
            <Stat label="Majors" value={h.majors} />
            <Stat label={ct('Conquistas')} value={`${unlocked}/${h.badges.length}`} />
          </div>
        </div>
      </Panel>
      <ul className="lg-badges">
        {badges.map((b) => {
          const [name, how] = BADGE[b.id] ?? [b.id, ''];
          return (
            <li key={b.id} className={`lg-badge lg-badge--${b.rarity}${b.unlocked ? ' is-on' : ''}`}>
              <span className="lg-badge__icon" aria-hidden>{b.unlocked ? <Trophy size={22} /> : <Lock size={20} />}</span>
              <div className="lg-badge__txt">
                <b>{ct(name)}</b>
                <span>{ct(how)}</span>
                {!b.unlocked && b.goal > 1 && (
                  <span className="lg-badge__bar" aria-label={`${b.progress}/${b.goal}`}><i style={{ width: `${(b.progress / b.goal) * 100}%` }} /></span>
                )}
              </div>
              <Tag tone={RARITY[b.rarity].tone}>{ct(RARITY[b.rarity].label)}</Tag>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── cards compartilháveis ─────────────────────────────────────────────────
export function buildCardsFor(p: LegadoTabProps): { id: string; label: string; data: LegadoCardData | null; locked?: string }[] {
  const { view, legado } = p;
  const trophies: string[] = [];
  if (view.hall.majors) trophies.push(`${view.hall.majors}× ${ct('Campeão do Major')}`);
  const tRec = view.records.club.find((r) => r.id === 'titleStreak');
  if (tRec && tRec.value >= 2) trophies.push(`${tRec.value} ${ct('títulos seguidos')}`);
  if (view.hall.titles) trophies.push(`${view.hall.titles} ${view.hall.titles === 1 ? ct('título') : ct('títulos')} ${ct('de circuito')}`);
  const top1 = legado.years.filter((y) => y.top20[0]?.teamId === 'user').length;
  if (top1) trophies.push(`${top1}× ${ct('jogador do ano')}`);
  const unbeaten = view.records.club.find((r) => r.id === 'unbeaten');
  if (unbeaten) trophies.push(`${ct('Campanha invicta')} (${unbeaten.value}–0)`);
  const ind = Object.fromEntries(view.records.individual.map((r) => [r.id, r]));
  const numbers = [
    { label: ct('Aproveitamento'), value: `${Math.round(view.hall.winRate * 100)}%` },
    { label: ct('Lendas'), value: String(view.legends.length) },
    ...(ind.mostMaps ? [{ label: ct('Mais mapas'), value: `${ind.mostMaps.holder} ${ind.mostMaps.value}` }] : []),
    ...(ind.bestRating ? [{ label: ct('Maior rating'), value: `${ind.bestRating.holder} ${ind.bestRating.value.toFixed(2)}` }] : []),
  ];
  const dynasty: LegadoCardData = {
    kind: 'dynasty', orgName: p.orgName, tag: p.tag, colors: p.colors,
    seasons: Math.max(1, Math.ceil(Math.max(1, p.split - 1) / 4)), splits: view.hall.splits, titles: view.hall.titles, majors: view.hall.majors,
    reputation: view.hall.reputation, repLabel: ct(reputationLabel(view.hall.reputation)),
    roster: p.roster.slice(0, 5), trophies, legends: view.legends.slice(0, 4).map((l) => l.nick), numbers,
  };
  // campeão do Major: o mais recente; elenco = quem estava no clube naquele split
  const majorSplit = [...view.timeline].flatMap((s) => s.entries).filter((e) => e.kind === 'major').map((e) => e.split).sort((a, b) => b - a)[0];
  let major: LegadoCardData | null = null;
  if (majorSplit) {
    const champs = view.lines
      .filter((l) => l.firstSplit && l.firstSplit <= majorSplit && (l.lastSplit == null || l.lastSplit >= majorSplit))
      .sort((a, b) => b.maps - a.maps)
      .slice(0, 5);
    const roster = champs.length >= 3 ? champs.map((l) => ({ nick: l.nick, role: l.role, value: l.rating ? l.rating.toFixed(2) : undefined })) : p.roster.slice(0, 5);
    const yearAw = legado.years.find((y) => y.startSplit <= majorSplit && y.endSplit >= majorSplit);
    const mvp = yearAw?.mvps.find((m) => m.major && m.teamId === 'user')?.nick;
    major = {
      kind: 'major', orgName: p.orgName, tag: p.tag, colors: p.colors,
      title: `Major · ${ct('Temporada')} ${Math.ceil(majorSplit / 4)}`,
      roster, coach: p.coachNick, mvp,
      numbers: [
        { label: 'Majors', value: String(view.hall.majors) },
        { label: ct('Títulos'), value: String(view.hall.titles) },
        { label: ct('Reputação'), value: String(view.hall.reputation) },
      ],
    };
  }
  // jogador do ano: o #1 mais recente do SEU clube
  let poty: LegadoCardData | null = null;
  for (let i = legado.years.length - 1; i >= 0 && !poty; i--) {
    const y = legado.years[i];
    const e = y.top20[0];
    if (e?.teamId !== 'user') continue;
    poty = {
      kind: 'poty', nick: e.nick, country: e.country, role: e.role, team: p.orgName, year: y.year,
      rating: e.maps ? e.rating.toFixed(2) : '—', maps: e.maps, titles: e.titles, ovr: e.ovr,
      runnersUp: y.top20.slice(1, 5).map((x, j) => ({ nick: `#${j + 2} ${x.nick}`, role: x.team, value: x.maps ? x.rating.toFixed(2) : String(x.ovr) })),
      orgName: p.orgName, colors: p.colors,
    };
  }
  return [
    { id: 'dynasty', label: ct('Minha dinastia'), data: dynasty },
    { id: 'major', label: ct('Campeão do Major'), data: major, locked: ct('Vença um Major para liberar este card.') },
    { id: 'poty', label: ct('Jogador do ano'), data: poty, locked: ct('Tenha o #1 do Top 20 do ano para liberar este card.') },
  ];
}

function CardsSection(p: LegadoTabProps) {
  const cards = useMemo(() => buildCardsFor(p), [p]);
  const [sel, setSel] = useState(cards[0].id);
  const card = cards.find((c) => c.id === sel) ?? cards[0];
  const [img, setImg] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const preview = img?.id === card.id ? img.url : null;
  const render = async () => {
    if (!card.data) return;
    setBusy(true);
    try { setImg({ id: card.id, url: await legadoCardDataUrl(card.data) }); } finally { setBusy(false); }
  };
  const share = async () => {
    if (!card.data) return;
    setBusy(true);
    try {
      const r = await shareLegadoCard(card.data);
      trackShare(`legado-${card.data.kind}`, r === 'shared' ? 'native' : 'copy');
      setMsg(r === 'shared' ? ct('Card compartilhado.') : ct('Card baixado e texto copiado.'));
    } finally { setBusy(false); }
  };
  // X: abre o compositor ANTES de qualquer await (senão o popup é bloqueado) e
  // baixa o PNG em seguida — o intent não aceita arquivo, o jogador anexa.
  const shareX = async () => {
    if (!card.data) return;
    const data = card.data;
    postOnX(`legado-${data.kind}`, legadoXText(data), LEGADO_URL);
    setMsg(ct('Abriu o X: anexa a imagem que baixou 😉'));
    try {
      const url = preview ?? await legadoCardDataUrl(data);
      downloadLegadoCard(url, legadoCardFileName(data));
    } catch { /* canvas indisponível: o post sai só com texto */ }
  };
  const download = async () => {
    if (!card.data) return;
    const url = preview ?? await legadoCardDataUrl(card.data);
    downloadLegadoCard(url, legadoCardFileName(card.data));
  };
  return (
    <div className="lg-cards">
      <ul className="lg-cards__pick" role="list">
        {cards.map((c) => (
          <li key={c.id}>
            <button type="button" className={`lg-cardpick${c.id === card.id ? ' is-on' : ''}${c.data ? '' : ' is-locked'}`} aria-pressed={c.id === card.id} onClick={() => { setSel(c.id); setMsg(''); }}>
              {c.data ? <Share2 size={16} aria-hidden /> : <Lock size={16} aria-hidden />}
              <b>{c.label}</b>
              {!c.data && <span>{c.locked}</span>}
            </button>
          </li>
        ))}
      </ul>
      <Panel title={card.label} icon={<Share2 size={16} />} className="lg-cards__stage">
        {card.data ? (
          <>
            <div className="lg-cards__preview">
              {preview ? <img src={preview} alt={card.label} width={540} height={675} /> : (
                <button type="button" className="lg-cards__gen" onClick={render} disabled={busy}>
                  <Sparkles size={22} aria-hidden /> {busy ? ct('Gerando…') : ct('Gerar o card')}
                </button>
              )}
            </div>
            <div className="lg-cards__actions">
              <Button variant="achievement" onClick={share} disabled={busy}><Share2 size={16} aria-hidden /> {ct('Compartilhar')}</Button>
              <Button variant="secondary" onClick={download} disabled={busy}><Download size={16} aria-hidden /> {ct('Baixar PNG')}</Button>
              <Button variant="secondary" onClick={() => { void shareX(); }} disabled={busy}>{ct('Postar no X')}</Button>
            </div>
            {msg && <p className="lg-note" role="status">{msg}</p>}
            <p className="lg-note">{ct('O card é gerado no seu aparelho (PNG 1080×1350). No celular, abre o compartilhamento do sistema; no computador, baixa a imagem e copia o texto.')}</p>
          </>
        ) : <EmptyState title={ct('Card bloqueado')}>{card.locked}</EmptyState>}
      </Panel>
    </div>
  );
}
