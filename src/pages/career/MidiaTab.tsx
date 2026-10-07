// [super atualização 2 · MÍDIA VIVA] Principal › Mídia.
// Sala de imprensa (coletivas estilo FM com repercussão real e visível), feed
// da cena estilo X/HLTV (derivado por seed: jornalistas, jogadores, torcida,
// rivais, resultados do mundo, mercado e rumores), trending e narrativas
// (clássicos, fregueses, maldições, sequências).
import { useMemo, useState } from 'react';
import {
  BadgeCheck, Flame, Hash, Heart, Megaphone, MessageCircle, Mic, Newspaper, Repeat2, Swords, TrendingDown, TrendingUp, Skull, Radio, Check, X as XIcon, CircleHelp,
} from 'lucide-react';
import { Panel, Segmented, Tag, Button, EmptyState, Modal, type TagTone } from '../../components/ds/index';
import { hashStr } from '../../state/hash';
import { MIDIA_REP_DEFAULT, PRESS_TONES, type MidiaLang, type MidiaState, type PressConf, type PressFx, type PressQ, type PressTone } from '../../engine/midia/model';
import { FX, narrativesOf, pressEffects, type Narrative } from '../../engine/midia/midia';
import { buildFeed, narrativeHeadline, trendingOf, JOURNALISTS, type FeedPost, type FeedScope, type WorldResultLite, type Author } from '../../engine/midia/feed';
import { ANSWER, KIND_TITLE, QUESTION, STAGE_NAME, TONE_LABEL, UI, fill, tr } from '../../engine/midia/texto';
import '../../styles/midia.css';

const fmtN = (n: number): string => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(n));
const initials = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';

function qVars(lang: MidiaLang, q: PressQ, conf: PressConf) {
  return { o: q.o ?? conf.o ?? '', n: q.n ?? '', x: q.x ?? '', stage: q.k ? tr(lang, STAGE_NAME[q.k]) : '', ev: conf.label ?? '' };
}

// ── Sala de imprensa ───────────────────────────────────────────────────────
interface PressProps {
  lang: MidiaLang;
  conf: PressConf;
  onAnswer: (conf: PressConf, picks: PressTone[] | null) => PressFx;
  nickOf?: (id: string) => string;
}

function FxChips({ lang, fx, nickOf }: { lang: MidiaLang; fx: PressFx; nickOf?: (id: string) => string }) {
  const chip = (label: string, v: number) => (
    <span key={label} className="md-fx" data-dir={v > 0 ? 'up' : v < 0 ? 'down' : 'flat'}>
      {v > 0 ? <TrendingUp size={12} aria-hidden /> : v < 0 ? <TrendingDown size={12} aria-hidden /> : null}
      {label} <b>{v > 0 ? `+${v}` : v}</b>
    </span>
  );
  return (
    <div className="md-fx-row">
      {chip(tr(lang, UI.squad), fx.squad)}
      {Object.entries(fx.players).map(([id, v]) => chip(nickOf?.(id) ?? id, v))}
      {chip(tr(lang, UI.board), fx.board)}
      {chip(tr(lang, UI.repShort), fx.rep)}
    </div>
  );
}

/** direção do efeito de um tom (sem número: o FM mostra o clima, não a conta) */
function toneHint(q: PressQ, tone: PressTone): { up: number; down: number } {
  const [s, p, b, r] = FX[q.t][tone];
  const vals = [s, q.p ? p : 0, b, r];
  return { up: vals.filter((v) => v > 0).length, down: vals.filter((v) => v < 0).length };
}

