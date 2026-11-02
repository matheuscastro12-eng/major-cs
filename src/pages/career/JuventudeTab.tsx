// [fase 4 · frente JUVENTUDE] Mercado › Juventude.
// A geração do ano (jovens de 16–18 revelados por região e pelas academias), a
// SUA geração (que você leva para a academia), as promessas do mundo com o
// relatório do olheiro — PA estimado como FAIXA, mais estreita com olheiros
// melhores na comissão — a distribuição de potencial da leva e as aposentadorias
// da cena (quem virou técnico/analista entra no mercado de staff).
import { useMemo, useState } from 'react';
import { ChartNoAxesColumn, GraduationCap, Sprout, Telescope, UserRoundMinus } from 'lucide-react';
import { Panel, Table, Segmented, Stat, Tag, Button, EmptyState, Ovr, RoleChip, type Column } from '../../components/ds/index';
import { Flag } from '../../components/ui';
import { CaPaStars } from '../../components/career/CaPaStars';
import { paRange, starsOf, type ScoutKnowledge } from '../../engine/attrs/stars';
import { playerOvr } from '../../engine/ratings';
import { MACRO_REGION_LABELS, MACRO_REGION_ORDER, type MacroRegion } from '../../data/regions';
import type { Player } from '../../types';
import {
  USER_ORIGIN, careerYearOf, newgenAge, newgenList, newgenOrigin, parseNewgenId, type MundoJuv,
} from '../../engine/mundo/juventude';
import { academyIdForNewgen, academyName } from '../../engine/mundo/juventudeMundo';
import { ct } from '../../state/career-i18n';
import '../../styles/juventude.css';

interface ClubRef { id: string; tag: string; name: string }
interface AcademyRef { id: string; nick: string }

interface Props {
  split: number;
  mundo: MundoJuv;
  moves: Record<string, string>;
  clubOf: (teamId: string) => ClubRef | null;
  /** staffEffects().scoutAccuracy (0–1): estreita a faixa do PA */
  scoutAccuracy: number;
  orgName: string;
  academy: AcademyRef[];
  academyMax: number;
  onTakeToAcademy: (id: string) => void;
  onOpenPlayer: (p: Player) => void;
  onGoAcademy: () => void;
}

interface Row {
  p: Player;
  age: number;
  ovr: number;
  ca: number;
  band: [number, number];
  est: number;          // meio da faixa (o que o olheiro "acha")
  region: MacroRegion;
  origin: string | null;
  club: ClubRef | null;
  year: number;
  own: boolean;
}

type RegionFilter = MacroRegion | 'all';
type Cohort = 'year' | 'all';

/** Nota do olheiro pelo PA estimado (escala 1–200). */
export function scoutNote(est: number): { text: string; tone: 'epic' | 'win' | 'accent' | 'neutral' | 'loss' } {
  if (est >= 165) return { text: 'Joia rara: pode virar um dos melhores do mundo', tone: 'epic' };
  if (est >= 145) return { text: 'Talento de elite: titular de tier 1 no futuro', tone: 'win' };
  if (est >= 125) return { text: 'Bom prospecto: pode ser titular de tier 2', tone: 'accent' };
  if (est >= 105) return { text: 'Profissional de tier 3, se evoluir', tone: 'neutral' };
  return { text: 'Dificilmente chega ao profissional', tone: 'loss' };
}

const BANDS: { lo: number; hi: number; label: string }[] = [
  { lo: 0, hi: 90, label: '< 90' },
  { lo: 90, hi: 110, label: '90–109' },
  { lo: 110, hi: 130, label: '110–129' },
  { lo: 130, hi: 150, label: '130–149' },
  { lo: 150, hi: 170, label: '150–169' },
  { lo: 170, hi: 999, label: '170+' },
];

const fmtStars = (v: number) => starsOf(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function PaCell({ band }: { band: [number, number] }) {
  const lo = starsOf(band[0]), hi = Math.max(lo, starsOf(band[1]));
  return (
    <span className="juv-pa" title={`${ct('PA estimado')} ${band[0]}–${band[1]}`}>
      <span className="juv-pa__stars" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="juv-pa__star" style={{ ['--solid' as string]: `${Math.max(0, Math.min(1, lo - i)) * 100}%`, ['--range' as string]: `${Math.max(0, Math.min(1, hi - i)) * 100}%` }}>★</span>
        ))}
      </span>
      <small>{lo === hi ? fmtStars(band[0]) : `${fmtStars(band[0])}–${fmtStars(band[1])}`}</small>
    </span>
  );
}

