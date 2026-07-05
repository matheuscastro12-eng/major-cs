import { useMemo, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { RtpIcon } from './RtpIcon';
import {
  buildInterview, repercussion, interviewCloser, TONE_LABELS,
  type InterviewAnswer,
} from '../../engine/rtp/interview';
import type { ProMatchResult } from '../../engine/rtp/matchSim';
import type { RoadToProSave } from '../../engine/rtp/types';

// RTP iter44 — ENTREVISTA PÓS-JOGO (UI): segmento OPCIONAL do resultado.
// Nunca bloqueia o "Concluir semana": o CTA principal segue renderizado abaixo,
// e "Pular entrevista" encerra a cena a qualquer momento. Puro sabor — a
// escolha do tom só gera uma linha de repercussão (nenhum stat muda).

interface Given { answer: InterviewAnswer; reaction: string }

export function RtpInterview({ save, result, major, matchSeed, grudge }: {
  save: RoadToProSave;
  result: ProMatchResult;
  major: boolean;
  matchSeed: number;
  grudge: boolean;
}) {
  const itv = useMemo(
    () => buildInterview(save, result, { major, matchSeed, grudge }),
    [save, result, major, matchSeed, grudge],
  );
  const [given, setGiven] = useState<Given[]>([]);
  const [skipped, setSkipped] = useState(false);

  if (skipped) {
    return (
      <div className="rtp-itv rtp-itv-skipped">
        <span className="rtp-itv-kicker">{itv.press ? ct('COLETIVA') : ct('ZONA MISTA')}</span>
        <span className="rtp-itv-skipnote">{ct('Você passou direto pela imprensa — sem declarações hoje.')}</span>
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
    });
    setGiven((g) => [...g, { answer: a, reaction }]);
  };

  return (
    <div className={`rtp-itv ${itv.press ? 'press' : ''}`}>
      <header className="rtp-itv-head">
        <span className="rtp-itv-kicker">
          <RtpIcon name="fame" size={12} /> {itv.press ? ct('COLETIVA DE IMPRENSA') : ct('ENTREVISTA RELÂMPAGO')}
        </span>
        <span className="rtp-itv-setting">{itv.setting}</span>
      </header>

      {/* Perguntas já respondidas: pergunta + sua fala + repercussão */}
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

      {done
        ? <p className="rtp-itv-closer">{interviewCloser(itv.press, matchSeed)}</p>
        : (
          <button type="button" className="rtp-btn-ghost rtp-itv-skip" onClick={() => setSkipped(true)}>
            {ct('Pular entrevista')}
          </button>
        )}
    </div>
  );
}
