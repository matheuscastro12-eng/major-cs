import { useRef, useState } from 'react';
import { makeRng, randomSeed } from '../engine/rng';
import { simulateAiTournament } from '../engine/swiss';
import type { TeamSeason } from '../types';
import { ct } from '../state/career-i18n';

interface Props {
  dataset: TeamSeason[];
  onBack: () => void;
}

interface LabResult {
  ran: number;
  titles: Map<string, number>;
  appearances: Map<string, number>;
}

// Lab de balanceamento: simula N torneios 100% IA e mostra % de título por
// time. Usado para calibrar forma/sinergia/coach antes de mexer nos números.
export function LabScreen({ dataset, onBack }: Props) {
  const [n, setN] = useState(300);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<LabResult | null>(null);
  const cancelRef = useRef(false);

  const run = () => {
    if (running) return;
    setRunning(true);
    setResult(null);
    setProgress(0);
    cancelRef.current = false;
    const titles = new Map<string, number>();
    const appearances = new Map<string, number>();
    const total = Math.max(50, Math.min(2000, n));
    let done = 0;

    const chunk = () => {
      const batch = Math.min(20, total - done);
      for (let i = 0; i < batch; i++) {
        const rng = makeRng(randomSeed());
        const t = simulateAiTournament(dataset, rng);
        for (const team of t.teams) appearances.set(team.id, (appearances.get(team.id) ?? 0) + 1);
        if (t.championId) titles.set(t.championId, (titles.get(t.championId) ?? 0) + 1);
        done++;
      }
      setProgress(done);
      if (done < total && !cancelRef.current) {
        window.setTimeout(chunk, 0);
      } else {
        setResult({ ran: done, titles, appearances });
        setRunning(false);
      }
    };
    window.setTimeout(chunk, 0);
  };

  const rows = result
    ? [...result.titles.entries()]
        .map(([id, wins]) => {
          const ts = dataset.find((t) => t.id === id);
          const apps = result.appearances.get(id) ?? 1;
          return { name: ts ? `${ts.team} ${ts.era}` : id, wins, apps, rate: (wins / apps) * 100 };
        })
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 25)
    : [];

  const maxRate = rows[0]?.rate ?? 1;

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          🧪 {ct('Lab de balanceamento')}
          <span className="spacer" />
          <button className="btn" onClick={onBack}>
            ← {ct('Voltar')}
          </button>
        </div>
        <div className="panel-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            {ct('Simula torneios inteiros entre os times da base (sem jogador humano) e mede a taxa de título de cada um quando participa. Use para calibrar atributos, sinergia e coaches.')}
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <div className="field" style={{ width: 140 }}>
              <label>{ct('Torneios')}</label>
              <input type="number" min={50} max={2000} value={n} onChange={(e) => setN(Number(e.target.value) || 300)} />
            </div>
            <button className="btn gold" onClick={run} disabled={running}>
              {running ? `${ct('Simulando…')} ${progress}/${Math.max(50, Math.min(2000, n))}` : `▶ ${ct('Rodar simulação')}`}
            </button>
            {running && (
              <button className="btn ghost" onClick={() => (cancelRef.current = true)}>
                {ct('Parar')}
              </button>
            )}
          </div>

          {result && (
            <>
              <div className="muted small" style={{ marginBottom: 8 }}>
                {result.ran} {ct('torneios simulados · taxa = títulos ÷ participações')}
              </div>
              {rows.map((r) => (
                <div key={r.name} className="lab-bar">
                  <span>{r.name}</span>
                  <span className="bar">
                    <i style={{ width: `${(r.rate / maxRate) * 100}%` }} />
                  </span>
                  <span className="muted">
                    {r.rate.toFixed(1)}% ({r.wins}/{r.apps})
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
