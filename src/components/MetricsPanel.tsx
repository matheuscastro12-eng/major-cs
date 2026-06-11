import { useCallback, useEffect, useState } from 'react';
import { adminPassword } from './AdminGate';

interface Metrics {
  totals: {
    visits: string;
    unique_visitors: string;
    visits_24h: string;
    visitors_24h: string;
    visitors_7d: string;
    games_started: string;
    games_finished: string;
    seasons_started: string;
    donate_clicks: string;
    share_cards: string;
  };
  visitsByDay: { day: string; visits: string; visitors: string }[];
  games: { titles: string; total: string };
  byDifficulty: { difficulty: string; games: string; titles: string }[];
  byPool: { pool: string; games: string }[];
  online: { lobbies_total: string; lobbies_7d: string; lobby_players_total: string; online_now?: string };
  last24h: { type: string; n: string }[];
  hall: { campaigns: string; titles: string };
}

const DIFF_LABEL: Record<string, string> = { normal: 'Normal', hard: 'Difícil', legend: 'Lendário' };

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="metric-card">
      <div className="mc-value">{value}</div>
      <div className="mc-label">{label}</div>
      {hint && <div className="mc-hint">{hint}</div>}
    </div>
  );
}

// Painel de métricas: o raio-x do crescimento do jogo.
export function MetricsPanel() {
  const [data, setData] = useState<Metrics | null>(null);
  const [err, setErr] = useState('');

  const requestMetrics = useCallback(() => {
    fetch('/api/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword() }),
      signal: AbortSignal.timeout(12000),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch((e) => setErr(e?.message === '401' ? 'Senha de admin inválida.' : 'Métricas indisponíveis (só funcionam no site publicado).'));
  }, []);

  const load = () => {
    setErr('');
    requestMetrics();
  };

  useEffect(() => {
    requestMetrics();
  }, [requestMetrics]);

  if (err) {
    return (
      <div className="panel">
        <div className="panel-head">📈 Métricas</div>
        <div className="panel-body muted">{err}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="panel">
        <div className="panel-head">📈 Métricas</div>
        <div className="panel-body muted">Carregando métricas…</div>
      </div>
    );
  }

  const t = data.totals;
  const conv = Number(t.games_started) > 0 ? ((Number(t.games_finished) / Number(t.games_started)) * 100).toFixed(0) : '0';
  const titleRate = Number(data.games.total) > 0 ? ((Number(data.games.titles) / Number(data.games.total)) * 100).toFixed(1) : '0';
  const maxV = Math.max(1, ...data.visitsByDay.map((d) => Number(d.visits)));

  return (
    <div className="panel">
      <div className="panel-head">
        📈 Métricas do jogo
        <span className="spacer" />
        <button className="btn ghost" onClick={load}>
          🔄 Atualizar
        </button>
      </div>
      <div className="panel-body">
        <div className="metric-grid">
          <Card label="Visitantes únicos (total)" value={t.unique_visitors} />
          <Card label="Visitantes hoje" value={t.visitors_24h} hint={`${t.visits_24h} visitas`} />
          <Card label="Visitantes (7 dias)" value={t.visitors_7d} />
          <Card label="Partidas iniciadas" value={t.games_started} />
          <Card label="Partidas concluídas" value={t.games_finished} hint={`${conv}% de conclusão`} />
          <Card label="Temporadas extras" value={t.seasons_started} hint="modo carreira" />
          <Card label="Taxa de título" value={`${titleRate}%`} hint="o quão fácil está ganhar" />
          <Card label="Jogadores online agora" value={data.online.online_now ?? '0'} hint="ativos nos ultimos 2 min" />
          <Card label="Salas online" value={data.online.lobbies_total} hint={`${data.online.lobbies_7d} esta semana`} />
          <Card label="Cliques em doar" value={t.donate_clicks} />
          <Card label="Cards compartilhados" value={t.share_cards} />
          <Card label="Campanhas no Hall" value={data.hall.campaigns} hint={`${data.hall.titles} títulos`} />
        </div>

        <div className="muted small" style={{ margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
          Visitas por dia (14 dias)
        </div>
        {data.visitsByDay.length === 0 && <div className="muted small">Sem visitas registradas ainda.</div>}
        {data.visitsByDay.map((d) => (
          <div key={d.day} className="lab-bar">
            {/* d.day é 'YYYY-MM-DD' do servidor (fuso SP); formatar direto da
                string evita o shift de -1 dia do parse UTC de new Date() */}
            <span>{String(d.day).slice(8, 10)}/{String(d.day).slice(5, 7)}</span>
            <span className="bar">
              <i style={{ width: `${(Number(d.visits) / maxV) * 100}%` }} />
            </span>
            <span className="muted">
              {d.visits} visitas · {d.visitors} únicos
            </span>
          </div>
        ))}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 18 }}>
          <div>
            <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
              Título por dificuldade
            </div>
            {data.byDifficulty.length === 0 && <div className="muted small">Sem partidas concluídas ainda.</div>}
            {data.byDifficulty.map((d) => {
              const rate = Number(d.games) > 0 ? ((Number(d.titles) / Number(d.games)) * 100).toFixed(1) : '0';
              return (
                <div key={d.difficulty} className="synergy-list">
                  <div className="item">
                    <span className="muted">
                      {DIFF_LABEL[d.difficulty] ?? d.difficulty} ({d.games} jogos)
                    </span>
                    <span className={Number(rate) > 35 ? 'neg' : 'pos'}>{rate}% título</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div>
            <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
              Modos mais jogados
            </div>
            {data.byPool.map((p) => (
              <div key={p.pool} className="synergy-list">
                <div className="item">
                  <span className="muted">{p.pool === 'br' ? '🇧🇷 GC Masters' : '🌍 Major Mundial'}</span>
                  <span className="pos">{p.games}</span>
                </div>
              </div>
            ))}
            <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, margin: '14px 0 6px' }}>
              Eventos nas últimas 24h
            </div>
            {data.last24h.map((e) => (
              <div key={e.type} className="synergy-list">
                <div className="item">
                  <span className="muted">{e.type}</span>
                  <span className="neutral">{e.n}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
