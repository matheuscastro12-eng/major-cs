// Modo Cenário + Desafio da Semana (UI). Isolado do CareerScreen: ele só
// monta o <CenariosPicker> na fundação e o <CenarioPanel> na Visão geral.
import { useEffect, useMemo, useState } from 'react';
import { Award, CalendarClock, Clock, Flag as FlagIcon, Medal as MedalIcon, Send, Sparkles, Target, Trophy } from 'lucide-react';
import {
  CENARIOS, MODIFIERS, cenarioById, evaluateRun, multiplierOf, tr, weeklyChallenge,
  type CenarioDef, type CenarioRun, type CenLang, type Grade, type L, type ModifierId, type WeeklyChallenge,
} from '../../engine/cenarios';
import type { TeamSeason } from '../../types';
import { useLang } from '../../state/i18n';
import { fetchCenBoard, fetchCenMe, hasAccount, postCenSubmit, type CenBoard, type CenMe } from '../../state/cenariosApi';
import { Flag, TeamBadge } from '../ui';
import '../../styles/cenarios.css';

// ── textos da tela (pt/en/es) ───────────────────────────────────────────────
const S = {
  kicker: { pt: 'Modo Cenário', en: 'Scenario Mode', es: 'Modo Escenario' },
  title: { pt: 'Cenários e desafios', en: 'Scenarios and challenges', es: 'Escenarios y desafíos' },
  lead: { pt: 'Carreiras que começam em situações reais da cena. Objetivos com prazo, nota final de S a C e uma medalha. Toda semana, um desafio novo igual para todo mundo.', en: 'Careers that start in real situations from the scene. Objectives with deadlines, a final grade from S to C and a medal. Every week, a new challenge, the same for everyone.', es: 'Carreras que empiezan en situaciones reales de la escena. Objetivos con plazo, nota final de S a C y una medalla. Cada semana, un desafío nuevo igual para todos.' },
  back: { pt: 'Voltar', en: 'Back', es: 'Volver' },
  weekly: { pt: 'Desafio da semana', en: 'Weekly challenge', es: 'Desafío de la semana' },
  week: { pt: 'Semana', en: 'Week', es: 'Semana' },
  endsIn: { pt: 'Fecha em', en: 'Ends in', es: 'Cierra en' },
  sameSeed: { pt: 'Mesmo mundo para todos (seed fixa), dificuldade normal.', en: 'Same world for everyone (fixed seed), normal difficulty.', es: 'Mismo mundo para todos (seed fija), dificultad normal.' },
  featured: { pt: 'Modificador da semana', en: "This week's modifier", es: 'Modificador de la semana' },
  playWeekly: { pt: 'Jogar o desafio', en: 'Play the challenge', es: 'Jugar el desafío' },
  ranking: { pt: 'Ranking da semana', en: 'Weekly ranking', es: 'Ranking semanal' },
  noScores: { pt: 'Ninguém enviou ainda. A primeira nota da semana pode ser a sua.', en: 'Nobody has submitted yet. The first score of the week can be yours.', es: 'Nadie envió todavía. La primera nota de la semana puede ser la tuya.' },
  offline: { pt: 'Ranking indisponível agora.', en: 'Ranking unavailable right now.', es: 'Ranking no disponible ahora.' },
  you: { pt: 'Sua melhor', en: 'Your best', es: 'Tu mejor' },
  loginHint: { pt: 'Entre na sua conta para aparecer no ranking.', en: 'Sign in to appear on the ranking.', es: 'Inicia sesión para aparecer en el ranking.' },
  players: { pt: 'managers', en: 'managers', es: 'managers' },
  mods: { pt: 'Modificadores', en: 'Modifiers', es: 'Modificadores' },
  modsHint: { pt: 'Opcionais. Valem para o desafio da semana e para os cenários livres. Quebrou a regra, perde o bônus.', en: 'Optional. They apply to the weekly challenge and free scenarios. Break the rule and you lose the bonus.', es: 'Opcionales. Valen para el desafío semanal y los escenarios libres. Si rompes la regla, pierdes el bono.' },
  mult: { pt: 'Multiplicador', en: 'Multiplier', es: 'Multiplicador' },
  free: { pt: 'Cenários livres', en: 'Free scenarios', es: 'Escenarios libres' },
  objectives: { pt: 'Objetivos', en: 'Objectives', es: 'Objetivos' },
  deadline: { pt: 'Prazo', en: 'Deadline', es: 'Plazo' },
  splits: { pt: 'splits', en: 'splits', es: 'splits' },
  seasons1: { pt: '1 temporada', en: '1 season', es: '1 temporada' },
  seasonsN: { pt: 'temporadas', en: 'seasons', es: 'temporadas' },
  start: { pt: 'Começar', en: 'Start', es: 'Empezar' },
  cash: { pt: 'Caixa', en: 'Bank', es: 'Caja' },
  difficulty: { pt: 'Dificuldade', en: 'Difficulty', es: 'Dificultad' },
  pts: { pt: 'pts', en: 'pts', es: 'pts' },
  // painel
  panelTitle: { pt: 'Cenário', en: 'Scenario', es: 'Escenario' },
  splitOf: { pt: 'Split', en: 'Split', es: 'Split' },
  of: { pt: 'de', en: 'of', es: 'de' },
  done: { pt: 'Cumprido', en: 'Done', es: 'Cumplido' },
  failed: { pt: 'Perdido', en: 'Failed', es: 'Perdido' },
  pending: { pt: 'Em aberto', en: 'Open', es: 'Abierto' },
  inSplit: { pt: 'no split', en: 'in split', es: 'en el split' },
  scoreNow: { pt: 'Pontuação parcial', en: 'Score so far', es: 'Puntuación parcial' },
  final: { pt: 'Resultado final', en: 'Final result', es: 'Resultado final' },
  objPts: { pt: 'Objetivos', en: 'Objectives', es: 'Objetivos' },
  speed: { pt: 'Velocidade', en: 'Speed', es: 'Velocidad' },
  perf: { pt: 'Campanha', en: 'Campaign', es: 'Campaña' },
  submit: { pt: 'Enviar ao ranking', en: 'Submit to ranking', es: 'Enviar al ranking' },
  resubmit: { pt: 'Enviado', en: 'Submitted', es: 'Enviado' },
  rankPos: { pt: 'Posição', en: 'Position', es: 'Posición' },
  weekClosed: { pt: 'Esta semana já fechou: o envio não conta mais.', en: 'This week has closed: submissions no longer count.', es: 'Esta semana ya cerró: el envío ya no cuenta.' },
  broken: { pt: 'Regra quebrada', en: 'Rule broken', es: 'Regla rota' },
  freeRun: { pt: 'Cenário livre (fora do ranking)', en: 'Free scenario (not ranked)', es: 'Escenario libre (fuera del ranking)' },
} satisfies Record<string, L>;

