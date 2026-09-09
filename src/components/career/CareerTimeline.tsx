// CareerTimeline (#51 do gap Brasval) — a história da org como NARRATIVA
// escaneável: agrupada por temporada (ano = MAJOR_EVERY splits), cada split
// vira um marco com chip colorido por resultado (título, Major, top 4, fundo
// da tabela). Fica no topo da HistoryTab; a tabela detalhada segue abaixo.
//
// [W4] Cada chip é CLICÁVEL: abre o detalhe do split com colocação, promessas
// (à diretoria e a jogadores) feitas/cumpridas/quebradas ali, cicatrizes
// ganhas e chegadas/saídas marcantes. Só usa dados que o save já tem
// (history, promiseLog, playerPromises, scars, stints) — nada inventado.

import { useState } from 'react';
import type { SplitRecord } from '../CareerScreen';
import { PLACE_SHORT, MAJOR_EVERY } from '../CareerScreen';
import { ct } from '../../state/career-i18n';
import { IconTrophy } from './DashIcons';
import type { PromiseOutcome } from '../../engine/career/promises';
import { PLAYER_PROMISE_LABEL, playerPromisesTouching, type PlayerPromise } from '../../engine/career/playerPromises';
import type { CoachScar } from '../../engine/career/scars';
import type { StintsMap } from '../../engine/career/stints';
import { ScarPills } from './ScarPills';

type Tone = 'gold' | 'good' | 'mid' | 'bad';

interface Milestone {
  split: number;
  text: string;
  tone: Tone;
  major?: string; // texto do chip de Major (se disputou)
  majorGold?: boolean;
}

// [W4] o que o save já guarda e a fita usa pra detalhar o split
export interface TimelineExtras {
  promiseLog?: PromiseOutcome[];
  playerPromises?: Record<string, PlayerPromise[]>;
  scars?: CoachScar[];
  stints?: StintsMap;
  currentSplit?: number;
  nickOf?: (playerId: string) => string;
}

const TONE_COLOR: Record<Tone, string> = {
  gold: 'var(--em-gold)',
  good: 'var(--em-green)',
  mid: 'var(--em-muted)',
  bad: 'var(--em-red)',
};

function milestoneOf(h: SplitRecord): Milestone {
  const tone: Tone = h.champion ? 'gold' : h.position > 0 && h.position <= 4 ? 'good' : h.position >= 9 ? 'bad' : 'mid';
  const text = h.champion
    ? `${ct('CAMPEÃO do')} ${h.circuit}`
    : h.position > 0
      ? `${h.position}º ${ct('no')} ${h.circuit}`
      : h.circuit;
  const major = h.major ? `Major: ${PLACE_SHORT[h.major.placement]}` : undefined;
  return { split: h.split, text, tone, major, majorGold: h.major?.champion };
}

