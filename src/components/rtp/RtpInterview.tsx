import { useMemo, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { RtpIcon } from './RtpIcon';
import {
  buildInterview, repercussion, interviewCloser, interviewFx, interviewBackfires,
  TONE_LABELS,
  type InterviewAnswer, type InterviewFx, type InterviewFxCtx,
} from '../../engine/rtp/interview';
import type { ProMatchResult } from '../../engine/rtp/matchSim';
import type { RoadToProSave } from '../../engine/rtp/types';

// RTP iter44 — ENTREVISTA PÓS-JOGO (UI): segmento OPCIONAL do resultado.
// Nunca bloqueia o "Concluir semana": o CTA principal segue renderizado abaixo,
// e "Pular entrevista" encerra a cena a qualquer momento.
//
// iter46 — o tom agora tem consequência REAL: cada resposta mostra o saldo
// mecânico (+fama/seguidores, ou o backfire do provocador), e as respostas
// sobem pro RTPMatch via onAnswer — o applyInterviewOutcome roda no CTA de
// concluir. Pular continua neutro: sem bônus, sem risco.

interface Given { answer: InterviewAnswer; reaction: string }

// Saldo mecânico legível de um InterviewFx — "+2 fama · +320 seguidores".
function fxLine(fx: InterviewFx): string {
  const parts = [
    `${fx.fame > 0 ? '+' : ''}${fx.fame} ${ct('fama')}`,
    `${fx.followers > 0 ? '+' : ''}${fx.followers.toLocaleString('pt-BR')} ${ct('seguidores')}`,
  ];
  if (fx.fans !== 0) parts.push(`${fx.fans > 0 ? '+' : ''}${fx.fans} ${ct('torcida')}`);
  if (fx.rivalHeat > 0) parts.push(`+${fx.rivalHeat} ${ct('rivalidade')}`);
  return parts.join(' · ');
}

export function RtpInterview({ save, result, major, matchSeed, grudge, onAnswer }: {
  save: RoadToProSave;
  result: ProMatchResult;
  major: boolean;
  matchSeed: number;
  grudge: boolean;
  onAnswer?: (a: InterviewAnswer) => void; // sobe pro RTPMatch → applyInterviewOutcome no CTA
}) {
  const itv = useMemo(
    () => buildInterview(save, result, { major, matchSeed, grudge }),
    [save, result, major, matchSeed, grudge],
  );
  const fxCtx = useMemo<InterviewFxCtx>(() => ({
    matchSeed, won: result.won, rival: grudge,
    nick: save.player.nick, oppTag: result.oppTag,
    rivalNick: save.media?.rival?.playerNick ?? null,
  }), [matchSeed, result, grudge, save]);
  const [given, setGiven] = useState<Given[]>([]);
  const [skipped, setSkipped] = useState(false);

  if (skipped) {
    return (
      <div className="rtp-itv rtp-itv-skipped">
        <span className="rtp-itv-kicker">{itv.press ? ct('COLETIVA') : ct('ZONA MISTA')}</span>
        <span className="rtp-itv-skipnote">{ct('Você passou direto pela imprensa — sem declarações, sem bônus, sem risco.')}</span>
      </div>
    );
  }

  const done = given.length >= itv.questions.length;
  const current = done ? null : itv.questions[given.length];

  const answer = (a: InterviewAnswer) => {
    const qIndex = given.length;
    const reaction = repercussion(a.tone, {
      matchSeed, qIndex, won: result.won, rival: grudge,
      rivalNick: save.media?.rival?.playerNick ?? null, press: itv.press,
      backfired: a.tone === 'provocative' && interviewBackfires(fxCtx),
    });
    setGiven((g) => [...g, { answer: a, reaction }]);
    onAnswer?.(a);
  };

  // Saldo FINAL aplicado no concluir — na coletiva prevalece o tom mais forte.
  const finalFx = done ? interviewFx(given.map((g) => g.answer), fxCtx) : null;

  return (
    <div className={`rtp-itv ${itv.press ? 'press' : ''}`}>
      <header className="rtp-itv-head">
        <span className="rtp-itv-kicker">
          <RtpIcon name="fame" size={12} /> {itv.press ? ct('COLETIVA DE IMPRENSA') : ct('ENTREVISTA RELÂMPAGO')}
        </span>
        <span className="rtp-itv-setting">{itv.setting}</span>
      </header>

      {/* Perguntas já respondidas: pergunta + sua fala + repercussão real */}
      {given.map((g, i) => (
        <div key={i} className="rtp-itv-block answered">
          <p className="rtp-itv-q"><b>{itv.questions[i].reporter}</b> — “{itv.questions[i].question}”</p>
          <p className="rtp-itv-said">
            <span className={`rtp-itv-tone t-${g.answer.tone}`}>{ct(TONE_LABELS[g.answer.tone])}</span>
            “{g.answer.text}”
          </p>
          <p className="rtp-itv-rep"><RtpIcon name="spark" size={11} /> {g.reaction}</p>
        </div>
      ))}

      {/* Pergunta atual + 3 respostas (o jogo é escolher o tom) */}
      {current && (
        <div className="rtp-itv-block">
          {itv.press && <span className="rtp-itv-count">{ct('Pergunta')} {given.length + 1}/{itv.questions.length}</span>}
          <p className="rtp-itv-q"><b>{current.reporter}</b> — “{current.question}”</p>
          <div className="rtp-itv-answers">
            {current.answers.map((a) => (
              <button key={a.tone} type="button" className={`rtp-itv-answer t-${a.tone}`} onClick={() => answer(a)}>
                <span className={`rtp-itv-tone t-${a.tone}`}>
                  {ct(TONE_LABELS[a.tone])}{a.echo && <i className="rtp-itv-echo" title={ct('No seu estilo')}>★</i>}
                </span>
                “{a.text}”
              </button>
            ))}
          </div>
        </div>
      )}

      {done && (
        <>
          {finalFx && (
            <p className={`rtp-itv-fx ${finalFx.backfired ? 'bad' : ''}`}>
              <RtpIcon name={finalFx.backfired ? 'fire' : 'fame'} size={11} />
              {itv.press && given.length > 1 && <>{ct('Saldo da coletiva (tom mais forte prevalece)')}: </>}
              {fxLine(finalFx)} · {ct('a manchete sai amanhã')}
            </p>
          )}
          <p className="rtp-itv-closer">{interviewCloser(itv.press, matchSeed)}</p>
        </>
      )}
      {!done && (
        <button type="button" className="rtp-btn-ghost rtp-itv-skip" onClick={() => setSkipped(true)}>
          {ct('Pular entrevista')}
        </button>
      )}
    </div>
  );
}
