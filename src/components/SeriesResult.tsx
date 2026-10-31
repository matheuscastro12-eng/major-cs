// RESULTADO DA SÉRIE (pós-jogo do MatchScreen): o que o jogador quer ver
// primeiro abre a tela — vitória/derrota, placar, destaque da partida e o que
// fazer agora (continuar, compartilhar). Abaixo, uma coluna de leitura com a
// análise e as chamadas, e o "Estilo em campo" ao lado.
// Só lê o SeriesResult: nenhum número é recalculado de outro jeito (o
// destaque da partida usa a mesma regra do Scoreboard).
import { useState } from 'react';
import { CircleAlert, CircleCheck, Crosshair, Flame, Info, Mic, Star, Trophy } from 'lucide-react';
import type { SeriesResult, TTeam } from '../types';
import { ct } from '../state/career-i18n';
import { inviteKind, inviteMessage, inviteUrl, seriesDareText } from '../state/shareInvite';
import { shareCard, shareText } from '../state/shareX';
import { drawSeriesCard, seriesCardData } from '../state/seriesShareCard';
import { ShareInvite } from './ShareInvite';
import '../styles/series-result.css';

import { bestRunOf, readTacticalNext, seriesPotm, TACTICAL_NEXT_KEY } from '../state/seriesResult';

// convite do fim da série (ShareInvite): medição share_card {kind, channel}
const DARE_KIND = inviteKind('serie', 'desafio');
const CARD_KIND = inviteKind('serie', 'card');

export function SeriesResultHero({ series, teams, userIdx, onContinue }: {
  series: SeriesResult; teams: [TTeam, TTeam]; userIdx: 0 | 1; onContinue: () => void;
}) {
  const opp: 0 | 1 = userIdx === 0 ? 1 : 0;
  const won = series.winner === userIdx;
  const me = teams[userIdx], them = teams[opp];
  const mine = series.mapScore[userIdx], theirs = series.mapScore[opp];
  const potm = seriesPotm(series, teams);
  const myBest = potm && potm.team !== userIdx ? seriesPotm(series, teams, userIdx) : null;
  const run = bestRunOf(series, userIdx);
  const tag = (i: 0 | 1) => teams[i].tag || teams[i].name;

  // texto do post do card (o mesmo do antigo "Postar no X")
  const text = `${won ? ct('Vitória') : ct('Derrota')} ${mine}-${theirs} · ${me.name} x ${them.name} · Road to Major`
    + (potm ? `\n${ct('Destaque da partida')}: ${potm.nick} (${potm.rating.toFixed(2)})` : '');
  // desafio: o link é a página inicial (não existe link que monte esta mesma série)
  const dare = async () => {
    const dareText = seriesDareText(
      { won, me: me.name, opp: them.name, mapScore: series.mapScore, userIdx },
      { win: ct('{me} {score} {opp} no Road to Major. Duvido você fazer melhor:'), loss: ct('{me} {score} {opp} no Road to Major. Você vence essa?') },
    );
    const ch = await shareText(DARE_KIND, inviteMessage(dareText, inviteUrl('serie', 'desafio')));
    return ch === 'copy' ? ct('Desafio copiado') : ch === 'native' ? ct('Compartilhado!') : null;
  };
  const postCard = async () => {
    let dataUrl = '';
    try {
      dataUrl = drawSeriesCard(seriesCardData(series, [teams[0].name, teams[1].name], userIdx, potm), {
        win: ct('Vitória'), loss: ct('Derrota'), potm: ct('Destaque da partida'), foot: `roadtomajor.com.br · ${ct('Jogue a sua').toLowerCase()}`,
      });
    } catch { /* canvas indisponível: segue só com o texto */ }
    const ch = await shareCard(CARD_KIND, { dataUrl, filename: 'serie-road-to-major.png', text, url: inviteUrl('serie', 'card') });
    if (ch === 'native') return ct('Compartilhado!');
    return ch === 'x' && dataUrl ? ct('Abriu o X: anexa a imagem que baixou 😉') : null;
  };

  return (
    <section className={`sr-hero ${won ? 'is-win' : 'is-loss'}`} aria-labelledby="sr-hero-title">
      <div className="sr-hero__head">
        {/* o placar grande já está logo acima: aqui, a frase do resultado */}
        <h2 id="sr-hero-title" className="sr-hero__title">
          {won && <Trophy size={26} aria-hidden className="sr-hero__ic" />}
          <span className="sr-hero__team">{won ? ct('Vitória sobre') : ct('Derrota para')} {them.name}</span>
          <span className="sr-hero__score">{mine}–{theirs}</span>
        </h2>
      </div>
      <ul className="sr-facts">
        {potm && (
          <li className="sr-fact">
            <Star size={16} aria-hidden className="sr-fact__ic" />
            <span className="sr-fact__k">{ct('Destaque da partida')}</span>
            <span className="sr-fact__v">{potm.nick} <small>{tag(potm.team)} · {potm.rating.toFixed(2)} rating</small></span>
          </li>
        )}
        {myBest && (
          <li className="sr-fact">
            <Star size={16} aria-hidden className="sr-fact__ic" />
            <span className="sr-fact__k">{ct('Seu melhor')}</span>
            <span className="sr-fact__v">{myBest.nick} <small>{myBest.rating.toFixed(2)} rating</small></span>
          </li>
        )}
        {run >= 3 && (
          <li className="sr-fact">
            <Flame size={16} aria-hidden className="sr-fact__ic" />
            <span className="sr-fact__k">{ct('Maior sequência')}</span>
            <span className="sr-fact__v">{run} {ct('rounds seguidos')}</span>
          </li>
        )}
      </ul>
      <div className="sr-actions">
        <button type="button" className="btn gold" onClick={onContinue}>{ct('Continuar')}</button>
      </div>
      {/* convite pra compartilhar: as duas ações no lugar do antigo "Compartilhar resultado" + "Postar no X" */}
      <ShareInvite
        lead={ct('Seu amigo faria melhor? Mande o desafio.')}
        dareLabel={ct('Desafie um amigo')}
        cardLabel={ct('Postar o card')}
        onDare={dare}
        onCard={postCard}
        darePrimary={false}
      />
    </section>
  );
}

