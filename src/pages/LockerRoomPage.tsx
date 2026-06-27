// LockerRoomPage — T10.2 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Snapshot pre-match: 5 jogadores titulares com avatar+mood+role, briefing
// tático curto do oponente (gerado pelo caller), plano de jogo selecionado.
// Não é interativo — é um beat narrativo antes do user clicar "JOGAR".

import { PlayerAvatar, Flag, OvrBadge } from '../components/ui';
import { CareerIcon } from '../components/career/CareerIcon';
import { playerOvr } from '../engine/ratings';
import type { Player } from '../types';

export interface LockerRoomData {
  /** Titulares (5 jogadores) na ordem do lineup */
  lineup: Player[];
  /** Mood/moral de cada jogador (id → 0-100) */
  morale: Record<string, number>;
  /** Sigla + nome do oponente */
  opponent: { tag: string; name: string; ovr: number };
  /** Plano de jogo selecionado (label legível, ex.: "Disciplinado") */
  gamePlan: string;
  /** Briefing curto (1-2 parágrafos gerados pelo caller) */
  briefing: string;
  /** Map a ser jogado (label, ex.: "Mirage") */
  mapName: string;
  /** Override opcional do título (default: "Vestiário") */
  title?: string;
}

interface Props {
  data: LockerRoomData;
  onClose?: () => void;
  /** Handler opcional pro botão "Pronto pra entrar" (default: onClose) */
  onReady?: () => void;
}

function moodOf(value: number): { label: string; color: string } {
  if (value >= 85) return { label: 'Hyped', color: '#5ed88a' };
  if (value >= 70) return { label: 'Focado', color: '#9bd35c' };
  if (value >= 55) return { label: 'Neutro', color: '#cfa75b' };
  if (value >= 40) return { label: 'Inseguro', color: '#e8a93b' };
  return { label: 'Abalado', color: '#e58a8a' };
}

export function LockerRoomPage({ data, onClose, onReady }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header com oponente e mapa */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(232, 193, 112, 0.1) 0%, transparent 60%)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
        }}
      >
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Vs
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--em-text)', marginTop: 2 }}>
            {data.opponent.tag}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--em-muted)' }}>
            {data.opponent.name} · OVR {data.opponent.ovr}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Mapa
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--em-gold)', marginTop: 2 }}>
            {data.mapName}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--em-muted)' }}>
            Plano: <b style={{ color: 'var(--em-text)' }}>{data.gamePlan}</b>
          </div>
        </div>
      </header>

      {/* Lineup */}
      <section>
        <h3 style={sectionTitle}>Lineup</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${data.lineup.length}, 1fr)`,
            gap: 10,
          }}
        >
          {data.lineup.map((p) => {
            const m = moodOf(data.morale[p.id] ?? 60);
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '14px 8px',
                  background: 'var(--em-panel-2)',
                  border: '1px solid var(--em-border)',
                  borderRadius: 6,
                  textAlign: 'center',
                }}
              >
                <PlayerAvatar nick={p.nick} size={52} />
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Flag cc={p.country} />
                  <b style={{ fontSize: '0.86rem', color: 'var(--em-text)' }}>{p.nick}</b>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <OvrBadge ovr={playerOvr(p)} />
                  <span className={`role-pill ${p.role}`}>{p.role}</span>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    padding: '2px 8px',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 10,
                    fontSize: '0.7rem',
                    color: m.color,
                    fontWeight: 700,
                  }}
                >
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Briefing */}
      <section>
        <h3 style={sectionTitle}>
          <CareerIcon name="document" size={13} /> Briefing
        </h3>
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--em-panel)',
            border: '1px solid var(--em-border)',
            borderLeft: '3px solid var(--em-gold)',
            borderRadius: '0 6px 6px 0',
            color: 'var(--em-text)',
            fontSize: '0.88rem',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
          }}
        >
          {data.briefing}
        </div>
      </section>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--em-border)', paddingTop: 14 }}>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: 'var(--em-text)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Voltar
          </button>
        )}
        {onReady && (
          <button
            type="button"
            onClick={onReady}
            style={{
              padding: '8px 20px',
              background: 'var(--em-gold)',
              color: '#1a1205',
              border: 'none',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 800,
              cursor: 'pointer',
              letterSpacing: '0.5px',
            }}
          >
            ⊳ ENTRAR
          </button>
        )}
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: '0.7rem',
  fontWeight: 800,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: 'var(--em-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};
