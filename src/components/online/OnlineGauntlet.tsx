// Gauntlet — um time só contra uma fila de rivais cada vez mais fortes.
// Nota = maior sequência. Draft em pacotes (cartinhas) + partida MD3 de verdade
// (scoreboard, adversário, round a round) igual aos outros modos.
import { useMemo, useRef, useState } from 'react';
import { Panel, Button } from '../ds';
import { Flag } from '../ui';
import { BackBar } from './bits';
import { PackDraft } from './PackDraft';
import { MatchReplay } from './MatchReplay';
import { buildOnlineTeam, type OnlineStats, type PoolPlayer } from './onlineData';
import { makeRng } from '../../engine/rng';
import { autoVeto } from '../../engine/veto';
import { simulateSeries } from '../../engine/match';
import type { PlaybackSpeed } from '../../state/online';
import { ct } from '../../state/career-i18n';
import type { SeriesResult, TTeam } from '../../types';

type Entry = { idx: number; opp: string; cc: string; win: boolean; score: string; ovr: number };
type Live = { series: SeriesResult; teams: [TTeam, TTeam]; oppOvr: number; oppCc: string; oppName: string };

export function OnlineGauntlet({ pool, stats, setStats, onHub, onExit }: {
  pool: PoolPlayer[];
  stats: OnlineStats;
  setStats: (fn: (s: OnlineStats) => OnlineStats) => void;
  onHub: () => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<'intro' | 'draft' | 'run' | 'over'>('intro');
  const [picked, setPicked] = useState<PoolPlayer[]>([]);
  const [myOvr, setMyOvr] = useState(0);
  const [streak, setStreak] = useState(0);
  const [log, setLog] = useState<Entry[]>([]);
  const [match, setMatch] = useState<Live | null>(null);
  const [speed, setSpeed] = useState<PlaybackSpeed>(2);
  const resolved = useRef(false);

  // monta o ESQUADRÃO DE IA da rodada: 5 lendas do pool perto do alvo de força (sobe
  // com a sequência), excluindo quem já está no seu time. Vira um TTeam real.
  const buildOpp = (s: number): { team: TTeam; ovr: number; force: number; cc: string } => {
    const target = 80 + s * 1.6;
    const mine = new Set(picked.map((p) => p.id));
    const five = pool.filter((p) => !mine.has(p.id))
      .sort((a, b) => Math.abs(a.ovr - target) - Math.abs(b.ovr - target)).slice(0, 5)
      .sort((a, b) => b.ovr - a.ovr);
    const ovr = five.length ? Math.round(five.reduce((a, p) => a + p.ovr, 0) / five.length) : Math.min(99, Math.round(target));
    const team = buildOnlineTeam(`${ct('Esquadrão IA')} #${s + 1}`, five, `gaunt-opp-${s}`);
    // DIFICULDADE SEM TETO: o OVR satura no teto do pool (~95), então a corrida
    // nunca apertava de verdade (streak de 100). Aqui a FORÇA real do rival sobe a
    // cada vitória, sem teto — cada rival é genuinamente mais forte e a corrida
    // termina numa sequência saudável (boa run ~ dezenas, não centenas).
    const boost = s * 0.9 + Math.max(0, s - 6) * 0.8;
    team.strength += boost;
    return { team, ovr, force: Math.round(team.strength), cc: five[0]?.country ?? 'br' };
  };

  const nextOpp = useMemo(() => buildOpp(streak), [streak, picked, pool]); // eslint-disable-line react-hooks/exhaustive-deps

  function onDrafted(pick: PoolPlayer[], avg: number) { setPicked(pick); setMyOvr(avg); setStreak(0); setLog([]); setPhase('run'); }

  // dispara a partida MD3 de verdade (mesma simulação do online/carreira)
  function startMatch() {
    const userTeam = buildOnlineTeam(ct('Seu time'), picked, 'gaunt-user');
    const o = buildOpp(streak);
    const rng = makeRng(Math.floor(Math.random() * 2147483647));
    const maps = autoVeto([userTeam, o.team], rng, 3);
    const series = simulateSeries(rng, userTeam, o.team, maps, 3);
    resolved.current = false;
    setMatch({ series, teams: [userTeam, o.team], oppOvr: o.ovr, oppCc: o.cc, oppName: o.team.name });
  }

  // aplica o resultado quando o replay termina (ou ao fechar)
  function resolveMatch() {
    if (!match || resolved.current) return;
    resolved.current = true;
    const win = match.series.winner === 0;
    setLog((l) => [{ idx: streak + 1, opp: match.oppName, cc: match.oppCc, win, score: `${match.series.mapScore[0]}-${match.series.mapScore[1]}`, ovr: match.oppOvr }, ...l]);
    setMatch(null);
    if (win) setStreak((s) => s + 1);
    else { setStats((s) => ({ ...s, bestStreak: Math.max(s.bestStreak, streak) })); setPhase('over'); }
  }

  if (phase === 'intro') {
    return (
      <div style={{ maxWidth: '620px', margin: '0 auto' }}>
        <BackBar onHub={onHub} onExit={onExit} />
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '34px' }}>🔥</div>
          <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--rtm-font-cond)', fontSize: '32px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>Gauntlet</h1>
          <p style={{ color: 'var(--rtm-dim)', fontSize: '14px', maxWidth: '460px', margin: '8px auto 0', lineHeight: 1.55 }}>{ct('Monte um time só e enfrente uma fila de rivais. Cada vitória deixa o próximo mais forte. Sua nota é a maior sequência sem perder. Quando perder, acaba.')}</p>
        </div>
        <Panel title={ct('Regras rápidas')}>
          {([[ct('Sem trocas'), ct('O time que você montar vai até o fim da corrida.')], [ct('Dificuldade sobe'), ct('Cada rival vencido é mais forte que o anterior.')], [ct('Recorde'), ct('Seu placar é a maior sequência de vitórias sem perder. Seu recorde é ') + stats.bestStreak + '.']] as [string, string][]).map(([t, d], i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--rtm-border-soft)' : 'none' }}>
              <span style={{ color: 'var(--rtm-green-bright)', fontWeight: 800 }}>›</span>
              <div><b style={{ color: 'var(--rtm-text-strong)', fontSize: '13.5px' }}>{t}.</b> <span style={{ color: 'var(--rtm-dim)', fontSize: '13px' }}>{d}</span></div>
            </div>
          ))}
        </Panel>
        <Button variant="primary" size="big" style={{ width: '100%', marginTop: '20px' }} onClick={() => setPhase('draft')}>{ct('Montar meu time →')}</Button>
      </div>
    );
  }

  if (phase === 'draft') return <PackDraft pool={pool} count={5} title={ct('Monte seu time do Gauntlet')} subtitle={ct('Abra os pacotes e escolha 1 carta por rodada. Esse time encara a fila inteira, sem substituições.')} accent="var(--rtm-green-bright)" onBack={() => setPhase('intro')} onDone={onDrafted} />;

  if (phase === 'run') {
    // partida rolando: mostra o replay MD3 com scoreboard e stats (igual aos outros modos)
    if (match) {
      return (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <BackBar onHub={onHub} onExit={onExit} />
          <div style={{ textAlign: 'center', marginBottom: '12px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--rtm-dim)', fontWeight: 800 }}>{ct('Sequência')} {streak} · {match.teams[0].name} vs {match.oppName}</div>
          <MatchReplay
            series={match.series}
            teams={match.teams}
            playbackSpeed={speed}
            canControlSpeed
            onPlaybackSpeedChange={setSpeed}
            onFinish={resolveMatch}
            onClose={resolveMatch}
          />
        </div>
      );
    }
    const o = nextOpp;
    return (
      <div style={{ maxWidth: '620px', margin: '0 auto' }}>
        <BackBar onHub={onHub} onExit={onExit} />
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--rtm-dim)', fontWeight: 800 }}>{ct('Sequência atual · time')} {myOvr} OVR</div>
          <div style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '70px', fontWeight: 800, color: 'var(--rtm-green-bright)', lineHeight: 1, textShadow: '0 0 36px rgba(111,208,111,.35)' }}>{streak}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '16px', borderRadius: '10px', background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', marginBottom: '16px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rtm-dim)', fontWeight: 700 }}>{ct('Próximo rival (IA)')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.5px', color: '#06121d', background: 'var(--rtm-green-bright)', padding: '1px 6px', borderRadius: '4px' }}>IA</span>
              <b style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '20px', color: 'var(--rtm-text-strong)' }}>{o.team.name}</b>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--rtm-dim)', marginTop: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><Flag cc={o.cc} /> {ct('puxado por')} {o.team.players[0]?.nick ?? 'IA'}</div>
          </div>
          <div style={{ textAlign: 'center', paddingLeft: '16px', borderLeft: '1px solid var(--rtm-border-soft)' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rtm-dim)', fontWeight: 700 }}>{ct('Força')}</div>
            <div style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '20px', fontWeight: 800, color: o.force > myOvr ? 'var(--rtm-red-bright)' : 'var(--rtm-text-strong)' }}>{o.force}</div>
          </div>
        </div>
        <Button variant="primary" size="big" style={{ width: '100%' }} onClick={startMatch}>{ct('Enfrentar rival')}</Button>
        {log.length > 0 && (
          <div style={{ marginTop: '18px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--rtm-dim)', fontWeight: 700, marginBottom: '8px' }}>{ct('Corrida')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {log.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', borderRadius: 'var(--rtm-radius)', background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', boxShadow: `inset 3px 0 0 ${e.win ? 'var(--rtm-green)' : 'var(--rtm-red)'}` }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', color: 'var(--rtm-faint)', width: '24px' }}>#{e.idx}</span>
                  <Flag cc={e.cc} /><b style={{ flex: 1, fontFamily: 'var(--rtm-font-cond)', fontSize: '14px', color: 'var(--rtm-text-strong)' }}>{e.opp}</b>
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
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--rtm-dim)', fontWeight: 800 }}>{ct('Fim da corrida')}</div>
      <div style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '80px', fontWeight: 800, color: 'var(--rtm-green-bright)', lineHeight: 1, textShadow: '0 0 40px rgba(111,208,111,.4)' }}>{streak}</div>
      <div style={{ fontSize: '15px', color: 'var(--rtm-dim)' }}>{ct('vitórias seguidas')}</div>
      {record && <div style={{ marginTop: '12px', display: 'inline-block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#06121d', background: 'var(--rtm-gold)', padding: '5px 14px', borderRadius: '999px' }}>{ct('★ Novo recorde pessoal')}</div>}
      <p style={{ color: 'var(--rtm-faint)', fontSize: '13px', marginTop: '16px' }}>{ct('Seu recorde pessoal agora é')} {stats.bestStreak} {ct('vitórias.')}</p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '22px' }}>
        <Button variant="primary" onClick={() => setPhase('draft')}>{ct('Tentar de novo')}</Button>
        <Button variant="ghost" onClick={onHub}>{ct('Voltar ao hub')}</Button>
      </div>
    </div>
  );
}
