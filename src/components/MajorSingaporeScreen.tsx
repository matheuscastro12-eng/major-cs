// Modo MAJOR SINGAPORE 2026 — visual de evento/broadcast dentro do GameShell:
// Visão geral (hero com contagem regressiva, linha do tempo dos Stages e grid de
// cards por Stage), Previsões (pódio + linhas com barras) e Simular (campeão em
// destaque + chave). Lista única: src/data/major-singapore-2026.json. Previsões:
// scripts/major-singapore-predict.mts (1.000 simulações, pré-calculadas).
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Dices, LayoutGrid, ListOrdered, MapPin, Trophy, Users } from 'lucide-react';
import { ct } from '../state/career-i18n';
import { randomSeed, makeRng } from '../engine/rng';
import { buildField, simulateMajor, type MajorRun } from '../engine/majorSingapore';
import { MAJOR_SG_CONFIG, MAJOR_SG_DATASET } from '../engine/majorSingapore/data';
import { logoForTeam } from '../data/media';
import prediction from '../data/major-singapore-2026-prediction.json';
import { Button, Segmented, Tag } from './ds/index';
import { GameShell } from './ds/shell/GameShell';
import type { ShellNavGroup } from './ds/shell/types';
import { Flag, TeamBadge } from './ui';
import type { TeamSeason, Tournament } from '../types';
import { MajorErrorBoundary } from './MajorErrorBoundary';
import { majorCardData, postMajorCardOnX, shareMajorCard } from '../state/majorShareCard';
import { BO3_PHOTO_CREDIT, BO3_PHOTO_CREDIT_URL, BO3_PHOTOS_ON, bo3PhotoPath, initials, preloadPhotos } from '../data/bo3Photos';
import '../styles/major-singapore.css';

type View = 'geral' | 'previsoes' | 'simular';
type StageFilter = 'all' | '1' | '2' | '3';

const pct = (x: number | null | undefined) => (x == null ? '—' : `${x.toFixed(1)}%`);
// Início do Stage 1 (Singapura, UTC+8). Datas: HLTV / PGL.
const START = Date.parse('2026-11-24T10:00:00+08:00');
const STAGES = [
  { n: '1', name: 'Stage 1', dates: 'a partir de 24 nov', sub: 'Swiss de 16 · 3V avança, 3D cai · MD1 (MD3 em decisão)' },
  { n: '2', name: 'Stage 2', dates: 'data a confirmar (PGL)', sub: 'Swiss de 16 · 8 convidados + 8 do Stage 1' },
  { n: '3', name: 'Stage 3', dates: 'data a confirmar (PGL)', sub: 'Swiss de 16 · 8 convidados + 8 do Stage 2' },
  { n: '★', name: 'Champions Stage', dates: '10 – 13 dez', sub: 'Singapore Indoor Stadium · 8 times · MD3, final MD5' },
] as const;

// avatar do jogador: foto local do bo3.gg (flag) ou placeholder com iniciais
function PlayerAvatar({ nick, size = 28 }: { nick: string; size?: number }) {
  const [err, setErr] = useState(false);
  const p = bo3PhotoPath(nick);
  return p && !err
    ? <img className="msg-av" src={p} alt={nick} width={size} height={size} loading="lazy" onError={() => setErr(true)} />
    : <span className="msg-av msg-av--ph" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>{initials(nick)}</span>;
}

function useSmall() {
  const q = '(max-width: 767px)';
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setSmall(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return small;
}

function useCountdown(target: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, target - now);
  return { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, live: ms === 0 };
}

export function MajorSingaporeScreen({ onExit }: { onExit: () => void }) {
  return <MajorErrorBoundary onExit={onExit}><MajorSingaporeInner onExit={onExit} /></MajorErrorBoundary>;
}

