// DESAFIO DO PICK'EM — o link do palpite de um amigo vira duelo, o loop que
// traz gente nova: quem abre /major-singapore?p=<código> vê a faixa "fulano
// cravou X campeão · monte o seu e compare"; quando o próprio palpite fica
// completo aparece o painel "Você x amigo" e a barra fixa "Desafiar de volta"
// (link do seu palpite + texto pronto, copiar ou postar no X).
//
// O palpite do amigo fica guardado no navegador (até 5, o mais recente
// primeiro) pra comparação sobreviver à navegação. O apelido viaja no link
// como &de=<nick> (saneado) e quem compartilha pode tirá-lo. A lógica é pura:
// engine/pickemChallenge.ts. A tela (MajorSingaporeScreen) só encaixa as peças.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Swords, Trophy } from 'lucide-react';
import data from '../../data/major-singapore-2026.json';
import { decodePicks, encodePicks, picksComplete, type MajorData, type MajorPicks } from '../../engine/majorSingapore';
import { addRival, cleanNick, comparePicks, parseRivals, type PicksComparison, type SavedRival } from '../../engine/pickemChallenge';
import { getManager } from '../../state/manager';
import { shareUrl } from '../../state/shareLink';
import { postOnX } from '../../state/shareX';
import { trackShare } from '../../state/track';
// '../ds/index' = os primitivos novos (variant secondary, Panel com id/icon);
// '../ds' sozinho resolve pro wrapper legado ds.tsx (Button padrão = primary)
import { Alert, Button, Panel, Tag, cx } from '../ds/index';
import type { MajorKey } from './majorStrings';
import '../../styles/major-challenge.css';

const D = data as unknown as MajorData;
const TEAMS = new Map(D.teams.map((x) => [x.id, x]));
const RIVALS_KEY = 'rtm-major-sg-rivals-v1';
const MAJOR_PATH = '/major-singapore';
const SHARE_KIND = 'major-pickem-desafio';
const VS_ID = 'msg-vs';

type T = (k: MajorKey) => string;
interface Rival extends SavedRival { picks: MajorPicks }

function loadRivals(): SavedRival[] {
  try {
    const raw = localStorage.getItem(RIVALS_KEY);
    return raw ? parseRivals(JSON.parse(raw)) : [];
  } catch { return []; }
}

function readNickParam(): string {
  try { return cleanNick(new URLSearchParams(window.location.search).get('de')); } catch { return ''; }
}

/** troca {chave} pelo valor (texto puro: link, X, título) */
const fillText = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/** troca {chave} por um nó React (nome em negrito no meio da frase) */
function fill(s: string, vars: Record<string, ReactNode>): ReactNode[] {
  return s.split(/(\{\w+\})/).map((part, i) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1];
    return k && k in vars ? <Fragment key={i}>{vars[k]}</Fragment> : part;
  });
}

const teamName = (id: string | undefined) => (id ? TEAMS.get(id)?.name ?? '' : '');
const teamTag = (id: string) => TEAMS.get(id)?.tag ?? id;