/** sem nenhuma chamada na série: um convite só (antes eram dois blocos vazios) */
export function TacticalInvite() {
  const [armed, setArmed] = useState(readTacticalNext);
  const arm = () => {
    try { localStorage.setItem(TACTICAL_NEXT_KEY, '1'); } catch { /* sem storage */ }
    setArmed(true);
  };
  return (
    <section className="panel sr-invite fade-in" aria-labelledby="sr-invite-title">
      <div className="panel-head" id="sr-invite-title"><Crosshair size={16} aria-hidden /> {ct('Suas chamadas')}</div>
      <div className="panel-body">
        <p className="sr-invite__text">
          {ct('Você assistiu esta série no automático. Com o Tático ligado, você comanda round a round: postura, timeouts e chamadas mudam o resultado, e cada golpe mostra a % antes de rolar.')}
        </p>
        <button type="button" className="btn ghost" onClick={arm} disabled={armed} aria-pressed={armed}>
          {armed ? ct('Tático ligado para a próxima') : ct('Ligar o Tático na próxima')}
        </button>
      </div>
    </section>
  );
}

const TONE_ICON = { good: CircleCheck, bad: CircleAlert, info: Info } as const;

/** análise da série: veredito + observações, com ícone do sistema pelo tom */
export function ResultInsights({ verdict, bullets, title }: {
  verdict: string; bullets: { icon: string; text: string; tone: 'good' | 'bad' | 'info' }[]; title: string;
}) {
  return (
    <section className="panel insight-panel sr-insights fade-in" aria-label={title}>
      <div className="panel-head">{title}</div>
      <div className="panel-body">
        <div className="verdict">{verdict}</div>
        <ul className="insight-list">
          {bullets.map((b, i) => {
            const Icon = TONE_ICON[b.tone];
            return (
              <li key={i} className={`insight-item ${b.tone}`}>
                <Icon size={16} aria-hidden className="ic" />
                <span>{b.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** melhores momentos: as falas do narrador, com o ícone do sistema */
export function ResultHighlights({ moments, userIdx, title }: {
  moments: { text: string; teamIdx: number; big?: boolean }[]; userIdx: 0 | 1; title: string;
}) {
  return (
    <section className="panel highlights-panel fade-in" aria-label={title}>
      <div className="panel-head">{title}</div>
      <div className="panel-body">
        {moments.map((m, i) => (
          <div key={i} className={`caster-line ${m.teamIdx === userIdx ? 'mine' : 'opp'}${m.big ? ' big' : ''}`}>
            <Mic size={16} aria-hidden className="caster-mic" />
            <span className="caster-text">{m.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
