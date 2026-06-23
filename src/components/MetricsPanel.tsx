import { useCallback, useEffect, useState } from 'react';
import { adminPassword } from './AdminGate';
import { Flag } from './ui';
import { ct } from '../state/career-i18n';

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
    ad_clicks: string;
    ad_clicks_24h: string;
    share_cards: string;
  };
  visitsByDay: { day: string; visits: string; visitors: string }[];
  games: { titles: string; total: string };
  byDifficulty: { difficulty: string; games: string; titles: string }[];
  byPool: { pool: string; games: string }[];
  online: { lobbies_total: string; lobbies_7d: string; lobby_players_total: string; online_now?: string };
  last24h: { type: string; n: string }[];
  hall: { campaigns: string; titles: string };
  byCountry?: { country: string; visits: string; visitors: string }[];
}

const COUNTRY_NAME: Record<string, string> = {
  br: 'Brasil', us: 'Estados Unidos', pt: 'Portugal', ar: 'Argentina', de: 'Alemanha',
  fr: 'França', gb: 'Reino Unido', es: 'Espanha', pl: 'Polônia', ru: 'Rússia', ua: 'Ucrânia',
  se: 'Suécia', dk: 'Dinamarca', fi: 'Finlândia', no: 'Noruega', nl: 'Holanda', tr: 'Turquia',
  ca: 'Canadá', mx: 'México', cl: 'Chile', co: 'Colômbia', pe: 'Peru', uy: 'Uruguai',
  it: 'Itália', cz: 'Tchéquia', au: 'Austrália', cn: 'China', kz: 'Cazaquistão', in: 'Índia',
};

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
      .catch((e) => setErr(e?.message === '401' ? ct('Senha de admin inválida.') : ct('Métricas indisponíveis (só funcionam no site publicado).')));
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
        <div className="panel-head">📈 {ct('Métricas')}</div>
        <div className="panel-body muted">{err}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="panel">
        <div className="panel-head">📈 {ct('Métricas')}</div>
        <div className="panel-body muted">{ct('Carregando métricas…')}</div>
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
        📈 {ct('Métricas do jogo')}
        <span className="spacer" />
        <button className="btn ghost" onClick={load}>
          🔄 {ct('Atualizar')}
        </button>
      </div>
      <div className="panel-body">
        <div className="metric-grid">
          <Card label={ct('Visitantes únicos (total)')} value={t.unique_visitors} />
          <Card label={ct('Visitantes hoje')} value={t.visitors_24h} hint={`${t.visits_24h} ${ct('visitas')}`} />
          <Card label={ct('Visitantes (7 dias)')} value={t.visitors_7d} />
          <Card label={ct('Partidas iniciadas')} value={t.games_started} />
          <Card label={ct('Partidas concluídas')} value={t.games_finished} hint={`${conv}% ${ct('de conclusão')}`} />
          <Card label={ct('Temporadas extras')} value={t.seasons_started} hint={ct('modo carreira')} />
          <Card label={ct('Taxa de título')} value={`${titleRate}%`} hint={ct('o quão fácil está ganhar')} />
          <Card label={ct('Jogadores online agora')} value={data.online.online_now ?? '0'} hint={ct('ativos nos ultimos 2 min')} />
          <Card label={ct('Salas online')} value={data.online.lobbies_total} hint={`${data.online.lobbies_7d} ${ct('esta semana')}`} />
          <Card label={ct('Cliques em doar')} value={t.donate_clicks} />
          <Card label={ct('Cliques no banner (G4)')} value={t.ad_clicks} hint={`${t.ad_clicks_24h} ${ct('nas últimas 24h')}`} />
          <Card label={ct('Cards compartilhados')} value={t.share_cards} />
          <Card label={ct('Campanhas no Hall')} value={data.hall.campaigns} hint={`${data.hall.titles} ${ct('títulos')}`} />
        </div>

        <div className="muted small" style={{ margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
          {ct('Visitas por dia (14 dias)')}
        </div>
        {data.visitsByDay.length === 0 && <div className="muted small">{ct('Sem visitas registradas ainda.')}</div>}
        {data.visitsByDay.map((d) => (
          <div key={d.day} className="lab-bar">
            {/* d.day é 'YYYY-MM-DD' do servidor (fuso SP); formatar direto da
                string evita o shift de -1 dia do parse UTC de new Date() */}
            <span>{String(d.day).slice(8, 10)}/{String(d.day).slice(5, 7)}</span>
            <span className="bar">
              <i style={{ width: `${(Number(d.visits) / maxV) * 100}%` }} />
            </span>
            <span className="muted">
              {d.visits} {ct('visitas')} · {d.visitors} {ct('únicos')}
            </span>
          </div>
        ))}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 18 }}>
          <div>
            <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
              {ct('Título por dificuldade')}
            </div>
            {data.byDifficulty.length === 0 && <div className="muted small">{ct('Sem partidas concluídas ainda.')}</div>}
            {data.byDifficulty.map((d) => {
              const rate = Number(d.games) > 0 ? ((Number(d.titles) / Number(d.games)) * 100).toFixed(1) : '0';
              return (
                <div key={d.difficulty} className="synergy-list">
                  <div className="item">
                    <span className="muted">
                      {ct(DIFF_LABEL[d.difficulty] ?? d.difficulty)} ({d.games} {ct('jogos')})
                    </span>
                    <span className={Number(rate) > 35 ? 'neg' : 'pos'}>{rate}% {ct('título')}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div>
            <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
              {ct('Modos mais jogados')}
            </div>
            {data.byPool.map((p) => (
              <div key={p.pool} className="synergy-list">
                <div className="item">
                  <span className="muted">{p.pool === 'br' ? '🇧🇷 GC Masters' : '🌍 ' + ct('Major Mundial')}</span>
                  <span className="pos">{p.games}</span>
                </div>
              </div>
            ))}
            <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, margin: '14px 0 6px' }}>
              {ct('Países dos visitantes')}
            </div>
            {(() => {
              const list = data.byCountry ?? [];
              if (list.length === 0) {
                return <div className="muted small">{ct('Sem dados de país ainda (começa a contar a partir de agora, no site publicado).')}</div>;
              }
              const max = Math.max(1, ...list.map((c) => Number(c.visitors)));
              return list.map((c) => (
                <div key={c.country} className="country-row">
                  <Flag cc={c.country} />
                  <span className="country-name">{COUNTRY_NAME[c.country] ? ct(COUNTRY_NAME[c.country]) : c.country.toUpperCase()}</span>
                  <span className="country-bar"><i style={{ width: `${(Number(c.visitors) / max) * 100}%` }} /></span>
                  <span className="country-n">{c.visitors}</span>
                </div>
              ));
            })()}
            <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, margin: '14px 0 6px' }}>
              {ct('Eventos nas últimas 24h')}
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