function scrollToVs() {
  const el = document.getElementById(VS_ID);
  if (!el) return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

export interface Challenge {
  t: T;
  mine: MajorPicks;
  /** o palpite do link aberto agora (?p=), quando é de outra pessoa */
  incoming: Rival | null;
  /** o link aberto é o seu próprio palpite (nada é guardado) */
  ownLink: boolean;
  /** palpites de amigo guardados que ainda abrem na lista de times atual */
  rivals: Rival[];
  rival: Rival | null;
  pickRival: (i: number) => void;
  /** comparação com o amigo escolhido; só existe com o SEU palpite completo */
  vs: PicksComparison | null;
  /** o SEU palpite está completo (a barra de desafio aparece mesmo sem amigo guardado) */
  done: boolean;
  myNick: string;
  sign: boolean;
  setSign: (v: boolean) => void;
  copied: boolean;
  copy: () => void;
  postX: () => void;
}

/** estado do desafio. Chamar uma vez na tela, com o palpite do jogador e o do link. */
export function useChallenge(mine: MajorPicks, shared: MajorPicks | null, t: T): Challenge {
  // tudo que vem do link é lido uma vez, na montagem
  const [incomingCode] = useState(() => (shared ? encodePicks(D, shared) : ''));
  const [ownLink] = useState(() => !!incomingCode && incomingCode === encodePicks(D, mine));
  const [saved] = useState<SavedRival[]>(() => {
    const list = loadRivals();
    return incomingCode && !ownLink ? addRival(list, { code: incomingCode, nick: readNickParam() }) : list;
  });
  useEffect(() => {
    if (!incomingCode || ownLink) return;
    try { localStorage.setItem(RIVALS_KEY, JSON.stringify(saved)); } catch { /* sem storage */ }
  }, [saved, incomingCode, ownLink]);

  // link de uma lista de times antiga não decodifica: some da comparação
  const rivals = useMemo(() => saved.flatMap((r) => {
    const picks = decodePicks(D, r.code);
    return picks ? [{ ...r, picks }] : [];
  }), [saved]);
  const incoming = incomingCode && !ownLink ? rivals.find((r) => r.code === incomingCode) ?? null : null;
  const [idx, setIdx] = useState(0);
  const rival = rivals[Math.min(idx, rivals.length - 1)] ?? null;
  const done = picksComplete(mine);
  const vs = useMemo(() => (done && rival ? comparePicks(mine, rival.picks) : null), [done, rival, mine]);

  const [myNick] = useState(() => cleanNick(getManager()?.nick));
  const [sign, setSign] = useState(true);
  const [copied, setCopied] = useState(false);
  const link = done ? shareUrl(`${MAJOR_PATH}?p=${encodePicks(D, mine)}`, SHARE_KIND, sign && myNick ? { de: myNick } : {}) : '';
  const text = fillText(t('chText'), { champ: teamName(mine.bracket[6]) });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(`${text}\n${link}`);
      trackShare(SHARE_KIND, 'copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* sem clipboard */ }
  };
  const postX = () => { if (link) postOnX(SHARE_KIND, text, link); }; // postOnX já conta o 'x'

  return { t, mine, incoming, ownLink, rivals, rival, pickRival: setIdx, vs, done, myNick, sign, setSign, copied, copy, postX };
}

/**
 * Faixa no topo do Pick'em quando o link aberto é de outra pessoa. No lugar do
 * aviso "você está vendo o palpite de outra pessoa".
 */
export function ChallengeBanner({ ch, viewing, onView, onBuild, onUse }: {
  ch: Challenge;
  /** a tela está mostrando o palpite do amigo (só leitura) */
  viewing: boolean;
  onView: () => void;
  onBuild: () => void;
  /** sem onUse (palpites já travados) o botão "Usar como meu" some */
  onUse?: () => void;
}) {
  const { t, incoming } = ch;
  if (ch.ownLink) {
    return (
      <Alert tone="info" action={viewing ? <Button size="sm" onClick={onBuild}>{t('backToMine')}</Button> : undefined}>
        {t('chOwnLink')}
      </Alert>
    );
  }
  if (!incoming) return null;
  const who = <strong className="mch-band__who">{incoming.nick || t('chFriend')}</strong>;
  const champ = teamName(incoming.picks.bracket[6]);
  const done = picksComplete(ch.mine);
  const sub = viewing ? t('chSubBuild') : done ? t('chSubReady') : t('chSubFinish');
  const build = () => {
    onBuild();
    if (done) requestAnimationFrame(scrollToVs);
  };
  return (
    <section className="mch-band" aria-label={t('chKicker')}>
      <Swords className="mch-band__icon" size={22} aria-hidden />
      <div className="mch-band__txt">
        <span className="mch-band__kicker">{t('chKicker')}</span>
        <p className="mch-band__head">
          {champ
            ? fill(t('chHead'), { who, champ: <strong className="mch-band__champ">{champ}</strong> })
            : fill(t('chHeadNoChamp'), { who })}
        </p>
        <p className="mch-band__sub">{sub}</p>
      </div>
      <div className="mch-band__actions">
        {viewing ? (
          <>
            <Button variant="primary" onClick={build}>{done ? t('chCompare') : t('chBuild')}</Button>
            {onUse && <Button variant="ghost" size="sm" onClick={onUse}>{t('useShared')}</Button>}
          </>
        ) : (
          <>
            {done && <Button variant="primary" onClick={scrollToVs}>{t('chSeeVs')}</Button>}
            <Button onClick={onView}>{t('chViewTheirs')}</Button>
          </>
        )}
      </div>
    </section>
  );
}

function Meter({ n, of }: { n: number; of: number }) {
  return (
    <span className="mch-meter" aria-hidden>
      {Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? 'is-on' : undefined} />)}
    </span>
  );
}

