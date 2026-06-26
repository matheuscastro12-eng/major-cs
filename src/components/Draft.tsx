import { useEffect, useMemo, useRef, useState } from 'react';
import { logoForTeam } from '../data/media';
import { playerOvr } from '../engine/ratings';
import type { DraftState, Player, TeamSeason } from '../types';
import { useLang } from '../state/i18n';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';
import { FutCard } from './FutCard';
import { hashStr } from '../state/hash';
import { makeRng } from '../engine/rng';
import { CareerIcon } from './career/CareerIcon';

const teamLogo = (t: TeamSeason) => t.logoUrl ?? logoForTeam(t);

// Funções-chave que mais pesam na simulação (ver engine/ratings draftSynergy)
type RoleKey = 'IGL' | 'AWP' | 'Entry' | 'Support';
interface RoleNeed {
  key: RoleKey;
  critical: boolean;
}
const NEED_DEFS: Record<RoleKey, RoleNeed> = {
  IGL: { key: 'IGL', critical: true },
  AWP: { key: 'AWP', critical: true },
  Entry: { key: 'Entry', critical: false },
  Support: { key: 'Support', critical: false },
};

function rosterNeeds(picked: Player[]): RoleNeed[] {
  const out: RoleNeed[] = [];
  if (!picked.some((p) => p.role === 'IGL' || p.igl >= 80)) out.push(NEED_DEFS.IGL);
  if (!picked.some((p) => p.role === 'AWP' || p.awp >= 80)) out.push(NEED_DEFS.AWP);
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
  const { t: tr } = useLang();
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

  const [revealedTeam, setRevealedTeam] = useState<string | null>(null);
  const spinning = !coachPhase && !!source && revealedTeam !== source.id;

  const pickedPlayers = draft.rounds
    .slice(0, draft.current)
    .map((r) => {
      const t = dataset.find((x) => x.id === r.teamSeasonId);
      return t?.players.find((p) => p.id === r.pickedPlayerId);
    })
    .filter(Boolean) as Player[];

  const needs = useMemo(() => rosterNeeds(pickedPlayers), [pickedPlayers]);

  const fillsFor = (p: Player): RoleNeed | null => {
    if (needs.some((n) => n.key === 'IGL') && p.igl >= 80) return NEED_DEFS.IGL;
    if (needs.some((n) => n.key === 'AWP') && p.awp >= 80) return NEED_DEFS.AWP;
    if (needs.some((n) => n.key === 'Entry') && p.role === 'Entry') return NEED_DEFS.Entry;
    if (needs.some((n) => n.key === 'Support') && (p.role === 'Support' || p.role === 'Lurker')) return NEED_DEFS.Support;
    return null;
  };

  // Progresso (5 picks + coach)
  const STEPS = 6;
  const currentStep = Math.min(draft.current, STEPS - 1);

  return (
    <div className="fade-in em-draft-layout">
      <div className="em-stage-card em-draft-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header sticky */}
        <div className="em-draft-head">
          <div className="em-draft-head-row">
            <div className="em-draft-head-title">
              <span className="em-draft-kicker">
                {coachPhase ? tr('draft.coachTitle') : `${tr('draft.title')} ${draft.current + 1} ${tr('common.of')} 5`}
              </span>
              <span className="em-draft-title">
                {coachPhase ? tr('draft.coachSub') : spinning ? tr('draft.spinning') : tr('draft.spinDone')}
              </span>
            </div>
            {!coachPhase && source && !spinning && (
              <button type="button" className="em-btn em-btn-ghost" onClick={onReroll} disabled={draft.rerollsLeft <= 0}>
                <CareerIcon name="refresh" size={13} /> {tr('draft.reroll')} ({draft.rerollsLeft})
              </button>
            )}
          </div>

          {/* Barra de progresso (5 picks + coach) */}
          <div className="em-draft-steps" aria-label="Progresso do draft">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const isCoach = i === 5;
              const done = i < draft.current;
              const current = i === currentStep;
              return (
                <span key={i} className={`em-draft-step${done ? ' is-done' : ''}${current ? ' is-current' : ''}${isCoach ? ' is-coach' : ''}`}>
                  <span className="em-draft-step-tag">{isCoach ? 'C' : i + 1}</span>
                  <span className="em-draft-step-act">
                    {isCoach ? tr('draft.coachTitle') : `Pick ${i + 1}`}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="em-draft-body">
          {/* Fase de jogadores */}
          {!coachPhase && source && (
            <>
              {spinning && (
                <DraftRoulette
                  key={source.id}
                  pool={dataset}
                  target={source}
                  onDone={() => setRevealedTeam(source.id)}
                />
              )}

              {!spinning && (
                <>
                  <div className="em-draft-source" style={{ background: `linear-gradient(120deg, ${source.colors[0]}33 0%, var(--em-panel-2) 70%)` }}>
                    <TeamBadge tag={source.tag} colors={source.colors} size={64} logoUrl={teamLogo(source)} />
                    <div className="em-draft-source-info">
                      <div className="em-draft-source-era">
                        {source.game} · {source.era}
                      </div>
                      <h2>
                        {source.team} <Flag cc={source.country} />
                      </h2>
                      <div className="em-draft-source-honors">{source.honors}</div>
                    </div>
                  </div>

                  {/* Banner de necessidades */}
                  {needs.length === 0 ? (
                    <div className="em-draft-needs is-ok">
                      <CareerIcon name="check" size={14} /> {tr('draft.needsOk')}
                    </div>
                  ) : (
                    <div className="em-draft-needs">
                      <span className="em-draft-needs-title">{tr('draft.needsTitle')}</span>
                      {needs.map((n) => (
                        <span key={n.key} className={`em-draft-need-chip${n.critical ? ' is-critical' : ''}`} title={tr(`draft.need${n.key}Why`)}>
                          {n.critical && <CareerIcon name="warning" size={11} />}
                          {tr(`draft.need${n.key}`)}
                        </span>
                      ))}
                      <span className="em-draft-needs-hint">{tr('draft.needsHint')}</span>
                    </div>
                  )}

                  <div className="em-draft-players">
                    {source.players.map((p, i) => (
                      <div key={p.id} className="em-draft-player-wrap" style={{ animationDelay: `${i * 36}ms` }}>
                        <PlayerCard
                          p={p}
                          classic={classic}
                          taken={pickedIds.has(p.id) || pickedNicks.has(p.nick.toLowerCase())}
                          fills={fillsFor(p)}
                          onPick={() => onPick(p.id)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Fase de coach */}
          {coachPhase && (
            <div className="em-draft-coaches">
              {draft.coachOptions.map((tid, i) => {
                const t = dataset.find((x) => x.id === tid);
                if (!t) return null;
                const c = t.coach;
                return (
                  <button
                    key={tid}
                    type="button"
                    className="em-coach-card"
                    onClick={() => onPickCoach(tid)}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <PlayerAvatar nick={c.nick} size={56} coach />
                    {classic && <OvrBadge ovr={c.rating} label="COACH" />}
                    <div className="em-coach-nick">{c.nick}</div>
                    <div className="em-coach-meta">
                      <Flag cc={c.country} />
                      <span>{c.name}</span>
                    </div>
                    <div className="em-coach-style">
                      <span className={`role-pill IGL`}>{tr(`coach.${c.style}`)}</span>
                    </div>
                    <div className="em-coach-desc">{tr(`coach.${c.style}Desc`)}</div>
                    <div className="em-coach-from">
                      <TeamBadge tag={t.tag} colors={t.colors} size={16} logoUrl={teamLogo(t)} />
                      <span>{t.team} {t.era}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Roster (sidebar) */}
      <div className="em-stage-card em-draft-roster">
        <div className="em-draft-section-head">
          <CareerIcon name="star" size={13} /> {tr('draft.yourRoster')}
        </div>
        <div className="em-draft-slots">
          {[0, 1, 2, 3, 4].map((i) => {
            const r = draft.rounds[i];
            const t = r && dataset.find((x) => x.id === r.teamSeasonId);
            const p = t?.players.find((x) => x.id === r.pickedPlayerId);
            if (p && t) {
              return (
                <div key={i} className="em-draft-slot is-filled">
                  <PlayerAvatar nick={p.nick} size={36} />
                  <div className="em-draft-slot-info">
                    <div className="em-draft-slot-nick">
                      <Flag cc={p.country} /> {p.nick} <span className="em-draft-slot-ovr">{playerOvr(p)}</span>
                    </div>
                    <div className="em-draft-slot-meta">
                      <span className={`role-pill ${p.role}`}>{p.role}</span>
                      <span className="em-draft-slot-from">{t.team} {t.era}</span>
                    </div>
                  </div>
                </div>
              );
            }
            const isNext = i === draft.current;
            return (
              <div key={i} className={`em-draft-slot${isNext ? ' is-next' : ' is-empty'}`}>
                <span className="em-draft-slot-num">{i + 1}</span>
                <span className="em-draft-slot-placeholder">
                  {isNext ? tr('draft.choosing') : tr('draft.pickN')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const REEL_ITEM_W = 168;
const REEL_LEN = 44;
const REEL_TARGET = REEL_LEN - 5;

function DraftRoulette({ pool, target, onDone }: { pool: TeamSeason[]; target: TeamSeason; onDone: () => void }) {
  const { t: tr } = useLang();
  const reel = useMemo(() => {
    const others = pool.filter((t) => t.id !== target.id);
    const rng = makeRng(hashStr(`draft-reel:${target.id}`));
    const items: TeamSeason[] = [];
    for (let i = 0; i < REEL_LEN; i++) {
      if (i === REEL_TARGET) items.push(target);
      else items.push(others[Math.floor(rng() * others.length)] ?? target);
    }
    return items;
  }, [pool, target]);

  const windowRef = useRef<HTMLDivElement>(null);
  const [winW, setWinW] = useState(0);
  const [rolling, setRolling] = useState(false);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (windowRef.current) setWinW(windowRef.current.offsetWidth);
  }, []);

  useEffect(() => {
    if (!winW) return;
    const raf = requestAnimationFrame(() => setRolling(true));
    const t = window.setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current();
      }
    }, 4400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [winW]);

  const center = winW / 2;
  const startX = center - (REEL_ITEM_W * 2 + REEL_ITEM_W / 2);
  const endX = center - (REEL_TARGET * REEL_ITEM_W + REEL_ITEM_W / 2);

  return (
    <div className="em-roulette">
      <div className="em-roulette-window" ref={windowRef}>
        <div className="em-roulette-marker" />
        <div className="em-roulette-fade left" />
        <div className="em-roulette-fade right" />
        <div
          className="em-roulette-strip"
          style={{
            transform: `translateX(${rolling ? endX : startX}px)`,
            transition: rolling ? 'transform 3.8s cubic-bezier(0.12, 0.7, 0.12, 1)' : 'none',
          }}
          onTransitionEnd={() => {
            if (!doneRef.current) {
              doneRef.current = true;
              onDoneRef.current();
            }
          }}
        >
          {reel.map((t, i) => (
            <div
              key={i}
              className={`em-roulette-card${i === REEL_TARGET ? ' is-target' : ''}`}
              style={{ background: `linear-gradient(150deg, ${t.colors[0]}55 0%, var(--em-panel-2) 75%)` }}
            >
              <TeamBadge tag={t.tag} colors={t.colors} size={44} logoUrl={teamLogo(t)} />
              <div className="em-roulette-card-name">{t.team}</div>
              <div className="em-roulette-card-era">{t.era}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="em-roulette-hint">{tr('draft.rouletteHint')}</div>
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
  const { t: tr } = useLang();
  const flag = fills ? (
    <span className={`em-fills-flag${fills.critical ? ' is-critical' : ''}`}>
      {fills.critical && <CareerIcon name="warning" size={11} />}
      {fills.critical ? tr('draft.fills') : '+'} {tr(`draft.need${fills.key}Short`)}
    </span>
  ) : null;
  if (classic) {
    return (
      <div style={{ position: 'relative', opacity: taken ? 0.5 : 1, pointerEvents: taken ? 'none' : 'auto' }}>
        {flag}
        <FutCard player={p} onClick={taken ? undefined : onPick} />
        {taken && (
          <span className="em-draft-taken-tag">
            {tr('draft.alreadyPicked')}
          </span>
        )}
      </div>
    );
  }
  return (
    <button className={`em-pcard${taken ? ' is-taken' : ''}${fills ? ' fills-need' : ''}`} onClick={onPick}>
      {flag}
      <PlayerAvatar nick={p.nick} size={56} />
      <div className="em-pcard-nick">{p.nick}</div>
      <div className="em-pcard-meta">
        <Flag cc={p.country} />
        <span>{p.name}</span>
      </div>
      <div className="em-pcard-meta">
        <span className={`role-pill ${p.role}`}>{p.role}</span>
      </div>
      {taken && <div className="em-pcard-meta em-muted">{tr('draft.alreadyPicked')}</div>}
    </button>
  );
}
