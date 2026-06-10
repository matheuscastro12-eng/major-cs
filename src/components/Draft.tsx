import { useMemo } from 'react';
import { playerOvr } from '../engine/ratings';
import type { DraftState, Player, TeamSeason } from '../types';
import { COACH_STYLE_DESC, COACH_STYLE_LABELS } from '../types';
import { AttrBar, Flag, OvrBadge, TeamBadge } from './ui';

interface Props {
  draft: DraftState;
  dataset: TeamSeason[];
  onPick: (playerId: string) => void;
  onPickCoach: (teamSeasonId: string) => void;
  onReroll: () => void;
}

export function Draft({ draft, dataset, onPick, onPickCoach, onReroll }: Props) {
  const coachPhase = draft.current >= 5;
  const round = draft.rounds[draft.current];
  const source = useMemo(
    () => (coachPhase ? null : dataset.find((t) => t.id === round?.teamSeasonId)),
    [dataset, round, coachPhase],
  );

  const pickedIds = new Set(
    draft.rounds
      .slice(0, draft.current)
      .map((r) => r.pickedPlayerId)
      .filter(Boolean) as string[],
  );
  const pickedNicks = new Set(
    draft.rounds.slice(0, Math.min(draft.current, 5)).map((r) => {
      const t = dataset.find((x) => x.id === r.teamSeasonId);
      return t?.players.find((p) => p.id === r.pickedPlayerId)?.nick.toLowerCase();
    }),
  );

  const classic = draft.mode === 'classic';

  return (
    <div className="fade-in">
      {!coachPhase && source && (
        <div className="panel">
          <div className="panel-head">
            Draft — escolha {draft.current + 1} de 5
            <span className="spacer" />
            <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
              O dado sorteou um elenco histórico. Escolha 1 jogador para o seu time.
            </span>
          </div>

          <div className="draft-source">
            <TeamBadge tag={source.tag} colors={source.colors} size={44} />
            <div style={{ flex: 1 }}>
              <div className="era-game">
                {source.game} · {source.era}
              </div>
              <h2>
                {source.team} <Flag cc={source.country} />
              </h2>
              <div className="honors">{source.honors}</div>
            </div>
            <button className="btn ghost" onClick={onReroll} disabled={draft.rerollsLeft <= 0}>
              🎲 Rolar de novo ({draft.rerollsLeft})
            </button>
          </div>

          <div className="player-cards">
            {source.players.map((p) => (
              <PlayerCard
                key={p.id}
                p={p}
                classic={classic}
                taken={pickedIds.has(p.id) || pickedNicks.has(p.nick.toLowerCase())}
                onPick={() => onPick(p.id)}
              />
            ))}
          </div>
        </div>
      )}

      {coachPhase && (
        <div className="panel">
          <div className="panel-head">
            Draft — escolha o COACH
            <span className="spacer" />
            <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
              O treinador define o estilo do time dentro do servidor.
            </span>
          </div>
          <div className="player-cards">
            {draft.coachOptions.map((tid) => {
              const t = dataset.find((x) => x.id === tid);
              if (!t) return null;
              const c = t.coach;
              return (
                <button key={tid} className="pcard" onClick={() => onPickCoach(tid)}>
                  <div className="avatar" style={{ background: 'linear-gradient(160deg, #6a4f9e 0%, #3a2c5c 100%)' }}>
                    {c.nick.slice(0, 2).toUpperCase()}
                  </div>
                  {classic && <OvrBadge ovr={c.rating} label="COACH" />}
                  <div className="nick">{c.nick}</div>
                  <div className="meta">
                    <Flag cc={c.country} />
                    <span>{c.name}</span>
                  </div>
                  <div className="meta">
                    <span className="role-pill IGL">{COACH_STYLE_LABELS[c.style]}</span>
                  </div>
                  <div className="meta muted small" style={{ marginTop: 6, lineHeight: 1.3 }}>
                    {COACH_STYLE_DESC[c.style]}
                  </div>
                  <div className="meta muted small">
                    {t.team} {t.era}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">Seu elenco</div>
        <div className="panel-body">
          <div className="roster-slots">
            {[0, 1, 2, 3, 4].map((i) => {
              const r = draft.rounds[i];
              const t = r && dataset.find((x) => x.id === r.teamSeasonId);
              const p = t?.players.find((x) => x.id === r.pickedPlayerId);
              if (p && t) {
                return (
                  <div key={i} className="slot filled">
                    <div className="nick">
                      <Flag cc={p.country} /> {p.nick}{' '}
                      <span className="ovr-inline">{playerOvr(p)}</span>
                    </div>
                    <span className={`role-pill ${p.role}`}>{p.role}</span>
                    <div className="from">
                      {t.team} {t.era}
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="slot">
                  {i === draft.current ? '… escolhendo' : `Escolha ${i + 1}`}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({
  p,
  classic,
  taken,
  onPick,
}: {
  p: Player;
  classic: boolean;
  taken: boolean;
  onPick: () => void;
}) {
  return (
    <button className={`pcard${taken ? ' taken' : ''}`} onClick={onPick}>
      <div className="avatar">{p.nick.slice(0, 2).toUpperCase()}</div>
      {classic && <OvrBadge ovr={playerOvr(p)} />}
      <div className="nick">{p.nick}</div>
      <div className="meta">
        <Flag cc={p.country} />
        <span>{p.name}</span>
      </div>
      <div className="meta">
        <span className={`role-pill ${p.role}`}>{p.role}</span>
      </div>
      {classic && (
        <div className="attr-bars">
          <AttrBar label="Mira" value={p.aim} />
          <AttrBar label="Clutch" value={p.clutch} />
          <AttrBar label="Const." value={p.consistency} />
          <AttrBar label="AWP" value={p.awp} />
          <AttrBar label="IGL" value={p.igl} />
        </div>
      )}
      {taken && <div className="meta muted small">já está no seu time</div>}
    </button>
  );
}
