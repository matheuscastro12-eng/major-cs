// DIÁRIO — hub dos minigames diários + o jogo LINES HISTÓRICAS.
// Grátis, sem conta, sem save na nuvem: o Diário é porta de entrada e motivo
// de volta (loop tipo Wordle). A lógica vive em engine/daily/lines.ts; aqui é
// render + localStorage (state/daily.ts).

import { useEffect, useMemo, useRef, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { track } from '../../state/track';
import {
  DAILY_GAMES, dateKeyOf, dayNumberOf, lineOfDay, slotOrderOf,
  applyGuess, freshProgress, giveUp, shareTextOf, MAX_ERRORS,
  type LinesProgress,
} from '../../engine/daily/lines';
import {
  whoisPool, whoisOfDay, findInPool, applyWhoisGuess, freshWhois, giveUpWhois,
  shareTextOfWhois, WHOIS_MAX, type WhoisProgress, type ClueCell, type OvrClue,
} from '../../engine/daily/whois';
import {
  impostorOfDay, applyPick, freshImpostor, shareTextOfImpostor, IMPOSTOR_TRIES,
  type ImpostorProgress,
} from '../../engine/daily/impostor';
import {
  classicOfDay, applyClassicPick, freshClassic, classicHint, shareTextOfClassic, CLASSIC_TRIES,
  type ClassicProgress,
} from '../../engine/daily/classics';
import { CS2_REAL_2026 } from '../../data/bo3';
import { loadDailyProgress, saveDailyProgress, loadDailyStreak, dailyDayStatus, syncPerfectStreak, PERFECT_KEY, setDailyFlag, dailyBadgeFacts, bankDailyDay, loadDailyDays } from '../../state/daily';
import { pingDailyGame, fetchDailyGamesStats, type DailyGamesStats } from '../../state/dailyGamesApi';
import { ultimateIndex, ultimateTotw } from '../../state/ultimate';
import { evaluateDailyBadges } from '../../engine/daily/badges';
import '../../styles/daily.css';

// ISO alpha-2 → emoji de bandeira (regional indicators)
function flagOf(cc: string): string {
  return cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));
}

const ROLE_LABEL: Record<string, string> = {
  IGL: 'IGL', AWP: 'AWP', Rifler: 'Rifle', Entry: 'Entry', Support: 'Suporte', Lurker: 'Lurker', Coach: 'Coach',
};

