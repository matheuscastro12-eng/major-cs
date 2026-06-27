// Card individual de jogador (bottom row do broadcast). Espelha o print:
// [Foto] · NICK · HP · Arma · KDA · Money
//
// Por enquanto:
//   - Foto: PlayerAvatar (initials por hash). Vai melhorar quando tivermos
//     fotos reais por player_id em data/player-photos.json (já existe a infra).
//   - HP: 100 se alive, 0 se morto (sem dano gradual no piloto)
//   - Arma: AK pra T, M4A1 pra CT (sem track real ainda)
//   - KDA: vem direto do `agent.stats` (cumulativo no mapa). ANTES eu filtrava
//     `state.events` mas o array é trimado a 30 — kills antigos saíam e o KDA
//     voltava a zero após muitos rounds.
//   - Money: mock por round (T pistol/eco/full-buy padrão)

import type { TTeam } from '../../types';
import type { Agent, LiveState } from '../../lib/liveCanvasSim';
import { PlayerAvatar } from '../ui';

interface Props {
  agent: Agent;
  team: TTeam;
  state: LiveState;
  // alinhamento da card (esquerda = team 0 vermelho, direita = team 1 azul)
  align: 'left' | 'right';
  // destaca jogador do user
  isUser?: boolean;
}

function defaultWeapon(side: 'ct' | 't'): string {
  return side === 'ct' ? 'M4A1' : 'AK-47';
}

// Money por round simplificado (sem economy real do simulador 2D).
function moneyForRound(side: 'ct' | 't', roundIdx: number): number {
  if (roundIdx === 0 || roundIdx === 15) return 800; // pistol
  // alterna eco/full buy de jeito convincente — só visual
  const cycle = roundIdx % 4;
  if (cycle === 1) return side === 'ct' ? 2400 : 1800; // pós-pistol
  if (cycle === 2) return 4500;
  return 1000;
}

export function LivePlayerCard({ agent, team, state, align, isUser = false }: Props) {
  const { kills: k, deaths: d, assists: a } = agent.stats;

  const hp = agent.alive ? 100 : 0;
  const weapon = agent.alive ? defaultWeapon(agent.side) : '—';
  const money = moneyForRound(agent.side, state.roundIdx);
  const tagColor = team.colors?.[0] ?? (agent.side === 't' ? '#c0392b' : '#2872c0');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: align === 'left' ? 'row' : 'row-reverse',
        alignItems: 'stretch',
        gap: 0,
        width: 168,
        background: hp > 0 ? 'rgba(20,24,32,0.85)' : 'rgba(20,24,32,0.6)',
        borderTop: `3px solid ${tagColor}`,
        borderRadius: 4,
        overflow: 'hidden',
        opacity: hp > 0 ? 1 : 0.55,
        position: 'relative',
        outline: isUser ? `2px solid var(--em-gold)` : 'none',
        outlineOffset: -2,
      }}
    >
      {/* Foto */}
      <div style={{ width: 56, height: 76, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <PlayerAvatar nick={agent.nick} size={48} />
      </div>

      {/* Stats */}
      <div style={{ flex: 1, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4, color: '#fff', minWidth: 0 }}>
        {/* Nick + estrela se MVP/destaque (placeholder: kills >= 3) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <span style={{
            fontWeight: 700,
            fontSize: '0.74rem',
            letterSpacing: '0.4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {agent.nick.toUpperCase()}
          </span>
          {k >= 3 && (
            <span style={{ color: 'var(--em-gold)', fontSize: '0.8rem', lineHeight: 1 }}>★</span>
          )}
        </div>

        {/* HP bar + número */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${hp}%`,
                height: '100%',
                background: hp > 50 ? '#5ed85e' : hp > 20 ? '#ffb84d' : '#ff5252',
                transition: 'width .2s',
              }}
            />
          </div>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.74rem', fontWeight: 700, minWidth: 26, textAlign: 'right' }}>
            {hp}
          </span>
        </div>

        {/* Arma */}
        <div style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 700, color: hp > 0 ? '#fff' : 'rgba(255,255,255,0.4)' }}>{weapon}</span>
        </div>

        {/* KDA + money */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.66rem' }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'rgba(255,255,255,0.8)' }}>
            <b style={{ color: '#5ed85e' }}>{k}</b>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}> · </span>
            <span>{a}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}> · </span>
            <b style={{ color: '#ff8a8a' }}>{d}</b>
          </span>
          <span style={{ color: '#bfd14d', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}>
            ${money}
          </span>
        </div>
      </div>
    </div>
  );
}
