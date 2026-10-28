// [F2] PARTIDA PvP AO VIVO resolvida NO SERVIDOR. Os dois decidem ao mesmo
// tempo, com prazo comum por beat; quando os dois travam (ou o prazo vence) o
// servidor resolve e o placar anda. Este componente só apresenta e encaminha:
// poll de matchState (~1.5s, com backoff em erro), decide, e reconexão pelo
// próprio matchState (recarregar retoma do beat em que o servidor está).
// As odds vêm do motor compartilhado (pvpMatch) — o que aparece é o que rola.
//
// [ULT-ON] visual de transmissão (placar grande com os dois squads, mapa em
// destaque, timeline de beats, decisões grandes, feedback animado a cada lance
// e tela de vitória). A lógica de poll/decisão é a mesma de antes; o erro de
// poll transitório só aparece depois de falhas seguidas (state/pvpPoll).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Crosshair, Flame, Shield, Swords, Trophy, Zap } from 'lucide-react';
import { ct } from '../../state/career-i18n';
import { MAP_LABELS, type MapId } from '../../types';
import { ultMatchApi, type UltimatePvpSquad } from '../../state/online';
import { ultimateCatalog } from '../../state/ultimate';
import { geometryFor } from '../../data/mapGeometry';
import { pollErrorVisible } from '../../state/pvpPoll';
import { PVP_STYLE_LABEL, PVP_STYLES, type MatchView, type PvpStyle } from '../../engine/ultimate/pvpMatch';

const POLL_MS = 1500;
const POLL_MAX_MS = 12_000;
const BEAT_MS = 20_000;

const pct = (p: number) => `${Math.round(p * 100)}%`;
const STYLE_ICON: Record<PvpStyle, typeof Flame> = { aggro: Flame, safe: Shield, smart: Crosshair };
const STYLE_HINT: Record<PvpStyle, string> = { aggro: 'vence Passivo', safe: 'vence Setup', smart: 'vence Agressivo' };

function mapArt(map: string): string | null {
  try { return geometryFor(map as MapId).backgroundImage ?? null; } catch { return null; }
}

let _nickByPid: Map<string, string> | null = null;
function nickOf(pid: string): string {
  if (!_nickByPid) {
    _nickByPid = new Map();
    try { for (const c of ultimateCatalog()) if (!_nickByPid.has(c.playerId)) _nickByPid.set(c.playerId, c.nick); } catch { /* catálogo indisponível: usa o id */ }
  }
  return _nickByPid.get(pid) ?? pid.replace(/[-_].*$/, '');
}

const initials = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

