import { useMemo, useRef, useState } from 'react';
import { RtpFrame } from './RtpFrame';
import { ct } from '../../state/career-i18n';
import { MAP_LABELS, type MapId } from '../../types';
import { applyMatchOutcome, type MatchPrep, type ProMatchResult, type MatchConsequence } from '../../engine/rtp/matchSim';
import { prepareCircuitMatch, finishCircuitMatch, concludeCircuitRound, type EventEnd } from '../../engine/rtp/circuit';
import { prepareMajorMatch, finishMajorMatch, concludeMajorRound } from '../../engine/rtp/major';
import type { SeasonEndResult } from '../../engine/rtp/league';
import type { MomentOutcome } from '../../engine/rtp/moments';
import type { GamePlan } from '../../engine/rtp/meta';
import { atmoCloser, atmoStageOf } from '../../engine/rtp/atmosphere';
import { RtpRoundRoom } from './RtpRoundRoom';
import { RtpInterview } from './RtpInterview';
import { applyInterviewOutcome, type InterviewAnswer } from '../../engine/rtp/interview';
import { RtpPrematch } from './RtpPrematch';
import { Scoreboard } from '../Scoreboard';
import { RtpIcon } from './RtpIcon';
import { traitById } from '../../engine/rtp/perks';
import type { RoadToProSave } from '../../engine/rtp/types';

type Phase = 'intro' | 'moments' | 'result';
export type MatchMode = 'league' | 'major';