function MajorSingaporeInner({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<View>('geral');
  const [stage, setStage] = useState<StageFilter>('all');
  const [run, setRun] = useState<MajorRun | null>(null);
  const field = useMemo(() => buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET), []);
  const src = useMemo(() => new Map<string, TeamSeason>(MAJOR_SG_DATASET.map((t) => [t.id, t])), []);
  const provisional = MAJOR_SG_CONFIG.listStatus !== 'oficial';
  const nProv = MAJOR_SG_CONFIG.teams.filter((t) => t.provisional).length;
  const guessByStage = (s: number) => MAJOR_SG_CONFIG.teams.filter((t) => t.stageGuess && t.stage === s).length;
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const cd = useCountdown(START);
  const small = useSmall();

  const badge = (id: string, size = 24) => {
    const t = src.get(id);
    if (!t) return <span className="msg-nobadge" style={{ width: size, height: size }} title={ct('Sem dados no bo3.gg')}>?</span>;
    return <TeamBadge tag={t.tag} colors={t.colors as [string, string]} size={size} logoUrl={t.logoUrl ?? logoForTeam(t)} />;
  };
  const nameOf = (id: string) => src.get(id)?.team ?? id;
  const isProv = (id: string) => field.provisional.has(id);
  const isGuess = (id: string) => field.stageGuess.has(id);
  const GUESS_TIP = ct('Vaga praticamente garantida, mas o Stage de entrada é palpite (ranking VRS) até a lista oficial de 02/11');
  const provDot = (id: string) => (isProv(id)
    ? <span className="msg-provdot" title={ct('Vaga provisória (ranking) até a lista oficial de 02/11')} aria-label={ct('vaga provisória')} />
    : isGuess(id) ? <span className="msg-guess" title={GUESS_TIP}>{ct('Stage palpite')}</span> : null);

  const cardData = () => majorCardData(run!, (id) => { const t = src.get(id); return t && { name: t.team, tag: t.tag, colors: t.colors as [string, string], players: rosterOf(id).map((p) => p.nick) }; });
  const simulate = () => {
    setShareMsg(null);
    const r = simulateMajor(field, makeRng(randomSeed()));
    preloadPhotos(rosterOf(r.championId).map((p) => p.nick)); // pro card em canvas
    setRun(r); setView('simular');
  };

  const nav: ShellNavGroup[] = [
    { id: 'evento', label: ct('Evento'), items: [
      { id: 'geral', label: ct('Visão geral'), icon: LayoutGrid },
      { id: 'previsoes', label: ct('Previsões'), icon: ListOrdered },
      { id: 'simular', label: ct('Simular o Major'), icon: Dices },
    ] },
  ];

  const rows = prediction.teams.filter((t) => stage === 'all' || String(t.entryStage) === stage).sort((a, b) => b.title - a.title || b.playoffs - a.playoffs);
  const podium = prediction.teams.slice(0, 3);
  const playoffs = run?.stages[3];
  const series = (label: string) => playoffs?.history.filter((h) => h.pairing.label.startsWith(label)) ?? [];
  const stageTable = (t: Tournament) => [...t.teams].sort((a, b) => (a.status === 'advanced' ? 0 : 1) - (b.status === 'advanced' ? 0 : 1) || b.wins - a.wins || a.losses - b.losses);

  const rosterOf = (id: string) => {
    const subs = (MAJOR_SG_CONFIG.standIns ?? []).filter((x) => x.bo3Id === id);
    return (src.get(id)?.players ?? []).map((p) => subs.find((x) => x.out === p.nick)?.in ?? p).slice(0, 5);
  };
  const teamCard = (id: string) => {
    const t = src.get(id);
    return (
      <li key={id} className={`msg-tcard${isProv(id) ? ' is-prov' : isGuess(id) ? ' is-guess' : ''}`} title={isProv(id) ? ct('Vaga provisória (ranking) até a lista oficial de 02/11') : isGuess(id) ? GUESS_TIP : undefined}>
        <span className="msg-tcard__logo">{badge(id, small ? 40 : 56)}</span>
        <span className="msg-tcard__name">{nameOf(id)}</span>
        <span className="msg-tcard__meta">{t?.country && <Flag cc={t.country} />}{t?.tag}{provDot(id)}</span>
        <span className="msg-tcard__roster">
          {rosterOf(id).map((p) => (
            <span key={p.nick} className="msg-tcard__pl" title={p.name ? `${p.nick} · ${p.name}` : p.nick}>
              <PlayerAvatar nick={p.nick} size={small ? 24 : 30} />
              <span className="msg-tcard__nick">{p.nick}</span>
            </span>
          ))}
        </span>
      </li>
    );
  };

  const bar = (v: number | null | undefined, gold = false) => (
    <span className={`msg-bar${gold ? ' is-gold' : ''}`}><i style={{ width: `${Math.min(100, v ?? 0)}%` }} /></span>
  );

  const timeline = (
      <ol className="msg-tl" aria-label={ct('Formato do Major')}>
              {STAGES.map((s) => (
                <li key={s.name} className={s.n === '★' ? 'is-final' : ''}>
                  <span className="msg-tl__n">{s.n}</span>
                  <span className="msg-tl__name">{s.name}</span>
                  <span className="msg-tl__dates">{s.dates}</span>
                  <span className="msg-tl__sub">{ct(s.sub)}</span>
                </li>
              ))}
            </ol>
  );

  return (
    <GameShell
      mode="majorsg"
      identity={{ title: 'Singapore', subtitle: 'PGL · 24/11 – 13/12', badge: <Trophy size={18} aria-hidden /> }}
      nav={nav}
      active={view}
      onNav={(id) => setView(id as View)}
      title={view === 'geral' ? ct('Visão geral') : view === 'previsoes' ? ct('Previsões') : ct('Simular o Major')}
      meta={provisional ? <Tag tone="neutral">{ct('Lista provisória')}</Tag> : <Tag tone="win">{ct('Lista oficial')}</Tag>}
      next={{ label: ct('Simular'), detail: ct('Major inteiro · 32 times'), icon: Dices, onGo: simulate }}
      mobileNav={['geral', 'previsoes', 'simular']}
      history={{ back: onExit, canBack: true }}
    >
      <div className="msg">
        {view === 'geral' && (
          <>
            <header className="msg-ev">
              <div className="msg-ev__main">
                <span className="msg-ev__kicker"><Trophy size={14} aria-hidden /> CS2 Major · PGL</span>
                <h1 className="msg-ev__title">PGL Major<br /><em>Singapore 2026</em></h1>
                <ul className="msg-ev__facts">
                  <li><CalendarDays size={16} aria-hidden /> 24 nov – 13 dez</li>
                  <li><MapPin size={16} aria-hidden /> Singapura</li>
                  <li><Users size={16} aria-hidden /> 32 times</li>
                  <li><Trophy size={16} aria-hidden /> US$ 1.250.000</li>
                </ul>
                <div className="msg-ev__cta">
                  <Button variant="primary" size="lg" onClick={simulate}>{ct('Começar o Major')}</Button>
                  <Button variant="secondary" size="lg" onClick={() => setView('previsoes')}>{ct('Ver previsões')}</Button>
                </div>
              </div>
              <div className="msg-cd" aria-label={ct('Contagem regressiva para o Stage 1')}>
                <span className="msg-cd__lab">{cd.live ? ct('Em andamento') : ct('Stage 1 começa em')}</span>
                <div className="msg-cd__nums">
                  {[[cd.d, ct('dias')], [cd.h, ct('horas')], [cd.m, ct('min')]].map(([v, l]) => (
                    <span key={l as string} className="msg-cd__unit"><b>{String(v).padStart(2, '0')}</b><small>{l}</small></span>
                  ))}
                </div>
                <span className="msg-cd__foot">24/11 · Singapura</span>
              </div>
            </header>

            {timeline}

            {([3, 2, 1] as const).map((s) => {
              const ids = (s === 1 ? field.s1 : s === 2 ? field.s2 : field.s3).map((t) => t.id);
              const info = STAGES[s - 1];
              return (
                <section key={s} className="msg-sec">
                  <header className="msg-sec__head">
                    <span className="msg-sec__n">{s}</span>
                    <div>
                      <h2 className="msg-sec__title">Stage {s}</h2>
                      <p className="msg-sec__sub">{info.dates} · {ct(info.sub)}</p>
                    </div>
                    {provisional && (s === 1 || guessByStage(s) > 0) && (
                      <p className="msg-sec__note">
                        {s === 1 && <><span className="msg-provdot" aria-hidden /> {nProv} {ct('vagas provisórias pelo ranking')}{guessByStage(s) ? ' · ' : ''}</>}
                        {guessByStage(s) > 0 && <>{guessByStage(s)} {guessByStage(s) === 1 ? ct('time com Stage palpite') : ct('times com Stage palpite')}</>}
                        {' '}{ct('até a lista oficial (02/11)')}
                      </p>
                    )}
                  </header>
                  <ul className="msg-grid">{ids.map(teamCard)}</ul>
                </section>
              );
            })}
            {BO3_PHOTOS_ON && <p className="msg-credit"><a href={BO3_PHOTO_CREDIT_URL} target="_blank" rel="noopener">{BO3_PHOTO_CREDIT}</a></p>}
          </>
        )}

        {view === 'previsoes' && (
          <>
            <header className="msg-phead">
              <div>
                <span className="msg-ev__kicker"><ListOrdered size={14} aria-hidden /> {ct('Previsões')}</span>
                <h1 className="msg-phead__title">{ct('Quem levanta o troféu?')}</h1>
                <p className="msg-sec__sub">{prediction.sims.toLocaleString('pt-BR')} {ct('simulações do Major inteiro com os elencos atuais')}{provisional ? ` · ${ct('lista provisória')}` : ''}</p>
              </div>
            </header>
            <ol className="msg-podium">
              {podium.map((t, i) => (
                <li key={t.id} className={`msg-pod is-${i + 1}`}>
                  <span className="msg-pod__rank">{i + 1}</span>
                  {badge(t.id, 64)}
                  <span className="msg-pod__name">{t.team}</span>
                  <b className="msg-pod__pct">{pct(t.title)}</b>
                  <small className="msg-pod__lab">{ct('chance de título')}</small>
                </li>
              ))}
            </ol>
            <section className="msg-sec">
              <header className="msg-sec__head msg-sec__head--row">
                <h2 className="msg-sec__title">{ct('Chances por time')}</h2>
                <Segmented<StageFilter>
                  label={ct('Filtrar por Stage de entrada')}
                  value={stage}
                  onChange={setStage}
                  items={[{ value: 'all', label: ct('Todos') }, { value: '3', label: 'S3' }, { value: '2', label: 'S2' }, { value: '1', label: 'S1' }]}
                />
              </header>
              <div className="msg-odds">
                <div className="msg-odds__h" aria-hidden>
                  <span>#</span><span>{ct('Time')}</span><span>{ct('Passa S1')}</span><span>{ct('Passa S2')}</span><span>{ct('Playoffs')}</span><span>{ct('Final')}</span><span>{ct('Título')}</span>
                </div>
                <ol>
                  {rows.map((r, i) => (
                    <li key={r.id} className="msg-odds__r">
                      <span className="msg-odds__rank">{i + 1}</span>
                      <span className="msg-odds__team">{badge(r.id, 32)}<span><b>{r.team}</b><small>Stage {r.entryStage}{provDot(r.id)}</small></span></span>
                      {(['passStage1', 'passStage2', 'playoffs', 'final', 'title'] as const).map((k) => (
                        <span key={k} className={`msg-odds__c msg-odds__c--${k}`} data-lab={k === 'title' ? ct('Título') : k === 'playoffs' ? ct('Playoffs') : undefined}>
                          {r[k] == null ? <span className="msg-dim">—</span> : <>{bar(r[k], k === 'title')}<b>{pct(r[k])}</b></>}
                        </span>
                      ))}
                    </li>
                  ))}
                </ol>
              </div>
              <p className="msg-foot">{prediction.sims.toLocaleString('pt-BR')} {ct('simulações')} · seed {prediction.seed} · {prediction.generatedFrom}</p>
            </section>
          </>
        )}

        {view === 'simular' && !run && (
          <section className="msg-ev msg-ev--empty">
            <div className="msg-ev__main">
              <span className="msg-ev__kicker"><Dices size={14} aria-hidden /> {ct('Simular o Major')}</span>
              <h1 className="msg-ev__title">{ct('Do Stage 1 ao')}<br /><em>{ct('troféu')}</em></h1>
              <p className="msg-sec__sub">{ct('Roda o Major inteiro com os elencos atuais. Cada simulação é diferente.')}</p>
              <div className="msg-ev__cta"><Button variant="primary" size="lg" onClick={simulate}>{ct('Simular o Major inteiro')}</Button></div>
            </div>
          </section>
        )}
        {view === 'simular' && !run && (
          timeline
        )}

        {view === 'simular' && run && playoffs && (
          <>
            <section className="msg-champ">
              <span className="msg-champ__logo">{badge(run.championId, small ? 80 : 112)}</span>
              <div className="msg-champ__txt">
                <span className="msg-ev__kicker msg-ev__kicker--gold"><Trophy size={14} aria-hidden /> {ct('Campeão do PGL Major Singapore 2026')}</span>
                <h2 className="msg-champ__name">{nameOf(run.championId)}</h2>
                <p className="msg-champ__final">
                  {ct('Final')}: {run.finalists.map(nameOf).join(' × ')}
                  {series('FINAL')[0]?.pairing.result && <b> {series('FINAL')[0].pairing.result!.mapScore.join(' – ')}</b>}
                </p>
              </div>
              <div className="msg-champ__act">
                <Button variant="primary" size="lg" onClick={simulate}>{ct('Simular de novo')}</Button>
                <Button variant="secondary" onClick={() => void shareMajorCard(cardData()).then((r) => setShareMsg(r === 'shared' ? ct('Compartilhado!') : ct('Imagem baixada e texto copiado.')))}>{ct('Compartilhar chave')}</Button>
                <Button variant="ghost" onClick={() => { window.open(postMajorCardOnX(cardData()), '_blank', 'noopener'); setShareMsg(ct('Imagem baixada: anexe no post do X.')); }}>{ct('Postar no X')}</Button>
                {shareMsg && <span className="msg-champ__msg" role="status">{shareMsg}</span>}
              </div>
            </section>

            <section className="msg-sec">
              <header className="msg-sec__head"><span className="msg-sec__n">★</span><div><h2 className="msg-sec__title">Champions Stage</h2><p className="msg-sec__sub">10 – 13 dez · Singapore Indoor Stadium</p></div></header>
              <div className="msg-bracket">
                {[['QF', ct('Quartas')], ['SF', ct('Semifinal')], ['FINAL', ct('Final')]].map(([lab, title]) => (
                  <div key={lab} className={`msg-bracket__col msg-bracket__col--${lab.toLowerCase()}`}>
                    <h3 className="msg-bracket__h">{title}</h3>
                    {series(lab).map(({ pairing: p }) => {
                      const r = p.result!;
                      return (
                        <div key={p.label} className="msg-series">
                          {[0, 1].map((side) => {
                            const id = side === 0 ? p.a : p.b;
                            return (
                              <div key={id} className={`msg-series__row${r.winner === side ? ' is-win' : ''}`}>
                                {badge(id, 24)}<span className="msg-series__name">{nameOf(id)}</span><b>{r.mapScore[side]}</b>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>

            <div className="msg-results">
              {run.stages.slice(0, 3).reverse().map((t, i) => (
                <section key={t.name} className="msg-sec">
                  <header className="msg-sec__head"><span className="msg-sec__n">{3 - i}</span><div><h2 className="msg-sec__title">Stage {3 - i}</h2><p className="msg-sec__sub">{ct('8 avançam')}</p></div></header>
                  <ul className="msg-res">
                    {stageTable(t).map((x) => (
                      <li key={x.id} className={x.status === 'advanced' ? 'is-adv' : 'is-out'}>
                        {badge(x.id, 24)}<span className="msg-series__name">{nameOf(x.id)}</span><b>{x.wins}–{x.losses}</b>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </GameShell>
  );
}