function TeamTags({ ids, none }: { ids: string[]; none: string }) {
  if (!ids.length) return <span className="mch-none">{none}</span>;
  return <span className="mch-tags">{ids.map((id) => <span key={id} className="mch-tag">{teamTag(id)}</span>)}</span>;
}

/** painel "Você x amigo": entra logo abaixo da chave, onde o palpite fecha */
export function ChallengeVs({ ch }: { ch: Challenge }) {
  const { t, rival, vs, mine } = ch;
  if (!rival) return null;
  const who = rival.nick || t('chFriendMid');
  const theirs = rival.picks;
  return (
    <Panel id={VS_ID} tabIndex={-1} className="mch-vs" title={fillText(t('vsTitle'), { who })} icon={<Swords size={16} />}>
      {ch.rivals.length > 1 && (
        <div className="msg-chips mch-switch" role="group" aria-label={t('chKicker')}>
          {ch.rivals.map((r, i) => (
            <button key={r.code} type="button" className={cx('msg-chip', r === rival && 'is-on')} aria-pressed={r === rival} onClick={() => ch.pickRival(i)}>
              {r.nick || fillText(t('chFriendN'), { n: String(i + 1) })}
            </button>
          ))}
        </div>
      )}
      {!vs ? <p className="msg-muted">{fillText(t('vsIncomplete'), { who })}</p> : (
        <div className="mch-vs__body">
          <div className="mch-vs__head">
            <div className="mch-champs">
              {([[t('vsYou'), vs.champion.a], [who, vs.champion.b]] as const).map(([label, id], i) => (
                <div key={i} className={cx('mch-champ', vs.champion.same && 'is-same')}>
                  <span className="mch-champ__who">{label}</span>
                  <span className="mch-champ__name"><Trophy size={16} aria-hidden />{teamName(id) || '—'}</span>
                </div>
              ))}
            </div>
            {vs.champion.a && vs.champion.b && (
              <Tag tone={vs.champion.same ? 'accent' : 'neutral'}>
                {vs.champion.same ? t('vsSameChamp') : t('vsDiffChamp')}
              </Tag>
            )}
            <p className="mch-total"><strong>{vs.qualified}<small>/24</small></strong> <span>{t('vsQualified')}</span></p>
          </div>

          <div className="mch-vs__detail">
            <ul className="mch-rows">
              {[0, 1, 2].map((i) => {
                // 3-0/0-3 são opcionais: só compara o tipo que os DOIS marcaram neste stage
                const ext = (['x30', 'x03'] as const).filter((k) => mine[k][i].length > 0 && theirs[k][i].length > 0);
                return (
                  <li key={i} className="mch-row">
                    <span className="mch-row__label">Stage {i + 1}</span>
                    <Meter n={vs.stage[i]} of={8} />
                    <span className={cx('mch-row__count', vs.stage[i] === 8 && 'is-full')}>{vs.stage[i]}/8</span>
                    {ext.length > 0 && (
                      <span className="mch-row__ext">
                        {ext.map((k) => (
                          <span key={k}>{t(k === 'x30' ? 'vs30' : 'vs03')}: <TeamTags ids={vs[k][i]} none={t('vsNone')} /></span>
                        ))}
                      </span>
                    )}
                  </li>
                );
              })}
              <li className="mch-row">
                <span className="mch-row__label">{t('vsSemis')}</span>
                <TeamTags ids={vs.semis} none={t('vsNone')} />
                <span className={cx('mch-row__count', vs.semis.length === 4 && 'is-full')}>{vs.semis.length}/4</span>
              </li>
              <li className="mch-row">
                <span className="mch-row__label">{t('vsFinal')}</span>
                <TeamTags ids={vs.final} none={t('vsNone')} />
                <span className={cx('mch-row__count', vs.final.length === 2 && 'is-full')}>{vs.final.length}/2</span>
              </li>
            </ul>

            {ch.myNick && (
              <label className="mch-sign">
                <input type="checkbox" checked={ch.sign} onChange={(e) => ch.setSign(e.target.checked)} />
                <span>{fill(t('chSign'), { nick: <strong>{ch.myNick}</strong> })}</span>
              </label>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * Barra "Desafiar de volta": fica no fim do Pick'em e gruda no pé da tela
 * (acima da tab bar do shell no celular) enquanto a página rola, então o
 * botão está à mão sem descer até o fim. Com palpite completo: com amigo guardado
 * mostra o placar "Você x amigo"; sem amigo, convida a desafiar o primeiro.
 */
export function ChallengeBar({ ch }: { ch: Challenge }) {
  const { t, vs, rival } = ch;
  if (!ch.done) return null;
  if (!vs || !rival) return <DareBar ch={ch} />;
  const who = rival.nick || t('chFriendMid');
  return (
    <div className="mch-bar" role="region" aria-label={t('chBack')}>
      <p className="mch-bar__sum">
        <span className="mch-bar__vs">{fillText(t('vsTitle'), { who })}</span>
        <span><strong>{vs.qualified}/24</strong> {t('vsQualified')}</span>
        {vs.champion.a && vs.champion.b && <span>{vs.champion.same ? t('vsSameChamp') : t('vsDiffChamp')}</span>}
      </p>
      <div className="mch-bar__actions">
        <Button variant="primary" className="mch-bar__go" icon={ch.copied ? <Check size={16} aria-hidden /> : <Swords size={16} aria-hidden />} onClick={ch.copy}>
          {ch.copied ? t('chCopied') : t('chBack')}
        </Button>
        <Button onClick={ch.postX}>{t('postX')}</Button>
      </div>
      <span className="ds-sr-only" role="status">{ch.copied ? t('chCopied') : ''}</span>
    </div>
  );
}

/** barra sem amigo guardado: o palpite está pronto, desafie o primeiro */
function DareBar({ ch }: { ch: Challenge }) {
  const { t } = ch;
  return (
    <div className="mch-bar" role="region" aria-label={t('chDare')}>
      <p className="mch-bar__sum">
        <span>{t('chDareSum')}</span>
        {ch.myNick && (
          <label className="mch-sign">
            <input type="checkbox" checked={ch.sign} onChange={(e) => ch.setSign(e.target.checked)} />
            <span>{fill(t('chSign'), { nick: <strong>{ch.myNick}</strong> })}</span>
          </label>
        )}
      </p>
      <div className="mch-bar__actions">
        <Button variant="primary" className="mch-bar__go" icon={ch.copied ? <Check size={16} aria-hidden /> : <Swords size={16} aria-hidden />} onClick={ch.copy}>
          {ch.copied ? t('chCopied') : t('chDare')}
        </Button>
        <Button onClick={ch.postX}>{t('postX')}</Button>
      </div>
      <span className="ds-sr-only" role="status">{ch.copied ? t('chCopied') : ''}</span>
    </div>
  );
}
