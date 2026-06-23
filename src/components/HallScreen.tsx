import { useEffect, useState, type CSSProperties } from 'react';
import { Flag, PlayerAvatar } from './ui';
import { Button, Panel } from './ds';
import { ct } from '../state/career-i18n';

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

// Hall da Fama — reconstruído fiel ao design kit (HallOfFame.jsx): hero do campeão
// mais recente, recordes em pills, e a tabela de campanhas num Painel do design.
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
  const latest = champions[0] ?? null;
  const bestRating = data?.campaigns.reduce<Campaign | null>(
    (best, c) => ((c.records?.bestRating ?? 0) > (best?.records?.bestRating ?? 0) ? c : best),
    null,
  );
  const bestFrag = data?.campaigns.reduce<Campaign | null>(
    (best, c) => ((c.records?.biggestFrag ?? 0) > (best?.records?.biggestFrag ?? 0) ? c : best),
    null,
  );

  const pill: CSSProperties = { background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', borderRadius: 'var(--rtm-radius)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' };
  const pillK: CSSProperties = { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--rtm-dim)', fontWeight: 700 };
  const pillV: CSSProperties = { fontFamily: 'var(--rtm-font-cond)', fontWeight: 800, fontSize: '24px', color: 'var(--rtm-gold)' };
  const th: CSSProperties = { background: 'var(--rtm-header)', color: 'var(--rtm-dim)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.5px', padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--rtm-border-soft)', whiteSpace: 'nowrap' };

  return (
    <div className="rtm-fade-in" style={{ maxWidth: '1180px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--rtm-font-cond)', fontSize: '26px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--rtm-text-strong)' }}>🏛 {ct('Hall da Fama')}</h1>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={onBack}>← {ct('Voltar')}</Button>
      </div>

      {!data && !err && <div style={{ color: 'var(--rtm-dim)', padding: '24px' }}>{ct('Carregando o hall…')}</div>}
      {err && <div style={{ color: 'var(--rtm-dim)', padding: '24px' }}>{ct('Hall indisponível agora. Jogue offline que os títulos não fogem.')}</div>}

      {data && (
        <>
          {/* hero do campeão mais recente */}
          {latest && (
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--rtm-radius)', border: '1px solid var(--rtm-gold-soft)', background: 'linear-gradient(120deg, rgba(216,169,67,.12), var(--rtm-panel))', boxShadow: '0 0 0 1px rgba(216,169,67,.18), 0 8px 30px rgba(0,0,0,.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '22px 24px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '56px', lineHeight: 1 }}>🏆</div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontSize: '11px', letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--rtm-gold)', fontWeight: 700 }}>{ct('Campeão mais recente · Temporada')} {latest.season}</div>
                  <div style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '30px', fontWeight: 800, color: 'var(--rtm-text-strong)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '2px 0' }}>{latest.team_name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--rtm-dim)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {ct('dirigido por')} <b style={{ color: 'var(--rtm-link)' }}>{latest.player ?? ct('anônimo')}</b>
                    {latest.mvp && <> · MVP <b style={{ color: 'var(--rtm-gold)' }}>{latest.mvp}</b></>}
                  </div>
                </div>
                {latest.mvp && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', background: 'var(--rtm-panel-2)', border: '1px solid var(--rtm-gold-soft)', borderRadius: 'var(--rtm-radius)', padding: '12px 18px' }}>
                    <PlayerAvatar nick={latest.mvp} size={48} />
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '2px', color: 'var(--rtm-gold)', textTransform: 'uppercase', fontWeight: 700 }}>{ct('MVP da final')}</div>
                      <div style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '20px', fontWeight: 700, color: 'var(--rtm-text-strong)' }}>{latest.mvp}</div>
                      {latest.records?.bestRating ? <div style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '13px', color: 'var(--rtm-green-bright)', fontWeight: 700 }}>{latest.records.bestRating.toFixed(2)} rating</div> : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* recordes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            <div style={pill}><span style={pillK}>🏆 {ct('Títulos registrados')}</span><b style={pillV}>{data.totalTitles}</b></div>
            {bestRating?.records?.bestRating ? (
              <div style={pill}><span style={pillK}>📈 {ct('Melhor rating')} · {bestRating.records.bestRatingPlayer} ({bestRating.team_name})</span><b style={{ ...pillV, color: 'var(--rtm-green-bright)' }}>{bestRating.records.bestRating.toFixed(2)}</b></div>
            ) : null}
            {bestFrag?.records?.biggestFrag ? (
              <div style={pill}><span style={pillK}>🔫 {ct('Maior frag')} · {bestFrag.records.biggestFragPlayer} ({bestFrag.team_name})</span><b style={{ ...pillV, color: 'var(--rtm-text-strong)' }}>{bestFrag.records.biggestFrag} kills</b></div>
            ) : null}
          </div>

          {/* campanhas */}
          <Panel title={ct('Campanhas registradas')} accent="gold" flush>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>{['Jogador', 'Time', 'Elenco', 'Modo', 'Temp.', 'Resultado', 'Campeão'].map((h) => <th key={h} style={th}>{ct(h)}</th>)}</tr>
              </thead>
              <tbody>
                {data.campaigns.map((c, i) => (
                  <tr key={c.id} style={{ background: i % 2 ? 'var(--rtm-row-b)' : 'var(--rtm-row-a)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: c.placement === '1' ? 'var(--rtm-gold)' : 'var(--rtm-text-strong)', whiteSpace: 'nowrap' }}>{c.placement === '1' ? '🏆 ' : ''}{c.player ?? ct('anônimo')}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--rtm-text)' }}>{c.team_name}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--rtm-dim)', fontSize: '12px' }}>{(c.roster ?? []).map((p, j) => <span key={j} style={{ marginRight: 8, whiteSpace: 'nowrap' }}><Flag cc={p.country} /> {p.nick}</span>)}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--rtm-dim)' }}>{c.pool === 'br' ? '🇧🇷 GC' : '🌍 Major'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--rtm-dim)', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{c.season}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: c.placement === '1' ? 'var(--rtm-gold)' : 'var(--rtm-text)' }}>{c.placement === '1' ? ct('CAMPEÃO') : `${c.placement}º`}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--rtm-dim)' }}>{c.champion}</td>
                  </tr>
                ))}
                {data.campaigns.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: 'var(--rtm-dim)' }}>{ct('Nenhuma campanha registrada ainda. Seja o primeiro do Hall!')}</td></tr>
                )}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