export function DailyScreen({ onExit, onGoUltimate }: { onExit: () => void; onGoUltimate?: () => void }) {
  const [view, setView] = useState<'hub' | 'lines' | 'whois' | 'impostor' | 'classic'>('hub');
  const dateKey = dateKeyOf(new Date());
  const day = dayNumberOf(dateKey);
  const streak = loadDailyStreak(view === 'hub' ? 'lines' : view);
  // prova social: contadores agregados do dia (anônimos, cacheados no edge)
  const [stats, setStats] = useState<DailyGamesStats | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchDailyGamesStats(day).then((s) => { if (alive) setStats(s); });
    return () => { alive = false; };
  }, [day]);
  // ✨ DIA PERFEITO — recomputado sempre que volta pro hub (idempotente)
  const gameIds = DAILY_GAMES.map((g) => g.id);
  const dayStatus = view === 'hub' ? dailyDayStatus(gameIds, dateKey) : null;
  useEffect(() => {
    if (view === 'hub') syncPerfectStreak(gameIds, dateKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dateKey]);
  const perfectStreak = loadDailyStreak(PERFECT_KEY);
  const [dayCopied, setDayCopied] = useState(false);

  const shareDay = async () => {
    if (!dayStatus) return;
    const cells = DAILY_GAMES.map((g) => {
      const p = dayStatus.perGame[g.id];
      return `${g.icon}${p?.done ? (p.won ? '✅' : '❌') : '▫️'}`;
    }).join(' ');
    const perfect = dayStatus.perfect
      ? `\n✨ DIA PERFEITO${perfectStreak.streak >= 2 ? ` · 🔥 ${perfectStreak.streak} dias perfeitos seguidos` : ''}`
      : '';
    const text = `DIÁRIO #${day} · MAJOR//CS\n${cells} — ${dayStatus.won}/${dayStatus.total}${perfect}\nroadtomajor.com.br/diario`;
    track('daily_share', { game: 'day', day, won: dayStatus.perfect });
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* cai pro clipboard */ }
    try { await navigator.clipboard.writeText(text); setDayCopied(true); setTimeout(() => setDayCopied(false), 1800); } catch { /* sem clipboard */ }
  };

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
              <button key={g.id} type="button" className="rtm-daily-card" data-done={p?.done ? '' : undefined} onClick={() => setView(g.id as 'lines' | 'whois' | 'impostor' | 'classic')}>
                <span className="rtm-daily-card-icon">{g.icon}</span>
                <span className="rtm-daily-card-body">
                  <b>{g.title}</b>
                  <span>{g.blurb}</span>
                  <em>
                    {status}
                    {(() => {
                      const st = stats?.[g.id];
                      if (!st || st.plays < 3) return null; // sem público ainda — não mostrar "2 jogaram"
                      const pct = Math.round((st.wins / Math.max(1, st.plays)) * 100);
                      return <> · 🔥 {st.plays} {ct('jogaram hoje')} · {pct}% {ct('venceram')}</>;
                    })()}
                  </em>
                </span>
                <span className="rtm-daily-card-go">{p?.done ? '✓' : '→'}</span>
              </button>
            );
          })}
          {/* ✨ SEU DIA — o meta-loop de completar os 4 */}
          {dayStatus && dayStatus.done > 0 && (
            <div className={`rtm-daily-dayrow${dayStatus.perfect ? ' perfect' : ''}`}>
              <span className="rtm-daily-daycells">
                {DAILY_GAMES.map((g) => {
                  const p = dayStatus.perGame[g.id];
                  return <span key={g.id}>{g.icon}{p?.done ? (p.won ? '✅' : '❌') : '▫️'}</span>;
                })}
              </span>
              <b>
                {dayStatus.perfect
                  ? <>✨ {ct('DIA PERFEITO')}{perfectStreak.streak >= 2 ? ` · 🔥 ${perfectStreak.streak}` : ''}</>
                  : `${dayStatus.won}/${dayStatus.total}`}
              </b>
              <button type="button" onClick={() => { void shareDay(); }}>
                {dayCopied ? ct('Copiado! 😉') : ct('Compartilhar meu dia')}
              </button>
            </div>
          )}
          {/* 📆 SUA FITA — heatmap das últimas 8 semanas (estilo GitHub) */}
          {(() => {
            const days = loadDailyDays();
            if (Object.keys(days).length === 0) return null;
            // 8 colunas de semanas (seg→dom), terminando na semana corrente
            const today = new Date(`${dateKey}T12:00:00`);
            const dow = (today.getDay() + 6) % 7; // 0 = segunda
            const weeks: { key: string; won: number; done: number; future: boolean }[][] = [];
            for (let w = 7; w >= 0; w--) {
              const col: { key: string; won: number; done: number; future: boolean }[] = [];
              for (let r = 0; r < 7; r++) {
                const d = new Date(today.getTime() - (w * 7 + dow - r) * 86_400_000);
                const k = dateKeyOf(d);
                const rec = days[k];
                col.push({ key: k, won: rec?.won ?? 0, done: rec?.done ?? 0, future: k > dateKey });
              }
              weeks.push(col);
            }
            return (
              <div className="rtm-daily-heat">
                <b>📆 {ct('SUAS ÚLTIMAS 8 SEMANAS')}</b>
                <div className="rtm-daily-heat-grid">
                  {weeks.map((col, i) => (
                    <div key={i} className="rtm-daily-heat-col">
                      {col.map((c) => (
                        <span
                          key={c.key}
                          className={`rtm-daily-heat-cell${c.future ? ' future' : c.done === 0 ? '' : c.won >= DAILY_GAMES.length ? ' perfect' : c.won > 0 ? ' some' : ' zero'}`}
                          title={c.future ? '' : `${c.key} — ${c.done ? `${c.won}/${DAILY_GAMES.length}` : ct('não jogou')}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <span className="rtm-daily-heat-legend">{ct('cinza = não jogou · vermelho = zerou · âmbar = parcial · dourado = dia perfeito')}</span>
              </div>
            );
          })()}
          {/* 🏅 SALA DE TROFÉUS — badges colecionáveis (conquistado × bloqueado) */}
          {(() => {
            const badges = evaluateDailyBadges(dailyBadgeFacts(gameIds));
            const earned = badges.filter((b) => b.earned).length;
            if (earned === 0) return null; // sem troféu ainda — o painel nasce com a 1ª conquista
            return (
              <div className="rtm-daily-badges">
                <b>🏅 {ct('SALA DE TROFÉUS')} <span>{earned}/{badges.length}</span></b>
                <div className="rtm-daily-badges-grid">
                  {badges.map(({ def, earned: ok }) => (
                    <span key={def.id} className={`rtm-daily-badge t${def.tier}${ok ? '' : ' locked'}`} title={`${def.title} — ${def.desc}`}>
                      <em>{ok ? def.icon : '🔒'}</em>
                      <i>{def.title}</i>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
          {/* vitrine: o TOTW da semana do ULTIMATE (cross-sell grátis → pago) */}
          {(() => {
            try {
              const totw = ultimateTotw();
              if (totw.weekIndex < 0) return null;
              const idx = ultimateIndex();
              const nicks = totw.playerIds.map((pid) => idx.get(`${pid}:totw`)?.nick).filter(Boolean).join(' · ');
              if (!nicks) return null;
              return (
                <div className="rtm-daily-totw">
                  <b>⚡ {ct('TIME DA SEMANA no ULTIMATE')}</b>
                  <span className="rtm-daily-totw-names">{nicks}</span>
                  <span className="rtm-daily-totw-sub">{ct('7 in-forms novos toda segunda — colecione cartas no Ultimate Squad.')}</span>
                  {onGoUltimate && (
                    <button type="button" onClick={() => { track('daily_totw_cta', { day }); onGoUltimate(); }}>
                      {ct('Conhecer o Ultimate')} →
                    </button>
                  )}
                </div>
              );
            } catch { return null; } // catálogo indisponível — o Diário nunca quebra por causa da vitrine
          })()}
          <p className="rtm-daily-soon">{ct('Quatro desafios por dia, os mesmos pra todo mundo — prove que você manja de CS e cole o resultado no grupo.')}</p>
        </div>
      )}

      {view === 'lines' && <LinesGame dateKey={dateKey} streakNow={streak.streak} />}
      {view === 'whois' && <WhoisGame dateKey={dateKey} />}
      {view === 'impostor' && <ImpostorGame dateKey={dateKey} />}
      {view === 'classic' && <ClassicGame dateKey={dateKey} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LINES HISTÓRICAS

function LinesGame({ dateKey, streakNow }: { dateKey: string; streakNow: number }) {
  const line = useMemo(() => lineOfDay(dateKey), [dateKey]);
  const order = useMemo(() => slotOrderOf(dateKey, line), [dateKey, line]);
  const [progress, setProgress] = useState<LinesProgress>(() => {
    const saved = loadDailyProgress<LinesProgress>('lines', dateKey);
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
    if (p.done) { track('daily_done', { game: 'lines', day: dayNumberOf(dateKey), won: p.won, errors: p.errors, found: p.found.length }); pingDailyGame('lines', dayNumberOf(dateKey), p.won); if (p.won && p.errors === 0) setDailyFlag('ace'); bankDailyDay(DAILY_GAMES.map((g) => g.id), dateKey); }
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

// ─────────────────────────────────────────────────────────────────────────────
// QUEM É O PRO? — caça ao jogador misterioso com dicas por dimensão

const CLUE_EMOJI: Record<ClueCell, string> = { hit: '🟩', near: '🟨', miss: '🟥' };
const OVR_EMOJI: Record<OvrClue, string> = { hit: '🟩', up: '⬆️', down: '⬇️' };

function WhoisGame({ dateKey }: { dateKey: string }) {
  const pool = useMemo(() => whoisPool(CS2_REAL_2026), []);
  const target = useMemo(() => whoisOfDay(dateKey, pool), [dateKey, pool]);
  const [progress, setProgress] = useState<WhoisProgress>(() => {
    const saved = loadDailyProgress<WhoisProgress>('whois', dateKey);
    if (!saved) track('daily_play', { game: 'whois', day: dayNumberOf(dateKey) });
    return saved ?? freshWhois();
  });
  const [guess, setGuess] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (p: WhoisProgress) => {
    setProgress(p);
    saveDailyProgress('whois', dateKey, p);
    if (p.done) { track('daily_done', { game: 'whois', day: dayNumberOf(dateKey), won: p.won, guesses: p.guesses.length }); pingDailyGame('whois', dayNumberOf(dateKey), p.won); if (p.won && p.guesses.length === 1) setDailyFlag('sniper'); bankDailyDay(DAILY_GAMES.map((g) => g.id), dateKey); }
  };

  const submit = () => {
    if (!guess.trim() || progress.done) return;
    const entry = findInPool(pool, guess);
    if (!entry) { setUnknown(true); setTimeout(() => setUnknown(false), 1600); return; } // desconhecido não gasta chute
    commit(applyWhoisGuess(target, progress, entry));
    setGuess('');
    inputRef.current?.focus();
  };

  const doShare = async () => {
    const st = loadDailyStreak('whois');
    const text = shareTextOfWhois(dateKey, progress, st.streak);
    track('daily_share', { game: 'whois', day: dayNumberOf(dateKey), won: progress.won });
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* cai pro clipboard */ }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sem clipboard */ }
  };

  return (
    <div className="rtm-lines">
      <div className="rtm-lines-brief">
        <span className="rtm-lines-kicker">{ct('CACE O PRO')}</span>
        <b>{ct('Um jogador do cenário 2026')}</b>
        <p>{ct('Chute nicks: cada erro compara TIME · PAÍS · FUNÇÃO · OVR com o alvo. 🟩 igual, 🟨 quente, ⬆️⬇️ o alvo está acima/abaixo.')}</p>
      </div>

      {/* histórico de chutes — a tabela de dicas é o jogo */}
      {progress.guesses.length > 0 && (
        <div className="rtm-whois-rows">
          <div className="rtm-whois-row rtm-whois-head">
            <span>{ct('Chute')}</span><span>{ct('Time')}</span><span>{ct('País')}</span><span>{ct('Função')}</span><span>OVR</span>
          </div>
          {progress.guesses.map((g, i) => (
            <div key={i} className="rtm-whois-row">
              <b>{g.nick}</b>
              <span>{CLUE_EMOJI[g.team]}</span>
              <span>{CLUE_EMOJI[g.country]}</span>
              <span>{CLUE_EMOJI[g.role]}</span>
              <span>{OVR_EMOJI[g.ovr]}</span>
            </div>
          ))}
        </div>
      )}

      {!progress.done ? (
        <>
          <div className="rtm-lines-inputrow">
            <div className="rtm-lines-prompt">
              <input
                ref={inputRef}
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                placeholder={ct('digite um nick do cenário 2026')}
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <button type="button" className="rtm-lines-go" onClick={submit}>{ct('Chutar')}</button>
          </div>
          {unknown && <span className="rtm-whois-unknown">{ct('Nick não reconhecido no cenário 2026 — esse não gasta chute.')}</span>}
          <span className="rtm-whois-count">{progress.guesses.length}/{WHOIS_MAX} {ct('chutes')}</span>
          <button type="button" className="rtm-lines-giveup" onClick={() => { if (window.confirm(ct('Desistir revela o pro e zera sua sequência. Certeza?'))) commit(giveUpWhois(progress)); }}>
            {ct('Desistir e revelar')}
          </button>
        </>
      ) : (
        <div className="rtm-lines-result">
          <b className={progress.won ? 'w' : 'l'}>
            {progress.won ? `${ct('ERA')} ${target.nick.toUpperCase()}!` : `${ct('ERA')} ${target.nick.toUpperCase()} (${target.team})`}
          </b>
          <span className="rtm-lines-result-sub">
            {progress.won
              ? `${ct('Cravado em')} ${progress.guesses.length}/${WHOIS_MAX} — ${target.team} · ${target.role} · OVR ${target.ovr}`
              : ct('Amanhã tem outro pro misterioso.')}
          </span>
          <button type="button" className="rtm-lines-share" onClick={doShare}>
            {copied ? ct('Copiado! Cola no grupo 😉') : ct('Compartilhar resultado')}
          </button>
          <span className="rtm-lines-tomorrow">{ct('Próximo pro à meia-noite.')}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O IMPOSTOR — a line histórica com um infiltrado

function ImpostorGame({ dateKey }: { dateKey: string }) {
  const round = useMemo(() => impostorOfDay(dateKey), [dateKey]);
  const [progress, setProgress] = useState<ImpostorProgress>(() => {
    const saved = loadDailyProgress<ImpostorProgress>('impostor', dateKey);
    if (!saved) track('daily_play', { game: 'impostor', day: dayNumberOf(dateKey) });
    return saved ?? freshImpostor();
  });
  const [copied, setCopied] = useState(false);

  const pickSuspect = (idx: number) => {
    if (progress.done || progress.picks.includes(idx)) return;
    const next = applyPick(round, progress, idx);
    setProgress(next);
    saveDailyProgress('impostor', dateKey, next);
    if (next.done) { track('daily_done', { game: 'impostor', day: dayNumberOf(dateKey), won: next.won, picks: next.picks.length }); pingDailyGame('impostor', dayNumberOf(dateKey), next.won); if (next.won && next.picks.length === 1) setDailyFlag('detetive'); bankDailyDay(DAILY_GAMES.map((g) => g.id), dateKey); }
  };

  const doShare = async () => {
    const st = loadDailyStreak('impostor');
    const text = shareTextOfImpostor(dateKey, round, progress, st.streak);
    track('daily_share', { game: 'impostor', day: dayNumberOf(dateKey), won: progress.won });
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* cai pro clipboard */ }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sem clipboard */ }
  };

  return (
    <div className="rtm-lines">
      <div className="rtm-lines-brief">
        <span className="rtm-lines-kicker">{ct('ACHE O INFILTRADO')}</span>
        <b>{round.team} · {round.year}</b>
        <p>{round.context} {ct('Um destes 5 NUNCA jogou nessa line — aponte o impostor em até')} {IMPOSTOR_TRIES} {ct('tentativas.')}</p>
      </div>

      <div className="rtm-lines-slots">
        {round.players.map((pl, idx) => {
          const picked = progress.picks.includes(idx);
          const isImp = idx === round.impostorIdx;
          const revealImp = progress.done && isImp;
          const wrongPick = picked && !isImp;
          return (
            <button
              key={idx}
              type="button"
              className={`rtm-lines-slot rtm-imp-slot${revealImp ? ' missed' : ''}${wrongPick ? ' hit' : ''}`}
              onClick={() => pickSuspect(idx)}
              disabled={progress.done || picked}
              title={progress.done ? undefined : ct('Apontar como impostor')}
            >
              <span className="rtm-lines-flag">{flagOf(pl.country)}</span>
              <b className="rtm-lines-nick">{pl.nick}</b>
              <span className="rtm-lines-role">
                {revealImp ? `🎭 ${round.from.team} ${round.from.year}` : wrongPick ? `✔ ${ct('era da line')}` : ROLE_LABEL[pl.role] ?? pl.role}
              </span>
            </button>
          );
        })}
      </div>

      {!progress.done ? (
        <span className="rtm-whois-count">{progress.picks.length}/{IMPOSTOR_TRIES} {ct('tentativas')}</span>
      ) : (
        <div className="rtm-lines-result">
          <b className={progress.won ? 'w' : 'l'}>
            {progress.won
              ? (progress.picks.length === 1 ? ct('DE PRIMEIRA! 🕵️') : ct('IMPOSTOR ENCONTRADO!'))
              : ct('O IMPOSTOR ESCAPOU')}
          </b>
          <span className="rtm-lines-result-sub">
            {round.players[round.impostorIdx].nick} {ct('era da')} {round.from.team} {round.from.year} — {ct('nunca jogou na')} {round.team} {round.year}.
          </span>
          <button type="button" className="rtm-lines-share" onClick={doShare}>
            {copied ? ct('Copiado! Cola no grupo 😉') : ct('Compartilhar resultado')}
          </button>
          <span className="rtm-lines-tomorrow">{ct('Próximo impostor à meia-noite.')}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLACAR DO CLÁSSICO — a final histórica: campeão + placar em 2 tentativas

function ClassicGame({ dateKey }: { dateKey: string }) {
  const round = useMemo(() => classicOfDay(dateKey), [dateKey]);
  const [progress, setProgress] = useState<ClassicProgress>(() => {
    const saved = loadDailyProgress<ClassicProgress>('classic', dateKey);
    if (!saved) track('daily_play', { game: 'classic', day: dayNumberOf(dateKey), finalId: round.id });
    return saved ?? freshClassic();
  });
  const [copied, setCopied] = useState(false);

  const pick = (key: string) => {
    if (progress.done || progress.picks.includes(key)) return;
    const next = applyClassicPick(round, progress, key);
    setProgress(next);
    saveDailyProgress('classic', dateKey, next);
    if (next.done) { track('daily_done', { game: 'classic', day: dayNumberOf(dateKey), won: next.won, picks: next.picks.length }); pingDailyGame('classic', dayNumberOf(dateKey), next.won); if (next.won && next.picks.length === 1) setDailyFlag('historiador'); bankDailyDay(DAILY_GAMES.map((g) => g.id), dateKey); }
  };

  const doShare = async () => {
    const st = loadDailyStreak('classic');
    const text = shareTextOfClassic(dateKey, round, progress, st.streak);
    track('daily_share', { game: 'classic', day: dayNumberOf(dateKey), won: progress.won });
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* cai pro clipboard */ }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sem clipboard */ }
  };

  const answerLabel = round.options.find((o) => o.key === round.answerKey)?.label ?? '';
  // dica após o 1º erro (só enquanto o jogo está aberto)
  const hint = !progress.done && progress.picks.length === 1 ? classicHint(round, progress.picks[0]) : null;

  return (
    <div className="rtm-lines">
      <div className="rtm-lines-brief">
        <span className="rtm-lines-kicker">{ct('CRAVE O PLACAR')}</span>
        <b>{round.event}</b>
        <p>{round.context} <b>{round.teams[0]}</b> × <b>{round.teams[1]}</b> — {ct('quem levantou a taça, e por quanto?')}</p>
      </div>

      <div className="rtm-classic-grid">
        {round.options.map((o) => {
          const picked = progress.picks.includes(o.key);
          const isAns = o.key === round.answerKey;
          const revealAns = progress.done && isAns;
          return (
            <button
              key={o.key}
              type="button"
              className={`rtm-classic-opt${revealAns ? ' ans' : ''}${picked && !isAns ? ' wrong' : ''}`}
              onClick={() => pick(o.key)}
              disabled={progress.done || picked}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {hint && (
        <span className="rtm-whois-unknown">
          {hint === 'wrong-score' ? ct('🔥 Quente: o campeão está certo — só o placar que não.') : ct('❄️ Frio: nem o campeão era esse. Última chance.')}
        </span>
      )}

      {!progress.done ? (
        <span className="rtm-whois-count">{progress.picks.length}/{CLASSIC_TRIES} {ct('tentativas')}</span>
      ) : (
        <div className="rtm-lines-result">
          <b className={progress.won ? 'w' : 'l'}>
            {progress.won
              ? (progress.picks.length === 1 ? ct('CRAVADO DE PRIMEIRA! 🏆') : ct('CRAVADO!'))
              : ct('ERROU O CLÁSSICO')}
          </b>
          <span className="rtm-lines-result-sub">{answerLabel} — {round.event}.</span>
          <button type="button" className="rtm-lines-share" onClick={doShare}>
            {copied ? ct('Copiado! Cola no grupo 😉') : ct('Compartilhar resultado')}
          </button>
          <span className="rtm-lines-tomorrow">{ct('Próximo clássico à meia-noite.')}</span>
        </div>
      )}
    </div>
  );
}
