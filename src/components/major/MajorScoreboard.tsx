// PLACAR DO PICK'EM (aba Pick'em do Modo Major): pontua o palpite na tela (o
// seu, ou o de um link recebido) contra o resultado REAL de cada Stage, que
// entra por PR de dados (src/data/majorResults.ts). Antes do Stage 1 terminar,
// diz quando o placar começa; com resultado, mostra o total, os acertos (✓/✗)
// nos times do próprio palpite, o que ainda está aguardando e o botão de
// compartilhar. Quem decide a mensagem é placarView (engine/pickemScore.ts).
//
// Prévia só em `npm run dev`: ?placar=demo1 … demo6 troca o resultado por um
// Major simulado (1–3 = até o Stage N, 4 = + quartas, 5 = + semis, 6 = + campeão).
// Em produção import.meta.env.DEV é false e a prévia não existe.
import { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Trophy, X } from 'lucide-react';
import data from '../../data/major-singapore-2026.json';
import { MAJOR_RESULTS, PICKEM_LOCK_MS, STAGE1_END, STAGE1_ENDS_MS } from '../../data/majorResults';
import { MAJOR_SG_PATH } from '../../data/majorWindow';
import { encodePicks, simulateMajor, type MajorData, type MajorPicks } from '../../engine/majorSingapore';
import {
  outcomesFromSim, placarView,
  type MajorOutcomes, type Mark, type PlacarThrough, type PlacarView, type PlayoffScore, type StageScore,
} from '../../engine/pickemScore';
import { useLang, type Lang } from '../../state/i18n';
import { shareUrl } from '../../state/shareLink';
import { postOnX } from '../../state/shareX';
import { trackShare } from '../../state/track';
// '../ds/index' = os primitivos novos (Panel com icon/tone, Button secondary);
// '../ds' sozinho resolve pro wrapper legado ds.tsx
import { Button, Panel, Tag } from '../ds/index';
import type { MajorKey } from './majorStrings';
import '../../styles/major-scoreboard.css';

const D = data as unknown as MajorData;
const TEAMS = new Map(D.teams.map((x) => [x.id, x]));
const SHARE_KIND = 'major-pickem-placar';
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
    const m = /^demo([1-6])$/.exec(new URLSearchParams(window.location.search).get('placar') ?? '');
    return m ? outcomesFromSim(simulateMajor(D, 2026), Number(m[1]) as 1 | 2 | 3 | 4 | 5 | 6, '#placar-demo') : null;
  } catch { return null; }
}

function scopeOf(t: T, th: PlacarThrough): string {
  if (th === 1) return fill(t('pcScopeIn'), { n: 1 });
  if (th === 2 || th === 3) return fill(t('pcScopeUpTo'), { n: th });
  return t(th === 'qf' ? 'pcScopeQf' : th === 'sf' ? 'pcScopeSf' : 'pcScopeMajor');
}

export function MajorScoreboard({ t, picks, readOnly }: { t: T; picks: MajorPicks; readOnly: boolean }) {
  const { lang } = useLang();
  const demo = useMemo(() => devOutcomes(), []);
  const results = demo ?? MAJOR_RESULTS;
  const now = Date.now();
  const view = placarView(picks, results, now, STAGE1_ENDS_MS, readOnly ? Infinity : PICKEM_LOCK_MS);
  const starts = fill(t('pcStarts'), { date: fmtDay(STAGE1_END, lang) });
  const lockAt = fmtLock(PICKEM_LOCK_MS, lang);
  return (
    <Panel
      title={t('pcTitle')}
      icon={<Trophy size={16} aria-hidden />}
      tone={view.kind === 'scored' ? 'accent' : 'default'}
      actions={import.meta.env.DEV && demo ? <Tag tone="warn">demo (dev)</Tag> : undefined}
    >
      {view.kind === 'incomplete' && (
        <p className="msg-pc__text">{t('pcIncomplete')}{!view.started && <> {starts}</>}</p>
      )}
      {view.kind === 'excluded' && <p className="msg-pc__text">{t('pcExcluded')}</p>}
      {!readOnly && <p className="msg-muted">{fill(t(now >= PICKEM_LOCK_MS ? 'pcLocked' : 'pcLockAt'), lockAt)}</p>}
      {view.kind === 'waiting' && (
        <p className="msg-pc__text">{view.late ? t('pcLate') : starts}{!readOnly && <> {t('pcSaved')}</>}</p>
      )}
      {view.kind === 'scored' && <Scored t={t} view={view} results={results} picks={picks} readOnly={readOnly} />}
    </Panel>
  );
}

function Scored({ t, view, results, picks, readOnly }: {
  t: T; view: Extract<PlacarView, { kind: 'scored' }>; results: MajorOutcomes; picks: MajorPicks; readOnly: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const { score } = view;
  const vars = { pts: score.points, max: score.max, scope: scopeOf(t, view.through) };
  const link = shareUrl(`${MAJOR_SG_PATH}?p=${encodePicks(D, picks)}`, SHARE_KIND);
  const text = fill(t('pcShareText'), vars);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${link}`);
      setCopied(true);
      trackShare(SHARE_KIND, 'copy');
      setTimeout(() => setCopied(false), 1800);
    } catch { /* sem clipboard */ }
  };
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
      {!readOnly && (
        <div className="msg-toolbar">
          <Button icon={copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} onClick={copy}>
            {copied ? t('pcCopied') : t('pcCopy')}
          </Button>
          <Button variant="ghost" onClick={() => postOnX(SHARE_KIND, text, link)}>{t('pcPostX')}</Button>
        </div>
      )}
      <p className="msg-muted">{t('scoreRule')}</p>
    </div>
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
