// [CSM-3] Bloco "história da carta": estatísticas gravadas pelo SERVIDOR ao
// fechar duelos ranqueados (server/ultimate-card-stats.ts). Soma as cópias da
// mesma carta. Só mostra o que o motor mede (sem kills/MVP: o duelo por beats
// não os produz). Não mexe no componente visual da carta.
import { useEffect, useState } from 'react';
import { getToken } from '../../state/account';
import { ct } from '../../state/career-i18n';

interface Totals { games: number; wins: number; losses: number; roundsWon: number; roundsLost: number; clutchesWon: number; clutchesPlayed: number; lastPlayedAt: string | null }

async function fetchTotals(cardIds: string[]): Promise<Totals | 'needAccount' | 'offline'> {
  const token = getToken();
  if (!token) return 'needAccount';
  try {
    const r = await fetch('/api/ultimate-economy', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cardStats', token, cardIds: cardIds.slice(0, 60) }),
    });
    if (r.status === 401 || r.status === 403) return 'needAccount';
    if (!r.ok) return 'offline';
    const data = (await r.json()) as { stats?: (Totals & { cardId: string })[] };
    const z: Totals = { games: 0, wins: 0, losses: 0, roundsWon: 0, roundsLost: 0, clutchesWon: 0, clutchesPlayed: 0, lastPlayedAt: null };
    for (const s of data.stats ?? []) {
      z.games += s.games; z.wins += s.wins; z.losses += s.losses; z.roundsWon += s.roundsWon; z.roundsLost += s.roundsLost;
      z.clutchesWon += s.clutchesWon; z.clutchesPlayed += s.clutchesPlayed;
      if (s.lastPlayedAt && (!z.lastPlayedAt || s.lastPlayedAt > z.lastPlayedAt)) z.lastPlayedAt = s.lastPlayedAt;
    }
    return z;
  } catch { return 'offline'; }
}

export function CardHistoryBlock({ cardIds }: { cardIds: string[] }) {
  const [state, setState] = useState<Totals | 'needAccount' | 'offline' | null>(null);
  const key = cardIds.join(',');
  useEffect(() => {
    let alive = true;
    void fetchTotals(key ? key.split(',') : []).then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [key]);

  const box = { border: '1px solid var(--em-border,#2a3340)', borderRadius: 12, padding: '12px 14px' } as const;
  if (state === null) return <div style={box} className="muted small">{ct('Carregando história…')}</div>;
  if (state === 'needAccount') return <div style={box} className="muted small">{ct('Entre na sua conta para ver a história da carta.')}</div>;
  if (state === 'offline') return <div style={box} className="muted small">{ct('História indisponível agora.')}</div>;
  if (state.games === 0) return <div style={box} className="muted small">{ct('Esta carta ainda não jogou ranqueada.')}</div>;
  const winPct = Math.round((state.wins / state.games) * 100);
  const items: [string, string][] = [
    [ct('Partidas'), String(state.games)],
    [ct('Vitórias'), `${state.wins} (${winPct}%)`],
    [ct('Derrotas'), String(state.losses)],
    [ct('Rounds'), `${state.roundsWon}–${state.roundsLost}`],
    [ct('Clutches'), `${state.clutchesWon}/${state.clutchesPlayed}`],
  ];
  return (
    <div style={box}>
      <div style={{ fontWeight: 900, fontSize: '0.8rem', letterSpacing: '0.06em', marginBottom: 8 }}>{ct('HISTÓRIA DA CARTA')}</div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 8, margin: 0 }}>
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="muted small">{k}</dt>
            <dd style={{ margin: 0, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small" style={{ margin: '8px 0 0' }}>{ct('Contam só os duelos ranqueados fechados pelo servidor. Clutch = o lance de clutch do duelo, vencido/jogado pelo time com esta carta escalada.')}</p>
    </div>
  );
}