export function RTPMatch({ save, onDone, onExit, mode = 'league' }: {
  save: RoadToProSave;
  onDone: (next: RoadToProSave, seasonEnd?: SeasonEndResult, eventEnd?: EventEnd) => void;
  onExit: () => void;
  mode?: MatchMode;
}) {
  const prep = useState<MatchPrep | null>(() => (mode === 'major' ? prepareMajorMatch(save) : prepareCircuitMatch(save)))[0];
  const [phase, setPhase] = useState<Phase>('intro');
  const [outcomes, setOutcomes] = useState<MomentOutcome[]>([]);
  // v17: mapas como a Sala exibiu — o card oficial usa exatamente estes placares.
  const liveMapsRef = useRef<{ map: MapId; score: [number, number]; won: boolean }[] | null>(null);
  // Escolhas de pré-jogo (META): plano de jogo + mapas vetados.
  const [plan, setPlan] = useState<GamePlan>('default');
  const [vetoedMaps, setVetoedMaps] = useState<{ map: MapId; pickedBy: 0 | 1 | -1 }[] | null>(null);

  // prep enriquecido com as escolhas do pré-jogo (mapas vetados + plano). É o que
  // a Sala e o finish consomem — a vantagem do veto flui pelo mapPrefs do herói.
  const matchPrep = useMemo<MatchPrep | null>(
    () => (prep ? { ...prep, maps: vetoedMaps ?? prep.maps, plan } : null),
    [prep, vetoedMaps, plan],
  );

  // Resultado da série + a série orientada ao bracket (pairing/match) pra gravar.
  const finished = useMemo(() => {
    if (phase !== 'result' || !matchPrep) return null;
    if (mode === 'major') { const r = finishMajorMatch(save, matchPrep, outcomes, liveMapsRef.current ?? undefined); return { result: r.result, write: r.pairingResult }; }
    const r = finishCircuitMatch(save, matchPrep, outcomes, liveMapsRef.current ?? undefined);
    return { result: r.result, write: r.matchResult };
  }, [phase, save, matchPrep, outcomes, mode]);
  const result: ProMatchResult | null = finished?.result ?? null;

  // Respostas dadas na entrevista pós-jogo (iter46): a consequência (fama/
  // seguidores/manchete que cita a fala) é aplicada AQUI, no CTA de concluir —
  // a resposta é conhecida antes do CTA, e o conclude é a única mutação de save
  // do fluxo jogado. Pular a entrevista deixa o array vazio = neutro.
  const itvAnswers = useRef<InterviewAnswer[]>([]);

  const conclude = () => {
    if (!result || !finished?.write || !matchPrep) return;
    // No Major a premiação vem da resolução do torneio — sem prêmio por-série lá.
    const { save: afterOutcome } = applyMatchOutcome(save, result, { leaguePrize: mode !== 'major' });
    // Entrevista: pequena e honesta, DEPOIS do outcome (a manchete da fala entra
    // por cima da manchete do jogo no feed). Nada de prêmio/RP/dificuldade.
    const afterItv = applyInterviewOutcome(afterOutcome, itvAnswers.current, {
      matchSeed: matchPrep.matchSeed, won: result.won, rival: (matchPrep.grudge ?? 0) > 0,
      nick: save.player.nick, oppTag: result.oppTag,
      rivalNick: save.media?.rival?.playerNick ?? null,
    });
    if (mode === 'major') {
      const { save: next } = concludeMajorRound(afterItv, finished.write);
      onDone(next);
    } else {
      const { save: next, seasonEnd, eventEnd } = concludeCircuitRound(afterItv, finished.write);
      onDone(next, seasonEnd, eventEnd);
    }
  };

  // Sair no meio da Sala descarta os beats já jogados (a série recomeça do zero
  // na volta) — guarda de confirmação SÓ nessa fase; intro/result saem direto.
  const guardedExit = () => {
    if (phase === 'moments' && !window.confirm(ct('Sair da série agora? O progresso desta partida será perdido.'))) return;
    onExit();
  };

  if (!prep) {
    return (
      <RtpFrame onExit={onExit}>
        <div className="rtp-soon" style={{ padding: 24 }}>{ct('Sem partida pendente.')}</div>
        <div className="rtp-footer-actions"><button type="button" className="rtp-btn-ghost" onClick={onExit}>{ct('Voltar')}</button></div>
      </RtpFrame>
    );
  }

  return (
    <RtpFrame onExit={guardedExit} kicker={mode === 'major' ? ct('MAJOR') : undefined}>
      {phase === 'intro' && (
        <RtpPrematch
          save={save}
          prep={prep}
          major={mode === 'major'}
          onReady={(pl, maps) => { setPlan(pl); setVetoedMaps(maps); setPhase('moments'); }}
          onExit={onExit}
        />
      )}

      {phase === 'moments' && matchPrep && (
        <RtpRoundRoom
          save={save}
          prep={matchPrep}
          major={mode === 'major'}
          onComplete={(outs, maps) => { setOutcomes(outs); liveMapsRef.current = maps ?? null; setPhase('result'); }}
        />
      )}

      {phase === 'result' && result && matchPrep && (
        <Result save={save} result={result} onConclude={conclude} mode={mode}
          matchSeed={matchPrep.matchSeed} grudge={(matchPrep.grudge ?? 0) > 0}
          onInterviewAnswer={(a) => { itvAnswers.current = [...itvAnswers.current, a]; }} />
      )}
    </RtpFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultado: placar + linha do protagonista + scoreboard dos 10

function Result({ save, result, onConclude, mode, matchSeed, grudge, onInterviewAnswer }: {
  save: RoadToProSave; result: ProMatchResult; onConclude: () => void; mode: MatchMode;
  matchSeed: number; grudge: boolean; onInterviewAnswer: (a: InterviewAnswer) => void;
}) {
  const conseq = useMemo<MatchConsequence>(() => applyMatchOutcome(save, result, { leaguePrize: mode !== 'major' }).consequence, [save, result, mode]);
  const hero = result.userRows.find((r) => r.isHero);
  // Fechamento de ATMOSFERA (iter41): a arena reage ao veredito — tier-aware e
  // determinístico. "Apertada" = série no decider ou mapa decidido no detalhe.
  const tight = (result.maps.length > 1 && Math.abs(result.mapScore[0] - result.mapScore[1]) === 1)
    || result.maps.some((m) => Math.abs(m.score[0] - m.score[1]) <= 2);
  const closer = atmoCloser(atmoStageOf(save, mode === 'major'), result.won, tight,
    `${save.world.season}:${save.world.week}:${result.oppTag}`);

  return (
    <div className="rtp-result">
      <div className={`rtp-result-banner ${result.won ? 'win' : 'loss'}`}>
        <div className="rtp-result-verdict">{result.won ? ct('VITÓRIA') : ct('DERROTA')}</div>
        <div className="rtp-result-score">
          <span className="rtp-result-tag you">{save.team.tag}</span>
          {result.mapScore[0]} — {result.mapScore[1]}
          <span className="rtp-result-tag">{result.oppTag}</span>
        </div>
        <div className="rtp-result-maps">
          {result.maps.map((m, i) => (
            <span key={i} className={`rtp-result-map ${m.won ? 'w' : 'l'}`}>
              {MAP_LABELS[m.map] ?? m.map} {m.score[0]}-{m.score[1]}
            </span>
          ))}
        </div>
        {result.mvp && <div className="rtp-mvp"><RtpIcon name="fame" size={14} /> MVP</div>}
      </div>

      {/* a arena reage ao resultado — fechamento de atmosfera */}
      <p className={`rtp-result-atmo ${result.won ? 'w' : 'l'}`}>{closer}</p>

      {/* Sua linha */}
      <div className="rtp-hero-line">
        <div className="rtp-hero-line-rating" style={{ color: ratingColor(result.heroRating) }}>{result.heroRating.toFixed(2)}</div>
        <div className="rtp-hero-line-meta">
          <b>{hero?.nick}</b> · {hero?.kills}–{hero?.deaths} · {hero?.adr} ADR<br />
          <span className="rtp-soon" style={{ fontSize: '0.74rem' }}>{ct('Sua avaliação na série (rating 3.0)')}</span>
        </div>
      </div>

      {/* A DIFERENÇA QUE VOCÊ FEZ — decisões + EXECUÇÃO nos minigames = boost real */}
      {(() => {
        const decide = (result.momentScore - 0.5) * 18;
        const exec = result.execAvg != null ? (result.execAvg - 0.55) * 10 : 0;
        const carry = Math.round((decide + exec) * 10) / 10;
        const verb = carry >= 1.5 ? ct('carregou o time') : carry <= -1.5 ? ct('pesou contra') : ct('jogou na média');
        return (
          <div className={`rtp-diff ${carry >= 0 ? 'up' : 'down'}`}>
            <div className="rtp-diff-big">{carry > 0 ? '+' : ''}{carry.toFixed(1)}<i>OVR</i></div>
            <div className="rtp-diff-txt">
              <b>{ct('A diferença que você fez')}</b><br />
              {ct('Suas decisões nos momentos-chave')} {verb} — {ct('série')} {result.won ? ct('vencida') : ct('perdida')} {result.mapScore[0]}–{result.mapScore[1]}.
              <span className="rtp-diff-break">
                {ct('Decisões')} {decide >= 0 ? '+' : ''}{decide.toFixed(1)}
                {result.execAvg != null && <> · {ct('Execução (minigames)')} <b className={exec >= 0 ? 'up' : 'down'}>{Math.round(result.execAvg * 100)}% ({exec >= 0 ? '+' : ''}{exec.toFixed(1)})</b></>}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Subiu de nível / conquistou trait — recompensa da progressão RPG */}
      {(conseq.leveledUp > 0 || conseq.newTraits.length > 0) && (
        <div className="rtp-levelup">
          {conseq.leveledUp > 0 && (
            <div className="rtp-levelup-lv">
              <RtpIcon name="arrowUp" size={18} />
              <b>{ct('NÍVEL')} {conseq.newLevel}</b>
              <span>+{conseq.leveledUp} {conseq.leveledUp > 1 ? ct('níveis') : ct('nível')} · +{conseq.leveledUp} {ct('ponto(s) de perk')}</span>
            </div>
          )}
          {conseq.newTraits.length > 0 && (
            <div className="rtp-levelup-traits">
              {conseq.newTraits.map((id) => (
                <span key={id} className="rtp-levelup-trait"><RtpIcon name="spark" size={13} /> {ct('Novo trait')}: <b>{traitById(id)?.label ?? id}</b></span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scoreboard idêntico ao da Carreira (Rating 3.0, KAST, ADR, POTM…) */}
      <div className="rtp-scoreboard-wrap">
        <Scoreboard series={result.series} teams={[result.userTeam, result.oppTeam]} />
      </div>

      {/* Consequências */}
      <div className="dash-card" style={{ marginTop: 12 }}>
        <header className="dash-card-head"><b>{ct('Depois da partida')}</b></header>
        <div className="dash-card-body">
          {conseq.headline && (
            <div className="rtp-debrief-headline">
              <span className="rtp-debrief-kicker">{ct('IMPRENSA')}</span> “{conseq.headline}”
            </div>
          )}
          <div className="rtp-cond-chips">
            {conseq.deltas.map((d, i) => <span key={i} className="rtp-feedback-chip">{d.label} {d.value}</span>)}
          </div>
        </div>
      </div>

      {/* ENTREVISTA PÓS-JOGO (iter44/iter46): a imprensa te alcança na saída do
          palco. Só em partidas JOGADAS (o simular não pisa no palco) e 100%
          opcional — o CTA de concluir segue sempre visível logo abaixo. O tom
          escolhido sobe via onAnswer e vira consequência real no conclude. */}
      <RtpInterview save={save} result={result} major={mode === 'major'} matchSeed={matchSeed} grudge={grudge}
        onAnswer={onInterviewAnswer} />

      {/* CTA coerente com o que acontece de verdade: no Major a rodada NÃO gasta
          semana (só o circuito avança o calendário). */}
      <button type="button" className="rtp-cta rtp-advance" onClick={onConclude}>
        {mode === 'major' ? ct('Continuar no Major') : ct('Concluir semana')} →
      </button>
    </div>
  );
}

function ratingColor(r: number): string {
  if (r >= 1.25) return 'var(--rtp-win)';
  if (r >= 1.0) return '#a3d860';
  if (r >= 0.85) return 'var(--rtp-warn)';
  return 'var(--rtp-loss)';
}