export function PressRoom({ lang, conf, onAnswer, nickOf }: PressProps) {
  const [picks, setPicks] = useState<(PressTone | null)[]>(() => conf.qs.map(() => null));
  const [result, setResult] = useState<{ fx: PressFx; picks: PressTone[] } | null>(null);
  const ready = picks.every((p) => p != null);
  const preview = ready ? pressEffects(conf, picks as PressTone[]) : null;
  const send = (ans: PressTone[] | null) => {
    const fx = onAnswer(conf, ans);
    if (ans) setResult({ fx, picks: ans });
  };
  const outcome = conf.kind !== 'pre' && conf.score ? `${conf.won ? '✓' : '✗'} ${conf.o ?? ''} ${conf.score}` : conf.o ? `${tr(lang, UI.vs)} ${conf.o}` : '';
  return (
    <div className="md-press" data-kind={conf.kind}>
      <header className="md-press__head">
        <span className="md-press__mic" aria-hidden><Mic size={18} /></span>
        <div className="md-press__title">
          <span className="md-kicker">{tr(lang, KIND_TITLE[conf.kind])}</span>
          <strong>{conf.label ?? ''}{outcome ? <span className="md-press__score"> · {outcome}</span> : null}</strong>
        </div>
        <span className="md-onair"><Radio size={12} aria-hidden /> ON AIR</span>
      </header>
      {!result && <p className="md-hint">{tr(lang, UI.quoteHint)}</p>}
      <ol className="md-qs">
        {conf.qs.map((q, i) => {
          const j = JOURNALISTS[hashStr(`${conf.key}:${i}`) % JOURNALISTS.length];
          const vars = qVars(lang, q, conf);
          const chosen = result ? result.picks[i] : picks[i];
          return (
            <li key={`${q.t}${i}`} className="md-q">
              <div className="md-q__who">
                <Avatar a={j} size={30} />
                <span><b>{j.name}</b> <span className="md-dim">@{j.handle}</span></span>
                {q.n && <Tag tone="warn">{tr(lang, UI.cited)}: {q.n}</Tag>}
              </div>
              <p className="md-q__text">“{fill(lang, QUESTION[q.t], q.v, vars)}”</p>
              <div className="md-tones" role="radiogroup" aria-label={fill(lang, QUESTION[q.t], q.v, vars)}>
                {PRESS_TONES.map((tone) => {
                  const h = toneHint(q, tone);
                  const on = chosen === tone;
                  if (result && !on) return null;
                  return (
                    <button
                      key={tone} type="button" role="radio" aria-checked={on} disabled={!!result}
                      className="md-tone" data-tone={tone} data-on={on ? '' : undefined}
                      onClick={() => setPicks((ps) => ps.map((p, k) => (k === i ? tone : p)))}
                    >
                      <span className="md-tone__label">{tr(lang, TONE_LABEL[tone])}
                        <span className="md-tone__dots" aria-hidden>
                          {Array.from({ length: h.up }, (_, k) => <i key={`u${k}`} data-d="up" />)}
                          {Array.from({ length: h.down }, (_, k) => <i key={`d${k}`} data-d="down" />)}
                        </span>
                      </span>
                      <span className="md-tone__quote">{fill(lang, ANSWER[q.t][tone], 0, vars)}</span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
      {result ? (
        <div className="md-press__done">
          <span className="md-kicker">{tr(lang, UI.done)} · {tr(lang, UI.effects)}</span>
          <FxChips lang={lang} fx={result.fx} nickOf={nickOf} />
        </div>
      ) : (
        <footer className="md-press__foot">
          <div className="md-press__preview">
            <span className="md-kicker">{tr(lang, UI.effects)}</span>
            {preview ? <FxChips lang={lang} fx={preview} nickOf={nickOf} /> : <span className="md-dim">{picks.filter(Boolean).length}/{conf.qs.length}</span>}
          </div>
          <div className="md-press__actions">
            <Button variant="ghost" size="sm" onClick={() => send(null)} title={tr(lang, UI.skipHint)}>{tr(lang, UI.skip)}</Button>
            <Button variant="primary" size="sm" icon={<Mic size={14} aria-hidden />} disabled={!ready} onClick={() => ready && send(picks as PressTone[])}>{tr(lang, UI.answer)}</Button>
          </div>
        </footer>
      )}
    </div>
  );
}

/** Chamada compacta (playoffs/Major): abre a sala de imprensa num modal. */
export function PressCallout({ lang, conf, onAnswer, nickOf, done = false }: PressProps & { done?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="md-callout" data-done={done ? '' : undefined} onClick={() => setOpen(true)}>
        <span className="md-press__mic" aria-hidden><Mic size={16} /></span>
        <span className="md-callout__txt"><span className="md-kicker">{tr(lang, KIND_TITLE[conf.kind])}</span><b>{done ? tr(lang, UI.done) : tr(lang, UI.pending)}{conf.o ? ` · ${conf.o}` : ''}</b></span>
        {!done && <span className="md-onair"><Radio size={12} aria-hidden /> ON AIR</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={tr(lang, UI.press)} size="lg">
        <PressRoom lang={lang} conf={conf} onAnswer={onAnswer} nickOf={nickOf} />
      </Modal>
    </>
  );
}

/**
 * Lugar fixo da coletiva fora da aba Mídia: depois de responder, o botão fica
 * ("Coletiva encerrada") e o modal mostra a repercussão — até mudar o `scope`
 * (a próxima partida).
 */
export function PressSlot({ conf, scope, onAnswer, ...rest }: Omit<PressProps, 'conf'> & { conf: PressConf | null; scope: string }) {
  const [held, setHeld] = useState<{ conf: PressConf; scope: string } | null>(null);
  const kept = held && held.scope === scope ? held.conf : null;
  const c = conf ?? kept;
  if (!c) return null;
  const wrapped = (cc: PressConf, picks: PressTone[] | null) => { if (picks) setHeld({ conf: cc, scope }); return onAnswer(cc, picks); };
  return <PressCallout key={c.key} {...rest} conf={c} onAnswer={wrapped} done={!conf && !!kept} />;
}

// ── Feed ───────────────────────────────────────────────────────────────────
function Avatar({ a, size = 40 }: { a: Author; size?: number }) {
  return <span className="md-av" data-kind={a.kind} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>{initials(a.tag && a.kind !== 'player' ? a.tag : a.name)}</span>;
}

function Post({ lang, p, reply = false }: { lang: MidiaLang; p: FeedPost; reply?: boolean }) {
  const [open, setOpen] = useState(false);
  const thread = p.thread ?? [];
  return (
    <article className="md-post" data-reply={reply ? '' : undefined} data-tone={p.tone}>
      <Avatar a={p.a} size={reply ? 30 : 40} />
      <div className="md-post__body">
        <header className="md-post__head">
          <b className="md-post__name">{p.a.name}</b>
          {p.a.verified && <BadgeCheck size={14} className="md-verified" aria-label="verificado" />}
          <span className="md-dim">@{p.a.handle} · S{p.split}</span>
        </header>
        <p className="md-post__text">{p.text}</p>
        {p.card && (
          <div className="md-card" data-won={p.card.won ? '' : undefined}>
            <span className="md-card__team">{p.card.home}</span>
            <span className="md-card__sc">{p.card.sc}</span>
            <span className="md-card__team">{p.card.away}</span>
            <span className="md-card__lbl">{p.card.lbl}</span>
          </div>
        )}
        {p.quote && (
          <blockquote className="md-quote">
            <span className="md-dim">{p.quote.q}</span>
            <span>“{p.quote.a}”</span>
          </blockquote>
        )}
        {p.rumor && (
          <div className="md-rumor-meta">
            {p.rumor.st === 'ok' ? <Tag tone="win" icon={<Check size={12} aria-hidden />}>{tr(lang, UI.confirmed)}</Tag>
              : p.rumor.st === 'no' ? <Tag tone="loss" icon={<XIcon size={12} aria-hidden />}>{tr(lang, UI.denied)}</Tag>
                : <Tag tone="warn" icon={<CircleHelp size={12} aria-hidden />}>{tr(lang, UI.open)}</Tag>}
            <span className="md-dim">{p.rumor.cred}% {tr(lang, UI.credibility)}</span>
          </div>
        )}
        {p.tags.length > 0 && <div className="md-tags">{p.tags.map((t) => <span key={t}>{t}</span>)}</div>}
        <footer className="md-post__acts">
          <span><MessageCircle size={14} aria-hidden /> {fmtN(p.reps + thread.length)}</span>
          <span><Repeat2 size={14} aria-hidden /> {fmtN(p.rts)}</span>
          <span><Heart size={14} aria-hidden /> {fmtN(p.likes)}</span>
          {thread.length > 0 && !reply && (
            <button type="button" className="md-thread-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? tr(lang, UI.hideThread) : `${tr(lang, UI.showThread)} (${thread.length})`}
            </button>
          )}
        </footer>
        {open && <div className="md-thread">{thread.map((r) => <Post key={r.id} lang={lang} p={r} reply />)}</div>}
      </div>
    </article>
  );
}

const NARR_ICON: Record<Narrative['kind'], typeof Swords> = { rival: Swords, fregUs: Flame, fregThem: Skull, curse: Skull, streakW: TrendingUp, streakL: TrendingDown };
const NARR_TONE: Record<Narrative['kind'], TagTone> = { rival: 'epic', fregUs: 'win', fregThem: 'loss', curse: 'loss', streakW: 'win', streakL: 'loss' };

// ── Tela ───────────────────────────────────────────────────────────────────
export interface MidiaTabProps {
  lang: MidiaLang;
  seed: string;
  split: number;
  org: { name: string; tag: string };
  midia: MidiaState;
  pre: PressConf | null;
  rivalries?: Record<string, number>;
  results: WorldResultLite[];
  lastMoves: { nick: string; from: string; to: string }[];
  tagOf: (teamId: string) => string;
  playerOf?: (teamId: string, salt: string) => string | undefined;
  nickOf?: (playerId: string) => string;
  onAnswer: (conf: PressConf, picks: PressTone[] | null) => PressFx;
}

type View = 'press' | 'feed' | 'stories';

export function MidiaTab(props: MidiaTabProps) {
  const { lang, midia: m, org } = props;
  const [scope, setScope] = useState<FeedScope | 'all'>('all');
  const [view, setView] = useState<View>('press');
  const feed = useMemo(() => buildFeed({
    lang, seed: props.seed, split: props.split, org, m, rivalries: props.rivalries, results: props.results,
    tagOf: props.tagOf, playerOf: props.playerOf, lastMoves: props.lastMoves,
  }), [lang, props.seed, props.split, org, m, props.rivalries, props.results, props.tagOf, props.playerOf, props.lastMoves]);
  const trends = useMemo(() => trendingOf(feed), [feed]);
  const tagFor = (id: string) => m.tl?.find((e) => e.oid === id)?.o ?? props.tagOf(id);
  const narr = narrativesOf(m, props.rivalries, tagFor);
  // a coletiva respondida continua na tela (com a repercussão) até sair da aba
  const [held, setHeld] = useState<PressConf | null>(null);
  const conf = m.pend ?? props.pre ?? held;
  const onAnswer = (c: PressConf, picks: PressTone[] | null) => { if (picks) setHeld(c); return props.onAnswer(c, picks); };
  const shown = scope === 'all' ? feed : feed.filter((p) => p.scope === scope);
  const rep = m.rep ?? MIDIA_REP_DEFAULT;
  const form = (m.tl ?? []).slice(0, 10).reverse();
  const tag = org.tag || 'ORG';

  const pressPanel = (
    <Panel title={tr(lang, UI.press)} icon={<Mic size={16} />} tone={conf ? 'accent' : 'default'}>
      {conf ? (
        <PressRoom key={conf.key} lang={lang} conf={conf} onAnswer={onAnswer} nickOf={props.nickOf} />
      ) : (
        <EmptyState icon={<Mic size={22} />} title={tr(lang, UI.press)}>{tr(lang, UI.noPress)}</EmptyState>
      )}
      {(m.log ?? []).length > 0 && (
        <div className="md-log">
          <span className="md-kicker">{tr(lang, UI.history)}</span>
          <ul>
            {(m.log ?? []).slice(0, 4).map((l) => (
              <li key={l.key}>
                <span className="md-log__kind">{tr(lang, KIND_TITLE[l.kind])}{l.o ? ` · ${l.o}` : ''} · S{l.split}</span>
                <span className="md-log__tones">{l.picks.map((t, i) => <Tag key={i} tone={t === 'aggressive' ? 'loss' : t === 'confident' ? 'accent' : t === 'calm' ? 'win' : 'neutral'}>{tr(lang, TONE_LABEL[t])}</Tag>)}</span>
                <FxChips lang={lang} fx={l.fx} nickOf={props.nickOf} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );

  const feedPanel = (
    <Panel title={tr(lang, UI.feed)} icon={<Newspaper size={16} />} actions={
      <Segmented
        label={tr(lang, UI.feed)} value={scope} onChange={setScope}
        items={[
          { value: 'all', label: tr(lang, UI.all) },
          { value: 'you', label: tr(lang, UI.yours) },
          { value: 'world', label: tr(lang, UI.world) },
          { value: 'market', label: tr(lang, UI.market) },
        ]}
      />
    } flush>
      {shown.length ? <div className="md-feed">{shown.map((p) => <Post key={p.id} lang={lang} p={p} />)}</div>
        : <EmptyState icon={<Newspaper size={22} />} title={tr(lang, UI.feed)}>{tr(lang, UI.noFeed)}</EmptyState>}
    </Panel>
  );

  const sidePanels = (
    <>
      <Panel title={tr(lang, UI.trending)} icon={<Hash size={16} />}>
        {trends.length ? (
          <ol className="md-trends">
            {trends.map((t, i) => (
              <li key={t.tag}><span className="md-trends__n">{i + 1}</span><span className="md-trends__tag">{t.tag}</span><span className="md-dim">{fmtN(t.posts)} {tr(lang, UI.posts)}</span></li>
            ))}
          </ol>
        ) : <p className="md-dim">—</p>}
      </Panel>
      <Panel title={tr(lang, UI.narratives)} icon={<Swords size={16} />}>
        {narr.length ? (
          <ul className="md-narr">
            {narr.slice(0, 6).map((n, i) => {
              const Icon = NARR_ICON[n.kind];
              const tot = (n.w ?? 0) + (n.l ?? 0);
              return (
                <li key={`${n.kind}${n.oid ?? n.k ?? i}`} data-kind={n.kind}>
                  <span className="md-narr__icon" aria-hidden><Icon size={16} /></span>
                  <div className="md-narr__body">
                    <b>{narrativeHeadline(lang, n, tag, hashStr(`${props.seed}:${n.kind}:${n.oid ?? ''}`))}</b>
                    {tot > 0 && (
                      <div className="md-h2h" aria-label={`${tr(lang, UI.h2h)}: ${n.w} ${tr(lang, UI.wins)}, ${n.l} ${tr(lang, UI.losses)}`}>
                        <span className="md-h2h__w" style={{ flexGrow: n.w ?? 0 }}>{n.w}</span>
                        <span className="md-h2h__l" style={{ flexGrow: n.l ?? 0 }}>{n.l}</span>
                      </div>
                    )}
                  </div>
                  <Tag tone={NARR_TONE[n.kind]}>{n.x}</Tag>
                </li>
              );
            })}
          </ul>
        ) : <p className="md-dim md-small">{tr(lang, UI.noNarr)}</p>}
      </Panel>
      <Panel title={tr(lang, UI.rumors)} icon={<Megaphone size={16} />}>
        {(m.rum ?? []).length ? (
          <ul className="md-rums">
            {(m.rum ?? []).slice(0, 6).map((r) => (
              <li key={r.id}>
                <span><b>{r.nick}</b> <span className="md-dim">{r.from} → {r.to}</span></span>
                {r.st === 'ok' ? <Tag tone="win">{tr(lang, UI.confirmed)}</Tag> : r.st === 'no' ? <Tag tone="loss">{tr(lang, UI.denied)}</Tag> : <Tag tone="warn">{JOURNALISTS[r.src % JOURNALISTS.length].cred}%</Tag>}
              </li>
            ))}
          </ul>
        ) : <p className="md-dim">—</p>}
      </Panel>
    </>
  );

  return (
    <div className="md-tab">
      <section className="md-hero" aria-label={tr(lang, UI.title)}>
        <div className="md-hero__rep">
          <span className="md-kicker">{tr(lang, UI.rep)}</span>
          <div className="md-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rep}><span style={{ width: `${rep}%` }} data-band={rep >= 65 ? 'hi' : rep <= 35 ? 'lo' : 'mid'} /></div>
          <b className="md-hero__num">{rep}</b>
        </div>
        <div className="md-hero__form">
          <span className="md-kicker">{tr(lang, UI.streak)}</span>
          <div className="md-dots">{form.length ? form.map((e) => <i key={e.n} data-w={e.w ? '' : undefined} title={`${e.o} ${e.sc}`} />) : <span className="md-dim">—</span>}</div>
        </div>
        <div className="md-hero__stat"><span className="md-kicker">{tr(lang, UI.narratives)}</span><b className="md-hero__num">{narr.length}</b></div>
        <div className="md-hero__stat"><span className="md-kicker">{tr(lang, UI.history)}</span><b className="md-hero__num">{(m.log ?? []).length}</b></div>
      </section>
      <div className="md-switch">
        <Segmented
          label={tr(lang, UI.title)} value={view} onChange={setView}
          items={[{ value: 'press', label: tr(lang, UI.press) }, { value: 'feed', label: tr(lang, UI.feed) }, { value: 'stories', label: tr(lang, UI.narratives) }]}
        />
      </div>
      <div className="md-grid" data-view={view}>
        <div className="md-col md-col--press">{pressPanel}</div>
        <div className="md-col md-col--feed">{feedPanel}</div>
        <div className="md-col md-col--side">{sidePanels}</div>
      </div>
    </div>
  );
}
