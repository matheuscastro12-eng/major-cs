// [Major espetáculo] Peças reaproveitáveis: chip de time, toggle de som,
// contagem regressiva, walkout e a chave (suíço por recorde / mata-mata).
import { useEffect, useState } from 'react';
import { Flag, TeamBadge } from '../../../components/ui';
import type { Pairing, TPlayer, TTeam } from '../../../types';
import { play, useReducedMotion, useSound } from './audio';
import { mt } from './i18n';
import type { HistoryItem, PickemGrade, SwissBoard } from './logic';

export type TeamOf = (id: string) => { id: string; tag: string; name: string; country: string; colors: [string, string]; logoUrl?: string; players: TPlayer[] };

export function teamLookup(...pools: (TTeam[] | undefined)[]): TeamOf {
  const m = new Map<string, TTeam>();
  for (const p of pools) for (const t of p ?? []) if (!m.has(t.id)) m.set(t.id, t);
  return (id) => {
    const t = m.get(id);
    if (t) return t;
    const tag = (id.split(/[-_:]/)[0] || id).slice(0, 6).toUpperCase();
    return { id, tag, name: tag, country: '', colors: ['var(--c-surface-3)', 'var(--c-ink-faint)'] as [string, string], players: [] };
  };
}

export function TeamChip({ team, user, dim, big }: { team: ReturnType<TeamOf>; user?: boolean; dim?: boolean; big?: boolean }) {
  return (
    <span className={`mj-chip${user ? ' user' : ''}${dim ? ' dim' : ''}${big ? ' big' : ''}`}>
      <TeamBadge tag={team.tag} colors={team.colors} logoUrl={team.logoUrl} size={big ? 34 : 20} />
      <b>{team.tag}</b>
    </span>
  );
}

