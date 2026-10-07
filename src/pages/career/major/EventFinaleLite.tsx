// [Major espetáculo · lite] As mesmas peças, em tamanho de bolso, para a final
// de um evento T1 do circuito: contagem pra final, walkout curto e a
// cerimônia (troféu + confete quando é seu; o campeão em destaque quando não).
import { useEffect } from 'react';
import { Confetti, Trophy } from './Art';
import { markSeen, play, seenOnce, useReducedMotion } from './audio';
import { mt } from './i18n';
import { Countdown, SoundToggle, TeamChip, type TeamOf } from './parts';
import './major.css';

interface Side { id: string; tag: string; name: string; colors: [string, string]; logoUrl?: string }

export interface FinaleLiteProps {
  eventName: string;
  final: { a: Side; b: Side; score?: [number, number]; winnerId?: string } | null;
  userId?: string;
  seenKey: string;
}

const asTeam = (s: Side): ReturnType<TeamOf> => ({ ...s, country: '', players: [] });

export function EventFinaleLite({ eventName, final, userId = 'user', seenKey }: FinaleLiteProps) {
  const reduced = useReducedMotion();
  const done = !!final?.winnerId;
  const mine = !!final && (final.a.id === userId || final.b.id === userId);
  const won = done && final!.winnerId === userId;
  useEffect(() => {
    if (!done || seenOnce(seenKey)) return;
    markSeen(seenKey);
    play(won ? 'fanfare' : mine ? 'consolation' : 'hit');
  }, [done, won, mine, seenKey]);
  if (!final) return null;
  const champ = done ? (final.winnerId === final.a.id ? final.a : final.b) : null;
  return (
    <section className={`mj-lite${won ? ' champ' : ''}${done ? ' done' : ''}`} aria-label={mt('Final do evento')}>
      {won && <Confetti count={reduced ? 0 : 28} off={reduced} />}
      <div className="mj-lite-top">
        <span className="mj-cer-label">{eventName} · {done ? mt('Campeão') : mt('Grande final')}</span>
        <SoundToggle />
      </div>
      <div className="mj-lite-body">
        <Trophy size={done ? 72 : 52} tone={done && !won && mine ? 'silver' : 'gold'} className="mj-lite-trophy" />
        <div className="mj-lite-vs">
          <TeamChip team={asTeam(final.a)} big user={final.a.id === userId} dim={done && final.winnerId !== final.a.id} />
          <b className="mj-lite-score">{final.score ? `${final.score[0]} : ${final.score[1]}` : 'vs'}</b>
          <TeamChip team={asTeam(final.b)} big user={final.b.id === userId} dim={done && final.winnerId !== final.b.id} />
        </div>
        {!done && mine && <Countdown from={5} label={mt('A grande final começa em')} />}
        {done && champ && (
          <p className="mj-lite-line">
            {won ? mt('O troféu é seu. Respira, comemora e mira o Major.') : mine ? `${mt('Vice no')} ${eventName}. ${mt('Faltou uma série — o caminho está certo.')}` : `${champ.name} ${mt('levanta o troféu.')}`}
          </p>
        )}
      </div>
    </section>
  );
}
