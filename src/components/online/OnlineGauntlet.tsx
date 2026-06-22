// Gauntlet — um time só contra uma fila de rivais cada vez mais fortes.
// Nota = maior sequência. Porta fiel do OnlineGauntlet.jsx.
import { useState } from 'react';
import { Panel, Button } from '../ds';
import { Flag } from '../ui';
import { BackBar } from './bits';
import { QuickDraft } from './QuickDraft';
import { resolve, type OnlineStats, type PoolPlayer } from './onlineData';

type Entry = { idx: number; opp: string; cc: string; win: boolean; score: string; ovr: number };

export function OnlineGauntlet({ pool, stats, setStats, onHub, onExit }: {
  pool: PoolPlayer[];
  stats: OnlineStats;
  setStats: (fn: (s: OnlineStats) => OnlineStats) => void;
  onHub: () => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<'intro' | 'draft' | 'run' | 'over'>('intro');
  const [myOvr, setMyOvr] = useState(0);
  const [streak, setStreak] = useState(0);
  const [log, setLog] = useState<Entry[]>([]);
  const [rolling, setRolling] = useState(false);

  // cada rival é um ESQUADRÃO DE IA montado com lendas do pool; a força sobe com a
  // sequência (a IA escolhe um time mais forte a cada vitória sua).
  const aiOpp = (s: number) => {
    const target = 78 + s * 2.2;
    const five = [...pool].sort((a, b) => Math.abs(a.ovr - target) - Math.abs(b.ovr - target)).slice(0, 5).sort((a, b) => b.ovr - a.ovr);
    const ovr = five.length ? Math.round(five.reduce((a, p) => a + p.ovr, 0) / five.length) : Math.round(target);
    return { name: `Esquadrão IA #${s + 1}`, ovr, star: five[0]?.nick ?? 'IA', cc: five[0]?.country ?? 'br' };
  };

  function onDrafted(_picked: PoolPlayer[], avg: number) { setMyOvr(avg); setStreak(0); setLog([]); setPhase('run'); }

  function fight() {
    if (rolling) return;
    setRolling(true);
    const cur = streak;
    window.setTimeout(() => {
      const o = aiOpp(cur);
      const res = resolve(myOvr, o.ovr);
      setLog((l) => [{ idx: cur + 1, opp: o.name, cc: o.cc, win: res.win, score: res.score, ovr: o.ovr }, ...l]);
      setRolling(false);
      if (res.win) setStreak(cur + 1);
      else { setStats((s) => ({ ...s, bestStreak: Math.max(s.bestStreak, cur) })); setPhase('over'); }
    }, 850);
  }

  if (phase === 'intro') {
    return (
      <div style={{ maxWidth: '620px', margin: '0 auto' }}>
        <BackBar onHub={onHub} onExit={onExit} />
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '34px' }}>🔥</div>
          <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-cond)', fontSize: '32px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>Gauntlet</h1>
          <p style={{ color: 'var(--rtm-dim)', fontSize: '14px', maxWidth: '460px', margin: '8px auto 0', lineHeight: 1.55 }}>Monte um time só e enfrente uma fila de rivais. Cada vitória deixa o próximo mais forte. Sua nota é a maior sequência sem perder. Quando perder, acaba.</p>
        </div>
        <Panel title="Regras rápidas">
          {([['Sem trocas', 'O time que você montar vai até o fim da corrida.'], ['Dificuldade sobe', 'Cada rival vencido é mais forte que o anterior.'], ['Recorde', 'Seu placar é a maior sequência de vitórias sem perder. Seu recorde é ' + stats.bestStreak + '.']] as [string, string][]).map(([t, d], i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--rtm-border-soft)' : 'none' }}>
              <span style={{ color: 'var(--rtm-green-bright)', fontWeight: 800 }}>›</span>
              <div><b style={{ color: 'var(--rtm-text-strong)', fontSize: '13.5px' }}>{t}.</b> <span style={{ color: 'var(--rtm-dim)', fontSize: '13px' }}>{d}</span></div>
            </div>
          ))}
        </Panel>
        <Button variant="primary" size="big" style={{ width: '100%', marginTop: '20px' }} onClick={() => setPhase('draft')}>Montar meu time →</Button>
      </div>
    );
  }

  if (phase === 'draft') return <QuickDraft pool={pool} count={5} title="Monte seu time do Gauntlet" subtitle="Escolha 5. Esse time encara a fila inteira, sem substituições." accent="var(--rtm-green-bright)" onBack={() => setPhase('intro')} onDone={onDrafted} />;

  if (phase === 'run') {
    const o = aiOpp(streak);
    return (
      <div style={{ maxWidth: '620px', margin: '0 auto' }}>
        <BackBar onHub={onHub} onExit={onExit} />
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--rtm-dim)', fontWeight: 800 }}>Sequência atual · time {myOvr} OVR</div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: '70px', fontWeight: 800, color: 'var(--rtm-green-bright)', lineHeight: 1, textShadow: '0 0 36px rgba(111,208,111,.35)' }}>{streak}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '16px', borderRadius: '10px', background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', marginBottom: '16px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rtm-dim)', fontWeight: 700 }}>Próximo rival (IA)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.5px', color: '#06121d', background: 'var(--rtm-green-bright)', padding: '1px 6px', borderRadius: '4px' }}>IA</span>
              <b style={{ fontFamily: 'var(--font-cond)', fontSize: '20px', color: 'var(--rtm-text-strong)' }}>{o.name}</b>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--rtm-dim)', marginTop: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><Flag cc={o.cc} /> puxado por {o.star}</div>
          </div>
          <div style={{ textAlign: 'center', paddingLeft: '16px', borderLeft: '1px solid var(--rtm-border-soft)' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rtm-dim)', fontWeight: 700 }}>Força</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: '20px', fontWeight: 800, color: o.ovr > myOvr ? 'var(--rtm-red-bright)' : 'var(--rtm-text-strong)' }}>{o.ovr}</div>
          </div>
        </div>
        <Button variant="primary" size="big" style={{ width: '100%' }} disabled={rolling} onClick={fight}>{rolling ? 'Jogando…' : 'Enfrentar rival'}</Button>
        {log.length > 0 && (
          <div style={{ marginTop: '18px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--rtm-dim)', fontWeight: 700, marginBottom: '8px' }}>Corrida</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {log.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', borderRadius: 'var(--rtm-radius)', background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', boxShadow: `inset 3px 0 0 ${e.win ? 'var(--rtm-green)' : 'var(--rtm-red)'}` }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', color: 'var(--rtm-faint)', width: '24px' }}>#{e.idx}</span>
                  <Flag cc={e.cc} /><b style={{ flex: 1, fontFamily: 'var(--font-cond)', fontSize: '14px', color: 'var(--rtm-text-strong)' }}>{e.opp}</b>
                  <span style={{ fontSize: '11px', color: 'var(--rtm-faint)' }}>{e.ovr} OVR</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: e.win ? 'var(--rtm-green-bright)' : 'var(--rtm-red-bright)' }}>{e.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const record = streak > 0 && streak >= stats.bestStreak;
  return (
    <div style={{ maxWidth: '520px', margin: '40px auto 0', textAlign: 'center' }}>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--rtm-dim)', fontWeight: 800 }}>Fim da corrida</div>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: '80px', fontWeight: 800, color: 'var(--rtm-green-bright)', lineHeight: 1, textShadow: '0 0 40px rgba(111,208,111,.4)' }}>{streak}</div>
      <div style={{ fontSize: '15px', color: 'var(--rtm-dim)' }}>vitórias seguidas</div>
      {record && <div style={{ marginTop: '12px', display: 'inline-block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#06121d', background: 'var(--rtm-gold)', padding: '5px 14px', borderRadius: '999px' }}>★ Novo recorde pessoal</div>}
      <p style={{ color: 'var(--rtm-faint)', fontSize: '13px', marginTop: '16px' }}>Seu recorde pessoal agora é {stats.bestStreak} vitórias.</p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '22px' }}>
        <Button variant="primary" onClick={() => setPhase('draft')}>Tentar de novo</Button>
        <Button variant="ghost" onClick={onHub}>Voltar ao hub</Button>
      </div>
    </div>
  );
}
