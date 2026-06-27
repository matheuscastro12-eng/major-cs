// Painel lateral com narração dos rounds — espelha o print 2 (post-round):
//   ROUND 2  · MONGOLZ WIN  · 2-0
//   Quick entry by MONESY, traded by bLitz.
//   Falcons commit to B, Techno4K comes from behind and seals the round.
//
// A narração reusa engine/narration.ts (`narrateRound`) — já existe e produz
// 1-2 frases por round combinando killer, victim e contexto tático.
//
// Mostra os últimos N rounds (mais recente em cima). Aparece sempre, mas
// dá destaque ao último durante a fase 'postRound'.

import { useMemo } from 'react';
import { narrateRound } from '../../engine/narration';
import type { MapResult, TTeam } from '../../types';
import type { LiveState } from '../../lib/liveCanvasSim';

interface Props {
  mapResult: MapResult;
  teams: [TTeam, TTeam];
  state: LiveState;
  // limit de rounds exibidos (default: todos os já jogados)
  limit?: number;
}

export function LivePostRoundFeed({ mapResult, teams, state, limit = 8 }: Props) {
  // Narração por round, mais recente primeiro. Roda só uma vez por round porque
  // narrateRound é determinístico em cima do log.
  const items = useMemo(() => {
    const playedRounds = state.roundIdx + (state.phase === 'postRound' ? 1 : 0);
    const list: { idx: number; winner: 0 | 1; text: string; cumulativeScore: [number, number] }[] = [];
    let cum: [number, number] = [0, 0];
    for (let r = 0; r < playedRounds; r++) {
      const winner = (mapResult.roundLog?.[r] ?? 0) as 0 | 1;
      cum = [cum[0] + (winner === 0 ? 1 : 0), cum[1] + (winner === 1 ? 1 : 0)];
      const text = safeNarrate(mapResult, r, teams, winner);
      list.push({ idx: r, winner, text, cumulativeScore: [...cum] as [number, number] });
    }
    // ordem inversa (último por cima)
    return list.reverse().slice(0, limit);
  }, [mapResult, teams, state.roundIdx, state.phase, limit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.length === 0 ? (
        <div style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', fontStyle: 'italic' }}>
          Aguardando o primeiro round terminar...
        </div>
      ) : (
        items.map((it) => {
          const winnerTeam = teams[it.winner];
          const tagColor = winnerTeam.colors?.[0] ?? (it.winner === 0 ? '#c0392b' : '#2872c0');
          return (
            <div
              key={it.idx}
              style={{
                background: 'rgba(20,24,32,0.85)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderLeft: `3px solid ${tagColor}`,
                borderRadius: 4,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.74rem', letterSpacing: '0.6px' }}>
                  ROUND {it.idx + 1}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: tagColor, fontSize: '0.74rem', fontWeight: 700 }}>{winnerTeam.tag.toUpperCase()} WIN</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.74rem' }}>
                    {it.cumulativeScore[0]}-{it.cumulativeScore[1]}
                  </span>
                </span>
              </div>
              <div style={{ color: '#dfe5ec', fontSize: '0.82rem', lineHeight: 1.4 }}>
                {it.text}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// Wrapper safe: se narrateRound lançar (assinatura diferente do que assumimos),
// caímos num fallback genérico. Mantém o broadcast funcional mesmo se a engine
// de narração mudar.
function safeNarrate(mr: MapResult, roundIdx: number, teams: [TTeam, TTeam], winner: 0 | 1): string {
  try {
    // narrateRound original tem assinaturas variadas — tentar formato comum;
    // a função real determina o que cabe melhor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (narrateRound as unknown as (...args: any[]) => unknown)(mr, roundIdx, teams);
    if (typeof out === 'string' && out.length > 0) return out;
    if (out && typeof out === 'object' && 'text' in (out as Record<string, unknown>)) {
      const t = (out as { text?: unknown }).text;
      if (typeof t === 'string') return t;
    }
  } catch {
    /* fallback */
  }
  return `${teams[winner].name} venceu o round ${roundIdx + 1}.`;
}
