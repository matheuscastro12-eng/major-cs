// Aba Top20 HLTV — T1.4. Saiu de inline no CareerScreen (hubTab === 'top20').

import { DashCard } from '../../components/ds';
import { Flag, PlayerAvatar, TeamBadge } from '../../components/ui';
import { ct } from '../../state/career-i18n';
import { logoForTeam } from '../../data/media';
import type { Player, Role, TeamSeason } from '../../types';

// Shape mínimo do que cada linha do top20 (temporada) precisa.
// Vem do top20Memo do CareerScreen.
export interface Top20SeasonRow {
  p: Player;
  team: TeamSeason;
  role: Role;
  rating: number;
  mvps: number;
  sl: { kast: number; awpKills: number; entry: number; impact: number };
}

// Shape mínimo do top20 de CARREIRA.
export interface Top20CareerRow {
  rid: string;
  nick: string;
  country: string;
  role: Role;
  isMine: boolean;
  teamTag: string;
  rating: number;
  kd: number;
  adr: number;
  maps: number;
}

interface Props {
  t20Mode: 'season' | 'career';
  setT20Mode: (m: 'season' | 'career') => void;
  save: {
    split: number;
    org?: { tag?: string; colors?: [string, string]; logo?: string } | null;
  };
  top20: Top20SeasonRow[];
  careerTop20: Top20CareerRow[];
  mySquadOids: Set<string>;
  openPlayerProfile: (p: Player) => void;
  resolvePlayerById: (id: string) => Player | null;
}

export function Top20Tab({
  t20Mode,
  setT20Mode,
  save,
  top20,
  careerTop20,
  mySquadOids,
  openPlayerProfile,
  resolvePlayerById,
}: Props) {
  return (
    <DashCard title={ct('HLTV Top 20')}>
      <div className="t20-head">
        <div className="muted small section-label" style={{ marginTop: 0 }}>
          {t20Mode === 'season'
            ? `${ct('Top 20 HLTV · melhores da temporada')} ${save.split}`
            : ct('Ranking de carreira · maiores ratings acumulados')}
        </div>
        <div className="t20-toggle">
          <button
            className={`btn small${t20Mode === 'season' ? ' gold' : ' ghost'}`}
            onClick={() => setT20Mode('season')}
          >
            {ct('Temporada')}
          </button>
          <button
            className={`btn small${t20Mode === 'career' ? ' gold' : ' ghost'}`}
            onClick={() => setT20Mode('career')}
          >
            {ct('Carreira')}
          </button>
        </div>
      </div>
      {t20Mode === 'season' ? (
        <div className="top20-list">
          {top20.map((e, i) => {
            // jogador do SEU elenco aparece pela SUA org, não pelo clube de origem
            const isMine = mySquadOids.has(e.p.id);
            const tag = isMine ? (save.org?.tag ?? ct('VOCÊ')) : e.team.tag;
            const colors = isMine ? (save.org?.colors ?? e.team.colors) : e.team.colors;
            const logo = isMine ? save.org?.logo : (e.team.logoUrl ?? logoForTeam(e.team));
            return (
              <button
                key={e.p.id}
                type="button"
                className={`t20-row em-btn-reset clickable${i === 0 ? ' first' : ''}`}
                onClick={() => openPlayerProfile(e.p)}
              >
                <span className="t20-rank">{i + 1}</span>
                <PlayerAvatar nick={e.p.nick} size={32} />
                <span className="t20-nick"><Flag cc={e.p.country} /> {e.p.nick}</span>
                <span className="muted small t20-team">
                  <TeamBadge tag={tag} colors={colors} size={16} logoUrl={logo} /> {tag}
                </span>
                <span className={`role-pill ${e.p.role}`}>{e.p.role}</span>
                <span className="muted small t20-extra">
                  {e.mvps > 0 && <b className="t20-mvp">{e.mvps}× MVP</b>}
                  {e.sl.kast} KAST · {e.role === 'AWP' ? `${e.sl.awpKills} AWP/m` : `${e.sl.entry} entry/m`} · {e.sl.impact.toFixed(2)} imp
                </span>
                <span className="t20-rating">{e.rating.toFixed(2)}</span>
              </button>
            );
          })}
        </div>
      ) : careerTop20.length === 0 ? (
        <p className="muted small">
          {ct('As estatísticas de carreira aparecem aqui depois de jogar o primeiro split. Elas sobem conforme os jogadores evoluem.')}
        </p>
      ) : (
        <div className="top20-list">
          {careerTop20.map((e, i) => (
            <button
              key={e.rid}
              type="button"
              className={`t20-row em-btn-reset clickable${i === 0 ? ' first' : ''}${e.isMine ? ' human-row' : ''}`}
              onClick={() => { const pl = resolvePlayerById(e.rid); if (pl) openPlayerProfile(pl); }}
            >
              <span className="t20-rank">{i + 1}</span>
              <PlayerAvatar nick={e.nick} size={32} />
              <span className="t20-nick"><Flag cc={e.country} /> {e.nick}{e.isMine ? ' ★' : ''}</span>
              <span className="muted small t20-team">{e.teamTag}</span>
              <span className={`role-pill ${e.role}`}>{e.role}</span>
              <span className="muted small t20-extra">{e.kd.toFixed(2)} K/D · {e.adr.toFixed(0)} ADR · {e.maps}m</span>
              <span className="t20-rating">{e.rating.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
    </DashCard>
  );
}