export function JuventudeTab({ split, mundo, moves, clubOf, scoutAccuracy, orgName, academy, academyMax, onTakeToAcademy, onOpenPlayer, onGoAcademy }: Props) {
  const [region, setRegion] = useState<RegionFilter>('all');
  const [cohort, setCohort] = useState<Cohort>('year');
  const year = careerYearOf(split);

  const rows = useMemo<Row[]>(() => newgenList(mundo).map((p) => {
    const g = parseNewgenId(p.id)!;
    const origin = newgenOrigin(mundo, p.id);
    const own = origin === USER_ORIGIN;
    const ca = p.attrs?.ca ?? 1;
    const pa = p.attrs?.pa ?? ca;
    const knowledge: ScoutKnowledge = own ? 'scouted' : 'rumor';
    const band = paRange(pa, ca, knowledge, p.id, scoutAccuracy);
    const t = moves[p.id];
    return {
      p, age: newgenAge(p.id, split) ?? 17, ovr: playerOvr(p), ca, band, est: Math.round((band[0] + band[1]) / 2),
      region: g.region, origin, club: t ? clubOf(t) : null, year: careerYearOf(g.debut), own,
    };
  }), [mundo, moves, split, scoutAccuracy, clubOf]);

  const yearRows = rows.filter((r) => r.year === year);
  const mine = yearRows.filter((r) => r.own);
  const ownLog = (mundo.intake ?? []).filter((l) => l.year === year && Object.values(l.origin ?? {}).includes(USER_ORIGIN));
  const ownIds = ownLog.flatMap((l) => l.playerIds);
  const taken = ownIds.map((id) => academy.find((a) => a.id === academyIdForNewgen(id))).filter((a): a is AcademyRef => !!a);
  const academyFull = academy.length >= academyMax;
  const signed = rows.filter((r) => r.club);
  const retirees = (mundo.retirees ?? []).filter((r) => careerYearOf(r.split) >= year - 1);
  const promising = yearRows.filter((r) => r.est >= 145).length;

  const shown = (cohort === 'year' ? yearRows : rows)
    .filter((r) => region === 'all' || r.region === region)
    .sort((a, b) => b.est - a.est || b.ovr - a.ovr);

  const dist = BANDS.map((b) => ({ ...b, n: yearRows.filter((r) => r.est >= b.lo && r.est < b.hi).length }));
  const distMax = Math.max(1, ...dist.map((d) => d.n));
  const byRegion = MACRO_REGION_ORDER.map((rg) => {
    const rs = yearRows.filter((r) => r.region === rg);
    return { rg, n: rs.length, avg: rs.length ? Math.round(rs.reduce((s, r) => s + r.est, 0) / rs.length) : 0, top: rs.filter((r) => r.est >= 145).length };
  }).filter((x) => x.n > 0);

  const originLabel = (r: Row) => {
    if (r.own) return <Tag tone="accent">{ct('Sua base')}</Tag>;
    const aca = r.origin ? academyName(r.origin) : null;
    return aca ? <span className="juv-origin" title={ct('Revelado pela academia')}>{aca}</span> : <span className="juv-origin juv-dim">{ct(MACRO_REGION_LABELS[r.region])}</span>;
  };
  const cols: Column<Row>[] = [
    {
      key: 'who', header: ct('Jogador'), sort: (r) => r.p.nick.toLowerCase(),
      cell: (r) => (
        <span className="juv-who">
          <Flag cc={r.p.country} />
          <span className="juv-who__txt"><b>{r.p.nick}</b><small>{r.p.name}</small></span>
        </span>
      ),
    },
    { key: 'age', header: ct('Idade'), num: true, sort: (r) => r.age, cell: (r) => r.age },
    { key: 'role', header: ct('Função'), sort: (r) => r.p.role, cell: (r) => <RoleChip role={r.p.role}>{r.p.role}</RoleChip> },
    { key: 'ovr', header: 'OVR', num: true, sort: (r) => r.ovr, cell: (r) => <Ovr value={r.ovr} size="sm" /> },
    { key: 'pa', header: ct('Potencial (olheiro)'), sort: (r) => r.est, cell: (r) => <PaCell band={r.band} /> },
    { key: 'origin', header: ct('Origem'), sort: (r) => (r.own ? 'a' : r.origin ?? `z${r.region}`), cell: originLabel },
    { key: 'club', header: ct('Clube'), sort: (r) => r.club?.tag ?? '~', cell: (r) => (r.club ? <b className="juv-club">{r.club.tag}</b> : <span className="juv-dim">{ct('Sem clube')}</span>) },
    { key: 'note', header: ct('Relatório'), cell: (r) => <span className="juv-note-cell">{ct(scoutNote(r.est).text)}</span> },
  ];

  const retireeCols: Column<(typeof retirees)[number]>[] = [
    { key: 'who', header: ct('Jogador'), sort: (r) => r.nick.toLowerCase(), cell: (r) => <span className="juv-who"><Flag cc={r.country} /><b>{r.nick}</b></span> },
    { key: 'age', header: ct('Idade'), num: true, sort: (r) => r.age, cell: (r) => r.age },
    { key: 'ovr', header: 'OVR', num: true, sort: (r) => r.ovr, cell: (r) => <Ovr value={r.ovr} size="sm" /> },
    { key: 'club', header: ct('Último clube'), cell: (r) => (r.teamId ? clubOf(r.teamId)?.tag ?? '—' : <span className="juv-dim">{ct('Sem clube')}</span>) },
    {
      key: 'next', header: ct('Depois'), sort: (r) => (r.staffRole ? 0 : 1),
      cell: (r) => (r.staffRole
        ? <Tag tone="win">{r.staffRole === 'headCoach' ? ct('Técnico') : r.staffRole === 'analyst' ? ct('Analista') : ct('Auxiliar técnico')}</Tag>
        : <span className="juv-dim">{ct('Encerrou a carreira')}</span>),
    },
    { key: 'split', header: 'Split', num: true, sort: (r) => r.split, cell: (r) => r.split },
  ];

  return (
    <div className="em-tab juv-tab">
      <Panel icon={<Sprout size={16} />} title={`${ct('Juventude')} · ${ct('ano')} ${year + 1}`} tone="accent">
        <div className="juv-stats">
          <Stat label={ct('Geração do ano')} value={yearRows.length + taken.length} hint={`${byRegion.length} ${ct('regiões + academias')}`} />
          <Stat label={ct('Promessas de elite')} value={promising} hint={ct('potencial estimado ≥ 3,5 estrelas')} />
          <Stat label={ct('Jovens no profissional')} value={signed.length} hint={`${rows.length} ${ct('jovens gerados na cena')}`} />
          <Stat label={ct('Aposentadorias')} value={retirees.length} hint={`${retirees.filter((r) => r.staffRole).length} ${ct('viraram comissão técnica')}`} />
        </div>
        <p className="juv-note">
          {ct('O potencial vem do relatório do olheiro: uma faixa, não um número. Olheiros melhores na comissão técnica estreitam a faixa; os jovens da sua base você conhece melhor.')}
        </p>
      </Panel>

      <div className="juv-grid">
        <Panel icon={<GraduationCap size={16} />} title={`${ct('Sua geração')} · ${orgName}`} className="juv-mine">
          {mine.length === 0 && taken.length === 0 ? (
            <EmptyState title={ct('Nenhum jovem da sua base neste ano')}>{ct('A próxima geração chega na virada do ano. Uma comissão boa em formação de jovens melhora a leva.')}</EmptyState>
          ) : (
            <div className="juv-cards">
              {mine.map((r) => {
                const note = scoutNote(r.est);
                return (
                  <article key={r.p.id} className="juv-card">
                    <header className="juv-card__head">
                      <button type="button" className="juv-card__name" onClick={() => onOpenPlayer(r.p)}>
                        <Flag cc={r.p.country} /> <b>{r.p.nick}</b>
                      </button>
                      <Ovr value={r.ovr} size="sm" />
                    </header>
                    <p className="juv-card__meta">{r.p.name} · {r.age} {ct('anos')} · <RoleChip role={r.p.role}>{r.p.role}</RoleChip></p>
                    <CaPaStars ca={r.ca} paRange={r.band} />
                    <p className="juv-card__note"><Tag tone={note.tone === 'neutral' ? 'neutral' : note.tone}>{ct('Olheiro')}</Tag> {ct(note.text)}</p>
                    <footer className="juv-card__foot">
                      {r.club ? (
                        <span className="juv-dim">{ct('Assinou com')} {r.club.tag}</span>
                      ) : (
                        <Button size="sm" variant="primary" disabled={academyFull} onClick={() => onTakeToAcademy(r.p.id)} title={academyFull ? ct('Academia cheia: promova ou dispense um prospecto antes.') : undefined}>
                          {ct('Levar para a academia')}
                        </Button>
                      )}
                    </footer>
                  </article>
                );
              })}
              {taken.map((a) => (
                <article key={a.id} className="juv-card juv-card--done">
                  <header className="juv-card__head"><b>{a.nick}</b><Tag tone="win">{ct('Na academia')}</Tag></header>
                  <p className="juv-card__meta">{ct('Treina com a base do clube. Promova quando estiver pronto.')}</p>
                  <footer className="juv-card__foot"><Button size="sm" variant="ghost" onClick={onGoAcademy}>{ct('Ver academia')}</Button></footer>
                </article>
              ))}
            </div>
          )}
          {mine.some((r) => !r.club) && (
            <p className="juv-note">{ct('Quem você não levar fica sem clube e entra no mercado: os clubes da IA contratam quando ele render.')}{academyFull ? ` ${ct('Sua academia está cheia.')}` : ''}</p>
          )}
        </Panel>

        <Panel icon={<ChartNoAxesColumn size={16} />} title={ct('Potencial da geração')} className="juv-dist">
          <ul className="juv-bars" aria-label={ct('Distribuição do potencial estimado')}>
            {dist.map((d) => (
              <li key={d.label} className="juv-bar">
                <span className="juv-bar__label">{d.label}</span>
                <span className="juv-bar__track"><span className="juv-bar__fill" data-band={d.lo >= 150 ? 'top' : d.lo >= 130 ? 'good' : 'base'} style={{ width: `${(d.n / distMax) * 100}%` }} /></span>
                <b className="juv-bar__n">{d.n}</b>
              </li>
            ))}
          </ul>
          <p className="juv-note">{ct('PA estimado (escala 1–200). A maioria fica entre 90 e 130; potencial acima de 160 é raro.')}</p>
          <ul className="juv-regions">
            {byRegion.map((x) => (
              <li key={x.rg}>
                <span>{ct(MACRO_REGION_LABELS[x.rg])}</span>
                <small>{x.n} {ct('jovens')} · {ct('média')} {x.avg}{x.top ? ` · ${x.top} ${ct('de elite')}` : ''}</small>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        icon={<Telescope size={16} />}
        title={ct('Promessas do mundo')}
        flush
        className="juv-world"
        actions={(
          <div className="juv-filters">
            <Segmented<Cohort>
              label={ct('Geração')}
              value={cohort}
              onChange={setCohort}
              items={[{ value: 'year', label: ct('Deste ano'), count: yearRows.length }, { value: 'all', label: ct('Todas as gerações'), count: rows.length }]}
            />
            <Segmented<RegionFilter>
              label={ct('Região')}
              value={region}
              onChange={setRegion}
              items={[{ value: 'all', label: ct('Todas') }, ...MACRO_REGION_ORDER.map((rg) => ({ value: rg, label: ct(MACRO_REGION_LABELS[rg]) }))]}
            />
          </div>
        )}
      >
        <Table<Row>
          columns={cols}
          rows={shown.slice(0, 80)}
          rowKey={(r) => r.p.id}
          caption={ct('Promessas do mundo')}
          isMe={(r) => r.own}
          onRowClick={(r) => onOpenPlayer(r.p)}
          empty={ct('Nenhum jovem nesta região.')}
        />
      </Panel>

      <Panel icon={<UserRoundMinus size={16} />} title={ct('Aposentadorias na cena')} flush className="juv-retirees">
        <Table
          columns={retireeCols}
          rows={retirees.slice(0, 30)}
          rowKey={(r) => `${r.id}:${r.split}`}
          caption={ct('Aposentadorias na cena')}
          defaultSort={{ key: 'ovr', dir: 'desc' }}
          empty={ct('Ninguém se aposentou no último ano. A virada de ano (a cada temporada, 4 splits) é quando os veteranos param.')}
        />
      </Panel>
    </div>
  );
}