const GRADE_COPY: Record<Grade, L> = {
  S: { pt: 'Lendário', en: 'Legendary', es: 'Legendario' },
  A: { pt: 'Missão cumprida', en: 'Mission accomplished', es: 'Misión cumplida' },
  B: { pt: 'Meio caminho', en: 'Halfway there', es: 'A mitad de camino' },
  C: { pt: 'Ficou devendo', en: 'Fell short', es: 'Se quedó corto' },
};
const MEDAL_COPY: Record<string, L> = {
  diamante: { pt: 'Medalha de diamante', en: 'Diamond medal', es: 'Medalla de diamante' },
  ouro: { pt: 'Medalha de ouro', en: 'Gold medal', es: 'Medalla de oro' },
  prata: { pt: 'Medalha de prata', en: 'Silver medal', es: 'Medalla de plata' },
  bronze: { pt: 'Medalha de bronze', en: 'Bronze medal', es: 'Medalla de bronce' },
};
const ERR_COPY: Record<string, L> = {
  no_account: S.loginHint,
  not_started: { pt: 'Este run não foi registrado no servidor na largada (você estava sem conta ou offline).', en: 'This run was not registered on the server at the start (no account or offline).', es: 'Esta partida no se registró en el servidor al inicio (sin cuenta o sin conexión).' },
  too_fast: { pt: 'Rápido demais para ser verdade: o envio foi recusado.', en: 'Too fast to be true: the submission was refused.', es: 'Demasiado rápido para ser verdad: el envío fue rechazado.' },
  bad_week: S.weekClosed,
  network: { pt: 'Sem conexão com o servidor. Tente de novo.', en: 'Could not reach the server. Try again.', es: 'Sin conexión con el servidor. Inténtalo de nuevo.' },
};
const errText = (code: string, lang: CenLang) => tr(ERR_COPY[code] ?? { pt: 'O servidor recusou o envio.', en: 'The server refused the submission.', es: 'El servidor rechazó el envío.' }, lang);

