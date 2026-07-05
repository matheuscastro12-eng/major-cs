// Camada de TRANSMISSÃO do duelo ao vivo do Ultimate (iter41): fala de caster,
// barra de hype (momentum), chip de stakes (match point / "precisa de N") e
// momentos de estrela. iter44 soma a TEXTURA DE FRAGS (liveFrags.ts): callout
// de multi-kill nos rounds em que o caster do arco silencia, strip de top
// fragger corrente e "star watch" da carta-estrela — tudo do killFeed CANÔNICO
// da série compartilhada. 100% derivado de scripts determinísticos — nenhum
// Math.random aqui. Puramente presentational: NUNCA pausa nem atrasa o replay;
// em velocidade ≥4x falas e strip somem (o jogador quer o resultado, não o show).
import { useMemo } from 'react';
import { buildDramaScript, currentStakes, starsFromPlayers, type DramaPlayer } from '../../engine/ultimate/liveDrama';
import { buildFragScript, fragLeaderAt, starWatchAt, type WatchedStar } from '../../engine/ultimate/liveFrags';
import type { KillEvent } from '../../types';
import { ct } from '../../state/career-i18n';

// jogador do roster canônico com id (TPlayer atende) — o id liga o killFeed ao nick
export type CastPlayer = DramaPlayer & { id: string };

export function UltimateCast({ roundLog, names, players, killFeed = [], shown, speed, myIdx }: {
  roundLog: readonly (0 | 1)[];        // roundLog CANÔNICO (série compartilhada)
  names: [string, string];             // nomes canônicos dos times
  players: [CastPlayer[], CastPlayer[]]; // rosters canônicos (traits → estrelas; id → killFeed)
  killFeed?: readonly KillEvent[];     // killFeed CANÔNICO do mapa (frags reais da sim)
  shown: number;                       // rounds já exibidos no replay
  speed: number;                       // velocidade do replay (drama some em ≥4x)
  myIdx: 0 | 1;                        // meu lado na ordem canônica (espelha a hype bar)
}) {
  const script = useMemo(
    () => buildDramaScript(roundLog, names, [starsFromPlayers(players[0]), starsFromPlayers(players[1])]),
    [roundLog, names, players],
  );
  // texturas de frag por round + estrelas vigiadas (1ª carta com trait de cada
  // lado, na ordem canônica do roster — seleção idêntica nos 2 clientes).
  const nickOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const side of players) for (const p of side) m.set(p.id, p.nick);
    return (id: string) => m.get(id);
  }, [players]);
  const fragScript = useMemo(
    () => buildFragScript(killFeed, roundLog.length, names, nickOf),
    [killFeed, roundLog.length, names, nickOf],
  );
  const watched = useMemo<[WatchedStar | null, WatchedStar | null]>(() => {
    const first = (side: CastPlayer[]): WatchedStar | null => {
      for (const p of side) {
        const s = starsFromPlayers([p])[0];
        if (s) return { id: p.id, nick: p.nick, trait: s.trait };
      }
      return null;
    };
    return [first(players[0]), first(players[1])];
  }, [players]);
  if (roundLog.length === 0) return null;

  const beat = shown > 0 ? script.beats[Math.min(shown, script.beats.length) - 1] : null;
  const frag = shown > 0 ? fragScript[Math.min(shown, fragScript.length) - 1] : null;
  const calm = speed >= 4; // 4x/8x: sem falas nem flash — só hype bar + stakes
  const stakes = currentStakes(roundLog, shown);
  // strip de stats ao vivo: top fragger corrente + star watch (a partir do R3)
  const leader = !calm && shown >= 3 ? fragLeaderAt(killFeed, shown) : null;
  const watch = !calm ? starWatchAt(killFeed, shown, watched) : null;
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
      {/* textura de frag (iter44): só quando o caster do ARCO silencia neste
          round — nunca duas falas competindo; abates 100% reais do killFeed */}
      {!calm && !beat?.line && frag?.line && (
        <div key={`f${shown}`} className="ut-cast__line is-frag" style={{ ['--beat-dur' as string]: beatDur }}>
          <span className="ut-cast__tag">{ct('CASTER')}</span>
          <span className="ut-cast__text">{frag.line}</span>
        </div>
      )}
      {!calm && beat?.star && (
        <div key={`s${shown}`} className="ut-cast__star" style={{ ['--beat-dur' as string]: beatDur }}>
          ★ {ct('MOMENTO DE ESTRELA')} — {beat.star}
        </div>
      )}
      {/* strip de stats ao vivo (iter44): top fragger corrente + star watch —
          texto canônico (idêntico nos 2 clientes); só a COR espelha o lado */}
      {(leader || watch) && (
        <div className="ut-cast__strip">
          {leader && (
            <span className={`ut-cast__stat${leader.side === myIdx ? ' is-you' : ' is-opp'}`}>
              🔝 <b>{nickOf(leader.id) ?? '?'}</b> {ct('lidera o server')} — {leader.kills}K
            </span>
          )}
          {watch && (
            <span className={`ut-cast__stat ut-cast__stat--watch${watch.hot ? ' is-hot' : ''}${watch.side === myIdx ? ' is-you' : ' is-opp'}`}>
              ★ {watch.line}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
