// Perfil do manager — fiel ao ProfileScreen.jsx do design: banner de identidade +
// KPIs + detalhes + status da conta. Usa o manager (local), a conta (paga?) e o
// MMR do ranking online (dados reais).
import { useEffect, useState, type CSSProperties } from 'react';
import { Flag } from './ui';
import { Button, Panel } from './ds';
import { DivBadge } from './Leaderboard';
import type { Account } from '../state/account';
import { fetchMyRank, type MyRank } from '../state/ranking';
import type { Manager } from '../state/manager';

export function ManagerProfile({ manager, account, onBack, onEdit, onUpgrade }: {
  manager: Manager;
  account: Account | null;
  onBack: () => void;
  onEdit: () => void;
  onUpgrade: () => void;
}) {
  const paid = !!account?.paid;
  const [rank, setRank] = useState<MyRank | null>(null);
  useEffect(() => { if (paid) void fetchMyRank(manager.nick).then(setRank); }, [paid, manager.nick]);

  const games = rank ? rank.wins + rank.losses : 0;
  const winRate = games ? Math.round((rank!.wins / games) * 100) : 0;
  const KPI: [string, string | number, string][] = [
    ['MMR', paid ? (rank?.mmr ?? '—') : '★', 'var(--rtm-gold)'],
    ['Divisão', paid ? (rank?.division ?? '—') : '—', 'var(--rtm-text-strong)'],
    ['Vitórias', rank ? `${rank.wins}-${rank.losses}` : '0-0', 'var(--rtm-green-bright)'],
    ['Win rate', `${winRate}%`, 'var(--rtm-text-strong)'],
    ['Pico', paid ? (rank?.peak ?? '—') : '—', 'var(--rtm-gold)'],
  ];

  const cond: CSSProperties = { fontFamily: 'var(--font-cond)', fontWeight: 800 };
  return (
    <div className="rtm-fade-in" style={{ maxWidth: '1180px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* banner de identidade */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--rtm-border)', boxShadow: 'var(--rtm-shadow-banner)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/maps/mirage.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.22 }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(115deg, ${manager.accent}2e 0%, rgba(13,17,22,.92) 60%)` }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '20px', padding: '24px 26px', flexWrap: 'wrap' }}>
          <span style={{ width: '84px', height: '84px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '30px', color: '#fff', background: `linear-gradient(160deg, ${manager.accent}, #20303f)`, boxShadow: 'inset 0 0 0 3px rgba(255,255,255,.14)', flexShrink: 0 }}>{manager.nick.slice(0, 2).toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, ...cond, fontSize: '34px', color: 'var(--rtm-text-strong)', letterSpacing: '.5px' }}>{manager.nick}</h1>
              {paid
                ? <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#06121d', background: 'var(--rtm-gold)', padding: '3px 9px', borderRadius: '999px' }}>★ Conta vitalícia</span>
                : <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--rtm-dim)', background: 'var(--rtm-bg-deep)', border: '1px solid var(--rtm-border-soft)', padding: '3px 9px', borderRadius: '999px' }}>{account ? 'Grátis' : 'Convidado'}</span>}
              {paid && rank && <DivBadge d={rank.division} />}
            </div>
            <div style={{ fontSize: '13.5px', color: 'var(--rtm-dim)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
              <Flag cc={manager.country} /> {manager.name || manager.nick}{manager.age ? `, ${manager.age} anos` : ''} · {manager.org}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <Button variant="ghost" size="sm" onClick={onEdit}>✎ Editar perfil</Button>
            <Button variant="ghost" size="sm" onClick={onBack}>⇤ Menu</Button>
          </div>
        </div>
        {/* KPIs */}
        <div className="rtm-kpis" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderTop: '1px solid var(--rtm-border-soft)' }}>
          {KPI.map(([k, v, c], i) => (
            <div key={k} style={{ padding: '14px 16px', textAlign: 'center', borderLeft: i ? '1px solid var(--rtm-border-soft)' : 'none', background: 'rgba(18,22,27,.4)' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--rtm-dim)', fontWeight: 700 }}>{k}</div>
              <div style={{ ...cond, fontSize: '22px', color: c }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rtm-career-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: '16px', alignItems: 'start' }}>
        {/* esquerda: ranking online */}
        <Panel title="Ranking online" accent="gold">
          {paid ? (
            rank ? (
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div><div style={{ ...cond, fontSize: '40px', color: 'var(--rtm-gold)' }}>{rank.mmr}</div><div className="muted small">MMR · {rank.division}</div></div>
                <div><div style={{ ...cond, fontSize: '22px', color: 'var(--rtm-text-strong)' }}>#{rank.rank}</div><div className="muted small">no mundo</div></div>
                <div><div style={{ ...cond, fontSize: '22px', color: 'var(--rtm-green-bright)' }}>{rank.wins}-{rank.losses}</div><div className="muted small">vitórias · {winRate}% win rate</div></div>
                <div><div style={{ ...cond, fontSize: '22px', color: 'var(--rtm-gold)' }}>{rank.peak}</div><div className="muted small">MMR de pico</div></div>
              </div>
            ) : <p className="muted small" style={{ margin: 0 }}>Jogue uma partida online ranqueada pra entrar no ladder.</p>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>O ranking salvo é da conta vitalícia. No grátis você joga online, mas os pontos não persistem.</p>
          )}
        </Panel>

        {/* direita: detalhes + conta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Panel title="Detalhes">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
              {([['Nick', manager.nick], ['Nome', manager.name || '—'], ['Idade', manager.age ? `${manager.age} anos` : '—'], ['País', manager.country.toUpperCase()], ['Organização', manager.org]] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', paddingBottom: '9px', borderBottom: '1px solid var(--rtm-border-soft)' }}>
                  <span style={{ color: 'var(--rtm-dim)' }}>{k}</span><b style={{ color: 'var(--rtm-text-strong)' }}>{v}</b>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Conta" accent={paid ? 'gold' : 'blue'}>
            {paid ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(216,169,67,.16)', border: '1px solid var(--rtm-gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--rtm-gold)', fontSize: '18px' }}>★</span>
                  <div><div style={{ ...cond, fontWeight: 700, color: 'var(--rtm-text-strong)', fontSize: '15px' }}>Conta vitalícia ativa</div><div style={{ fontSize: '11.5px', color: 'var(--rtm-dim)' }}>{account?.email}</div></div>
                </div>
                {['Save sincronizado em todos os aparelhos', 'Ranking e MMR salvos no online', 'Histórico completo de partidas'].map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '9px', fontSize: '13px', color: 'var(--rtm-dim)', padding: '4px 0' }}><span style={{ color: 'var(--rtm-gold)', fontWeight: 800 }}>✓</span>{f}</div>
                ))}
              </div>
            ) : (
              <div>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--rtm-dim)', lineHeight: 1.5 }}>Você joga de graça com save no navegador. A conta vitalícia guarda tudo na nuvem e libera o ranking salvo do online.</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ ...cond, fontSize: '30px', color: 'var(--rtm-gold)' }}>R$20</span>
                  <span style={{ fontSize: '12px', color: 'var(--rtm-dim)' }}>uma vez, acesso vitalício</span>
                </div>
                <Button variant="gold" style={{ width: '100%' }} onClick={onUpgrade}>Ativar conta vitalícia</Button>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