function useCenLang(): CenLang {
  const { lang } = useLang();
  return lang === 'en' || lang === 'es' ? lang : 'pt';
}

// 4 splits = 1 temporada (o 4º fecha no Major)
const deadlineLabel = (d: CenarioDef, lang: CenLang) => (d.deadline <= 4 ? tr(S.seasons1, lang) : `${Math.round(d.deadline / 4)} ${tr(S.seasonsN, lang)}`) + ` · ${d.deadline} ${tr(S.splits, lang)}`;

function useCountdown(endsAt: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(id); }, []);
  const ms = Math.max(0, endsAt - now);
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}min`;
}

function Stars({ n }: { n: number }) {
  return <span className="cen-stars" aria-label={`${n}/3`}>{[1, 2, 3].map((i) => <span key={i} className={i <= n ? 'on' : ''} aria-hidden>●</span>)}</span>;
}

// ── seletor ─────────────────────────────────────────────────────────────────
export interface CenarioChoice { def: CenarioDef; team: TeamSeason; mods: ModifierId[]; weekly?: WeeklyChallenge }

export function CenariosPicker({ current, tierOf, budgetOf, logoOf, onBack, onStart }: {
  current: TeamSeason[];
  tierOf: (t: TeamSeason) => number;
  budgetOf: (def: CenarioDef, tier: number) => number;
  logoOf: (t: TeamSeason) => string | undefined;
  onBack: () => void;
  onStart: (c: CenarioChoice) => void;
}) {
  const lang = useCenLang();
  const wk = useMemo(() => weeklyChallenge(Date.now()), []);
  const [mods, setMods] = useState<ModifierId[]>([]);
  const items = useMemo(() => CENARIOS.map((def) => ({ def, team: current.find((t) => t.team.toLowerCase() === def.teamName.toLowerCase()) ?? null })).filter((x): x is { def: CenarioDef; team: TeamSeason } => !!x.team), [current]);
  const weeklyTeam = items.find((x) => x.def.id === wk.def.id)?.team ?? null;
  const toggle = (id: ModifierId) => setMods((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const mult = multiplierOf(mods);

  return (
    <div className="cen-page fade-in">
      <header className="cen-head">
        <div>
          <div className="cen-kicker"><Target size={14} aria-hidden /> {tr(S.kicker, lang)}</div>
          <h1 className="cen-h1">{tr(S.title, lang)}</h1>
          <p className="cen-lead">{tr(S.lead, lang)}</p>
        </div>
        <button type="button" className="ds-btn ds-btn--secondary" onClick={onBack}>← {tr(S.back, lang)}</button>
      </header>

      <div className="cen-top">
        <WeeklyHero wk={wk} team={weeklyTeam} tierOf={tierOf} logoOf={logoOf} lang={lang} mods={mods} onPlay={() => weeklyTeam && onStart({ def: wk.def, team: weeklyTeam, mods, weekly: wk })} />
        <WeeklyBoard weekId={wk.id} lang={lang} />
      </div>

      <section className="cen-mods" aria-labelledby="cen-mods-h">
        <div className="cen-mods__head">
          <h2 id="cen-mods-h" className="cen-h2"><Sparkles size={15} aria-hidden /> {tr(S.mods, lang)}</h2>
          <span className="cen-mult" aria-live="polite">{tr(S.mult, lang)} <b>×{mult.toFixed(2)}</b></span>
        </div>
        <p className="cen-muted">{tr(S.modsHint, lang)}</p>
        <div className="cen-mods__list">
          {MODIFIERS.map((m) => {
            const on = mods.includes(m.id);
            return (
              <button key={m.id} type="button" className={`cen-mod${on ? ' is-on' : ''}${m.id === wk.featuredMod ? ' is-featured' : ''}`} aria-pressed={on} onClick={() => toggle(m.id)}>
                <span className="cen-mod__top"><b>{tr(m.title, lang)}</b><span className="cen-mod__x">×{m.mult.toFixed(1)}</span></span>
                <span className="cen-mod__desc">{tr(m.desc, lang)}</span>
                {m.id === wk.featuredMod && <span className="cen-mod__tag">{tr(S.featured, lang)}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="cen-free-h">
        <h2 id="cen-free-h" className="cen-h2"><FlagIcon size={15} aria-hidden /> {tr(S.free, lang)}</h2>
        <div className="cen-grid">
          {items.map(({ def, team }) => {
            const tier = tierOf(team);
            const budget = mods.includes('zeroBudget') ? 0 : budgetOf(def, tier);
            return (
              <article key={def.id} className="cen-card">
                <div className="cen-card__id">
                  <TeamBadge tag={team.tag} colors={team.colors} size={40} logoUrl={logoOf(team)} />
                  <div className="cen-card__name">
                    <h3><Flag cc={team.country} /> {tr(def.title, lang)}</h3>
                    <div className="cen-card__meta"><span className="cen-tier">Tier {tier}</span><span>{tr(S.difficulty, lang)} <Stars n={def.difficulty} /></span></div>
                  </div>
                </div>
                <p className="cen-card__ctx">{tr(def.context, lang)}</p>
                <ul className="cen-objs">
                  {def.objectives.map((o) => <li key={o.id}><Target size={13} aria-hidden /> <span>{tr(o.text, lang)}</span> <em>{o.pts} {tr(S.pts, lang)}</em></li>)}
                </ul>
                <footer className="cen-card__foot">
                  <span className="cen-card__facts">
                    <span><CalendarClock size={13} aria-hidden /> {deadlineLabel(def, lang)}</span>
                    <span className="cen-money">{tr(S.cash, lang)} R$ {budget.toLocaleString('pt-BR')}</span>
                  </span>
                  <button type="button" className="ds-btn ds-btn--primary ds-btn--sm" onClick={() => onStart({ def, team, mods })}>{tr(S.start, lang)} →</button>
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function WeeklyHero({ wk, team, tierOf, logoOf, lang, mods, onPlay }: {
  wk: WeeklyChallenge; team: TeamSeason | null; tierOf: (t: TeamSeason) => number; logoOf: (t: TeamSeason) => string | undefined;
  lang: CenLang; mods: ModifierId[]; onPlay: () => void;
}) {
  const left = useCountdown(wk.endsAt);
  const weekNo = Number(wk.id.slice(-2));
  const featured = MODIFIERS.find((m) => m.id === wk.featuredMod)!;
  return (
    <section className="cen-hero" aria-labelledby="cen-hero-h">
      <div className="cen-hero__bar">
        <span className="cen-live"><Trophy size={13} aria-hidden /> {tr(S.weekly, lang)}</span>
        <span className="cen-muted">{tr(S.week, lang)} {weekNo}</span>
        <span className="cen-hero__clock"><Clock size={13} aria-hidden /> {tr(S.endsIn, lang)} <b>{left}</b></span>
      </div>
      <div className="cen-hero__main">
        {team && <TeamBadge tag={team.tag} colors={team.colors} size={64} logoUrl={logoOf(team)} />}
        <div>
          <h2 id="cen-hero-h" className="cen-hero__title">{tr(wk.def.title, lang)}</h2>
          <p className="cen-hero__tag">{tr(wk.def.tagline, lang)}</p>
          <div className="cen-card__meta">
            {team && <span className="cen-tier">Tier {tierOf(team)}</span>}
            <span><CalendarClock size={13} aria-hidden /> {deadlineLabel(wk.def, lang)}</span>
            <span>{tr(S.difficulty, lang)} <Stars n={wk.def.difficulty} /></span>
          </div>
        </div>
      </div>
      <p className="cen-hero__ctx">{tr(wk.def.context, lang)}</p>
      <ul className="cen-objs cen-objs--row">
        {wk.def.objectives.map((o) => <li key={o.id}><Target size={13} aria-hidden /> <span>{tr(o.text, lang)}</span> <em>{o.pts}</em></li>)}
      </ul>
      <div className="cen-hero__foot">
        <span className="cen-muted">{tr(S.sameSeed, lang)} {tr(S.featured, lang)}: <b className="cen-gold">{tr(featured.title, lang)}</b></span>
        <button type="button" className="ds-btn ds-btn--primary" onClick={onPlay} disabled={!team}>
          {tr(S.playWeekly, lang)}{mods.length > 0 ? ` · ×${multiplierOf(mods).toFixed(2)}` : ''} →
        </button>
      </div>
    </section>
  );
}

function WeeklyBoard({ weekId, lang, highlight }: { weekId: string; lang: CenLang; highlight?: number }) {
  const [board, setBoard] = useState<CenBoard | null | 'loading'>('loading');
  const [me, setMe] = useState<CenMe | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchCenBoard(weekId).then((b) => { if (alive) setBoard(b); });
    if (hasAccount()) void fetchCenMe(weekId).then((m) => { if (alive) setMe(m); });
    return () => { alive = false; };
  }, [weekId, highlight]);
  return (
    <section className="cen-board" aria-labelledby="cen-board-h">
      <h2 id="cen-board-h" className="cen-h2"><Award size={15} aria-hidden /> {tr(S.ranking, lang)}
        {board && board !== 'loading' && <span className="cen-muted cen-board__n">{board.total} {tr(S.players, lang)}</span>}
      </h2>
      {board === 'loading' && <div className="cen-skel" aria-busy="true" />}
      {board === null && <p className="cen-muted">{tr(S.offline, lang)}</p>}
      {board && board !== 'loading' && board.board.length === 0 && <p className="cen-muted">{tr(S.noScores, lang)}</p>}
      {board && board !== 'loading' && board.board.length > 0 && (
        <ol className="cen-board__list">
          {board.board.slice(0, 10).map((r) => (
            <li key={`${r.rank}-${r.nick}`}>
              <span className="cen-board__rank">{r.rank}</span>
              <span className="cen-board__nick">{r.nick}</span>
              <span className={`cen-grade cen-grade--${r.grade}`}>{r.grade}</span>
              <span className="cen-board__score">{r.score.toLocaleString('pt-BR')}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="cen-board__me">
        {me && me.best != null
          ? <>{tr(S.you, lang)}: <b>{me.best.toLocaleString('pt-BR')}</b> · {tr(S.rankPos, lang)} <b>#{me.rank}</b></>
          : !hasAccount() ? tr(S.loginHint, lang) : null}
      </div>
    </section>
  );
}

// ── painel na Visão geral ───────────────────────────────────────────────────
export function CenarioPanel({ run, split, onSubmitted }: { run: CenarioRun; split: number; onSubmitted: (score: number) => void }) {
  const lang = useCenLang();
  const def = cenarioById(run.defId);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  if (!def) return null;
  const res = evaluateRun(def, run, split);
  const splitIdx = Math.min(def.deadline, Math.max(1, split - run.startSplit + 1));
  const weeklyOpen = run.weekly ? Date.now() <= weeklyChallenge(Date.now()).endsAt && weeklyChallenge(Date.now()).id === run.weekly : false;
  const submit = async () => {
    if (!run.weekly) return;
    setSending(true); setMsg(null);
    const r = await postCenSubmit(run.weekly, run);
    setSending(false);
    if (r.ok) { setRank(r.rank); setMsg({ ok: true, text: `${tr(S.rankPos, lang)} #${r.rank} · ${r.best.toLocaleString('pt-BR')}` }); onSubmitted(r.score); }
    else setMsg({ ok: false, text: errText(r.error, lang) });
  };
  return (
    <section className={`cen-panel${res.finished ? ' is-final' : ''}`} aria-labelledby="cen-panel-h">
      <header className="cen-panel__head">
        <div>
          <div className="cen-kicker"><Target size={13} aria-hidden /> {run.weekly ? `${tr(S.weekly, lang)} · ${tr(S.week, lang)} ${Number(run.weekly.slice(-2))}` : tr(S.panelTitle, lang)}</div>
          <h2 id="cen-panel-h" className="cen-panel__title">{tr(def.title, lang)}</h2>
        </div>
        <div className="cen-panel__clock">
          {res.finished ? tr(S.final, lang) : <>{tr(S.splitOf, lang)} <b>{splitIdx}</b> {tr(S.of, lang)} {def.deadline}</>}
          <div className="cen-progress" role="progressbar" aria-valuemin={0} aria-valuemax={def.deadline} aria-valuenow={res.finished ? def.deadline : splitIdx - 1}>
            <span style={{ width: `${Math.round(((res.finished ? def.deadline : splitIdx - 1) / def.deadline) * 100)}%` }} />
          </div>
        </div>
      </header>
      <div className="cen-panel__body">
        <ul className="cen-status">
          {res.objectives.map((o) => (
            <li key={o.def.id} className={o.doneAt != null ? 'is-done' : o.failed ? 'is-failed' : ''}>
              <span className="cen-status__dot" aria-hidden />
              <span className="cen-status__txt">{tr(o.def.text, lang)}</span>
              <span className="cen-status__st">
                {o.doneAt != null ? `${tr(S.done, lang)} · ${tr(S.inSplit, lang)} ${o.doneAt - run.startSplit + 1}` : o.failed ? tr(S.failed, lang) : tr(S.pending, lang)}
              </span>
              <span className="cen-status__pts">{o.def.pts}</span>
            </li>
          ))}
        </ul>
        <div className="cen-score">
          {res.finished ? (
            <div className="cen-final">
              <span className={`cen-grade cen-grade--${res.grade} cen-grade--xl`}>{res.grade}</span>
              <div>
                <div className="cen-final__copy">{tr(GRADE_COPY[res.grade], lang)}</div>
                <div className={`cen-medal cen-medal--${res.medal}`}><MedalIcon size={14} aria-hidden /> {tr(MEDAL_COPY[res.medal], lang)}</div>
              </div>
            </div>
          ) : <div className="cen-muted">{tr(S.scoreNow, lang)}</div>}
          <div className="cen-score__num">{res.score.toLocaleString('pt-BR')} <small>{tr(S.pts, lang)}</small></div>
          <dl className="cen-score__parts">
            <div><dt>{tr(S.objPts, lang)}</dt><dd>{res.objPts}</dd></div>
            <div><dt>{tr(S.speed, lang)}</dt><dd>+{res.speed}</dd></div>
            <div><dt>{tr(S.perf, lang)}</dt><dd>+{res.perf}</dd></div>
            <div><dt>{tr(S.mult, lang)}</dt><dd>×{res.mult.toFixed(2)}</dd></div>
          </dl>
          {run.mods.length > 0 && (
            <div className="cen-panel__mods">
              {run.mods.map((m) => {
                const md = MODIFIERS.find((x) => x.id === m)!;
                const kept = res.modsKept.includes(m);
                return <span key={m} className={`cen-chip${kept ? '' : ' is-broken'}`} title={kept ? undefined : tr(S.broken, lang)}>{tr(md.title, lang)}{kept ? '' : ` · ${tr(S.broken, lang)}`}</span>;
              })}
            </div>
          )}
          {run.weekly && res.finished && (
            weeklyOpen ? (
              <button type="button" className="ds-btn ds-btn--achievement cen-submit" onClick={submit} disabled={sending || (run.submitted != null && run.submitted >= res.score && rank != null)}>
                <Send size={14} aria-hidden /> {run.submitted != null && run.submitted >= res.score ? tr(S.resubmit, lang) : tr(S.submit, lang)}
              </button>
            ) : <p className="cen-muted">{tr(S.weekClosed, lang)}</p>
          )}
          {!run.weekly && <p className="cen-muted">{tr(S.freeRun, lang)}</p>}
          {msg && <p className={msg.ok ? 'cen-ok' : 'cen-err'} role="status">{msg.text}</p>}
        </div>
      </div>
    </section>
  );
}

