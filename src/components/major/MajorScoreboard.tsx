// PLACAR DO PICK'EM (aba Pick'em do Modo Major): pontua o palpite na tela (o
// seu, ou o de um link recebido) contra o resultado REAL de cada Stage, que
// entra por PR de dados (src/data/majorResults.ts). Antes do Stage 1 terminar,
// diz quando o placar começa; com resultado, mostra o total, os acertos (✓/✗)
// nos times do próprio palpite, o que ainda está aguardando e o RECAP pra
// compartilhar (ShareInvite: "Desafie um amigo" com o link do palpite e
// "Postar o card" com o PNG do placar, majorShareCard.ts → drawPlacarCard).
// Quem decide a mensagem é placarView (engine/pickemScore.ts). Palpite que
// travou aberto (lockedOut) ouve isso com todas as letras.
//
// Medição: share_card com os kinds placar-desafio e placar-card
// (state/shareInvite.ts). O Início e a landing abrem o Modo Major já aqui e
// pedem a rolagem até o placar (data/majorLive.ts → requestPlacarFocus).
//
// Prévia só em `npm run dev`: ?placar=demo1 … demo6 troca o resultado por um
// Major simulado (1–3 = até o Stage N, 4 = + quartas, 5 = + semis, 6 = + campeão).
// Em produção import.meta.env.DEV é false e a prévia não existe.
import { useEffect, useMemo } from 'react';
import { Check, ExternalLink, Trophy, X } from 'lucide-react';
import data from '../../data/major-singapore-2026.json';
import { MAJOR_RESULTS, PICKEM_LOCK_MS, PICKEM_LOCKS, STAGE1_END, STAGE1_ENDS_MS } from '../../data/majorResults';
import { demoParam, takePlacarFocus } from '../../data/majorLive';
import { readPickSnapshots } from '../../state/pickSnapshots';
import { encodePicks, simulateMajor, type MajorData, type MajorPicks } from '../../engine/majorSingapore';
import {
  lockedOut, outcomesFromSim, placarRecap, placarView, scoredPicks,
  type MajorOutcomes, type Mark, type PlacarThrough, type PlacarView, type PlayoffScore, type StageScore,
} from '../../engine/pickemScore';
import { useLang, type Lang } from '../../state/i18n';
import { fillTemplate, inviteKind, inviteMessage, inviteUrl, placarShareText } from '../../state/shareInvite';
import { shareCard, shareText } from '../../state/shareX';
// '../ds/index' = os primitivos novos (Panel com icon/tone);
// '../ds' sozinho resolve pro wrapper legado ds.tsx
import { Panel, Tag } from '../ds/index';
import { ShareInvite } from '../ShareInvite';
import { drawPlacarCard } from './majorShareCard';
import type { MajorKey } from './majorStrings';
import '../../styles/major-scoreboard.css';

