// Aba Calendar — T1.4. Saiu de IIFE inline no CareerScreen (hubTab === 'calendar').
//
// Lógica de derivação (groupDone/nextMajor/stages/upcoming) ficou DENTRO da page
// — não era state, só compute do save+league. Constants vieram de CareerScreen
// (MAJOR_EVERY/MAJOR_VRS_CUT/isMajorSplit) que foram exportados.

import { DashCard } from '../../components/ds';
import { CareerIcon, type CareerIconName } from '../../components/career/CareerIcon';
import { Flag, TeamBadge } from '../../components/ui';
import {
  MAJOR_EVERY,
  MAJOR_VRS_CUT,
  isMajorSplit,
  type Playoff,
} from '../../components/CareerScreen';
import { ct } from '../../state/career-i18n';
import type { League } from '../../engine/league';
import type { TTeam, Tournament } from '../../types';

interface Props {
  save: {
    split: number;
    circuit?: { name?: string } | null;
    playoff?: Playoff | null;
    majorT?: Tournament | null;
  };
  league: League;
  table: TTeam[];
  myPos: number;
  myVrsRank: number;
  setSelTeam: (t: TTeam) => void;
}

export function CalendarTab({ save, league, table, myPos, myVrsRank, setSelTeam }: Props) {
  const groupDone = league.current >= league.rounds.length;
  const nextMajor = isMajorSplit(save.split) ? save.split : save.split + (MAJOR_EVERY - (save.split % MAJOR_EVERY));
  const splitsToMajor = nextMajor - save.split;
  const majorSplitNow = isMajorSplit(save.split);

  type StStatus = 'done' | 'live' | 'locked' | 'na';
  const stages: { ic: CareerIconName; name: string; status: StStatus; detail: string }[] = [
    {
      ic: 'focus',
      name: `${ct('Fase de grupos ·')} ${save.circuit?.name ?? ct('Circuito')}`,
      status: groupDone ? 'done' : 'live',
      detail: groupDone
        ? ct('Concluída')
        : `${ct('Rodada')} ${league.current + 1} de ${league.rounds.length} ${ct('· você em')} ${myPos}º`,
    },
    {
      ic: 'trophy',
      name: ct('Mata-mata do circuito'),
      status: save.playoff ? (save.playoff.champion ? 'done' : 'live') : 'locked',
      detail: save.playoff
        ? (save.playoff.champion ? ct('Encerrado') : ct('Semis (MD3) + final (MD5)'))
        : ct('Os 4 melhores do grupo avançam'),
    },
    {
      ic: 'globe',
      name: ct('Major Mundial'),
      status: majorSplitNow ? (save.majorT ? 'live' : 'locked') : 'na',
      detail: majorSplitNow
        ? `Top ${MAJOR_VRS_CUT} ${ct('do ranking VRS mundial garantem a vaga')}`
        : `${ct('Só em split de Major · próximo no Split')} ${nextMajor}`,
    },
  ];
  const STLABEL: Record<StStatus, string> = {
    done: ct('concluído'),
    live: ct('em andamento'),
    locked: ct('a seguir'),
    na: ct('fora deste split'),
  };

  const upcoming = Array.from({ length: 6 }, (_, i) => save.split + i).map((sp) => ({
    sp,
    major: isMajorSplit(sp),
  }));

  return (
    <DashCard title={ct('Calendário')}>
      <div className={`cal-major-banner ${splitsToMajor === 0 ? 'now' : ''}`}>
        {splitsToMajor === 0 ? (
          <>
            <CareerIcon name="globe" size={16} /> <b>{ct('É split de Major!')}</b>{' '}
            {ct('Os')} <b>{ct('top')} {MAJOR_VRS_CUT} {ct('do ranking VRS mundial')}</b>{' '}
            {ct('garantem a vaga. Você está em')} <b>#{myVrsRank}</b>.
          </>
        ) : (
          <>
            <CareerIcon name="globe" size={16} /> <b>{ct('Major Mundial no Split')} {nextMajor}</b> ·{' '}
            {splitsToMajor === 1 ? ct('falta 1 split') : `${ct('faltam')} ${splitsToMajor} splits`}.{' '}
            {ct('Suba no')} <b>{ct('ranking VRS')}</b>{' '}
            ({ct('você está em')} #{myVrsRank}){' '}
            {ct('vencendo partidas e campeonatos — os top')} {MAJOR_VRS_CUT} {ct('vão ao Major.')}
          </>
        )}
      </div>

      <div className="muted small section-label">{ct('Temporada atual · Split')} {save.split}</div>
      <div className="cal-stages">
        {stages.map((st, i) => (
          <div key={i} className={`cal-stage ${st.status}`}>
            <span className="cal-ic"><CareerIcon name={st.ic} size={18} /></span>
            <div className="cal-st-body">
              <div className="cal-st-name">
                {st.name} <span className={`cal-st-pill ${st.status}`}>{STLABEL[st.status]}</span>
              </div>
              <div className="cal-st-detail muted small">{st.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="muted small section-label">{ct('Próximos splits')}</div>
      <div className="cal-upcoming">
        {upcoming.map(({ sp, major }) => (
          <div key={sp} className={`cal-up${sp === save.split ? ' current' : ''}${major ? ' major' : ''}`}>
            <div className="cal-up-n">Split {sp}</div>
            <div className="cal-up-t">
              {major ? (
                <><CareerIcon name="globe" size={12} /> Major</>
              ) : (
                <><CareerIcon name="focus" size={12} /> {ct('Circuito')}</>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="muted small section-label">{ct('Times no circuito')} ({table.length})</div>
      <div className="rtm-field" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        {table.map((tm) => {
          const mine = tm.id === 'user';
          return (
            <button
              key={tm.id}
              onClick={() => setSelTeam(tm)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '6px',
                background: mine ? 'color-mix(in srgb, var(--em-gold) 14%, transparent)' : 'var(--em-panel-2)',
                border: `1px solid ${mine ? 'var(--em-gold)' : 'var(--em-border)'}`,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <TeamBadge tag={tm.tag} colors={tm.colors} logoUrl={tm.logoUrl} size={30} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    fontSize: '14px',
                    color: mine ? 'var(--em-gold)' : 'var(--em-text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {tm.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--rtm-faint)' }}>
                  <Flag cc={tm.country} />{tm.tag}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        Cada split tem um <b>{ct('circuito')}</b> {ct('(fase de grupos + mata-mata) que vale prêmio e')} <b>VRS</b>.
        A cada {MAJOR_EVERY} splits acontece o <b>{ct('Major Mundial')}</b>: o clímax da temporada, com a maior premiação.
        Seu VRS e seu tier definem se você chega lá.
      </p>
    </DashCard>
  );
}
