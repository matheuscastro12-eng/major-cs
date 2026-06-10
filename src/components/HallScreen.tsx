import { useEffect, useState } from 'react';
import { Flag } from './ui';

interface Campaign {
  id: number;
  player: string;
  team_name: string;
  pool: string;
  placement: string;
  champion: string;
  mvp: string;
  season: number;
  roster: { nick: string; country: string; ovr: number }[];
  records: { bestRating?: number; bestRatingPlayer?: string; biggestFrag?: number; biggestFragPlayer?: string; pickemScore?: string };
  created_at: string;
}

interface Props {
  onBack: () => void;
}

export function HallScreen({ onBack }: Props) {
  const [data, setData] = useState<{ campaigns: Campaign[]; totalTitles: number } | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch('/api/hall', { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  const champions = data?.campaigns.filter((c) => c.placement === '1') ?? [];
  const bestRating = data?.campaigns.reduce<Campaign | null>(
    (best, c) => ((c.records?.bestRating ?? 0) > (best?.records?.bestRating ?? 0) ? c : best),
    null,
  );
  const bestFrag = data?.campaigns.reduce<Campaign | null>(
    (best, c) => ((c.records?.biggestFrag ?? 0) > (best?.records?.biggestFrag ?? 0) ? c : best),
    null,
  );

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          🏛 Hall da Fama
          <span className="spacer" />
          <button className="btn" onClick={onBack}>
            ← Voltar
          </button>
        </div>
        <div className="panel-body">
          {!data && !err && <div className="muted">Carregando o hall…</div>}
          {err && <div className="muted">Hall indisponível agora - jogue offline que os títulos não fogem.</div>}
          {data && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 16 }}>
                <div className="hall-record">
                  <span>🏆 Títulos registrados</span>
                  <b>{data.totalTitles}</b>
                </div>
                {bestRating?.records?.bestRating ? (
                  <div className="hall-record">
                    <span>
                      📈 Melhor rating de campanha - <b>{bestRating.records.bestRatingPlayer}</b> ({bestRating.team_name})
                    </span>
                    <b>{bestRating.records.bestRating?.toFixed(2)}</b>
                  </div>
                ) : null}
                {bestFrag?.records?.biggestFrag ? (
                  <div className="hall-record">
                    <span>
                      🔫 Maior frag em um mapa - <b>{bestFrag.records.biggestFragPlayer}</b> ({bestFrag.team_name})
                    </span>
                    <b>{bestFrag.records.biggestFrag} kills</b>
                  </div>
                ) : null}
              </div>

              <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
                Campanhas recentes
              </div>
              <div className="panel-body tight" style={{ padding: 0 }}>
                <table className="stats">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Jogador</th>
                      <th style={{ textAlign: 'left' }}>Time</th>
                      <th style={{ textAlign: 'left' }}>Elenco</th>
                      <th>Modo</th>
                      <th>Temp.</th>
                      <th>Resultado</th>
                      <th style={{ textAlign: 'left' }}>Campeão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns.map((c) => (
                      <tr key={c.id}>
                        <td style={{ textAlign: 'left', fontWeight: 700, color: c.placement === '1' ? 'var(--gold)' : 'var(--text-strong)' }}>
                          {c.placement === '1' ? '🏆 ' : ''}
                          {c.player ?? 'anônimo'}
                        </td>
                        <td style={{ fontWeight: 600 }}>{c.team_name}</td>
                        <td style={{ textAlign: 'left' }} className="muted small">
                          {(c.roster ?? []).map((p, i) => (
                            <span key={i} style={{ marginRight: 8, whiteSpace: 'nowrap' }}>
                              <Flag cc={p.country} /> {p.nick}
                            </span>
                          ))}
                        </td>
                        <td>{c.pool === 'br' ? '🇧🇷 GC' : '🌍 Major'}</td>
                        <td>{c.season}</td>
                        <td>{c.placement === '1' ? 'CAMPEÃO' : `${c.placement}º`}</td>
                        <td style={{ textAlign: 'left' }} className="muted">
                          {c.champion}
                        </td>
                      </tr>
                    ))}
                    {champions.length === 0 && data.campaigns.length === 0 && (
                      <tr>
                        <td colSpan={7} className="muted center">
                          Nenhuma campanha registrada ainda - seja o primeiro do Hall!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