function TeamBlock({ name, squad, side, align, lead }: { name: string; squad?: UltimatePvpSquad; side: 'ct' | 't'; align: 'left' | 'right'; lead: boolean }) {
  const cards = squad?.cards ?? [];
  const avg = cards.length ? Math.round(cards.reduce((a, c) => a + c.ovr, 0) / cards.length) : null;
  return (
    <div className={`upl-team upl-team--${side} upl-team--${align}${lead ? ' is-lead' : ''}`}>
      <div className="upl-team__id">
        <span className="upl-crest" aria-hidden="true">{initials(name)}</span>
        <div className="upl-team__txt">
          <span className="upl-team__name">{name}</span>
          <span className="upl-team__meta">{side === 'ct' ? 'CT' : 'T'}{avg != null ? ` · OVR ${avg}` : ''}</span>
        </div>
      </div>
      {cards.length > 0 && (
        <div className="upl-roster">
          {cards.slice(0, 5).map((c, i) => (
            <span key={`${c.pid}-${i}`} className="upl-mini" title={`${nickOf(c.pid)} · ${c.ovr}`}>
              <b>{c.ovr}</b><i>{nickOf(c.pid)}</i>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function UltimatePvpLive({ code, nick, onDone, onLeave, squads }: {
  code: string;
  nick: string;
  onDone: (view: MatchView) => void;   // partida encerrada (vencedor fixado pelo servidor) — 1x
  onLeave: () => void;
  squads?: [UltimatePvpSquad | undefined, UltimatePvpSquad | undefined]; // [eu, rival] — só visual
}) {
  const [view, setView] = useState<MatchView | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState<PvpStyle | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const recvAt = useRef(Date.now());       // quando chegou a última visão (contagem local do prazo)
  const delay = useRef(POLL_MS);
  const doneRef = useRef(false);
  const fails = useRef(0);

  const accept = useCallback((v: MatchView) => {
    recvAt.current = Date.now();
    setView((prev) => (prev && prev.version > v.version && prev.status === v.status ? prev : v));
    if (v.status !== 'live' && !doneRef.current) { doneRef.current = true; onDone(v); }
  }, [onDone]);

  // início idempotente + poll com backoff (erro/429 dobra o intervalo até 12s)
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const tick = async (first: boolean) => {
      try {
        const r = await ultMatchApi({ action: first ? 'matchStart' : 'matchState', code, nick });
        if (!alive) return;
        if (r.ok && r.match) { fails.current = 0; setError(''); delay.current = POLL_MS; accept(r.match); }
        else {
          fails.current += 1;
          // [ULT-ON] 500/503 isolado (instância fria, os dois chegando juntos) não pisca na tela
          if (pollErrorVisible(fails.current, r.status)) setError(r.error ?? ct('Falha ao falar com o servidor.'));
          delay.current = Math.min(POLL_MAX_MS, delay.current * 2);
          if (r.status === 403 || r.status === 404) return; // não é desta partida: para
          // o 1º matchStart que falhou é repetido como matchStart (cria a partida se ainda não existe)
          if (first && alive && !doneRef.current) { timer = window.setTimeout(() => void tick(true), delay.current); return; }
        }
      } catch {
        if (!alive) return;
        fails.current += 1;
        if (pollErrorVisible(fails.current, null)) setError(ct('Sem conexão — tentando de novo…'));
        delay.current = Math.min(POLL_MAX_MS, delay.current * 2);
        if (first && alive && !doneRef.current) { timer = window.setTimeout(() => void tick(true), delay.current); return; }
      }
      if (alive && !doneRef.current) timer = window.setTimeout(() => void tick(false), delay.current);
    };
    void tick(true);
    // voltar pro app (aba oculta no celular) repõe na hora
    const onVis = () => { if (!document.hidden && alive) { window.clearTimeout(timer); void tick(false); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [code, nick, accept]);

  // relógio do prazo (só visual; quem manda é o servidor)
  useEffect(() => {
    if (view?.status !== 'live') return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [view?.status]);

  const decide = async (style: PvpStyle) => {
    if (!view?.beat || view.myDecision || sending) return;
    setSending(style);
    try {
      const r = await ultMatchApi({ action: 'decide', code, nick, style, beat: view.beat.idx });
      if (r.ok && r.match) accept(r.match); else setError(r.error ?? ct('Não foi possível enviar a decisão.'));
    } catch { setError(ct('Sem conexão — a decisão não saiu. Tente de novo.')); }
    setSending(null);
  };

  const art = useMemo(() => (view ? mapArt(view.map) : null), [view?.map]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view) {
    return (
      <div className="upl upl--connecting" aria-live="polite">
        <div className="upl-connect">
          <span className="upl-connect__ring" aria-hidden="true" />
          <span className="upl-connect__txt">{ct('Conectando à partida…')}</span>
          <span className="upl-connect__code">{ct('Sala')} {code}</span>
        </div>
        {error && <div className="ut-duel__err">{error}</div>}
      </div>
    );
  }

  const beat = view.beat;
  const left = Math.max(0, view.deadlineIn - (now - recvAt.current));
  const secs = Math.ceil(left / 1000);
  const last = view.last;
  const mapName = MAP_LABELS[view.map as MapId] ?? view.map;
  const score = view.finalScore ?? view.score;
  const mySide: 'ct' | 't' = beat?.side === 'T' ? 't' : 'ct';
  const oppSide: 'ct' | 't' = mySide === 'ct' ? 't' : 'ct';
  const total = beat?.total ?? Math.max(view.history.length, 1);
  const ended = view.status !== 'live';
  const lastKey = last ? `${last.idx}` : 'none';

  return (
    <div className={`upl${ended ? ' upl--ended' : ''}`} aria-live="polite">
      {/* ── placar de transmissão ── */}
      <section className="upl-board" style={art ? { ['--upl-art' as string]: `url(${art})` } : undefined}>
        <div className="upl-board__top">
          <span className={`upl-live${ended ? ' is-off' : ''}`}><span className="upl-live__dot" />{ended ? ct('ENCERRADA') : ct('AO VIVO')}</span>
          <span className="upl-map"><span className="upl-map__k">{ct('MAPA')}</span> {mapName}</span>
          {view.ranked && <span className="upl-tag">{ct('ranqueada')}</span>}
        </div>
        <div className="upl-board__main">
          <TeamBlock name={view.names[0]} squad={squads?.[0]} side={mySide} align="left" lead={score[0] > score[1]} />
          <div className="upl-score" aria-label={`${score[0]} a ${score[1]}`}>
            <span key={`a${score[0]}`} className={`upl-score__n upl-score__n--${mySide} upl-bump`}>{score[0]}</span>
            <span className="upl-score__sep">:</span>
            <span key={`b${score[1]}`} className={`upl-score__n upl-score__n--${oppSide} upl-bump`}>{score[1]}</span>
          </div>
          <TeamBlock name={view.names[1]} squad={squads?.[1]} side={oppSide} align="right" lead={score[1] > score[0]} />
        </div>
        {/* timeline de beats (cada lance decisivo do mapa) */}
        <ol className="upl-tl" aria-label={ct('Lances da partida')}>
          {Array.from({ length: total }, (_, i) => {
            const h = view.history[i];
            const cur = !ended && beat?.idx === i;
            const cls = h ? (h.won ? 'is-win' : 'is-loss') : cur ? 'is-cur' : '';
            return (
              <li key={i} className={`upl-tl__b ${cls}`} title={h ? `${ct('Você')}: ${ct(PVP_STYLE_LABEL[h.mine])} · ${ct('Rival')}: ${ct(PVP_STYLE_LABEL[h.theirs])}` : undefined}>
                <span className="upl-tl__n">{i + 1}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── feedback do último lance (anima a cada beat) ── */}
      {last && !ended && (
        <div key={lastKey} className={`upl-flash ${last.won ? 'is-win' : 'is-loss'}`}>
          <span className="upl-flash__big">{last.won ? ct('+1 ROUND') : ct('ROUND DO RIVAL')}</span>
          <span className="upl-flash__det">
            {ct('Você')} <b>{ct(PVP_STYLE_LABEL[last.mine])}</b>{last.myAuto ? ` (${ct('auto')})` : ''} × <b>{ct(PVP_STYLE_LABEL[last.theirs])}</b>{last.theirAuto ? ` (${ct('auto')})` : ''} {ct('Rival')} · {ct('chance era')} {pct(last.pWin)}
          </span>
        </div>
      )}

      {/* ── lance atual + decisões ── */}
      {!ended && beat && (
        <>
          <section className="upl-beat">
            <div className="upl-beat__head">
              <span className="upl-beat__kick">{beat.kicker} · {ct('lance')} {beat.idx + 1}/{beat.total} · <span className={`upl-side upl-side--${mySide}`}>{ct('lado')} {beat.side}</span></span>
              <span className={`upl-clock${secs <= 5 ? ' is-low' : ''}`}>
                <Clock size={14} aria-hidden="true" /> {secs}s
                <span className="upl-clock__bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (left / BEAT_MS) * 100)}%` }} /></span>
              </span>
            </div>
            {beat.bridged && <div className="upl-beat__bridge">{ct('Desde o último lance')}: {beat.bridged[0]}–{beat.bridged[1]} {ct('em rounds')}</div>}
            <h3 className="upl-beat__title">{beat.title}</h3>
            <p className="upl-beat__sit">{beat.situation}</p>
          </section>

          <div className="upl-opts" role="group" aria-label={ct('Sua decisão')}>
            {beat.options.map((o) => {
              const chosen = view.myDecision === o.style;
              const locked = !!view.myDecision;
              const Icon = STYLE_ICON[o.style];
              return (
                <button key={o.style} data-style={o.style} className={`upl-opt upl-opt--${o.style}${chosen ? ' is-chosen' : ''}${sending === o.style ? ' is-sending' : ''}`}
                  disabled={locked || !!sending} aria-pressed={chosen} onClick={() => void decide(o.style)}>
                  <span className="upl-opt__ic" aria-hidden="true"><Icon size={22} /></span>
                  <span className="upl-opt__name">{ct(PVP_STYLE_LABEL[o.style])}</span>
                  <span className="upl-opt__label">{o.label}</span>
                  {o.desc && <span className="upl-opt__desc">{o.desc}</span>}
                  <span className="upl-opt__odds">
                    {PVP_STYLES.map((t) => (
                      <span key={t} className="upl-odd">
                        <span className="upl-odd__k">{ct('vs')} {ct(PVP_STYLE_LABEL[t]).slice(0, 3)}</span>
                        <span className="upl-odd__bar"><span style={{ width: pct(o.odds[t]) }} /></span>
                        <span className="upl-odd__v">{pct(o.odds[t])}</span>
                      </span>
                    ))}
                  </span>
                  <span className="upl-opt__hint">{ct(STYLE_HINT[o.style])}</span>
                  {chosen && <span className="upl-opt__lock"><Zap size={12} /> {ct('TRAVADO')}</span>}
                </button>
              );
            })}
          </div>
          <div className="upl-status">
            <span className={`upl-opp${view.oppDecided ? ' is-ready' : ''}`}>{view.oppDecided ? ct('O rival já decidiu.') : ct('O rival ainda está decidindo…')}</span>
            <span className="upl-status__note">{ct('Sem decisão no prazo, o servidor sorteia uma escolha pra você.')}</span>
          </div>
        </>
      )}

      {/* ── fim de jogo ── */}
      {ended && (
        <section className={`upl-end ${view.status === 'abandoned' ? 'is-void' : view.won ? 'is-win' : 'is-loss'}`}>
          <div className="upl-end__rays" aria-hidden="true" />
          <span className="upl-end__icon" aria-hidden="true">{view.won ? <Trophy size={44} /> : <Swords size={40} />}</span>
          <h2 className="upl-end__title">
            {view.status === 'abandoned' ? ct('PARTIDA ABANDONADA') : view.won ? ct('VITÓRIA') : ct('DERROTA')}
          </h2>
          <div className="upl-end__score"><span className={`upl-score__n--${mySide}`}>{score[0]}</span><span className="upl-score__sep">:</span><span className={`upl-score__n--${oppSide}`}>{score[1]}</span></div>
          <div className="upl-end__sub">
            {view.names[0]} × {view.names[1]} · {mapName}{view.reason === 'wo' && view.status === 'done' ? ` · ${ct('W.O.')}` : ''}
          </div>
          <div className="upl-end__note">{ct('Resultado fixado pelo servidor.')}</div>
          <button className="ut-btn ut-btn--ghost upl-end__btn" onClick={onLeave}>{ct('Voltar')}</button>
        </section>
      )}

      {error && <div className="ut-duel__err">{error}</div>}
    </div>
  );
}
