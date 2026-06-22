// Hub do online — escolhe um modo ranqueado (cada um explicado) + leaderboard.
// Porta fiel do OnlineHub.jsx. Ranking salvo só pra conta paga (gate de conta).
import { useEffect, useState } from 'react';
import { Panel, Button } from '../ds';
import { Flag } from '../ui';
import type { Manager } from '../../state/manager';
import type { Account } from '../../state/account';
import { getLadder, type RankRow } from '../../state/ranking';
import { rankFor, majorPlace, type OnlineStats } from './onlineData';

export type OnlineModeId = '1v1' | 'major' | 'gauntlet';

export function OnlineHub({ manager, stats, account, onPlay, onCasual, onExit }: {
  manager: Manager;
  stats: OnlineStats;
  account: Account | null;
  onPlay: (id: OnlineModeId) => void;
  onCasual: () => void;
  onExit: () => void;
}) {
  const me = manager;
  const rk = rankFor(stats.mmr);
  const paid = !!account?.paid;
  const [lb, setLb] = useState<OnlineModeId>('1v1');
  const [ladder, setLadder] = useState<RankRow[]>([]);
  useEffect(() => { void getLadder().then((d) => setLadder(d.ladder)); }, []);

  const MODES = [
    { id: '1v1' as const, icon: '⚔', tone: 'var(--rtm-blue-bright)', name: 'Ranked 1v1', players: '2 jogadores', ranked: 'MMR e elo', pitch: 'Duelo de draft contra um rival do seu nível.', how: ['O matchmaking acha um rival perto do seu MMR', 'Vocês sorteiam 5 lendas em draft alternado (snake)', 'Jogam uma melhor de 3 com veto de mapa', 'Vitória sobe seu MMR, derrota desce'] },
    { id: 'major' as const, icon: '🏆', tone: 'var(--rtm-gold)', name: 'Ranked Major', players: '2 a 8 managers', ranked: 'Pontos de temporada', pitch: 'Vários managers no mesmo Major. Quem chega mais longe pontua.', how: ['De 2 a 8 managers entram na mesma chave', 'Cada um monta o seu time de 5', 'Todos disputam a campanha: suíça, quartas, semi, final', 'A colocação final vira pontos: campeão 100, vice 70, semi 45...'] },
    { id: 'gauntlet' as const, icon: '🔥', tone: 'var(--rtm-green-bright)', name: 'Gauntlet', players: 'Solo vs fila', ranked: 'Maior sequência', pitch: 'Um time só contra uma fila de rivais cada vez mais fortes.', how: ['Você monta um único time', 'Enfrenta rivais em sequência, sem trocar ninguém', 'Cada vitória deixa o próximo rival mais forte', 'Sua pontuação é a maior sequência de vitórias. Perdeu, acabou'] },
  ];

  type LbRow = { nick: string; country: string; val: number; you: boolean; sub: string; subColor: string; fmt: string };
  function rows(): LbRow[] {
    if (lb === '1v1') {
      const mine = me.nick.toLowerCase();
      const base = ladder.map((r) => ({ nick: r.nick, country: '', val: r.mmr, you: r.nick.toLowerCase() === mine }));
      if (!base.some((r) => r.you)) base.push({ nick: me.nick, country: me.country, val: stats.mmr, you: true });
      return base.sort((a, b) => b.val - a.val).map((r) => ({ ...r, sub: rankFor(r.val).name, subColor: rankFor(r.val).color, fmt: r.val + ' MMR' }));
    }
    // Major e Gauntlet ainda não têm ranking de servidor — mostra só o seu número.
    if (lb === 'major') {
      const pl = majorPlace(stats.majorPts >= 100 ? 'champion' : 'semi');
      return [{ nick: me.nick, country: me.country, val: stats.majorPts, you: true, sub: 'Melhor: ' + pl.label, subColor: pl.color, fmt: stats.majorPts + ' pts' }];
    }
    return [{ nick: me.nick, country: me.country, val: stats.bestStreak, you: true, sub: 'Sequência recorde', subColor: 'var(--rtm-green-bright)', fmt: stats.bestStreak + ' seguidas' }];
  }
  const LB_NOTE: Record<OnlineModeId, string> = {
    '1v1': 'Ranking real por MMR (contas com ranking salvo). Ganhar sobe, perder desce.',
    major: 'Pontos de colocação dos seus Majors. Por enquanto o placar é só o seu.',
    gauntlet: 'A maior sequência de vitórias que você já emendou sem perder.',
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button type="button" onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--rtm-faint)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>⇤ Menu</button>
      </div>

      {/* banner do jogador */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--rtm-border)', boxShadow: 'var(--rtm-shadow-banner)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/maps/dust2.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.24 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(111,208,111,.14), rgba(13,17,22,.92) 60%)' }} />
        <div className="hub-banner-body" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '20px', padding: '22px 26px', flexWrap: 'wrap' }}>
          <span style={{ width: '70px', height: '70px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '24px', color: '#fff', background: `linear-gradient(160deg, ${me.accent || '#4382b6'}, #20303f)`, boxShadow: 'inset 0 0 0 3px rgba(255,255,255,.12)', flexShrink: 0 }}>{me.nick.slice(0, 2).toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--rtm-green-bright)', fontWeight: 800 }}>Modo online</div>
            <h1 style={{ margin: '2px 0', fontFamily: 'var(--font-cond)', fontSize: '30px', fontWeight: 800, color: 'var(--rtm-text-strong)' }}>{me.nick}</h1>
            <div style={{ fontSize: '13px', color: 'var(--rtm-dim)', display: 'flex', alignItems: 'center', gap: '8px' }}><Flag cc={me.country} /> <b style={{ color: rk.color }}>{rk.name}</b> · {stats.mmr} MMR</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {([['1v1', stats.w + 'W ' + stats.l + 'L', 'var(--rtm-green-bright)'], ['Major', stats.majorPts + ' pts', 'var(--rtm-gold)'], ['Gauntlet', stats.bestStreak + ' rec', 'var(--rtm-blue-bright)']] as [string, string, string][]).map(([k, v, c]) => (
              <div key={k} style={{ textAlign: 'center', padding: '8px 14px', borderRadius: 'var(--rtm-radius)', background: 'rgba(18,22,27,.55)', border: '1px solid var(--rtm-border-soft)' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--rtm-dim)', fontWeight: 700 }}>{k}</div>
                <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '17px', color: c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {!paid && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 26px', background: 'rgba(216,169,67,.1)', borderTop: '1px solid var(--rtm-gold-soft)', fontSize: '12.5px', color: 'var(--rtm-dim)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--rtm-gold)', fontWeight: 800 }}>★</span>
            Você joga casual à vontade. Para o seu rank entrar no <b style={{ color: 'var(--rtm-text)' }}>ranking salvo</b>, ative a conta vitalícia.
            <a href="/" style={{ marginLeft: 'auto', color: 'var(--rtm-link)', fontWeight: 700, whiteSpace: 'nowrap' }}>Ativar conta →</a>
          </div>
        )}
      </div>

      {/* grid de modos */}
      <div className="rtm-online-modes" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {MODES.map((m) => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ position: 'relative', padding: '18px 20px', borderBottom: '1px solid var(--rtm-border-soft)' }}>
              <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: m.tone }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '26px', width: '46px', height: '46px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--rtm-bg-deep)', border: '1px solid var(--rtm-border-soft)' }}>{m.icon}</span>
                <div>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-cond)', fontSize: '21px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>{m.name}</h2>
                  <div style={{ fontSize: '11.5px', color: m.tone, fontWeight: 700 }}>{m.players}</div>
                </div>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '13px', color: 'var(--rtm-text)', lineHeight: 1.5 }}>{m.pitch}</p>
            </div>
            <div style={{ padding: '16px 20px', flex: 1 }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--rtm-dim)', fontWeight: 700, marginBottom: '10px' }}>Como funciona</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {m.how.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '12.5px', color: 'var(--rtm-dim)', lineHeight: 1.45 }}>
                    <span style={{ flexShrink: 0, width: '18px', height: '18px', borderRadius: '50%', background: 'var(--rtm-bg-deep)', border: '1px solid var(--rtm-border-soft)', color: m.tone, fontSize: '10px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    {h}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '0 20px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--rtm-faint)', marginBottom: '12px' }}>
                <span style={{ color: 'var(--rtm-dim)' }}>Vale para:</span> <b style={{ color: m.tone }}>{m.ranked}</b>
              </div>
              <Button variant={m.id === 'major' ? 'gold' : 'primary'} style={{ width: '100%' }} onClick={() => onPlay(m.id)}>Jogar {m.name}</Button>
            </div>
          </div>
        ))}
      </div>

      {/* casual com amigos (salas reais, sem ranking) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', borderRadius: '12px', padding: '16px 20px' }}>
        <span style={{ fontSize: '28px', width: '50px', height: '50px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--rtm-bg-deep)', border: '1px solid var(--rtm-border-soft)', flexShrink: 0 }}>👥</span>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <b style={{ fontFamily: 'var(--font-cond)', fontSize: '19px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>Casual · jogar com amigos</b>
          <div style={{ fontSize: '12.5px', color: 'var(--rtm-dim)', marginTop: '2px' }}>Crie uma sala <b style={{ color: 'var(--rtm-text)' }}>aberta</b> (qualquer um entra) ou <b style={{ color: 'var(--rtm-text)' }}>fechada</b> (só com o código que você manda pros amigos). Duelo 1v1 ou Major em grupo, ao vivo. Não conta pro ranking.</div>
        </div>
        <Button variant="ghost" onClick={onCasual} style={{ whiteSpace: 'nowrap' }}>Criar / entrar em sala</Button>
      </div>

      {/* leaderboard */}
      <Panel title="Ranking" accent="gold" flush actions={
        <span style={{ display: 'flex', gap: '6px' }}>
          {([['1v1', 'Ranked 1v1'], ['major', 'Ranked Major'], ['gauntlet', 'Gauntlet']] as [OnlineModeId, string][]).map(([id, lbl]) => (
            <button key={id} type="button" onClick={() => setLb(id)} style={{ cursor: 'pointer', borderRadius: '999px', padding: '5px 13px', fontSize: '12px', fontWeight: 700, border: `1px solid ${lb === id ? 'var(--rtm-gold)' : 'var(--rtm-border)'}`, background: lb === id ? 'var(--rtm-gold)' : 'transparent', color: lb === id ? '#06121d' : 'var(--rtm-dim)' }}>{lbl}</button>
          ))}
        </span>
      }>
        <div style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--rtm-faint)', borderBottom: '1px solid var(--rtm-border-soft)' }}>{LB_NOTE[lb]}{!paid && ' (no casual seu rank não é salvo)'}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <tbody>
            {rows().map((r, i) => (
              <tr key={r.nick + i} style={{ background: r.you ? 'rgba(216,169,67,.1)' : (i % 2 ? 'var(--rtm-row-b)' : 'var(--rtm-row-a)'), boxShadow: r.you ? 'inset 3px 0 0 var(--rtm-gold)' : 'none' }}>
                <td style={{ padding: '10px 14px', width: '44px', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '16px', color: i === 0 ? 'var(--rtm-gold)' : i < 3 ? 'var(--rtm-text-strong)' : 'var(--rtm-faint)' }}>{i + 1}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    {r.country && <Flag cc={r.country} />}
                    <b style={{ fontFamily: 'var(--font-cond)', fontSize: '15px', color: r.you ? 'var(--rtm-gold)' : 'var(--rtm-text-strong)' }}>{r.nick}</b>
                    {r.you && <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', color: '#06121d', background: 'var(--rtm-gold)', padding: '2px 7px', borderRadius: '999px' }}>Você</span>}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', color: r.subColor, fontSize: '11.5px', fontWeight: 700 }}>{r.sub}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '15px', color: 'var(--rtm-text-strong)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.fmt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
