// DIÁRIO — hub dos minigames diários + o jogo LINES HISTÓRICAS.
// Grátis, sem conta, sem save na nuvem: o Diário é porta de entrada e motivo
// de volta (loop tipo Wordle). A lógica vive em engine/daily/lines.ts; aqui é
// render + localStorage (state/daily.ts).

import { useEffect, useMemo, useRef, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { track } from '../../state/track';
import { postOnX, shareText } from '../../state/shareX';
import { useSectionHistory } from '../../state/app-history';
import {
  DAILY_GAMES, dateKeyOf, dayNumberOf, lineOfDay, slotOrderOf,
  applyGuess, freshProgress, giveUp, shareTextOf, MAX_ERRORS, DAILY_URL,
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
import { loadDailyProgress, saveDailyProgress, loadDailyStreak, dailyDayStatus, syncPerfectStreak, PERFECT_KEY, setDailyFlag, dailyBadgeFacts, bankDailyDay, loadDailyDays, loadMarathon, saveMarathon, type MarathonRecord } from '../../state/daily';
import { pingDailyGame, fetchDailyGamesStats, type DailyGamesStats } from '../../state/dailyGamesApi';
import { canInstall, promptInstall, dismissInstall, onInstallChange } from '../../state/pwa';
import { ultimateIndex, ultimateTotw, useUltimate } from '../../state/ultimate';
import { loadStreakState, recordStreakPlay, syncStreakWithServer } from '../../state/dailyStreak';
import { frameById } from '../../engine/ultimate/cosmetics';
import { nextMilestone, pendingMilestones, streakStatus, STREAK_MILESTONES, type StreakState } from '../../engine/daily/streak';
import { evaluateDailyBadges } from '../../engine/daily/badges';
import { MARATHON_ORDER, MARATHON_URL, marathonGrade, marathonShareText, fmtDuration } from '../../engine/daily/marathon';
import '../../styles/daily.css';
import { GameShell } from '../ds/shell/GameShell';
import type { ShellNavGroup } from '../ds/shell/types';
import { Binoculars, CalendarDays, Flag, Flame, Play, Puzzle, Search, TriangleAlert, Trophy, Users, Zap, type LucideIcon } from 'lucide-react';

// ISO alpha-2 → emoji de bandeira (regional indicators)
function flagOf(cc: string): string {
  return cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));
}

const ROLE_LABEL: Record<string, string> = {
  IGL: 'IGL', AWP: 'AWP', Rifler: 'Rifle', Entry: 'Entry', Support: 'Suporte', Lurker: 'Lurker', Coach: 'Coach',
};

const DAILY_VIEWS = ['hub', 'lines', 'whois', 'impostor', 'classic'] as const;