export function SoundToggle() {
  const [on, set] = useSound();
  return (
    <button type="button" className={`mj-sound${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set(!on)} title={mt('Som sintetizado (opcional)')}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {on ? <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          : <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      </svg>
      <span>{on ? mt('Som ligado') : mt('Som desligado')}</span>
    </button>
  );
}

/** contagem para a grande final: 10 → 0 e "AO VIVO" (estático com movimento reduzido) */
export function Countdown({ from = 10, label }: { from?: number; label: string }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(from);
  useEffect(() => {
    if (reduced) return;
    let x = from;
    const id = window.setInterval(() => {
      x -= 1;
      if (x > 0 && x <= 3) play('tick');
      if (x === 0) play('go');
      if (x <= 0) window.clearInterval(id);
      setN(Math.max(0, x));
    }, 1000);
    return () => window.clearInterval(id);
  }, [reduced, from]);
  const shown = reduced ? 0 : n;
  return (
    <div className="mj-countdown" role="timer" aria-live="polite">
      <small>{label}</small>
      {shown > 0 ? <b key={shown} className="mj-count-n">{shown}</b> : <b className="mj-count-live">{mt('AO VIVO')}</b>}
    </div>
  );
}

/** walkout dos dois times: os 5 de cada lado entram no palco, um a um */
export function Walkout({ a, b, userSide, replayKey }: { a: ReturnType<TeamOf>; b: ReturnType<TeamOf>; userSide: 0 | 1 | -1; replayKey: number }) {
  const side = (t: ReturnType<TeamOf>, s: 0 | 1) => (
    <div className={`mj-walk-side s${s}${userSide === s ? ' user' : ''}`}>
      <div className="mj-walk-team"><TeamChip team={t} big user={userSide === s} /><span>{t.name}</span></div>
      <div className="mj-walk-row">
        {(t.players.length ? t.players.slice(0, 5) : Array.from({ length: 5 }, () => null)).map((p, i) => (
          <div key={`${replayKey}-${i}`} className="mj-walk-card" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
            <span className="mj-walk-sil" aria-hidden="true" />
            <b>{p?.nick ?? '—'}</b>
            {p && <small><Flag cc={p.country} /> {p.role}</small>}
          </div>
        ))}
      </div>
    </div>
  );
  return <div className="mj-walkout" aria-label={mt('Walkout dos times')}>{side(a, 0)}<span className="mj-walk-vs">VS</span>{side(b, 1)}</div>;
}

const recClass = (label: string) => {
  const m = /^(\d)-(\d)$/.exec(label); if (!m) return '';
  const w = +m[1]; const l = +m[2];
  return w === 2 && l === 2 ? 'decider' : l === 2 ? 'elim' : w === 2 ? 'adv' : '';
};

function pickMark(grade: PickemGrade | undefined, stage: number, p: Pairing): { pick?: string; hit: boolean | null } {
  const row = grade?.rows.find((r) => r.pick.stage === stage && r.pick.a === p.a && r.pick.b === p.b && r.pick.label === p.label);
  return row ? { pick: row.pick.pick, hit: row.hit } : { hit: null };
}

/** quadro suíço: rodada a rodada, agrupado por recorde; pendentes aceitam palpite */
export function SwissBoardView({ board, teamOf, stage, grade, onPick, onOpen }: {
  board: SwissBoard; teamOf: TeamOf; stage: number; grade?: PickemGrade;
  onPick?: (key: string, teamId: string) => void; onOpen?: (p: Pairing) => void;
}) {
  return (
    <div className="mj-swiss" role="region" aria-label={mt('Quadro suíço')}>
      <div className="mj-swiss-cols">
        {board.columns.map((col) => (
          <div key={col.round} className="mj-swiss-col">
            <div className="mj-swiss-head">{mt('Rodada')} {col.round}</div>
            {col.cells.map((cell) => (
              <div key={cell.label} className={`mj-swiss-cell ${recClass(cell.label)}`}>
                <div className="mj-swiss-rec">
                  <b>{cell.label}</b>
                  {recClass(cell.label) === 'decider' && <em>{mt('decider')}</em>}
                  {recClass(cell.label) === 'elim' && <em>{mt('eliminação')}</em>}
                  {recClass(cell.label) === 'adv' && <em>{mt('vale vaga')}</em>}
                </div>
                {cell.matches.map((m) => {
                  const A = teamOf(m.a); const B = teamOf(m.b);
                  const mark = pickMark(grade, stage, m.pairing);
                  const isUser = m.a === 'user' || m.b === 'user';
                  const canPick = m.pending && !isUser && !!onPick;
                  const row = (t: ReturnType<TeamOf>, idx: 0 | 1) => {
                    const won = m.winner === t.id; const lost = !!m.winner && !won;
                    const picked = mark.pick === t.id;
                    return canPick ? (
                      <button type="button" className={`mj-sw-team pick${picked ? ' picked' : ''}`} onClick={() => { onPick!(`${m.a}|${m.b}`, t.id); play('tick'); }} aria-pressed={picked} title={`${mt('Palpite:')} ${t.name}`}>
                        <TeamChip team={t} user={t.id === 'user'} /><span className="mj-sw-pk" aria-hidden="true">{picked ? '●' : '○'}</span>
                      </button>
                    ) : (
                      <span className={`mj-sw-team${won ? ' won' : ''}${lost ? ' lost' : ''}`}>
                        <TeamChip team={t} user={t.id === 'user'} dim={lost} />
                        {m.score && <b className="mj-sw-score">{m.score[idx]}</b>}
                        {picked && mark.hit !== null && <span className={`mj-sw-hit ${mark.hit ? 'ok' : 'no'}`} title={mark.hit ? mt('Acertou o palpite') : mt('Errou o palpite')}>{mark.hit ? '✓' : '✗'}</span>}
                      </span>
                    );
                  };
                  return (
                    <div key={`${m.a}|${m.b}`} className={`mj-sw-match${isUser ? ' user' : ''}${m.pending ? ' pending' : ''}${!m.pending && onOpen ? ' clickable' : ''}`}
                      onClick={!m.pending && onOpen ? () => onOpen(m.pairing) : undefined}>
                      {row(A, 0)}{row(B, 1)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
        <div className="mj-swiss-col final">
          <div className="mj-swiss-head">{mt('Classificados')}</div>
          {board.qualified.length === 0 && <p className="mj-muted">{mt('Ninguém com 3 vitórias ainda.')}</p>}
          {board.qualified.map((q) => <div key={q.id} className={`mj-sw-final q r${q.rec.replace('-', '')}`}><TeamChip team={teamOf(q.id)} user={q.id === 'user'} /><b>{q.rec}</b></div>)}
          <div className="mj-swiss-head elim">{mt('Eliminados')}</div>
          {board.eliminated.map((q) => <div key={q.id} className="mj-sw-final e"><TeamChip team={teamOf(q.id)} user={q.id === 'user'} dim /><b>{q.rec}</b></div>)}
        </div>
      </div>
    </div>
  );
}

/** mata-mata: quartas → semis → grande final */
export function PlayoffTreeView({ items, live, teamOf, onOpen, grade, stage, onPick }: {
  items: HistoryItem[]; live: Pairing[]; teamOf: TeamOf; onOpen?: (p: Pairing) => void;
  grade?: PickemGrade; stage: number; onPick?: (key: string, teamId: string) => void;
}) {
  const all = [...items.map((h) => h.pairing), ...live.filter((p) => !items.some((h) => h.pairing.a === p.a && h.pairing.b === p.b && h.pairing.label === p.label))];
  const by = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => all.find((p) => p.label === (n === 1 ? prefix : `${prefix}${i + 1}`)));
  const cols: { title: string; ms: (Pairing | undefined)[]; cls: string }[] = [
    { title: mt('Quartas'), ms: by('QF', 4), cls: 'qf' },
    { title: mt('Semifinais'), ms: by('SF', 2), cls: 'sf' },
    { title: mt('Grande final'), ms: by('FINAL', 1), cls: 'fi' },
  ];
  return (
    <div className="mj-tree" role="region" aria-label={mt('Chave dos playoffs')}>
      {cols.map((c) => (
        <div key={c.cls} className={`mj-tree-col ${c.cls}`}>
          <div className="mj-swiss-head">{c.title}</div>
          <div className="mj-tree-stack">
            {c.ms.map((p, i) => {
              if (!p) return <div key={i} className="mj-tree-match tbd"><span>{mt('a definir')}</span><span>{mt('a definir')}</span></div>;
              const r = p.result; const mark = pickMark(grade, stage, p);
              const isUser = p.a === 'user' || p.b === 'user';
              const canPick = !r && !isUser && !!onPick;
              return (
                <div key={i} className={`mj-tree-match${isUser ? ' user' : ''}${r && onOpen ? ' clickable' : ''}`} onClick={r && onOpen ? () => onOpen(p) : undefined}>
                  {([p.a, p.b] as const).map((id, k) => {
                    const won = r && (r.winner === k); const lost = r && !won;
                    const picked = mark.pick === id;
                    return canPick ? (
                      <button key={id} type="button" className={`mj-sw-team pick${picked ? ' picked' : ''}`} onClick={() => onPick!(`${p.a}|${p.b}`, id)} aria-pressed={picked}>
                        <TeamChip team={teamOf(id)} /><span className="mj-sw-pk" aria-hidden="true">{picked ? '●' : '○'}</span>
                      </button>
                    ) : (
                      <span key={id} className={`mj-sw-team${won ? ' won' : ''}${lost ? ' lost' : ''}`}>
                        <TeamChip team={teamOf(id)} user={id === 'user'} dim={!!lost} />
                        {r && <b className="mj-sw-score">{r.mapScore[k]}</b>}
                        {picked && mark.hit !== null && <span className={`mj-sw-hit ${mark.hit ? 'ok' : 'no'}`}>{mark.hit ? '✓' : '✗'}</span>}
                      </span>
                    );
                  })}
                  <small className="mj-tree-bo">MD{p.bestOf ?? (c.cls === 'fi' ? 5 : 3)}</small>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
