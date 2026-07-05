// Camada de TRANSMISSÃO do duelo ao vivo do Ultimate (iter41): fala de caster,
// barra de hype (momentum), chip de stakes (match point / "precisa de N") e
// momentos de estrela. 100% derivado do script determinístico (liveDrama.ts)
// construído dos dados que os dois clientes do PvP compartilham — nenhum
// Math.random aqui. Puramente presentational: NUNCA pausa nem atrasa o replay;
// em velocidade ≥4x as falas somem (o jogador quer o resultado, não o show).
import { useMemo } from 'react';
import { buildDramaScript, currentStakes, starsFromPlayers, type DramaPlayer } from '../../engine/ultimate/liveDrama';
import { ct } from '../../state/career-i18n';

export function UltimateCast({ roundLog, names, players, shown, speed, myIdx }: {
  roundLog: readonly (0 | 1)[];        // roundLog CANÔNICO (série compartilhada)
  names: [string, string];             // nomes canônicos dos times
  players: [DramaPlayer[], DramaPlayer[]]; // rosters canônicos (traits → estrelas)
  shown: number;                       // rounds já exibidos no replay
  speed: number;                       // velocidade do replay (drama some em ≥4x)
  myIdx: 0 | 1;                        // meu lado na ordem canônica (espelha a hype bar)
}) {
  const script = useMemo(
    () => buildDramaScript(roundLog, names, [starsFromPlayers(players[0]), starsFromPlayers(players[1])]),
    [roundLog, names, players],
  );
  if (roundLog.length === 0) return null;

  const beat = shown > 0 ? script.beats[Math.min(shown, script.beats.length) - 1] : null;
  const calm = speed >= 4; // 4x/8x: sem falas nem flash — só hype bar + stakes
  const stakes = currentStakes(roundLog, shown);
  // hype bar SEMPRE da perspectiva do usuário: direita = você embalado
  const mom = beat ? (myIdx === 0 ? beat.momentum : -beat.momentum) : 0;
  const pos = ((mom + 1) / 2) * 100;
  const beatDur = speed <= 1 ? '1.5s' : '0.85s';

  return (
    <div className="ut-cast">
      <div className="ut-cast__row">
        <div className="ut-hype" title={ct('Momentum da partida')}>
          <span className="ut-hype__lbl">{ct('RIVAL')}</span>
          <div className="ut-hype__track">
            <div className="ut-hype__fill" style={{ width: `${pos}%` }} />
            <i className="ut-hype__pin" style={{ left: `${pos}%` }} />
          </div>
          <span className="ut-hype__lbl you">{ct('VOCÊ')}</span>
        </div>
        {stakes && (
          <span className={`ut-stakes${stakes.matchPoint ? ' is-mp' : ''}`}>
            {stakes.double
              ? <>🏆 {ct('MATCH POINT DUPLO')}</>
              : stakes.matchPoint
                ? <>🏆 {ct('MATCH POINT')} · {names[stakes.side]}</>
                : <>{names[stakes.side]} {ct('precisa de')} {stakes.need}</>}
          </span>
        )}
      </div>
      {!calm && beat?.line && (
        <div key={shown} className={`ut-cast__line${beat.key ? ' is-key' : ''}`} style={{ ['--beat-dur' as string]: beatDur }}>
          <span className="ut-cast__tag">{ct('CASTER')}</span>
          <span className="ut-cast__text">{beat.line}</span>
          {beat.key && <span className="ut-cast__score">{beat.score[myIdx]}–{beat.score[1 - myIdx]}</span>}
        </div>
      )}
      {!calm && beat?.star && (
        <div key={`s${shown}`} className="ut-cast__star" style={{ ['--beat-dur' as string]: beatDur }}>
          ★ {ct('MOMENTO DE ESTRELA')} — {beat.star}
        </div>
      )}
    </div>
  );
}