export function CareerTimeline({ history, extras }: { history: SplitRecord[]; extras?: TimelineExtras }) {
  const [openSplit, setOpenSplit] = useState<number | null>(null);
  if (history.length === 0) return null;
  // agrupa por temporada (mais recente primeiro), preservando ordem dos splits
  const byYear = new Map<number, Milestone[]>();
  for (const h of history) {
    const year = Math.max(1, Math.ceil(h.split / MAJOR_EVERY));
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(milestoneOf(h));
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const toggle = (s: number) => setOpenSplit((cur) => (cur === s ? null : s));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
      {years.map((year) => {
        const marks = byYear.get(year)!;
        const opened = marks.find((m) => m.split === openSplit);
        return (
          <div key={year} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 74 }}>
              <b style={{ fontSize: '0.72rem', letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--em-muted)' }}>
                {ct('Temporada')} {year}
              </b>
              <div style={{ flex: 1, width: 2, background: 'var(--em-border)', marginTop: 6, borderRadius: 1 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start', paddingBottom: 4 }}>
                {marks.map((m) => (
                  <button
                    key={m.split}
                    type="button"
                    onClick={() => toggle(m.split)}
                    aria-expanded={openSplit === m.split}
                    title={ct('Clique pra ver o detalhe do split')}
                    style={chipStyle(TONE_COLOR[m.tone], m.tone === 'gold', openSplit === m.split)}
                  >
                    {m.tone === 'gold' && <IconTrophy size={12} />}
                    <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', fontFamily: '"JetBrains Mono", monospace' }}>S{m.split}</span>
                    {m.text}
                    {m.major && (
                      <b style={{ color: m.majorGold ? 'var(--em-gold)' : 'var(--em-text)', fontSize: '0.7rem' }}>
                        · {m.majorGold ? ct('CAMPEÃO DO MAJOR') : m.major}
                      </b>
                    )}
                  </button>
                ))}
              </div>
              {opened && (
                <SplitDetail
                  record={history.find((h) => h.split === opened.split)!}
                  extras={extras}
                  onClose={() => setOpenSplit(null)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detalhe do split (W4)

function SplitDetail({ record, extras, onClose }: { record: SplitRecord; extras?: TimelineExtras; onClose: () => void }) {
  const s = record.split;
  const nick = (pid: string) => extras?.nickOf?.(pid) ?? pid;
  const boardProms = (extras?.promiseLog ?? []).filter((p) => p.split === s);
  const playerProms = playerPromisesTouching(extras?.playerPromises, s);
  const scars = (extras?.scars ?? []).filter((sc) => sc.since === s);
  const arrivals: { pid: string; ovr: number }[] = [];
  const departures: { pid: string; ovr: number | undefined }[] = [];
  for (const [pid, list] of Object.entries(extras?.stints ?? {})) {
    for (const st of list) {
      if (st.from === s) arrivals.push({ pid, ovr: st.startOvr });
      if (st.to === s) departures.push({ pid, ovr: st.endOvr });
    }
  }
  arrivals.sort((a, b) => b.ovr - a.ovr);
  departures.sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));

  const placement = record.champion
    ? `${ct('CAMPEÃO do')} ${record.circuit}`
    : record.position > 0 ? `${record.position}º ${ct('no')} ${record.circuit}` : record.circuit;
  const majorLine = record.major
    ? (record.major.champion ? ct('CAMPEÃO DO MAJOR') : `Major: ${PLACE_SHORT[record.major.placement]}`)
    : null;
  const empty = boardProms.length === 0 && playerProms.length === 0 && scars.length === 0 && arrivals.length === 0 && departures.length === 0;

  return (
    <div style={detailStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <b style={{ fontSize: '0.84rem', color: 'var(--em-text)' }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--em-muted)', marginRight: 6 }}>S{s}</span>
          {placement}{majorLine ? ` · ${majorLine}` : ''}
        </b>
        <button type="button" onClick={onClose} style={closeStyle} aria-label={ct('Fechar')}>×</button>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--em-muted)', fontFamily: '"JetBrains Mono", monospace' }}>
        <span>{record.wins}V {record.losses}D</span>
        <span>RD {record.roundDiff > 0 ? '+' : ''}{record.roundDiff}</span>
        <span>VRS +{record.vrs}</span>
      </div>

      {boardProms.length > 0 && (
        <Section label={ct('Promessa à diretoria')}>
          {boardProms.map((p, i) => (
            <Line key={i} tone={p.met ? 'good' : 'bad'}>
              {p.met ? '✔' : '✘'} "{ct(p.text)}" — {p.met ? ct('cumprida') : ct('quebrada')}
            </Line>
          ))}
        </Section>
      )}
      {playerProms.length > 0 && (
        <Section label={ct('Promessas a jogadores')}>
          {playerProms.map(({ playerId, promise, role }, i) => {
            const tone = promise.status === 'kept' ? 'good' : promise.status === 'broken' ? 'bad' : 'mid';
            const status = promise.status === 'kept' ? ct('cumprida') : promise.status === 'broken' ? ct('quebrada') : ct('em aberto');
            return (
              <Line key={i} tone={tone}>
                {role === 'made' ? ct('Prometeu a') : ct('Prazo estourou com')} <b>{nick(playerId)}</b>: "{ct(PLAYER_PROMISE_LABEL[promise.kind])}"
                {' '}({ct('feita no S')}{promise.madeAtSplit}, {ct('prazo S')}{promise.deadlineSplit}) — {status}
              </Line>
            );
          })}
        </Section>
      )}
      {scars.length > 0 && (
        <Section label={ct('Cicatrizes ganhas')}>
          <ScarPills scars={scars} split={extras?.currentSplit ?? s} showExpired compact />
        </Section>
      )}
      {(arrivals.length > 0 || departures.length > 0) && (
        <Section label={ct('Mercado')}>
          {arrivals.map((a) => (
            <Line key={`in-${a.pid}`} tone="good">↗ {ct('Chegou')} <b>{nick(a.pid)}</b>{a.ovr ? ` (OVR ${a.ovr})` : ''}</Line>
          ))}
          {departures.map((d) => (
            <Line key={`out-${d.pid}`} tone="mid">↘ {ct('Saiu')} <b>{nick(d.pid)}</b>{d.ovr ? ` (OVR ${d.ovr})` : ''}</Line>
          ))}
        </Section>
      )}
      {empty && (
        <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--em-muted)', fontStyle: 'italic' }}>
          {ct('Sem promessas, cicatrizes ou movimentos registrados neste split.')}
        </p>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--em-muted)' }}>{label}</span>
      {children}
    </div>
  );
}

function Line({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '0.76rem', color: tone === 'mid' ? 'var(--em-text)' : TONE_COLOR[tone] }}>{children}</div>
  );
}

const chipStyle = (color: string, strong: boolean, open: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 999,
  border: `1px solid color-mix(in srgb, ${color} ${strong || open ? '65%' : '40%'}, transparent)`,
  background: `color-mix(in srgb, ${color} ${strong || open ? '14%' : '8%'}, transparent)`,
  color: strong ? color : 'var(--em-text)',
  fontSize: '0.76rem',
  fontWeight: strong ? 700 : 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  outline: open ? `2px solid color-mix(in srgb, ${color} 35%, transparent)` : 'none',
});

const detailStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '10px 12px',
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderRadius: 6,
};

const closeStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--em-muted)',
  fontSize: '1rem',
  cursor: 'pointer',
  lineHeight: 1,
  padding: '0 4px',
};
