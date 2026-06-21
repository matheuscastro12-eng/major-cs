// Ranking competitivo do online — temporada atual, sua posição, ladder top 50 e
// campeões da temporada passada. Estilo da tabela espelha o RankingTeams.jsx do design.
import { useEffect, useState, type CSSProperties } from 'react';
import { Button, Panel } from './ds';
import type { Account } from '../state/account';
import { getLadder, getChampions, fetchMyRank, type RankRow, type MyRank, type Champion } from '../state/ranking';

const DIV_COLOR: Record<string, string> = {
  Calibrando: 'var(--rtm-dim)',
  Prata: '#b9c2cf',
  'Ouro Nova': 'var(--rtm-gold)',
  'Mestre Guardião': 'var(--rtm-blue-bright)',
  'Águia': '#c792ea',
  'Global Elite': '#e8743b',
};
export function DivBadge({ d }: { d: string }) {
  const c = DIV_COLOR[d] ?? 'var(--rtm-dim)';
  return <span style={{ display: 'inline-block', fontSize: '10.5px', fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: c, background: 'color-mix(in srgb, ' + c + ' 15%, transparent)', border: '1px solid color-mix(in srgb, ' + c + ' 40%, transparent)', padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap' }}>{d}</span>;
}

function countdown(iso: string): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'encerrando';
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

const th: CSSProperties = { background: 'var(--rtm-header)', color: 'var(--rtm-dim)', fontSize: '11px', padding: '8px 12px', borderBottom: '1px solid var(--rtm-border-soft)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.5px' };
const cond: CSSProperties = { fontFamily: 'var(--font-cond)', fontWeight: 800 };

export function Leaderboard({ account, onBack, onUpgrade }: { account: Account | null; onBack: () => void; onUpgrade: () => void }) {
  const paid = !!account?.paid;
  const [data, setData] = useState<{ total: number; ladder: RankRow[]; season: number; endsAt: string } | null>(null);
  const [mine, setMine] = useState<MyRank | null>(null);
  const [champs, setChamps] = useState<{ season: number; champions: Champion[] } | null>(null);

  useEffect(() => { void getLadder().then(setData); void getChampions().then(setChamps); }, []);
  useEffect(() => { if (paid) void fetchMyRank(account?.nick).then(setMine); }, [paid, account?.nick]);

  const myNick = (mine && account?.nick) || account?.nick;
  return (
    <div className="rtm-fade-in" style={{ maxWidth: '1180px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* banner da temporada */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--rtm-border)', boxShadow: 'var(--rtm-shadow-banner)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/maps/nuke.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.2 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(216,169,67,.18) 0%, rgba(13,17,22,.92) 60%)' }} />
        <div className="hub-banner-body" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '18px', padding: '22px 26px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--rtm-gold)', fontWeight: 800 }}>Ranking competitivo · Online</div>
            <h1 style={{ margin: '4px 0 0', ...cond, fontSize: '34px', color: 'var(--rtm-text-strong)', textTransform: 'uppercase', letterSpacing: '1px' }}>Temporada {data?.season ?? '—'}</h1>
            <div style={{ fontSize: '13.5px', color: 'var(--rtm-dim)', marginTop: '4px' }}>
              {data ? <>Termina em <b style={{ color: 'var(--rtm-text-strong)' }}>{countdown(data.endsAt)}</b> · {data.total} {data.total === 1 ? 'manager' : 'managers'} no ladder</> : 'Carregando…'}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>⇤ Menu</Button>
        </div>
      </div>

      {/* sua posição */}
      {paid && mine && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1px', background: 'var(--rtm-border-soft)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--rtm-border)' }} className="rtm-kpis">
          {([['Sua posição', mine.placing ? '—' : `#${mine.rank}`], ['MMR', String(mine.mmr)], ['Divisão', mine.division], ['Vitórias', `${mine.wins}-${mine.losses}`], ['Pico', String(mine.peak)]] as [string, string][]).map(([k, v], i) => (
            <div key={k} style={{ padding: '14px 12px', textAlign: 'center', background: 'var(--rtm-panel)' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--rtm-dim)', fontWeight: 700 }}>{k}</div>
              {k === 'Divisão' ? <div style={{ marginTop: '5px' }}><DivBadge d={v} /></div> : <div style={{ ...cond, fontSize: '22px', color: i === 1 || i === 4 ? 'var(--rtm-gold)' : 'var(--rtm-text-strong)' }}>{v}</div>}
            </div>
          ))}
        </div>
      )}
      {paid && mine?.placing && (
        <p className="muted small" style={{ margin: 0, color: 'var(--rtm-gold)' }}>🎯 Calibrando: faltam {mine.placementLeft} {mine.placementLeft === 1 ? 'partida' : 'partidas'} de colocação pra cravar sua divisão.</p>
      )}

      <div className="rtm-career-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: '16px', alignItems: 'start' }}>
        {/* ladder */}
        <Panel title={`Ladder · Temporada ${data?.season ?? ''}`} accent="blue" flush>
          {!data || data.ladder.length === 0 ? (
            <p className="muted small" style={{ padding: '18px' }}>Ninguém pontuou nesta temporada ainda. Jogue uma ranqueada e seja o primeiro.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: 'left' }}>#</th>
                  <th style={{ ...th, textAlign: 'left' }}>Manager</th>
                  <th style={{ ...th, textAlign: 'left' }}>Divisão</th>
                  <th style={{ ...th, textAlign: 'right' }}>V-D</th>
                  <th style={{ ...th, textAlign: 'right' }}>MMR</th>
                </tr></thead>
                <tbody>
                  {data.ladder.map((r, i) => {
                    const isMe = !!myNick && r.nick.toLowerCase() === myNick.toLowerCase();
                    return (
                      <tr key={r.nick + i} style={{ background: isMe ? 'rgba(67,130,182,.16)' : i % 2 ? 'var(--rtm-row-b)' : 'var(--rtm-row-a)', boxShadow: isMe ? 'inset 3px 0 0 var(--rtm-blue-bright)' : 'none' }}>
                        <td style={{ padding: '10px 12px', ...cond, fontSize: '15px', color: i < 3 ? 'var(--rtm-gold)' : 'var(--rtm-faint)' }}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : r.rank}</td>
                        <td style={{ padding: '10px 12px' }}><b style={{ color: isMe ? 'var(--rtm-blue-bright)' : 'var(--rtm-text-strong)' }}>{r.nick}</b>{isMe && <span className="muted small"> · você</span>}</td>
                        <td style={{ padding: '10px 12px' }}><DivBadge d={r.division} /></td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--rtm-text)' }}>{r.wins}-{r.losses}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', ...cond, fontVariantNumeric: 'tabular-nums', color: 'var(--rtm-text-strong)' }}>{r.mmr}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* rail: campeões + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Panel title={champs && champs.season >= 0 ? `Campeões · Temporada ${champs.season}` : 'Campeões'} accent="gold">
            {!champs || champs.champions.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>Quando a temporada virar, os 10 primeiros ficam eternizados aqui.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {champs.champions.map((c) => (
                  <div key={c.place} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px' }}>
                    <span style={{ ...cond, width: '22px', color: c.place <= 3 ? 'var(--rtm-gold)' : 'var(--rtm-faint)' }}>{c.place <= 3 ? ['🥇', '🥈', '🥉'][c.place - 1] : c.place}</span>
                    <b style={{ flex: 1, color: 'var(--rtm-text-strong)' }}>{c.nick}</b>
                    <span style={{ ...cond, color: 'var(--rtm-gold)', fontVariantNumeric: 'tabular-nums' }}>{c.mmr}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {!paid && (
            <Panel title="Entre no ranking" accent="gold">
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--rtm-dim)', lineHeight: 1.5 }}>O ladder salvo é da conta vitalícia. No grátis você joga ranqueada, mas o MMR não persiste entre sessões.</p>
              <Button variant="gold" style={{ width: '100%' }} onClick={onUpgrade}>Ativar conta vitalícia (R$20)</Button>
            </Panel>
          )}

          <Panel title="Como funciona">
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--rtm-dim)', lineHeight: 1.7 }}>
              <li>Vitória rende <b>+25</b> de MMR, derrota tira até <b>20</b>.</li>
              <li>As <b>5 primeiras</b> partidas da temporada são de colocação (valem mais).</li>
              <li>Divisões: Prata → Ouro Nova → Mestre Guardião → Águia → Global Elite.</li>
              <li>A cada mês a temporada vira e o MMR faz um <b>soft-reset</b> rumo a 1000.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