export function DailyScreen({ onExit, onGoUltimate }: { onExit: () => void; onGoUltimate?: () => void }) {
  const [view, setView] = useState<'hub' | 'lines' | 'whois' | 'impostor' | 'classic'>('hub');
  // Voltar/Avançar (shell, Alt+←/→ e navegador) passam pelos desafios do dia
  useSectionHistory('diario', view, (v) => { if (DAILY_VIEWS.includes(v as typeof view)) setView(v as typeof view); }, (path) => path === '/diario');
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

  // [URG-4] STREAK DO DIÁRIO — dias seguidos jogando qualquer jogo. Local pra
  // todo mundo; conta logada funde com o servidor (o maior vence) ao abrir.
  const [dStreak, setDStreak] = useState<StreakState>(() => loadStreakState());
  useEffect(() => {
    let alive = true;
    void syncStreakWithServer().then((st) => { if (alive) setDStreak(st); });
    return () => { alive = false; };
  }, []);
  const dStatus = streakStatus(dStreak, Date.now());
  const dNext = nextMilestone(dStatus.current);
  const dPrev = [...STREAK_MILESTONES].reverse().find((m) => m <= dStatus.current) ?? 0;
  const dPct = dNext ? Math.round(((dStatus.current - dPrev) / (dNext - dPrev)) * 100) : 100;
  const { state: ultState, claimStreakMilestone } = useUltimate();
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const flash = (msg: string, ms = 3200) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), ms);
  };
  // qualquer jogo fechou: registra o dia, resgata marcos novos (idempotente
  // pela chave streak:<n> no perfil do Ultimate) e avisa.
  const onGameDone = () => {
    const next = recordStreakPlay(Date.now());
    setDStreak(next);
    for (const m of pendingMilestones(next.current, ultState.profile.objectivesClaimed)) {
      const r = claimStreakMilestone(m);
      if (!r.ok) continue;
      const parts = [r.credits ? `+${r.credits.toLocaleString('pt-BR')} coins no Ultimate` : '', r.frame ? `${ct('Moldura')} ${frameById(r.frame)?.name ?? r.frame} ${ct('liberada')}` : ''].filter(Boolean);
      flash(`🔥 ${m} ${ct('dias seguidos!')} ${parts.join(' · ')}`, 4200);
      track('daily_streak_milestone', { days: m, coins: r.credits ?? 0, frame: r.frame ?? '' });
    }
  };

  const shareDay = async () => {
    if (!dayStatus) return;
    const cells = DAILY_GAMES.map((g) => {
      const p = dayStatus.perGame[g.id];
      return `${g.icon}${p?.done ? (p.won ? '✅' : '❌') : '▫️'}`;
    }).join(' ');
    const perfect = dayStatus.perfect
      ? `\n✨ DIA PERFEITO${perfectStreak.streak >= 2 ? ` · 🔥 ${perfectStreak.streak} dias perfeitos seguidos` : ''}`
      : '';
    const text = `DIÁRIO #${day} · ROAD TO MAJOR\n${cells} — ${dayStatus.won}/${dayStatus.total}${perfect}\n${DAILY_URL}`;
    track('daily_share', { game: 'day', day, won: dayStatus.perfect });
    if (await shareText('daily', text) === 'copy') { setDayCopied(true); setTimeout(() => setDayCopied(false), 1800); }
  };
  // X: texto curto e minúsculo (tom de post, não de cartaz), grade sem spoiler.
  const shareDayX = () => {
    if (!dayStatus) return;
    const cells = DAILY_GAMES.map((g) => {
      const p = dayStatus.perGame[g.id];
      return `${g.icon}${p?.done ? (p.won ? '✅' : '❌') : '▫️'}`;
    }).join(' ');
    const tail = dayStatus.perfect ? ' · dia perfeito ✨' : '';
    postOnX('daily', `diário #${day} do road to major\n${cells}\n${dayStatus.won}/${dayStatus.total}${tail}`, DAILY_URL);
  };

  // 🏁 MARATONA — moldura sobre os 4 jogos: ordem fixa + cronômetro + nota
  const [marathon, setMarathon] = useState<MarathonRecord | null>(() => loadMarathon(dateKey));
  const marathonActive = !!marathon && marathon.finishedAt == null;
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (!marathonActive) return;
    const t = window.setInterval(() => setClockTick((c) => c + 1), 1000);
    return () => window.clearInterval(t);
  }, [marathonActive]);
  // fim da maratona: detectado no HUB quando os 4 fecharam
  useEffect(() => {
    if (!marathonActive || view !== 'hub' || !dayStatus || dayStatus.done < dayStatus.total) return;
    const rec: MarathonRecord = { ...marathon!, finishedAt: Date.now(), wins: dayStatus.won };
    saveMarathon(rec);
    setMarathon(rec);
    track('daily_marathon_done', { day, wins: dayStatus.won, seconds: Math.round((rec.finishedAt! - rec.startedAt) / 1000) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marathonActive, view, dayStatus?.done]);
  const startMarathon = () => {
    const rec: MarathonRecord = { dateKey, startedAt: Date.now(), finishedAt: null };
    saveMarathon(rec);
    setMarathon(rec);
    track('daily_marathon_start', { day });
    setView(MARATHON_ORDER[0]);
  };
  // próximo jogo ainda aberto na ordem da maratona
  const marathonNext = marathonActive && dayStatus
    ? MARATHON_ORDER.find((id) => !dayStatus.perGame[id]?.done) ?? null
    : null;
  const [marCopied, setMarCopied] = useState(false);
  const shareMarathon = async () => {
    if (!marathon || marathon.finishedAt == null) return;
    const secs = Math.round((marathon.finishedAt - marathon.startedAt) / 1000);
    const wins = marathon.wins ?? 0;
    const text = marathonShareText(day, wins, secs, marathonGrade(wins, secs));
    track('daily_share', { game: 'marathon', day, won: wins >= 4 });
    if (await shareText('marathon', text) === 'copy') { setMarCopied(true); setTimeout(() => setMarCopied(false), 1800); }
  };
  const shareMarathonX = () => {
    if (!marathon || marathon.finishedAt == null) return;
    const secs = Math.round((marathon.finishedAt - marathon.startedAt) / 1000);
    const wins = marathon.wins ?? 0;
    postOnX('marathon', `maratona do diário #${day} do road to major\nnota ${marathonGrade(wins, secs)} · ${wins}/4 em ${fmtDuration(secs)}\nencara?`, MARATHON_URL);
  };

  type DView = 'hub' | 'lines' | 'whois' | 'impostor' | 'classic';
  const GAME_SHORT: Record<string, string> = { lines: 'Lines', whois: ct('Quem é?'), impostor: ct('Impostor'), classic: ct('Clássico') };
  const GAME_ICON: Record<string, LucideIcon> = { lines: Users, whois: Search, impostor: Binoculars, classic: Trophy };
  const hubStatus = dailyDayStatus(gameIds, dateKey);
  const nextGame = DAILY_GAMES.find((g) => !hubStatus.perGame[g.id]?.done);
  const dailyNav: ShellNavGroup[] = [
    { id: 'hoje', label: ct('Hoje'), items: [
      { id: 'hub', label: ct('Visão do dia'), icon: CalendarDays },
      ...DAILY_GAMES.map((g) => {
        const p = hubStatus.perGame[g.id];
        return { id: g.id, label: g.title, short: GAME_SHORT[g.id], icon: GAME_ICON[g.id] ?? Puzzle, badge: p?.done ? undefined : '!', badgeTone: 'brand' as const };
      }),
    ] },
  ];
  const shellNext = nextGame
    ? { label: ct('Jogar'), detail: nextGame.title, icon: Play, onGo: () => setView(nextGame.id as DView) }
    : { label: ct('Jogar'), detail: ct('Dia completo · volte amanhã'), disabled: true };

  return (
    <GameShell
      mode="diario"
      identity={{ title: `${ct('Diário')} #${day}`, subtitle: `${ct('Hoje')} · ${hubStatus.done}/${DAILY_GAMES.length} ${ct('desafios')}`, badge: <span className="gs-crest__txt daily-crest">#{day}</span> }}
      nav={dailyNav}
      active={view}
      onNav={(id) => setView(id as DView)}
      title={view === 'hub' ? ct('Hoje') : DAILY_GAMES.find((g) => g.id === view)?.title}
      crumbs={[{ label: ct('Um desafio novo por dia, igual pra todo mundo') }]}
      meta={dStatus.current >= 1 ? <span className="gs-chip"><Flame size={15} aria-hidden /> {dStatus.current} {dStatus.current === 1 ? ct('dia') : ct('dias')}</span> : undefined}
      next={shellNext}
      mobileNav={['hub', 'lines', 'whois', 'impostor']}
      sideWidget={(
        <div className="gs-widget">
          <span className="gs-widget__kicker"><CalendarDays size={13} aria-hidden /> {ct('Amanhã')}</span>
          <span className="gs-widget__main">{ct('Diário')} #{day + 1}</span>
          <span className="gs-widget__sub">{ct('Novos desafios à meia-noite')}</span>
        </div>
      )}
    >
    <div className="rtm-daily rtm-daily-in-shell">
      <header className="rtm-daily-head">
        <button type="button" className="rtm-daily-back" onClick={() => (view === 'hub' ? onExit() : setView('hub'))}>←</button>
        <div className="rtm-daily-title">
          <b>{ct('DIÁRIO')} <span className="rtm-daily-num">#{day}</span></b>
          <span>{ct('Um desafio novo por dia — mesmo pra todo mundo.')}</span>
        </div>
        {marathonActive && marathon && (
          <span className="rtm-daily-streak" style={{ borderColor: 'var(--dl-t)' }}>🏁 {fmtDuration((Date.now() - marathon.startedAt) / 1000)}</span>
        )}
        {dStatus.current >= 1 && (
          <span className="rtm-daily-streakbox" title={dNext ? `${ct('Próximo marco')}: ${dNext} ${ct('dias')}` : ct('Todos os marcos batidos')}>
            <span className="rtm-daily-streak">🔥 {dStatus.current} {dStatus.current === 1 ? ct('dia') : ct('dias')}</span>
            {dNext && (
              <span className="rtm-daily-streakbar" aria-label={`${dStatus.current}/${dNext}`}>
                <i style={{ width: `${dPct}%` }} />
                <small>{dNext}</small>
              </span>
            )}
          </span>
        )}
      </header>
      {toast && <div className="rtm-daily-toast" role="status">{toast}</div>}
      {dStatus.atRisk && view === 'hub' && (
        <div className="rtm-daily-risk"><TriangleAlert size={15} aria-hidden /> {ct('Você perde')} {dStatus.current} {ct('dias em')} {dStatus.hoursLeft}h — {ct('jogue qualquer um dos 4 pra manter.')}</div>
      )}

      {view === 'hub' && (
        <div className="rtm-daily-hub">
          {DAILY_GAMES.map((g) => {
            const p = loadDailyProgress(g.id, dateKey);
            const status = p?.done ? (p.won ? ct('completo · volte amanhã') : ct('foi por pouco · volte amanhã')) : p ? ct('em andamento') : ct('novo desafio disponível');
            return (
              <button key={g.id} type="button" className="rtm-daily-card" data-done={p?.done ? '' : undefined} onClick={() => setView(g.id as 'lines' | 'whois' | 'impostor' | 'classic')}>
                <span className="rtm-daily-card-icon">{(() => { const I = GAME_ICON[g.id] ?? Puzzle; return <I size={24} aria-hidden />; })()}</span>
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
          {/* 🏁 MARATONA — os 4 em sequência, contra o relógio */}
          {dayStatus && (() => {
            // resultado do dia (maratona concluída)
            if (marathon && marathon.finishedAt != null) {
              const secs = Math.round((marathon.finishedAt - marathon.startedAt) / 1000);
              const wins = marathon.wins ?? 0;
              const grade = marathonGrade(wins, secs);
              return (
                <div className={`rtm-daily-marathon done g${grade}`}>
                  <b><Flag size={16} aria-hidden /> {ct('MARATONA')} · {ct('NOTA')} {grade}</b>
                  <span>{wins}/4 {ct('em')} {fmtDuration(secs)}</span>
                  <button type="button" onClick={() => { void shareMarathon(); }}>
                    {marCopied ? ct('Copiado! 😉') : ct('Compartilhar a nota')}
                  </button>
                  <button type="button" className="x" onClick={shareMarathonX}>{ct('Postar no X')}</button>
                </div>
              );
            }
            // em andamento: CTA pro próximo desafio da ordem
            if (marathonActive) {
              const nextDef = DAILY_GAMES.find((g) => g.id === marathonNext);
              return nextDef ? (
                <div className="rtm-daily-marathon">
                  <b><Flag size={16} aria-hidden /> {ct('MARATONA EM ANDAMENTO')}</b>
                  <span>{ct('Próximo')}: {nextDef.icon} {nextDef.title}</span>
                  <button type="button" onClick={() => setView(nextDef.id as 'lines' | 'whois' | 'impostor' | 'classic')}>
                    {ct('CONTINUAR')} →
                  </button>
                </div>
              ) : null;
            }
            // start: só com o dia ZERADO (senão a nota não seria comparável)
            if (dayStatus.done === 0) {
              return (
                <div className="rtm-daily-marathon">
                  <b><Flag size={16} aria-hidden /> {ct('MODO MARATONA')}</b>
                  <span>{ct('Os 4 desafios em sequência, contra o relógio — uma NOTA única no fim (4/4 em menos de 5min = S). Uma por dia.')}</span>
                  <button type="button" onClick={startMarathon}>{ct('COMEÇAR MARATONA')} →</button>
                </div>
              );
            }
            return null;
          })()}
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
              <button type="button" className="x" onClick={shareDayX}>{ct('Postar no X')}</button>
            </div>
          )}
          {/* 📱 INSTALAR — só depois de jogar pelo menos um jogo do dia: pedir
              antes de o jogador saber o que é o Diário só queima o convite (o
              beforeinstallprompt só vem uma vez por visita). */}
          {dayStatus && dayStatus.done > 0 && <InstallPrompt />}
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
                  <b><Zap size={15} aria-hidden /> {ct('TIME DA SEMANA no ULTIMATE')}</b>
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

      {view === 'lines' && <LinesGame dateKey={dateKey} streakNow={streak.streak} onDone={onGameDone} streakDays={dStatus.current} />}
      {view === 'whois' && <WhoisGame dateKey={dateKey} onDone={onGameDone} streakDays={dStatus.current} />}
      {view === 'impostor' && <ImpostorGame dateKey={dateKey} onDone={onGameDone} streakDays={dStatus.current} />}
      {view === 'classic' && <ClassicGame dateKey={dateKey} onDone={onGameDone} streakDays={dStatus.current} />}
    </div>
    </GameShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LINES HISTÓRICAS

function LinesGame({ dateKey, streakNow, onDone, streakDays }: { dateKey: string; streakNow: number; onDone: () => void; streakDays: number }) {
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
    if (p.done) { track('daily_done', { game: 'lines', day: dayNumberOf(dateKey), won: p.won, errors: p.errors, found: p.found.length }); pingDailyGame('lines', dayNumberOf(dateKey), p.won); if (p.won && p.errors === 0) setDailyFlag('ace'); bankDailyDay(DAILY_GAMES.map((g) => g.id), dateKey); onDone(); }
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
    if (await shareText('daily-lines', text) === 'copy') { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };
  const doShareX = () => postOnX('daily-lines', shareTextOf(dateKey, line, progress, loadDailyStreak('lines').streak || streakNow), DAILY_URL);

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
          <button type="button" className="rtm-lines-share x" onClick={doShareX}>{ct('Postar no X')}</button>
          <span className="rtm-daily-streak-kept"><Flame size={14} aria-hidden /> {ct('streak mantida')}: {streakDays} {streakDays === 1 ? ct('dia') : ct('dias')}</span>
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

function WhoisGame({ dateKey, onDone, streakDays }: { dateKey: string; onDone: () => void; streakDays: number }) {
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
    if (p.done) { track('daily_done', { game: 'whois', day: dayNumberOf(dateKey), won: p.won, guesses: p.guesses.length }); pingDailyGame('whois', dayNumberOf(dateKey), p.won); if (p.won && p.guesses.length === 1) setDailyFlag('sniper'); bankDailyDay(DAILY_GAMES.map((g) => g.id), dateKey); onDone(); }
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
    if (await shareText('daily-whois', text) === 'copy') { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };
  const doShareX = () => postOnX('daily-whois', shareTextOfWhois(dateKey, progress, loadDailyStreak('whois').streak), DAILY_URL);

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
          <button type="button" className="rtm-lines-share x" onClick={doShareX}>{ct('Postar no X')}</button>
          <span className="rtm-daily-streak-kept"><Flame size={14} aria-hidden /> {ct('streak mantida')}: {streakDays} {streakDays === 1 ? ct('dia') : ct('dias')}</span>
          <span className="rtm-lines-tomorrow">{ct('Próximo pro à meia-noite.')}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O IMPOSTOR — a line histórica com um infiltrado

function ImpostorGame({ dateKey, onDone, streakDays }: { dateKey: string; onDone: () => void; streakDays: number }) {
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
    if (next.done) { track('daily_done', { game: 'impostor', day: dayNumberOf(dateKey), won: next.won, picks: next.picks.length }); pingDailyGame('impostor', dayNumberOf(dateKey), next.won); if (next.won && next.picks.length === 1) setDailyFlag('detetive'); bankDailyDay(DAILY_GAMES.map((g) => g.id), dateKey); onDone(); }
  };

  const doShare = async () => {
    const st = loadDailyStreak('impostor');
    const text = shareTextOfImpostor(dateKey, round, progress, st.streak);
    track('daily_share', { game: 'impostor', day: dayNumberOf(dateKey), won: progress.won });
    if (await shareText('daily-impostor', text) === 'copy') { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };
  const doShareX = () => postOnX('daily-impostor', shareTextOfImpostor(dateKey, round, progress, loadDailyStreak('impostor').streak), DAILY_URL);

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
          <button type="button" className="rtm-lines-share x" onClick={doShareX}>{ct('Postar no X')}</button>
          <span className="rtm-daily-streak-kept"><Flame size={14} aria-hidden /> {ct('streak mantida')}: {streakDays} {streakDays === 1 ? ct('dia') : ct('dias')}</span>
          <span className="rtm-lines-tomorrow">{ct('Próximo impostor à meia-noite.')}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLACAR DO CLÁSSICO — a final histórica: campeão + placar em 2 tentativas

function ClassicGame({ dateKey, onDone, streakDays }: { dateKey: string; onDone: () => void; streakDays: number }) {
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
    if (next.done) { track('daily_done', { game: 'classic', day: dayNumberOf(dateKey), won: next.won, picks: next.picks.length }); pingDailyGame('classic', dayNumberOf(dateKey), next.won); if (next.won && next.picks.length === 1) setDailyFlag('historiador'); bankDailyDay(DAILY_GAMES.map((g) => g.id), dateKey); onDone(); }
  };

  const doShare = async () => {
    const st = loadDailyStreak('classic');
    const text = shareTextOfClassic(dateKey, round, progress, st.streak);
    track('daily_share', { game: 'classic', day: dayNumberOf(dateKey), won: progress.won });
    if (await shareText('daily-classic', text) === 'copy') { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };
  const doShareX = () => postOnX('daily-classic', shareTextOfClassic(dateKey, round, progress, loadDailyStreak('classic').streak), DAILY_URL);

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
          <button type="button" className="rtm-lines-share x" onClick={doShareX}>{ct('Postar no X')}</button>
          <span className="rtm-daily-streak-kept"><Flame size={14} aria-hidden /> {ct('streak mantida')}: {streakDays} {streakDays === 1 ? ct('dia') : ct('dias')}</span>
          <span className="rtm-lines-tomorrow">{ct('Próximo clássico à meia-noite.')}</span>
        </div>
      )}
    </div>
  );
}

// 📱 Convite pra instalar na home. Só aparece quando o browser convidou
// (beforeinstallprompt), o app ainda não está instalado e o jogador não
// dispensou — ver state/pwa.ts. Some sozinho depois de aceito ou recusado.
function InstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => onInstallChange(() => force((v) => v + 1)), []);
  if (!canInstall()) return null;
  return (
    <div className="rtm-daily-install">
      <div className="rtm-daily-install-txt">
        <b>📱 {ct('Põe o Diário na sua tela inicial')}</b>
        <span>{ct('Um toque pra jogar amanhã — sem procurar o link.')}</span>
      </div>
      <div className="rtm-daily-install-acts">
        <button type="button" className="rtm-daily-install-go" onClick={() => { void promptInstall(); }}>
          {ct('Instalar')}
        </button>
        <button type="button" className="rtm-daily-install-no" onClick={dismissInstall}>
          {ct('agora não')}
        </button>
      </div>
    </div>
  );
}
