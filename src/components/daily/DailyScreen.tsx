// DIÁRIO — hub dos minigames diários + o jogo LINES HISTÓRICAS.
// Grátis, sem conta, sem save na nuvem: o Diário é porta de entrada e motivo
// de volta (loop tipo Wordle). A lógica vive em engine/daily/lines.ts; aqui é
// render + localStorage (state/daily.ts).

import { useMemo, useRef, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { track } from '../../state/track';
import {
  DAILY_GAMES, dateKeyOf, dayNumberOf, lineOfDay, slotOrderOf,
  applyGuess, freshProgress, giveUp, shareTextOf, MAX_ERRORS,
  type LinesProgress,
} from '../../engine/daily/lines';
import { loadDailyProgress, saveDailyProgress, loadDailyStreak } from '../../state/daily';
import '../../styles/daily.css';

// ISO alpha-2 → emoji de bandeira (regional indicators)
function flagOf(cc: string): string {
  return cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));
}

const ROLE_LABEL: Record<string, string> = {
  IGL: 'IGL', AWP: 'AWP', Rifler: 'Rifle', Entry: 'Entry', Support: 'Suporte', Lurker: 'Lurker', Coach: 'Coach',
};

export function DailyScreen({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<'hub' | 'lines'>('hub');
  const dateKey = dateKeyOf(new Date());
  const day = dayNumberOf(dateKey);
  const streak = loadDailyStreak('lines');

  return (
    <div className="rtm-daily">
      <header className="rtm-daily-head">
        <button type="button" className="rtm-daily-back" onClick={() => (view === 'hub' ? onExit() : setView('hub'))}>←</button>
        <div className="rtm-daily-title">
          <b>{ct('DIÁRIO')} <span className="rtm-daily-num">#{day}</span></b>
          <span>{ct('Um desafio novo por dia — mesmo pra todo mundo.')}</span>
        </div>
        {streak.streak >= 2 && <span className="rtm-daily-streak">🔥 {streak.streak}</span>}
      </header>

      {view === 'hub' && (
        <div className="rtm-daily-hub">
          {DAILY_GAMES.map((g) => {
            const p = loadDailyProgress(g.id, dateKey);
            const status = p?.done ? (p.won ? ct('completo · volte amanhã') : ct('foi por pouco · volte amanhã')) : p ? ct('em andamento') : ct('novo desafio disponível');
            return (
              <button key={g.id} type="button" className="rtm-daily-card" data-done={p?.done ? '' : undefined} onClick={() => setView('lines')}>
                <span className="rtm-daily-card-icon">{g.icon}</span>
                <span className="rtm-daily-card-body">
                  <b>{g.title}</b>
                  <span>{g.blurb}</span>
                  <em>{status}</em>
                </span>
                <span className="rtm-daily-card-go">{p?.done ? '✓' : '→'}</span>
              </button>
            );
          })}
          <p className="rtm-daily-soon">{ct('Mais minigames diários em breve — todo dia, um jeito novo de provar que você manja de CS.')}</p>
        </div>
      )}

      {view === 'lines' && <LinesGame dateKey={dateKey} streakNow={streak.streak} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LINES HISTÓRICAS

function LinesGame({ dateKey, streakNow }: { dateKey: string; streakNow: number }) {
  const line = useMemo(() => lineOfDay(dateKey), [dateKey]);
  const order = useMemo(() => slotOrderOf(dateKey, line), [dateKey, line]);
  const [progress, setProgress] = useState<LinesProgress>(() => {
    const saved = loadDailyProgress('lines', dateKey);
    if (!saved) track('daily_play', { game: 'lines', day: dayNumberOf(dateKey), lineId: line.id });
    return saved ?? freshProgress();
  });
  const [guess, setGuess] = useState('');
  const [shake, setShake] = useState(0);
  const [popIdx, setPopIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (p: LinesProgress) => {
    setProgress(p);
    saveDailyProgress('lines', dateKey, p);
    if (p.done) track('daily_done', { game: 'lines', day: dayNumberOf(dateKey), won: p.won, errors: p.errors, found: p.found.length });
  };

  const submit = () => {
    if (!guess.trim() || progress.done) return;
    const { progress: next, hit } = applyGuess(line, progress, guess);
    if (hit != null) { setPopIdx(hit); setTimeout(() => setPopIdx(null), 500); }
    else if (next.errors > progress.errors) { setShake((s) => s + 1); }
    commit(next);
    setGuess('');
    inputRef.current?.focus();
  };

  const doGiveUp = () => {
    if (progress.done) return;
    if (!window.confirm(ct('Desistir revela a line e zera sua sequência. Certeza?'))) return;
    commit(giveUp(progress));
  };

  const doShare = async () => {
    // streak PÓS-resultado: se venceu hoje, o load já reflete o dia salvo.
    const st = loadDailyStreak('lines');
    const text = shareTextOf(dateKey, line, progress, st.streak || streakNow);
    track('daily_share', { game: 'lines', day: dayNumberOf(dateKey), won: progress.won });
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch { /* cancelado — cai pro clipboard */ }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* sem clipboard */ }
  };

  const livesLeft = MAX_ERRORS - progress.errors;

  return (
    <div className="rtm-lines">
      {/* a manchete que situa a line — a dica principal */}
      <div className="rtm-lines-brief">
        <span className="rtm-lines-kicker">{ct('LEMBRE OS 5')}</span>
        <b>{line.team} · {line.year}</b>
        <p>{line.context}</p>
      </div>

      {/* os 5 slots — scoreboard estilo HLTV */}
      <div className="rtm-lines-slots">
        {order.map((idx, pos) => {
          const pl = line.players[idx];
          const found = progress.found.includes(idx);
          const revealed = progress.done && !found;
          return (
            <div key={idx} data-pos={String(pos + 1).padStart(2, '0')} className={`rtm-lines-slot${found ? ' hit' : ''}${revealed ? ' missed' : ''}${popIdx === idx ? ' pop' : ''}`}>
              <span className="rtm-lines-flag">{flagOf(pl.country)}</span>
              {found || revealed
                ? <b className="rtm-lines-nick">{pl.nick}</b>
                : <b className="rtm-lines-nick hidden">{'▒'.repeat(Math.min(pl.nick.length, 8))}</b>}
              <span className="rtm-lines-role">{ROLE_LABEL[pl.role] ?? pl.role}</span>
            </div>
          );
        })}
      </div>

      {/* vidas como pente de munição: cada erro gasta um cartucho */}
      <div className="rtm-lines-lives" title={ct('Chutes errados restantes')}>
        {Array.from({ length: MAX_ERRORS }, (_, i) => (
          <span key={i} className={`rtm-lines-bullet${i >= livesLeft ? ' spent' : ''}`} />
        ))}
      </div>

      {/* input ou resultado */}
      {!progress.done ? (
        <>
          <div key={shake} className="rtm-lines-inputrow shakeable">
            <div className="rtm-lines-prompt">
              <input
                ref={inputRef}
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                placeholder={ct('digite um nick (ex.: fallen)')}
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <button type="button" className="rtm-lines-go" onClick={submit}>{ct('Chutar')}</button>
          </div>
          <button type="button" className="rtm-lines-giveup" onClick={doGiveUp}>{ct('Desistir e revelar')}</button>
        </>
      ) : (
        <div className="rtm-lines-result">
          <b className={progress.won ? 'w' : 'l'}>
            {progress.won
              ? (progress.errors === 0 ? 'ACE! 5/5 SEM ERRAR' : ct('LINE COMPLETA!'))
              : ct('ELIMINADO')}
          </b>
          <span className="rtm-lines-result-sub">
            {progress.won
              ? `${ct('Erros')}: ${progress.errors}/${MAX_ERRORS}`
              : ct('A escalação completa está aí em cima. Amanhã tem outra.')}
          </span>
          <button type="button" className="rtm-lines-share" onClick={doShare}>
            {copied ? ct('Copiado! Cola no grupo 😉') : ct('Compartilhar resultado')}
          </button>
          <span className="rtm-lines-tomorrow">{ct('Próxima line à meia-noite.')}</span>
        </div>
      )}
    </div>
  );
}