// ── chamada na tela de Desafios da Carreira ─────────────────────────────────
const E = {
  cta: { pt: 'Abrir cenários', en: 'Open scenarios', es: 'Abrir escenarios' },
  title: { pt: 'Novo: Modo Cenário e Desafio da Semana', en: 'New: Scenario Mode and Weekly Challenge', es: 'Nuevo: Modo Escenario y Desafío de la Semana' },
  thisWeek: { pt: 'Esta semana', en: 'This week', es: 'Esta semana' },
} satisfies Record<string, L>;

export function CenariosEntry({ onOpen }: { onOpen: () => void }) {
  const lang = useCenLang();
  const wk = useMemo(() => weeklyChallenge(Date.now()), []);
  const left = useCountdown(wk.endsAt);
  return (
    <button type="button" className="cen-entry" onClick={onOpen}>
      <span className="cen-entry__icon" aria-hidden><Trophy size={20} /></span>
      <span className="cen-entry__txt">
        <b>{tr(E.title, lang)}</b>
        <span>{tr(E.thisWeek, lang)}: <em>{tr(wk.def.title, lang)}</em> · {tr(S.endsIn, lang)} {left}</span>
      </span>
      <span className="cen-entry__cta">{tr(E.cta, lang)} →</span>
    </button>
  );
}
