// Ranked 1v1 — matchmaking → snake draft → resultado (MMR). Porta do Ranked1v1.jsx.
// Nesta fase a partida é resolvida por força de time; veto/match completos vêm depois.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel, Button } from '../ds';
import { Flag, OvrBadge, PlayerAvatar } from '../ui';
import { VetoScreen } from '../VetoScreen';
import { MatchScreen } from '../MatchScreen';
import { makeRng, randomSeed } from '../../engine/rng';
import { hashStr } from '../../state/hash';
import { RoleTag } from './bits';
import { buildOnlineTeam, genOpp, rankFor, type OnlineStats, type PoolPlayer, type Rival } from './onlineData';
import type { Manager } from '../../state/manager';
import type { MapId, SeriesResult, TTeam } from '../../types';
import { ct } from '../../state/career-i18n';

const ORDER = ['me', 'rival', 'rival', 'me', 'me', 'rival', 'rival', 'me', 'me', 'rival'] as const;

export function Ranked1v1({ manager, pool, stats, setStats, onReport, onHub, onExit }: {
  manager: Manager;
  pool: PoolPlayer[];
  stats: OnlineStats;
  setStats: (fn: (s: OnlineStats) => OnlineStats) => void;
  onReport?: (won: boolean) => void;
  onHub: () => void;
  onExit: () => void;
}) {
  const me = manager;
  const mmr = stats.mmr;
  const [phase, setPhase] = useState<'lobby' | 'search' | 'draft' | 'veto' | 'match' | 'result'>('lobby');
  const [rival, setRival] = useState<Rival | null>(null);
  const [dots, setDots] = useState(0);
  const [outcome, setOutcome] = useState<{ won: boolean; delta: number } | null>(null);
  const [teams, setTeams] = useState<[TTeam, TTeam] | null>(null);
  const [maps, setMaps] = useState<{ map: MapId; pickedBy: 0 | 1 | -1 }[]>([]);
  const [matchSeed, setMatchSeed] = useState(() => hashStr(`ranked:${manager.nick}:${stats.w}:${stats.l}`));
  const rng = useMemo(() => makeRng(matchSeed), [matchSeed]);
  const draftPool = useMemo(() => pool.slice(0, 18), [pool]);
  const [taken, setTaken] = useState<Record<string, 'me' | 'rival'>>({});
  const [pickN, setPickN] = useState(0);
  const myCount = Object.values(taken).filter((x) => x === 'me').length;
  const rivalCount = Object.values(taken).filter((x) => x === 'rival').length;

  const beginSearch = () => {
    setMatchSeed(randomSeed());
    setDots(0);
    setOutcome(null);
    setTeams(null);
    setMaps([]);
    setPhase('search');
  };

  // draft completo: monta os 2 times reais e vai pro veto → partida ao vivo
  const toMatch = useCallback(() => {
    const mine = draftPool.filter((p) => taken[p.nick] === 'me');
    const theirs = draftPool.filter((p) => taken[p.nick] === 'rival');
    if (mine.length !== 5 || theirs.length !== 5) return;
    const myTeam = buildOnlineTeam(me.org || me.nick, mine, 'you');
    const rivalTeam = buildOnlineTeam(rival ? rival.nick : ct('Adversário'), theirs, 'rival');
    setTeams([myTeam, rivalTeam]);
    setPhase('veto');
  }, [draftPool, taken, me.org, me.nick, rival]);

  useEffect(() => {
    if (phase !== 'search') return;
    const di = window.setInterval(() => setDots((d) => (d + 1) % 4), 350);
    const done = window.setTimeout(() => {
      setRival(genOpp());
      setPhase('draft'); setTaken({}); setPickN(0);
    }, 2400);
    return () => { window.clearInterval(di); window.clearTimeout(done); };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'draft') return;
    if (pickN >= ORDER.length) {
      const t = window.setTimeout(() => toMatch(), 700);
      return () => window.clearTimeout(t);
    }
    if (ORDER[pickN] === 'rival') {
      const t = window.setTimeout(() => {
        const avail = draftPool.filter((p) => !taken[p.nick]);
        const choice = avail[Math.floor(rng() * Math.min(3, avail.length))];
        if (choice) { setTaken((tk) => ({ ...tk, [choice.nick]: 'rival' })); setPickN((n) => n + 1); }
      }, 700);
      return () => window.clearTimeout(t);
    }
  }, [phase, pickN, taken, draftPool, rng, toMatch]);

  // fim da série: MMR sobe/desce conforme o resultado real
  function finishMatch(series: SeriesResult) {
    const won = series.winner === 0;
    const delta = won ? 25 : -22;
    setOutcome({ won, delta });
    setStats((s) => ({ ...s, mmr: Math.max(0, s.mmr + delta), w: s.w + (won ? 1 : 0), l: s.l + (won ? 0 : 1) }));
    onReport?.(won);
    setPhase('result');
  }

  function myPick(p: PoolPlayer) {
    if (ORDER[pickN] !== 'me' || taken[p.nick]) return;
    setTaken((t) => ({ ...t, [p.nick]: 'me' })); setPickN((n) => n + 1);
  }

  const rk = rankFor(mmr);
  const bar = (back?: () => void) => (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
      {back && <button type="button" onClick={back} style={{ background: 'none', border: 'none', color: 'var(--rtm-link)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>← {ct('Hub online')}</button>}
      <button type="button" onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--rtm-faint)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>{ct('Menu')}</button>
    </div>
  );

  if (phase === 'lobby') {
    return (
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        {bar(onHub)}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--em-border-strong)', padding: '28px 26px', marginBottom: '16px' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/maps/dust2.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.24 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(13,17,22,.92), rgba(13,17,22,.6))' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <span style={{ width: '64px', height: '64px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontWeight: 800, fontSize: '22px', color: '#fff', background: `linear-gradient(160deg, ${me.accent || 'var(--em-gold)'}, #20303f)` }}>{me.nick.slice(0, 2).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '1.4px', textTransform: 'uppercase', color: rk.color, fontWeight: 800 }}>{rk.name}</div>
              <h1 style={{ margin: '2px 0', fontFamily: 'inherit', fontSize: '28px', fontWeight: 800, color: 'var(--em-text)' }}>{me.nick}</h1>
              <div style={{ fontSize: '13px', color: 'var(--em-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}><Flag cc={me.country} /> {mmr} MMR</div>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 18px', borderRadius: '6px', background: 'rgba(18,22,27,.6)', border: '1px solid var(--em-border)' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--em-muted)', fontWeight: 700 }}>{ct('Temporada')}</div>
              <div style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: '18px', color: '#29c47a' }}>{stats.w}W · {stats.l}L</div>
            </div>
          </div>
        </div>
        <Panel title={ct('Ranked 1v1')} accent="blue">
          <p style={{ margin: '0 0 16px', color: 'var(--em-muted)', fontSize: '14px', lineHeight: 1.5 }}>{ct('O matchmaking busca um rival perto do seu MMR. Vocês sorteiam cinco lendas em draft alternado e jogam uma melhor de três. Leia o board e escolha para contrapor o adversário.')}</p>
          <Button size="big" variant="primary" onClick={beginSearch} style={{ width: '100%' }}>🔍 {ct('Procurar partida')}</Button>
        </Panel>
      </div>
    );
  }

  if (phase === 'search') {
    return (
      <div style={{ maxWidth: '560px', margin: '60px auto 0', textAlign: 'center' }}>
        <div style={{ width: '80px', height: '80px', margin: '0 auto 20px', borderRadius: '50%', border: '3px solid var(--em-border-strong)', borderTopColor: 'var(--em-gold)', animation: 'rtmSpin 0.9s linear infinite' }} />
        <h1 style={{ fontFamily: 'inherit', fontSize: '26px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--em-text)', margin: 0 }}>{ct('Procurando rival')}{'.'.repeat(dots)}</h1>
        <p style={{ color: 'var(--em-muted)', marginTop: '8px' }}>{ct('Buscando perto de')} {mmr} MMR · {rk.name}</p>
        <Button variant="ghost" size="sm" onClick={() => setPhase('lobby')} style={{ marginTop: '18px' }}>{ct('Cancelar')}</Button>
        <style>{`@keyframes rtmSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (phase === 'veto' && teams) {
    return (
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        {bar(() => setPhase('lobby'))}
        <VetoScreen teams={teams} userIdx={0} rng={rng} phaseLabel={ct('Ranked 1v1')} bestOf={3} onDone={(m) => { setMaps(m); setPhase('match'); }} />
      </div>
    );
  }

  if (phase === 'match' && teams) {
    return (
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <MatchScreen teams={teams} maps={maps} userIdx={0} rng={rng} phaseLabel={ct('Ranked 1v1')} bestOf={3} onFinish={finishMatch} />
      </div>
    );
  }

  if (phase === 'result' && outcome) {
    const won = outcome.won;
    return (
      <div style={{ maxWidth: '560px', margin: '50px auto 0', textAlign: 'center' }}>
        <div style={{ fontFamily: 'inherit', fontSize: '64px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '4px', color: won ? '#29c47a' : '#e2574c', textShadow: `0 0 40px ${won ? 'rgba(111,208,111,.4)' : 'rgba(226,90,90,.4)'}` }}>{won ? ct('Vitória') : ct('Derrota')}</div>
        <div style={{ fontSize: '15px', color: 'var(--em-muted)', marginTop: '4px' }}>vs {rival ? rival.nick : 'rival'}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', margin: '24px auto 0', padding: '16px 28px', borderRadius: '10px', background: 'var(--em-panel)', border: '1px solid var(--em-border)' }}>
          <div><div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--em-muted)', fontWeight: 700, letterSpacing: '.6px' }}>MMR</div><div style={{ fontFamily: 'inherit', fontSize: '28px', fontWeight: 800, color: 'var(--em-text)' }}>{stats.mmr}</div></div>
          <div style={{ fontFamily: 'inherit', fontSize: '20px', fontWeight: 800, color: won ? '#29c47a' : '#e2574c' }}>{outcome.delta >= 0 ? '+' : ''}{outcome.delta}</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '26px' }}>
          <Button variant="primary" onClick={beginSearch}>{ct('Jogar de novo')}</Button>
          <Button variant="ghost" onClick={onHub}>{ct('Voltar ao hub')}</Button>
        </div>
      </div>
    );
  }

  // SNAKE DRAFT
  const turn = ORDER[pickN];
  const myTurn = turn === 'me';
  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      {bar(() => setPhase('lobby'))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '14px', padding: '14px 20px', borderRadius: '10px', background: 'linear-gradient(120deg, color-mix(in srgb, var(--em-gold) 14%, transparent), rgba(13,17,22,.4))', border: '1px solid var(--em-border)', marginBottom: '14px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '38px', height: '38px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontWeight: 800, color: '#fff', background: `linear-gradient(160deg, ${me.accent || 'var(--em-gold)'}, #20303f)` }}>{me.nick.slice(0, 2).toUpperCase()}</span>
          <span><b style={{ color: 'var(--em-gold)', fontFamily: 'inherit', fontSize: '16px' }}>{me.nick}</b><div style={{ fontSize: '11px', color: 'var(--em-muted)' }}>{myCount}/5 {ct('escolhidos')}</div></span>
        </span>
        <span style={{ fontFamily: 'inherit', fontWeight: 800, color: 'var(--em-gold)', fontSize: '18px' }}>{ct('DRAFT')}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
          <span style={{ textAlign: 'right' }}><b style={{ color: 'var(--em-gold)', fontFamily: 'inherit', fontSize: '16px' }}>{rival ? rival.nick : 'rival'}</b><div style={{ fontSize: '11px', color: 'var(--em-muted)' }}>{rivalCount}/5 {ct('escolhidos')}</div></span>
          <span style={{ width: '38px', height: '38px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontWeight: 800, color: '#06121d', background: 'linear-gradient(160deg, var(--em-gold), var(--em-gold))' }}>{rival ? rival.nick.slice(0, 2).toUpperCase() : '??'}</span>
        </span>
      </div>
      <div style={{ textAlign: 'center', marginBottom: '12px', fontFamily: 'inherit', fontSize: '15px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: pickN >= ORDER.length ? '#29c47a' : myTurn ? 'var(--em-gold)' : 'var(--em-gold)' }}>
        {pickN >= ORDER.length ? ct('Draft completo — resolvendo…') : myTurn ? `● ${ct('Sua escolha')}` : `${rival ? rival.nick : 'rival'} ${ct('está escolhendo…')}`}
      </div>
      <div className="rtm-pcards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', opacity: myTurn ? 1 : 0.75 }}>
        {draftPool.map((p) => {
          const owner = taken[p.nick];
          return (
            <button key={p.nick} type="button" disabled={!!owner || !myTurn} onClick={() => myPick(p)} style={{ position: 'relative', textAlign: 'center', cursor: owner || !myTurn ? 'default' : 'pointer', background: owner === 'me' ? 'color-mix(in srgb, var(--em-gold) 14%, transparent)' : owner === 'rival' ? 'rgba(216,169,67,.14)' : 'var(--em-panel-2)', border: `1px solid ${owner === 'me' ? 'var(--em-gold)' : owner === 'rival' ? 'var(--em-gold)' : 'var(--em-border)'}`, borderRadius: '6px', padding: '12px 8px', opacity: owner ? 0.6 : 1 }}>
              <OvrBadge ovr={p.ovr} />
              <PlayerAvatar nick={p.nick} size={44} />
              <div style={{ fontFamily: 'inherit', fontSize: '14px', fontWeight: 700, color: 'var(--em-text)', marginTop: '6px' }}>{p.nick}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', marginTop: '4px' }}><Flag cc={p.country} /><RoleTag role={p.role} /></div>
              {owner && <div style={{ marginTop: '6px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: owner === 'me' ? 'var(--em-gold)' : 'var(--em-gold)' }}>{owner === 'me' ? me.nick : (rival ? rival.nick : 'rival')}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
