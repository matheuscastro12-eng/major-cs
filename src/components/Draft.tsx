import { useEffect, useMemo, useRef, useState } from 'react';
import { logoForTeam } from '../data/media';
import { playerOvr } from '../engine/ratings';
import type { DraftState, Player, TeamSeason } from '../types';
import { useLang } from '../state/i18n';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';
import { FutCard } from './FutCard';

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

  // animação de roleta: gira ao sortear um novo elenco (e em cada reroll)
  const [revealedTeam, setRevealedTeam] = useState<string | null>(null);
  const spinning = !coachPhase && !!source && revealedTeam !== source.id;

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
            {tr('draft.title')} {draft.current + 1} {tr('common.of')} 5
            <span className="spacer" />
            <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {spinning ? tr('draft.spinning') : tr('draft.spinDone')}
            </span>
          </div>

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
              <div className="draft-source draft-reveal" style={{ background: `linear-gradient(120deg, ${source.colors[0]}33 0%, var(--header) 70%)` }}>
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
                  {tr('draft.reroll')} ({draft.rerollsLeft})
                </button>
              </div>

          <div className="role-needs">
            {needs.length === 0 ? (
              <span className="role-needs-ok">{tr('draft.needsOk')}</span>
            ) : (
              <>
                <span className="role-needs-title">{tr('draft.needsTitle')}</span>
                {needs.map((n) => (
                  <span key={n.key} className={`need-chip${n.critical ? ' critical' : ''}`} title={tr(`draft.need${n.key}Why`)}>
                    {n.critical ? '⚠ ' : ''}
                    {tr(`draft.need${n.key}`)}
                  </span>
                ))}
                <span className="role-needs-hint">{tr('draft.needsHint')}</span>
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
            </>
          )}
        </div>
      )}

      {coachPhase && (
        <div className="panel">
          <div className="panel-head">
            {tr('draft.coachTitle')}
            <span className="spacer" />
            <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {tr('draft.coachSub')}
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
                    <span className="role-pill IGL">{tr(`coach.${c.style}`)}</span>
                  </div>
                  <div className="meta muted small" style={{ marginTop: 6, lineHeight: 1.3 }}>
                    {tr(`coach.${c.style}Desc`)}
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
        <div className="panel-head">{tr('draft.yourRoster')}</div>
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
                  {i === draft.current ? `… ${tr('draft.choosing')}` : `${tr('draft.pickN')} ${i + 1}`}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Roleta horizontal (estilo abertura de caixa): gira passando por vários
// elencos e desacelera parando no time sorteado, dando aquela tensão gostosa.
const REEL_ITEM_W = 168; // largura do card + gap (precisa casar com o CSS)
const REEL_LEN = 44; // quantos cards passam até parar
const REEL_TARGET = REEL_LEN - 5; // posição final do time sorteado

function DraftRoulette({ pool, target, onDone }: { pool: TeamSeason[]; target: TeamSeason; onDone: () => void }) {
  const { t: tr } = useLang();
  const reel = useMemo(() => {
    const others = pool.filter((t) => t.id !== target.id);
    const items: TeamSeason[] = [];
    for (let i = 0; i < REEL_LEN; i++) {
      if (i === REEL_TARGET) items.push(target);
      else items.push(others[Math.floor(Math.random() * others.length)] ?? target);
    }
    return items;
  }, [pool, target]);

  const windowRef = useRef<HTMLDivElement>(null);
  const [winW, setWinW] = useState(0);
  const [rolling, setRolling] = useState(false);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // mede a largura da janela da roleta para centralizar o card alvo
  useEffect(() => {
    if (windowRef.current) setWinW(windowRef.current.offsetWidth);
  }, []);

  // dispara a animação uma única vez (não depende de onDone, que muda a cada render)
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

  // centro do card alvo (a partir da borda esquerda da tira) e centro da janela
  const center = winW / 2;
  const startX = center - (REEL_ITEM_W * 2 + REEL_ITEM_W / 2); // 3º card centralizado no início
  const endX = center - (REEL_TARGET * REEL_ITEM_W + REEL_ITEM_W / 2);

  return (
    <div className="roulette">
      <div className="roulette-window" ref={windowRef}>
        <div className="roulette-marker" />
        <div className="roulette-fade left" />
        <div className="roulette-fade right" />
        <div
          className="roulette-strip"
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
              className={`roulette-card${i === REEL_TARGET ? ' is-target' : ''}`}
              style={{ background: `linear-gradient(150deg, ${t.colors[0]}55 0%, var(--header) 75%)` }}
            >
              <TeamBadge tag={t.tag} colors={t.colors} size={44} logoUrl={teamLogo(t)} />
              <div className="rc-name">{t.team}</div>
              <div className="rc-era">{t.era}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="roulette-hint">{tr('draft.rouletteHint')}</div>
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
    <span className={`fills-flag${fills.critical ? ' critical' : ''}`} style={{ position: 'absolute', top: '-9px', left: '50%', transform: 'translateX(-50%)', zIndex: 3, whiteSpace: 'nowrap' }}>
      {fills.critical ? `⚠ ${tr('draft.fills')} ` : '+ '}
      {tr(`draft.need${fills.key}Short`)}
    </span>
  ) : null;
  // modo clássico: cards FUT do design (info completa). Almanaque mantém o card com
  // info oculta (o jogo é adivinhar a era), só com a função visível.
  if (classic) {
    return (
      <div style={{ position: 'relative', opacity: taken ? 0.5 : 1, pointerEvents: taken ? 'none' : 'auto' }}>
        {flag}
        <FutCard player={p} onClick={taken ? undefined : onPick} />
        {taken && <span style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--rtm-faint)', zIndex: 3 }}>{tr('draft.alreadyPicked')}</span>}
      </div>
    );
  }
  return (
    <button className={`pcard${taken ? ' taken' : ''}${fills ? ' fills-need' : ''}`} onClick={onPick} style={{ position: 'relative' }}>
      {flag}
      <PlayerAvatar nick={p.nick} size={56} />
      <div className="nick">{p.nick}</div>
      <div className="meta">
        <Flag cc={p.country} />
        <span>{p.name}</span>
      </div>
      <div className="meta">
        <span className={`role-pill ${p.role}`}>{p.role}</span>
      </div>
      {taken && <div className="meta muted small">{tr('draft.alreadyPicked')}</div>}
    </button>
  );
}
