import { useMemo } from 'react';
import { logoForTeam } from '../data/media';
import { playerOvr } from '../engine/ratings';
import type { DraftState, Player, TeamSeason } from '../types';
import { COACH_STYLE_DESC, COACH_STYLE_LABELS } from '../types';
import { AttrBar, Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';

const teamLogo = (t: TeamSeason) => t.logoUrl ?? logoForTeam(t);

// Funções-chave que mais pesam na simulação (ver engine/ratings draftSynergy)
type RoleKey = 'IGL' | 'AWP' | 'Entry' | 'Support';
interface RoleNeed {
  key: RoleKey;
  label: string;
  short: string;
  why: string;
  critical: boolean;
}
const NEED_DEFS: Record<RoleKey, RoleNeed> = {
  IGL: { key: 'IGL', label: 'IGL (capitão)', short: 'IGL', why: 'sem leitura tática seu time desmorona em rounds fechados', critical: true },
  AWP: { key: 'AWP', label: 'AWPer', short: 'AWP', why: 'sem sniper o lado CT vira sofrimento', critical: true },
  Entry: { key: 'Entry', label: 'Entry fragger', short: 'Entry', why: 'abre espaço e troca o primeiro duelo', critical: false },
  Support: { key: 'Support', label: 'Suporte/Lurker', short: 'Suporte', why: 'fecha o mapa e segura informação', critical: false },
};

function rosterNeeds(picked: Player[]): RoleNeed[] {
  const out: RoleNeed[] = [];
  if (!picked.some((p) => p.igl >= 80)) out.push(NEED_DEFS.IGL);
  if (!picked.some((p) => p.awp >= 80)) out.push(NEED_DEFS.AWP);
  if (!picked.some((p) => p.role === 'Entry')) out.push(NEED_DEFS.Entry);
  if (!picked.some((p) => p.role === 'Support' || p.role === 'Lurker')) out.push(NEED_DEFS.Support);
  return out;
}

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

  // jogadores já escolhidos (objetos completos) para diagnosticar lacunas de função
  const pickedPlayers = draft.rounds
    .slice(0, draft.current)
    .map((r) => {
      const t = dataset.find((x) => x.id === r.teamSeasonId);
      return t?.players.find((p) => p.id === r.pickedPlayerId);
    })
    .filter(Boolean) as Player[];

  // funções-chave que ainda faltam (impactam MUITO a simulação)
  const needs = useMemo(() => rosterNeeds(pickedPlayers), [pickedPlayers]);

  // o que ESTE jogador preencheria (para destacar nas cartas)
  const fillsFor = (p: Player): RoleNeed | null => {
    if (needs.some((n) => n.key === 'IGL') && p.igl >= 80) return NEED_DEFS.IGL;
    if (needs.some((n) => n.key === 'AWP') && p.awp >= 80) return NEED_DEFS.AWP;
    if (needs.some((n) => n.key === 'Entry') && p.role === 'Entry') return NEED_DEFS.Entry;
    if (needs.some((n) => n.key === 'Support') && (p.role === 'Support' || p.role === 'Lurker')) return NEED_DEFS.Support;
    return null;
  };

  return (
    <div className="fade-in">
      {!coachPhase && source && (
        <div className="panel">
          <div className="panel-head">
            Draft - escolha {draft.current + 1} de 5
            <span className="spacer" />
            <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
              O dado sorteou um elenco histórico. Escolha 1 jogador para o seu time.
            </span>
          </div>

          <div className="draft-source" style={{ background: `linear-gradient(120deg, ${source.colors[0]}33 0%, var(--header) 70%)` }}>
            <TeamBadge tag={source.tag} colors={source.colors} size={64} logoUrl={teamLogo(source)} />
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

          <div className="role-needs">
            {needs.length === 0 ? (
              <span className="role-needs-ok">✅ Composição equilibrada: todas as funções-chave cobertas. Agora caçe overall.</span>
            ) : (
              <>
                <span className="role-needs-title">Ainda falta no seu time:</span>
                {needs.map((n) => (
                  <span key={n.key} className={`need-chip${n.critical ? ' critical' : ''}`} title={n.why}>
                    {n.critical ? '⚠ ' : ''}
                    {n.label}
                  </span>
                ))}
                <span className="role-needs-hint">funções em vermelho dão penalidade pesada se ficarem vazias.</span>
              </>
            )}
          </div>

          <div className="player-cards">
            {source.players.map((p) => (
              <PlayerCard
                key={p.id}
                p={p}
                classic={classic}
                taken={pickedIds.has(p.id) || pickedNicks.has(p.nick.toLowerCase())}
                fills={fillsFor(p)}
                onPick={() => onPick(p.id)}
              />
            ))}
          </div>
        </div>
      )}

      {coachPhase && (
        <div className="panel">
          <div className="panel-head">
            Draft - escolha o COACH
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
                  <PlayerAvatar nick={c.nick} size={52} coach />
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
                    <TeamBadge tag={t.tag} colors={t.colors} size={18} logoUrl={teamLogo(t)} /> {t.team} {t.era}
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
  fills,
  onPick,
}: {
  p: Player;
  classic: boolean;
  taken: boolean;
  fills: RoleNeed | null;
  onPick: () => void;
}) {
  return (
    <button className={`pcard${taken ? ' taken' : ''}${fills ? ' fills-need' : ''}`} onClick={onPick}>
      {fills && (
        <span className={`fills-flag${fills.critical ? ' critical' : ''}`}>
          {fills.critical ? '⚠ preenche ' : '+ '}
          {fills.short}
        </span>
      )}
      <PlayerAvatar nick={p.nick} size={56} />
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