const D = data as unknown as MajorData;
const TEAMS = new Map(D.teams.map((x) => [x.id, x]));
const PANEL_ID = 'msg-placar';
type T = (k: MajorKey) => string;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
const teamName = (id: string) => TEAMS.get(id)?.name ?? id;

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-11-27' → '27/11' (pt/es) ou 'Nov 27' (en) */
function fmtDay(iso: string, lang: Lang): string {
  const [, m, d] = iso.split('-').map(Number);
  return lang === 'en' ? `${MONTHS_EN[m - 1]} ${d}` : `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** hora da trava em Brasília (UTC-3): '23/11, 13h' / 'Nov 23, 1 PM' */
function fmtLock(ms: number, lang: Lang): { date: string; time: string } {
  const brt = new Date(ms - 3 * 3600 * 1000);
  const iso = brt.toISOString().slice(0, 10);
  const h = brt.getUTCHours();
  return { date: fmtDay(iso, lang), time: lang === 'en' ? `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` : `${h}h` };
}

function devOutcomes(): MajorOutcomes | null {
  if (!import.meta.env.DEV) return null;
  try {
    const n = demoParam(window.location.search);
    return n ? outcomesFromSim(simulateMajor(D, 2026), n, '#placar-demo') : null;
  } catch { return null; }
}

function scopeOf(t: T, th: PlacarThrough): string {
  if (th === 1) return fill(t('pcScopeIn'), { n: 1 });
  if (th === 2 || th === 3) return fill(t('pcScopeUpTo'), { n: th });
  return t(th === 'qf' ? 'pcScopeQf' : th === 'sf' ? 'pcScopeSf' : 'pcScopeMajor');
}

export function MajorScoreboard({ t, picks, readOnly, nick = '' }: {
  t: T; picks: MajorPicks; readOnly: boolean;
  /** apelido que assina o desafio (o mesmo "Mostrar meu nick" do desafio do pick'em); '' = sem */
  nick?: string;
}) {
  const { lang } = useLang();
  const demo = useMemo(() => devOutcomes(), []);
  const results = demo ?? MAJOR_RESULTS;
  const now = Date.now();
  // o próprio palpite é pontuado pela foto de cada trava (state/pickSnapshots.ts);
  // o palpite de um link recebido, como veio
  const scored = readOnly ? picks : scoredPicks(picks, readPickSnapshots(), PICKEM_LOCKS, now);
  const view = placarView(scored, results, now, STAGE1_ENDS_MS);
  // travou aberto: não promete que completar agora entra no placar
  const out = !readOnly && view.kind === 'incomplete' && lockedOut(scored, PICKEM_LOCKS, now);
  const starts = fill(t('pcStarts'), { date: fmtDay(STAGE1_END, lang) });
  const lockAt = fmtLock(PICKEM_LOCK_MS, lang);
  // "veja seus pontos" no Início/landing: rola até aqui ao abrir (uma vez)
  useEffect(() => {
    if (!takePlacarFocus()) return;
    const raf = requestAnimationFrame(() => {
      const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(PANEL_ID)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <Panel
      id={PANEL_ID}
      className="msg-pc-panel"
      title={t('pcTitle')}
      icon={<Trophy size={16} aria-hidden />}
      tone={view.kind === 'scored' ? 'accent' : 'default'}
      actions={import.meta.env.DEV && demo ? <Tag tone="warn">demo (dev)</Tag> : undefined}
    >
      {view.kind === 'incomplete' && (out
        ? <p className="msg-pc__text">{t('pcOut')}</p>
        : <p className="msg-pc__text">{t('pcIncomplete')}{!view.started && <> {starts}</>}</p>)}
      {!readOnly && !out && <p className="msg-muted">{fill(t(now >= PICKEM_LOCK_MS ? 'pcLocked' : 'pcLockAt'), lockAt)}</p>}
      {view.kind === 'waiting' && (
        <p className="msg-pc__text">{view.late ? t('pcLate') : starts}{!readOnly && <> {t('pcSaved')}</>}</p>
      )}
      {view.kind === 'scored' && <Scored t={t} view={view} results={results} picks={scored} readOnly={readOnly} nick={nick} />}
    </Panel>
  );
}

function Scored({ t, view, results, picks, readOnly, nick }: {
  t: T; view: Extract<PlacarView, { kind: 'scored' }>; results: MajorOutcomes; picks: MajorPicks; readOnly: boolean; nick: string;
}) {
  const { score } = view;
  const vars = { pts: score.points, max: score.max, scope: scopeOf(t, view.through) };
  return (
    <div className="msg-pc">
      <div className="msg-pc__head">
        <span className="msg-pc__big" aria-hidden>{score.points}<small>/{score.max}</small></span>
        <p className="msg-pc__line">{fill(t(readOnly ? 'pcThey' : 'pcYou'), vars)}</p>
      </div>
      <ol className="msg-pc__parts">
        {score.stages.map((s, i) => (s
          ? <StageRow key={i} t={t} s={s} source={results.stages[i]?.source ?? ''} />
          : <WaitRow key={i} t={t} label={`Stage ${i + 1}`} next={view.next === i + 1} />))}
        {score.playoffs
          ? <PlayoffRow t={t} s={score.playoffs} source={results.playoffs?.source ?? ''} />
          : <WaitRow t={t} label="Playoffs" next={view.next === 'playoffs'} />}
      </ol>
      {!readOnly && <PlacarInvite t={t} view={view} picks={picks} nick={nick} text={fill(t('pcShareText'), vars)} />}
      <p className="msg-muted">{t('scoreRule')}</p>
    </div>
  );
}

/**
 * Recap com card: "Desafie um amigo" manda o link do palpite pontuado (o X já
 * mostra o card do palpite no preview) e "Postar o card" gera o PNG do placar
 * (no celular vai pelo share sheet; no PC baixa o PNG e abre o X).
 */
function PlacarInvite({ t, view, picks, nick, text }: {
  t: T; view: Extract<PlacarView, { kind: 'scored' }>; picks: MajorPicks; nick: string; text: string;
}) {
  const code = encodePicks(D, picks);
  const recap = placarRecap(view);
  const vars = { hits: String(recap.hits), of: String(recap.of) };
  const dare = async () => {
    const url = inviteUrl('placar', 'desafio', { code, nick });
    const r = await shareText(inviteKind('placar', 'desafio'), inviteMessage(text, url));
    return r === 'copy' ? t('chCopied') : r === 'native' ? t('invShared') : null;
  };
  const card = async () => {
    let dataUrl = '';
    try {
      dataUrl = drawPlacarCard(recap, {
        kicker: t('rcCardKicker'),
        event: D.event.name,
        hits: fillTemplate(t(recap.part === 'playoffs' ? 'rcHitsPlayoffs' : 'rcHitsStage'), vars),
        total: t(recap.final ? 'rcCardTotalFinal' : 'rcCardTotal'),
        waiting: t('pcWaiting'),
        foot: 'roadtomajor.com.br',
      });
    } catch { /* canvas indisponível: segue só com o texto e o link */ }
    const r = await shareCard(inviteKind('placar', 'card'), {
      dataUrl,
      filename: 'placar-pickem-major-singapore.png',
      text: placarShareText(recap, {
        title: t('rcTitle'), hitsStage: t('rcHitsStage'), hitsPlayoffs: t('rcHitsPlayoffs'), total: t('rcTotal'), totalFinal: t('rcTotalFinal'),
      }),
      url: inviteUrl('placar', 'card', { code }),
    });
    if (r === 'native') return t('invShared');
    return r === 'x' && dataUrl ? t('invXHint') : null;
  };
  return (
    <ShareInvite
      lead={t('rcLead')}
      dareLabel={t('invDare')}
      cardLabel={t('invCard')}
      onDare={dare}
      onCard={card}
    />
  );
}

function PartMeta({ t, label, points, max, source }: { t: T; label: string; points: number; max: number; source: string }) {
  return (
    <div className="msg-pc__meta">
      <h3 className="msg-pc__name">{label}</h3>
      <span className="msg-pc__pts">{points}<small>/{max}</small></span>
      {source && (
        <a className="msg-pc__src" href={source} target="_blank" rel="noopener noreferrer">
          {t('pcSource')} <ExternalLink size={14} aria-hidden />
        </a>
      )}
    </div>
  );
}

function StageRow({ t, s, source }: { t: T; s: StageScore; source: string }) {
  return (
    <li className="msg-pc__part">
      <PartMeta t={t} label={`Stage ${s.stage}`} points={s.points} max={s.max} source={source} />
      <div className="msg-pc__body">
        <Marks t={t} label={t('advanced')} marks={s.qualified} />
        <div className="msg-pc__ext">
          <Marks t={t} label="3-0" marks={s.x30} />
          <Marks t={t} label="0-3" marks={s.x03} />
        </div>
      </div>
    </li>
  );
}

function PlayoffRow({ t, s, source }: { t: T; s: PlayoffScore; source: string }) {
  return (
    <li className="msg-pc__part">
      <PartMeta t={t} label="Playoffs" points={s.points} max={s.max} source={source} />
      <div className="msg-pc__body">
        <Marks t={t} label={t('qf')} marks={s.qf} />
        <div className="msg-pc__ext">
          <Marks t={t} label={t('sf')} marks={s.sf} />
          <Marks t={t} label={t('champion')} marks={s.final} />
        </div>
      </div>
    </li>
  );
}

function WaitRow({ t, label, next }: { t: T; label: string; next: boolean }) {
  return (
    <li className="msg-pc__part is-wait">
      <h3 className="msg-pc__name">{label}</h3>
      <span><Tag tone={next ? 'accent' : 'neutral'}>{t('pcWaiting')}</Tag></span>
    </li>
  );
}

/** os times do palpite numa parte, cada um com ✓ (acertou) ou ✗ (errou); null = rodada aguardando */
function Marks({ t, label, marks }: { t: T; label: string; marks: Mark[] | null }) {
  const hits = marks?.filter((m) => m.hit).length ?? 0;
  return (
    <div className="msg-pc__group">
      <span className="msg-pc__label">
        {label}
        {!!marks?.length && <span className="msg-pc__count">{hits}/{marks.length}</span>}
      </span>
      {marks == null ? <span className="msg-pc__wait">{t('pcWaiting')}</span>
        : !marks.length ? <span className="msg-pc__wait">{t('pcNone')}</span>
        : (
          <ul className="msg-pc__marks">
            {marks.map((m) => (
              <li key={m.id} className={`msg-pc__mark ${m.hit ? 'is-hit' : 'is-miss'}`}>
                {m.hit ? <Check size={16} aria-hidden /> : <X size={16} aria-hidden />}
                <span className="msg-pc__team">{teamName(m.id)}</span>
                <span className="ds-sr-only">{t(m.hit ? 'pcHit' : 'pcMiss')}</span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
