// Ultimate Squad — tela P1 (Loja + Coleção + reveal de pack). Modo offline,
// cartas do dataset real, moeda `credits`. Padrão em-*/DashCard/Modal/Button.
// Ver docs-but-map.md. Sub-fases futuras: Squad Builder (P2), partida vs IA (P3).

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, DashCard, Modal } from '../ds';
import { Flag, PlayerAvatar } from '../ui';
import { ultimateCatalog, ultimateIndex, useUltimate } from '../../state/ultimate';
import { PACK_DEFS, type PackDef } from '../../engine/ultimate/packs';
import { rarityInfo } from '../../engine/ultimate/rarities';
import { FORMATIONS, formationById } from '../../engine/ultimate/formations';
import { chemLabel, computeChemistry, roleFitsSlot, type ChemNode } from '../../engine/ultimate/chemistry';
import { activeSquad, type MatchOutcome, type OwnedCard } from '../../engine/ultimate/state';
import type { UltCard } from '../../engine/ultimate/cards';
import { computeNextDaily, dateKey, DAILY_TABLE } from '../../engine/ultimate/daily';
import { TITLES, titleBySlug } from '../../engine/ultimate/titles';
import { SBCS, checkSbc, type SbcDef } from '../../engine/ultimate/sbc';
import { quickSellValue } from '../../engine/ultimate/quicksell';
import { buildAiLadder, buildBazaar, bazaarDayBucket, type AiPlayer, type Listing } from '../../engine/ultimate/bazaar';
import { MatchReplay } from '../online/MatchReplay';
import { buildOnlineTeam, buildPool, rankFor, type PoolPlayer } from '../online/onlineData';
import { makeRng } from '../../engine/rng';
import { autoVeto } from '../../engine/veto';
import { simulateSeries } from '../../engine/match';
import { CS2_REAL_2026 } from '../../data/bo3';
import type { PlaybackSpeed } from '../../state/online';
import type { SeriesResult, TTeam } from '../../types';
import { ct } from '../../state/career-i18n';

const fmt = (n: number) => n.toLocaleString('pt-BR');

// carta visual compacta, moldura/glow pela raridade.
const ROLE_CODE: Record<string, string> = { AWP: 'AWP', Entry: 'ENT', Rifler: 'RIF', Lurker: 'LUR', Support: 'SUP', IGL: 'IGL' };
const STAT_ROWS: [keyof UltCard['stats'], string][][] = [
  [['tiro', 'TIR'], ['mira', 'MIR'], ['reflexo', 'REF']],
  [['visao', 'VIS'], ['clutch', 'CLU'], ['util', 'UTI']],
];
const FOIL_RARITIES = new Set(['legendary', 'icon', 'tots', 'major']);
const REGION_CODE: Record<string, string> = { samerica: 'SA', namerica: 'NA', europe: 'EU', cis: 'CIS', asia: 'AS', oceania: 'OCE', africa: 'AF', global: 'GLB' };

// carta estilo FUT: moldura por raridade, OVR/função/bandeira no topo, avatar,
// nome, 6 substats e brilho (foil) nas especiais. `qs` = valor de quick-sell.
function UltCardView({ card, size = 132, count, qs }: { card: UltCard; size?: number; count?: number; qs?: number }) {
  const info = rarityInfo(card.rarity);
  const compact = size < 116;
  const h = Math.round(size * 1.4);
  const foil = FOIL_RARITIES.has(card.rarity);
  const dark = card.rarity === 'icon' || card.rarity === 'tots' || card.rarity === 'major';
  const ink = dark ? '#1a1205' : 'var(--em-text,#e6edf5)';
  const sub = dark ? 'rgba(26,18,5,0.7)' : 'var(--em-muted,#8a99ab)';
  return (
    <div style={{ width: size, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: qs != null ? 6 : 0 }}>
      <div
        style={{
          position: 'relative', width: size, height: h, borderRadius: 12, overflow: 'hidden',
          background: dark
            ? `linear-gradient(155deg, ${info.color} 0%, ${info.color}cc 55%, ${info.color}88 100%)`
            : `linear-gradient(155deg, ${info.color}33 0%, var(--em-panel-2,#12161e) 66%)`,
          border: `1.5px solid ${info.color}`, boxShadow: `0 4px 18px ${info.color}44`,
        }}
      >
        {foil && <div className="ult-foil" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />}
        {count != null && count > 1 && (
          <span style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, fontSize: '0.6rem', fontWeight: 900, padding: '1px 6px', borderRadius: 10, background: 'rgba(0,0,0,0.55)', color: '#fff' }}>×{count}</span>
        )}
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: `${Math.round(size * 0.06)}px ${Math.round(size * 0.06)}px ${Math.round(size * 0.05)}px` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, minWidth: Math.round(size * 0.24) }}>
              <span style={{ fontSize: `${(size / 140) * 1.7}rem`, fontWeight: 900, color: ink, fontFamily: '"JetBrains Mono", monospace' }}>{card.ovr}</span>
              <span style={{ fontSize: `${(size / 140) * 0.58}rem`, fontWeight: 800, color: ink, opacity: 0.85, marginTop: 1 }}>{ROLE_CODE[card.role] ?? card.role}</span>
              <span style={{ marginTop: 3 }}><Flag cc={card.country} /></span>
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <PlayerAvatar nick={card.nick} size={Math.round(size * (compact ? 0.42 : 0.5))} />
            </div>
          </div>
          <div style={{ fontSize: `${(size / 140) * 0.86}rem`, fontWeight: 900, color: ink, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{card.nick}</div>
          {!compact && (
            <>
              <div style={{ height: 1, background: dark ? 'rgba(26,18,5,0.25)' : `${info.color}44`, margin: '3px 6px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, justifyContent: 'center' }}>
                {STAT_ROWS.map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', justifyContent: 'space-around' }}>
                    {row.map(([k, label]) => (
                      <span key={label} style={{ fontSize: `${(size / 140) * 0.6}rem`, fontFamily: '"JetBrains Mono", monospace' }}>
                        <b style={{ color: ink, fontWeight: 900 }}>{card.stats[k]}</b> <span style={{ color: sub, fontWeight: 700 }}>{label}</span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 2 }}>
            <span style={{ fontSize: `${(size / 140) * 0.54}rem`, fontWeight: 800, color: ink, opacity: 0.8 }}>{REGION_CODE[card.region] ?? 'GLB'}</span>
            <span style={{ fontSize: `${(size / 140) * 0.54}rem`, fontWeight: 800, color: dark ? 'rgba(26,18,5,0.85)' : info.color, letterSpacing: '0.2px' }}>· {info.label}</span>
          </div>
        </div>
      </div>
      {qs != null && (
        <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(232,193,112,0.4)', color: '#e8c170' }}>🪙 +{qs.toLocaleString('pt-BR')}</span>
      )}
    </div>
  );
}

// agrupa o inventário por cardKey → carta + contagem de cópias (+ owned ids).
interface ClubRow { card: UltCard; count: number; ownedIds: string[]; dupSellValue: number }

export function UltimateSquadScreen({ onBack }: { onBack: () => void }) {
  const { state, openPack, sell, ensureSquad, placeInSquad, setFormation, recordMatch, claimDaily, syncTitles, equipTitle, claimStarter, submitSbc, tickSeason, buyCard } = useUltimate();
  const index = ultimateIndex();
  const [tab, setTab] = useState<'hub' | 'store' | 'mercado' | 'club' | 'squad' | 'ranked' | 'sbc' | 'ranking'>('hub');
  const [reveal, setReveal] = useState<UltCard[] | null>(null);
  const [pickSlot, setPickSlot] = useState<number | null>(null);
  const [live, setLive] = useState<{ series: SeriesResult; teams: [TTeam, TTeam]; oppElo: number } | null>(null);
  const [result, setResult] = useState<{ won: boolean; score: string; outcome: MatchOutcome } | null>(null);
  const [speed, setSpeed] = useState<PlaybackSpeed>(2);
  const [onbForm, setOnbForm] = useState('standard');
  const [dailyOpen, setDailyOpen] = useState(false);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const [sbcDef, setSbcDef] = useState<SbcDef | null>(null);
  const [sbcSel, setSbcSel] = useState<string[]>([]);
  const [seasonRoll, setSeasonRoll] = useState<{ credits: number; newElo: number } | null>(null);
  const [toast, setToast] = useState<string>('');

  const credits = state.profile.credits;
  const equipped = state.profile.equippedTitle ? titleBySlug(state.profile.equippedTitle) : undefined;
  const daily = computeNextDaily(state.profile.daily.streakDay, state.profile.daily.lastClaim, dateKey(new Date()));

  // toast com timer único (cancela o anterior — senão um timer velho apagava um
  // toast novo antes da hora).
  const toastTimer = useRef<number | undefined>(undefined);
  const flash = (msg: string, ms = 1800) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), ms);
  };

  // garante um squad ativo ao abrir a aba Squad
  useEffect(() => { if (tab === 'squad') ensureSquad(); }, [tab, ensureSquad]);
  // season: no mount, inicia/rola por relógio local; se rolou, mostra o modal
  useEffect(() => {
    const r = tickSeason();
    if (r.rolled) setSeasonRoll({ credits: r.credits, newElo: r.newElo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // reavalia títulos quando algum fato muda (vitórias, coleção, pico, sequência)
  useEffect(() => {
    const newly = syncTitles();
    if (newly.length) {
      const labels = newly.map((s) => titleBySlug(s)?.label).filter(Boolean).join(', ');
      if (labels) flash(`🏷️ ${ct('Título desbloqueado')}: ${labels}`, 2600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.profile.w, state.profile.peakElo, state.profile.streak, state.inventory.length, state.profile.onboarded]);

  const club = useMemo<ClubRow[]>(() => {
    const byKey = new Map<string, { card: UltCard; ownedIds: string[] }>();
    for (const o of state.inventory) {
      const card = index.get(o.cardKey);
      if (!card) continue;
      const g = byKey.get(o.cardKey);
      if (g) g.ownedIds.push(o.id);
      else byKey.set(o.cardKey, { card, ownedIds: [o.id] });
    }
    const rows: ClubRow[] = [];
    for (const { card, ownedIds } of byKey.values()) {
      rows.push({ card, count: ownedIds.length, ownedIds, dupSellValue: 0 });
    }
    return rows.sort((a, b) => b.card.ovr - a.card.ovr);
  }, [state.inventory, index]);

  const totalCards = state.inventory.length;
  const uniqueCards = club.length;
  const dupCount = totalCards - uniqueCards;

  // ── squad building ──
  const ownedById = useMemo(() => new Map(state.inventory.map((o) => [o.id, o] as const)), [state.inventory]);
  const squad = activeSquad(state);
  const form = formationById(squad?.formation ?? 'standard');
  const slotCard = (slotIdx: number): { owned: OwnedCard; card: UltCard } | null => {
    const entry = squad?.slots.find((s) => s.slot === slotIdx);
    if (!entry?.ownedId) return null;
    const owned = ownedById.get(entry.ownedId);
    const card = owned ? index.get(owned.cardKey) : undefined;
    return owned && card ? { owned, card } : null;
  };
  const nodes: ChemNode[] = form.slots.map((fs) => {
    const sc = slotCard(fs.slot);
    return { slot: fs.slot, slotRole: fs.role, card: sc ? { teamOrigin: sc.card.teamOrigin, region: sc.card.region, country: sc.card.country, role: sc.card.role } : null };
  });
  const chem = computeChemistry(form.adjacency, nodes);
  const placed = form.slots.map((fs) => slotCard(fs.slot)?.card).filter((c): c is UltCard => !!c);
  const avgOvr = placed.length ? Math.round(placed.reduce((a, c) => a + c.ovr, 0) / placed.length) : 0;
  const cl = chemLabel(chem.total);

  // ── ranqueada vs IA ──
  const pool = useMemo(() => buildPool(CS2_REAL_2026), []);
  const poolById = useMemo(() => new Map(pool.map((p) => [p.id, p] as const)), [pool]);
  const squadPool = form.slots.map((fs) => { const sc = slotCard(fs.slot); return sc ? poolById.get(sc.card.playerId) ?? null : null; });
  const squadComplete = squadPool.every((p): p is PoolPlayer => p != null);
  const rank = rankFor(state.profile.elo);

  // ── ladder de IA (ranking) + bazar (mercado) — P6 ──
  const ladder = useMemo<AiPlayer[]>(() => buildAiLadder(pool.map((p) => ({ nick: p.nick, country: p.country, ovr: p.ovr })), 20260607), [pool]);
  const [bazaar, setBazaar] = useState<Listing[]>([]);
  useEffect(() => {
    setBazaar(buildBazaar(ultimateCatalog(), ladder.slice(0, 60).map((a) => a.nick), bazaarDayBucket(Date.now())));
  }, [ladder]);
  const buyFromBazaar = (l: Listing) => {
    if (buyCard(l.cardKey, l.price)) { setBazaar((b) => b.filter((x) => x.id !== l.id)); flash(`✅ ${ct('Comprado')} · -${fmt(l.price)} 🪙`); }
    else flash(ct('Créditos insuficientes.'));
  };
  // ranking com VOCÊ inserido por elo
  const rankedList = useMemo(() => {
    const me: AiPlayer = { id: 'you', nick: ct('Você'), country: 'br', elo: state.profile.elo, w: state.profile.w, l: state.profile.l };
    const arr = [...ladder, me].sort((a, b) => b.elo - a.elo);
    return arr;
  }, [ladder, state.profile.elo, state.profile.w, state.profile.l]);
  const myRankPos = rankedList.findIndex((p) => p.id === 'you') + 1;

  const playMatch = () => {
    if (!squadComplete) return;
    const five = squadPool as PoolPlayer[];
    const userTeam = buildOnlineTeam(ct('Seu Squad'), five, 'ut-user');
    userTeam.strength = userTeam.strength * chem.multiplier; // química influencia a força
    const target = Math.max(60, Math.min(96, 68 + (state.profile.elo - 1000) / 25));
    const mineIds = new Set(five.map((p) => p.id));
    const oppFive = pool.filter((p) => !mineIds.has(p.id))
      .sort((a, b) => Math.abs(a.ovr - target) - Math.abs(b.ovr - target)).slice(0, 5)
      .sort((a, b) => b.ovr - a.ovr);
    const oppTeam = buildOnlineTeam(ct('Esquadrão IA'), oppFive, 'ut-opp');
    const oppOvr = oppFive.length ? Math.round(oppFive.reduce((a, p) => a + p.ovr, 0) / oppFive.length) : Math.round(target);
    // ELO do rival RELATIVO ao SEU squad: bater um time acima do seu OVR paga mais
    // e perder pra um mais fraco custa mais — a recompensa acompanha a dificuldade real.
    const myOvr = avgOvr || oppOvr;
    const oppElo = Math.max(300, Math.round(state.profile.elo + (oppOvr - myOvr) * 22));
    const rng = makeRng(Math.floor(Math.random() * 2147483647));
    const maps = autoVeto([userTeam, oppTeam], rng, 1);
    const series = simulateSeries(rng, userTeam, oppTeam, maps, 1);
    setResult(null);
    setLive({ series, teams: [userTeam, oppTeam], oppElo });
  };

  const finishMatch = () => {
    if (!live) return;
    const won = live.series.winner === 0;
    const m = live.series.maps[0];
    const score = m ? `${m.score[0]}-${m.score[1]}` : `${live.series.mapScore[0]}-${live.series.mapScore[1]}`;
    const outcome = recordMatch(won, live.oppElo);
    setLive(null);
    setResult({ won, score, outcome });
  };

  const buy = (pack: PackDef) => {
    const res = openPack(pack.id);
    if (!res.ok) { flash(res.reason === 'insufficient' ? ct('Créditos insuficientes.') : ct('Não foi possível abrir.')); return; }
    setReveal([...res.cards].sort((a, b) => b.ovr - a.ovr));
  };

  // vende TODAS as duplicatas (mantém 1 cópia de cada), somando os créditos.
  const sellAllDuplicates = () => {
    let total = 0;
    let sold = 0;
    for (const row of club) {
      if (row.count <= 1) continue;
      // mantém a 1ª, vende o resto
      for (const id of row.ownedIds.slice(1)) {
        const r = sell(id);
        if (r.ok) { total += r.credited; sold++; }
      }
    }
    flash(sold ? `${ct('Vendidas')} ${sold} ${ct('duplicatas')} · +${fmt(total)} 🪙` : ct('Nenhuma duplicata pra vender.'));
  };

  const sellOne = (row: ClubRow) => {
    // vende a cópia "extra" se houver dupe; senão a única
    const id = row.count > 1 ? row.ownedIds[row.ownedIds.length - 1] : row.ownedIds[0];
    const r = sell(id);
    if (r.ok) flash(`+${fmt(r.credited)} 🪙`);
  };

  // primeira vez: onboarding (escolhe esquema → 5 cartas iniciais → onboarded=true).
  if (!state.profile.onboarded) {
    return (
      <div className="fade-in" style={{ maxWidth: 620, margin: '0 auto', padding: '24px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--em-muted,#8a99ab)' }}>MAJOR//CS · Ultimate Squad</div>
          <h1 style={{ margin: '6px 0 0', fontSize: '1.8rem', fontWeight: 900, color: 'var(--em-text,#e6edf5)' }}>{ct('Monte sua coleção')}</h1>
          <p className="muted" style={{ maxWidth: 470, margin: '8px auto 0', lineHeight: 1.5, fontSize: '0.9rem' }}>{ct('Escolha um esquema inicial e receba 5 cartas dos jogadores reais de 2026. Depois abra pacotes, monte o time com química e suba no ranking.')}</p>
        </div>
        <DashCard title={`🧩 ${ct('Escolha seu esquema')}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
            {FORMATIONS.map((f) => (
              <button key={f.id} onClick={() => setOnbForm(f.id)} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${onbForm === f.id ? 'var(--em-gold,#e8c170)' : 'var(--em-border,#2a3340)'}`, background: onbForm === f.id ? 'rgba(232,193,112,0.1)' : 'transparent' }}>
                <div style={{ fontWeight: 900, fontSize: '0.95rem', color: onbForm === f.id ? '#e8c170' : 'var(--em-text,#e6edf5)' }}>{f.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--em-muted,#8a99ab)', marginTop: 3, lineHeight: 1.35 }}>{f.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <Button variant="primary" onClick={() => { const cards = claimStarter(onbForm); setReveal([...cards].sort((a, b) => b.ovr - a.ovr)); }}>🎁 {ct('Receber meu time inicial')}</Button>
          </div>
        </DashCard>
        <div style={{ textAlign: 'center' }}><button onClick={onBack} style={backBtn}>← {ct('Voltar')}</button></div>
      </div>
    );
  }

  // partida rolando: substitui a tela pelo replay round-a-round (reusa MatchReplay).
  if (live) {
    return (
      <div className="fade-in" style={{ maxWidth: 960, margin: '0 auto', padding: '14px 16px 40px' }}>
        <button onClick={finishMatch} style={backBtn}>← {ct('Encerrar')}</button>
        <div style={{ margin: '10px 0', textAlign: 'center', fontWeight: 800, fontSize: '0.8rem', color: 'var(--em-muted,#8a99ab)' }}>
          {live.teams[0].name} vs {live.teams[1].name}
        </div>
        <MatchReplay series={live.series} teams={live.teams} playbackSpeed={speed} canControlSpeed onPlaybackSpeedChange={setSpeed} onFinish={finishMatch} onClose={finishMatch} />
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 16px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        .ult-foil { background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 48%, rgba(255,255,255,0.05) 55%, transparent 70%); background-size: 250% 250%; animation: ult-shimmer 3.2s linear infinite; mix-blend-mode: screen; }
        @keyframes ult-shimmer { 0% { background-position: 120% 0; } 100% { background-position: -60% 0; } }
        .ult-reveal-card { animation: ult-pop .45s cubic-bezier(0.2,0.8,0.2,1) both; }
        @keyframes ult-pop { from { opacity:0; transform: translateY(14px) scale(.82) rotateY(35deg); } to { opacity:1; transform:none; } }
      `}</style>
      {/* header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={backBtn}>← {ct('Voltar')}</button>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--em-muted,#8a99ab)' }}>MAJOR//CS</span>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.3px', color: 'var(--em-text,#e6edf5)' }}>Ultimate Squad</h1>
        </div>
        <span style={{ flex: 1 }} />
        {equipped && <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 800, border: `1px solid ${equipped.color}`, color: equipped.color }}>{equipped.label}</span>}
        <button onClick={() => setDailyOpen(true)} style={{ ...iconBtn, ...(daily.canClaim ? { borderColor: '#e8c170', color: '#e8c170' } : {}) }} title={ct('Recompensa diária')}>🎁{daily.canClaim ? ' •' : ''}</button>
        <button onClick={() => setTitlesOpen(true)} style={iconBtn} title={ct('Títulos')}>🏷️</button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(232,193,112,0.12)', border: '1px solid rgba(232,193,112,0.4)', fontWeight: 900, color: '#e8c170', fontFamily: '"JetBrains Mono", monospace' }}>
          🪙 {fmt(credits)}
        </span>
      </header>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {([
          ['hub', ct('Hub')],
          ['club', `${ct('Coleção')} (${totalCards})`],
          ['squad', ct('Squad')],
          ['store', ct('Loja')],
          ['mercado', ct('Mercado')],
          ['ranked', ct('Ranqueada')],
          ['sbc', ct('Desafios')],
          ['ranking', ct('Ranking')],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={tabBtn(tab === id)}>{label}</button>
        ))}
      </div>

      {tab === 'hub' && (
        <>
          <DashCard
            title={`📅 ${ct('Recompensa diária')}`}
            actions={daily.canClaim
              ? <Button variant="primary" onClick={() => { const r = claimDaily(); if (r.claimed) flash(`${ct('Dia')} ${r.day} · +${fmt(r.credits)} 🪙`); }}>{ct('Resgatar dia')} {daily.day}</Button>
              : <span className="muted small">{ct('Volte amanhã')}</span>}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
              {DAILY_TABLE.map((e) => {
                const done = daily.canClaim ? e.day < daily.day : e.day <= state.profile.daily.streakDay;
                const isCur = daily.canClaim && e.day === daily.day;
                return (
                  <div key={e.day} style={{ padding: '8px 4px', borderRadius: 8, textAlign: 'center', border: `1px solid ${isCur ? '#e8c170' : 'var(--em-border,#2a3340)'}`, background: isCur ? 'rgba(232,193,112,0.14)' : done ? 'rgba(94,216,138,0.08)' : 'transparent', opacity: done ? 0.75 : 1 }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 800, color: 'var(--em-muted,#8a99ab)' }}>D{e.day}</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 900, color: isCur ? '#e8c170' : 'var(--em-text,#e6edf5)' }}>🪙{e.credits >= 1000 ? `${e.credits / 1000}k` : e.credits}</div>
                    {done && <div style={{ fontSize: '0.66rem', color: '#5ed88a' }}>✓</div>}
                  </div>
                );
              })}
            </div>
          </DashCard>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <DashCard title={`⚔️ ${ct('Match Day')}`}>
              {squadComplete ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="muted small" style={{ margin: 0 }}>{ct('Squad pronto. Entre na fila ranqueada.')}</p>
                  <Button variant="primary" onClick={() => setTab('ranked')}>▶ {ct('Jogar ranqueada')}</Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="muted small" style={{ margin: 0 }}>{ct('Você não tem squad ativo — monte no Squad Builder.')}</p>
                  <Button variant="ghost" onClick={() => setTab('squad')}>{ct('Montar squad')}</Button>
                </div>
              )}
            </DashCard>
            <DashCard title={`🏅 ${ct('Rank atual')}`}>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: rank.color }}>{rank.name}</div>
              <div style={{ fontSize: '1.4rem', fontFamily: '"JetBrains Mono", monospace', fontWeight: 900, marginTop: 2 }}>{state.profile.elo} <span style={{ fontSize: '0.7rem', color: 'var(--em-muted,#8a99ab)' }}>RP</span></div>
              <div style={{ fontSize: '0.74rem', color: 'var(--em-muted,#8a99ab)', marginTop: 2 }}>{state.profile.w}V · {state.profile.l}D · {ct('pico')} {state.profile.peakElo}</div>
            </DashCard>
            <DashCard title={`💰 ${ct('Economia')}`}>
              <div style={{ display: 'flex', gap: 18, fontSize: '0.82rem' }}>
                {([['CREDITS', fmt(credits), '#e8c170'], [ct('CARTAS'), String(totalCards), 'var(--em-text,#e6edf5)'], [ct('ÚNICAS'), String(uniqueCards), 'var(--em-text,#e6edf5)']] as const).map(([lab, val, col]) => (
                  <div key={lab}><div style={{ fontSize: '0.58rem', color: 'var(--em-muted,#8a99ab)', fontWeight: 800 }}>{lab}</div><b style={{ fontFamily: '"JetBrains Mono", monospace', color: col }}>{val}</b></div>
                ))}
              </div>
            </DashCard>
            <DashCard title={`🔥 ${ct('Streak & forma')}`}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: '"JetBrains Mono", monospace', color: state.profile.streak > 0 ? '#5ed88a' : 'var(--em-text,#e6edf5)' }}>{state.profile.streak}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--em-muted,#8a99ab)' }}>{ct('vitórias seguidas')}</div>
            </DashCard>
          </div>
          {squadComplete && (
            <DashCard title={`🧩 ${ct('Squad ativo')}`} actions={<Button variant="ghost" onClick={() => setTab('squad')}>{ct('Editar')}</Button>}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {form.slots.map((fs) => { const sc = slotCard(fs.slot); return sc ? <UltCardView key={fs.slot} card={sc.card} size={96} /> : null; })}
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, fontSize: '0.8rem' }}>{ct('OVR')} <b>{avgOvr}</b> · {ct('química')} <b style={{ color: cl.color }}>{chem.total}/15</b></div>
            </DashCard>
          )}
        </>
      )}

      {tab === 'mercado' && (
        <DashCard title={`🛒 ${ct('Mercado (bazar)')}`}>
          <p className="muted small" style={{ marginTop: -2, marginBottom: 10 }}>{ct('Cartas à venda por outros jogadores (IA). O mercado renova todo dia. Compre com credits.')}</p>
          {bazaar.length === 0 ? <p className="muted small">{ct('Sem listagens agora.')}</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, justifyItems: 'center' }}>
              {bazaar.map((l) => {
                const c = index.get(l.cardKey);
                if (!c) return null;
                const afford = credits >= l.price;
                return (
                  <div key={l.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <UltCardView card={c} size={128} />
                    <div style={{ fontSize: '0.6rem', color: 'var(--em-muted,#8a99ab)' }}>{ct('por')} {l.sellerNick}</div>
                    <button onClick={() => buyFromBazaar(l)} disabled={!afford} style={{ ...sellBtn, borderColor: afford ? '#e8c170' : 'var(--em-border,#2a3340)', color: afford ? '#e8c170' : 'var(--em-muted,#8a99ab)', cursor: afford ? 'pointer' : 'default', fontWeight: 900 }}>🪙 {fmt(l.price)}</button>
                  </div>
                );
              })}
            </div>
          )}
        </DashCard>
      )}

      {tab === 'ranking' && (
        <DashCard title={`🏆 ${ct('Ranking global')}`}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: '0.8rem', color: 'var(--em-muted,#8a99ab)' }}>
            <span>{ct('Jogadores')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{rankedList.length}</b></span>
            <span>{ct('Sua posição')}: <b style={{ color: '#e8c170' }}>#{myRankPos}</b></span>
            <span>{ct('Líder')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{rankedList[0]?.nick}</b> ({rankedList[0]?.elo} RP)</span>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14, alignItems: 'flex-end' }}>
            {[1, 0, 2].map((idx) => {
              const p = rankedList[idx];
              if (!p) return null;
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
              return (
                <div key={idx} style={{ textAlign: 'center', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--em-border,#2a3340)', background: idx === 0 ? 'rgba(232,193,112,0.1)' : 'var(--em-panel,#0f131a)', minWidth: 108, transform: idx === 0 ? 'scale(1.06)' : 'none' }}>
                  <div style={{ fontSize: '1.4rem' }}>{medal}</div>
                  <PlayerAvatar nick={p.nick} size={40} />
                  <div style={{ fontWeight: 900, fontSize: '0.82rem', marginTop: 4 }}>{p.nick}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--em-muted,#8a99ab)', fontFamily: '"JetBrains Mono", monospace' }}>{p.elo} RP</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {rankedList.slice(0, 30).map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', borderRadius: 6, fontSize: '0.8rem', background: p.id === 'you' ? 'rgba(232,193,112,0.12)' : 'transparent' }}>
                <span style={{ minWidth: 28, color: 'var(--em-muted,#8a99ab)', fontFamily: '"JetBrains Mono", monospace' }}>#{i + 1}</span>
                <Flag cc={p.country} /> <b style={{ flex: 1, color: p.id === 'you' ? '#e8c170' : 'var(--em-text,#e6edf5)' }}>{p.nick}</b>
                <span style={{ color: 'var(--em-muted,#8a99ab)' }}>{p.w}V-{p.l}D</span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 800 }}>{p.elo}</span>
              </div>
            ))}
            {myRankPos > 30 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', borderRadius: 6, fontSize: '0.8rem', background: 'rgba(232,193,112,0.12)', marginTop: 6 }}>
                <span style={{ minWidth: 28, color: '#e8c170', fontFamily: '"JetBrains Mono", monospace' }}>#{myRankPos}</span>
                <Flag cc="br" /> <b style={{ flex: 1, color: '#e8c170' }}>{ct('Você')}</b>
                <span style={{ color: 'var(--em-muted,#8a99ab)' }}>{state.profile.w}V-{state.profile.l}D</span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 800 }}>{state.profile.elo}</span>
              </div>
            )}
          </div>
        </DashCard>
      )}

      {tab === 'store' && (
        <DashCard title={`🎁 ${ct('Loja de pacotes')}`}>
          <p className="muted small" style={{ marginTop: -2, marginBottom: 10 }}>
            {ct('Abra pacotes, monte sua coleção dos jogadores reais de 2026. Venda duplicatas por créditos e junte pros pacotes melhores.')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
            {PACK_DEFS.map((pack) => {
              const afford = credits >= pack.cost;
              return (
                <div key={pack.id} style={{ borderRadius: 10, padding: 14, border: `1px solid ${pack.color}55`, background: `linear-gradient(160deg, ${pack.color}18 0%, var(--em-panel,#0f131a) 70%)`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '2rem', textAlign: 'center' }}>📦</div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: pack.color, textAlign: 'center' }}>{pack.name}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--em-muted,#8a99ab)', textAlign: 'center', minHeight: 32 }}>{pack.desc}</div>
                  <Button variant={afford ? 'primary' : 'ghost'} onClick={() => buy(pack)} disabled={!afford} style={{ width: '100%', justifyContent: 'center' }}>
                    🪙 {fmt(pack.cost)}
                  </Button>
                </div>
              );
            })}
          </div>
        </DashCard>
      )}

      {tab === 'club' && (
        <DashCard
          title={`🗂️ ${ct('Coleção')}`}
          actions={dupCount > 0 ? <Button variant="ghost" onClick={sellAllDuplicates}>{ct('Vender duplicatas')} ({dupCount})</Button> : undefined}
        >
          {uniqueCards === 0 ? (
            <p className="muted small">{ct('Sua coleção está vazia. Abra um pacote na Loja pra começar.')}</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: '0.78rem', color: 'var(--em-muted,#8a99ab)' }}>
                <span>{ct('Cartas')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{totalCards}</b></span>
                <span>{ct('Únicas')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{uniqueCards}</b></span>
                <span>{ct('Duplicatas')}: <b style={{ color: dupCount ? '#e8c170' : 'var(--em-text,#e6edf5)' }}>{dupCount}</b></span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, justifyItems: 'center' }}>
                {club.map((row) => (
                  <div key={row.card.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <UltCardView card={row.card} count={row.count} size={140} qs={quickSellValue(row.card.rarity, row.card.ovr, row.count > 1)} />
                    <button onClick={() => sellOne(row)} style={sellBtn} title={ct('Quick-sell')}>
                      {row.count > 1 ? ct('vender dup') : ct('vender')} 🪙
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </DashCard>
      )}

      {tab === 'squad' && (
        <DashCard title={`🧩 ${ct('Montar squad')}`}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {FORMATIONS.map((f) => (
              <button key={f.id} onClick={() => setFormation(f.id)} title={f.desc} style={tabBtn(form.id === f.id)}>{f.name}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', fontSize: '0.82rem' }}>
            <span>{ct('Química')}: <b style={{ color: cl.color, fontFamily: '"JetBrains Mono", monospace' }}>{chem.total}/15</b> <span style={{ color: cl.color, fontWeight: 800 }}>{cl.label}</span></span>
            <span>{ct('Multiplicador')}: <b style={{ fontFamily: '"JetBrains Mono", monospace', color: chem.multiplier >= 1 ? '#5ed88a' : '#e58a8a' }}>{chem.multiplier.toFixed(2)}×</b></span>
            <span>{ct('OVR médio')}: <b style={{ fontFamily: '"JetBrains Mono", monospace' }}>{avgOvr || '—'}</b></span>
          </div>
          <div style={{ position: 'relative', width: '100%', maxWidth: 520, margin: '0 auto', aspectRatio: '4 / 5', background: 'radial-gradient(ellipse at 50% 34%, rgba(94,216,138,0.06), transparent 62%)', border: '1px solid var(--em-border,#2a3340)', borderRadius: 12 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {chem.edges.map((e, i) => {
                const a = form.slots[e.a], b = form.slots[e.b];
                const stroke = e.score >= 1.5 ? '#5ed88a' : e.score >= 0.5 ? '#e8c170' : e.score > 0 ? '#e58a8a' : 'rgba(255,255,255,0.08)';
                return <line key={i} x1={a.x * 100} y1={a.y * 100} x2={b.x * 100} y2={b.y * 100} stroke={stroke} strokeWidth={e.score >= 1.5 ? 0.9 : 0.6} strokeDasharray={e.score > 0 && e.score < 0.5 ? '2 2' : undefined} />;
              })}
            </svg>
            {form.slots.map((fs) => {
              const sc = slotCard(fs.slot);
              return (
                <div key={fs.slot} style={{ position: 'absolute', left: `${fs.x * 100}%`, top: `${fs.y * 100}%`, transform: 'translate(-50%,-50%)' }}>
                  {sc ? (
                    <button onClick={() => setPickSlot(fs.slot)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} title={ct('Trocar')}>
                      <UltCardView card={sc.card} size={92} />
                    </button>
                  ) : (
                    <button onClick={() => setPickSlot(fs.slot)} style={emptySlot}>
                      <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>＋</span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 800 }}>{fs.role}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted small" style={{ textAlign: 'center', marginTop: 10 }}>
            {ct('Mesma org (+1), mesma região (+0.5) e mesmo país (+0.5) entre jogadores conectados dão química. Encaixe as funções pra somar mais.')}
          </p>
        </DashCard>
      )}

      {tab === 'ranked' && (
        <DashCard title={`🏆 ${ct('Ranqueada vs IA')}`}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'inline-flex', flexDirection: 'column', padding: '10px 16px', borderRadius: 10, border: `1px solid ${rank.color}55`, background: `${rank.color}14`, minWidth: 150 }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--em-muted,#8a99ab)' }}>{ct('Seu rank')}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 900, color: rank.color }}>{rank.name}</span>
              <span style={{ fontSize: '0.8rem', fontFamily: '"JetBrains Mono", monospace', color: 'var(--em-text,#e6edf5)' }}>{state.profile.elo} RP</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--em-muted,#8a99ab)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span>{ct('Vitórias')}: <b style={{ color: '#5ed88a' }}>{state.profile.w}</b> · {ct('Derrotas')}: <b style={{ color: '#e58a8a' }}>{state.profile.l}</b></span>
              <span>{ct('Sequência')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{state.profile.streak}</b> · {ct('Pico')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{state.profile.peakElo} RP</b></span>
              <span>{ct('Seu squad')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{avgOvr || '—'} OVR</b> · {ct('química')} <b style={{ color: cl.color }}>{chem.total}/15</b> ({chem.multiplier.toFixed(2)}×)</span>
            </div>
          </div>
          {squadComplete ? (
            <Button variant="primary" onClick={playMatch}>▶ {ct('Jogar partida ranqueada')}</Button>
          ) : (
            <div>
              <Button variant="ghost" disabled>▶ {ct('Jogar partida ranqueada')}</Button>
              <p className="muted small" style={{ marginTop: 8 }}>{ct('Complete os 5 slots do seu squad (aba Squad) pra jogar. A química do time influencia a força na partida.')}</p>
            </div>
          )}
        </DashCard>
      )}

      {/* resultado da partida */}
      {result && (
        <Modal open onClose={() => setResult(null)} title={result.won ? `✅ ${ct('Vitória!')}` : `❌ ${ct('Derrota')}`} size="sm"
          footer={<><Button variant="ghost" onClick={() => setResult(null)}>{ct('Fechar')}</Button><Button variant="primary" onClick={() => { setResult(null); playMatch(); }} disabled={!squadComplete}>{ct('Jogar de novo')}</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ fontSize: '2rem', fontWeight: 900, fontFamily: '"JetBrains Mono", monospace', color: result.won ? '#5ed88a' : '#e58a8a' }}>{result.score}</div>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.9rem', fontWeight: 800 }}>
              <span style={{ color: result.outcome.eloDelta >= 0 ? '#5ed88a' : '#e58a8a' }}>{result.outcome.eloDelta >= 0 ? '▲ +' : '▼ '}{result.outcome.eloDelta} RP</span>
              {result.outcome.credits > 0 && <span style={{ color: '#e8c170' }}>🪙 +{fmt(result.outcome.credits)}</span>}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--em-muted,#8a99ab)' }}>{rank.name} · {state.profile.elo} RP</span>
          </div>
        </Modal>
      )}

      {/* seletor de carta pro slot */}
      {pickSlot != null && (() => {
        const slotRole = form.slots[pickSlot].role;
        const cands = state.inventory
          .map((o) => ({ o, card: index.get(o.cardKey) }))
          .filter((x): x is { o: OwnedCard; card: UltCard } => !!x.card)
          .sort((a, b) => (Number(roleFitsSlot(b.card.role, slotRole)) - Number(roleFitsSlot(a.card.role, slotRole))) || b.card.ovr - a.card.ovr);
        const current = slotCard(pickSlot);
        return (
          <Modal open onClose={() => setPickSlot(null)} title={`${ct('Escolher')} · ${slotRole}`} size="lg"
            footer={current ? <Button variant="ghost" onClick={() => { placeInSquad(pickSlot, null); setPickSlot(null); }}>{ct('Remover do slot')}</Button> : undefined}>
            {cands.length === 0 ? (
              <p className="muted small">{ct('Sem cartas. Abra pacotes na Loja.')}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10, maxHeight: 440, overflowY: 'auto', justifyItems: 'center' }}>
                {cands.map(({ o, card }) => {
                  const fits = roleFitsSlot(card.role, slotRole);
                  return (
                    <button key={o.id} onClick={() => { placeInSquad(pickSlot, o.id); setPickSlot(null); }} style={{ position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, opacity: fits ? 1 : 0.72 }}>
                      <UltCardView card={card} size={116} />
                      {!fits && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 8, background: 'rgba(229,138,138,0.85)', color: '#fff' }}>{ct('fora')}</span>}
                      {o.locked === 'squad' && <span style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#9fd6ff' }}>{ct('escalado')}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Modal>
        );
      })()}

      {tab === 'sbc' && (
        <DashCard title={`🧪 ${ct('Desafios (SBC)')}`}>
          <p className="muted small" style={{ marginTop: -2, marginBottom: 10 }}>
            {ct('Monte times que cumpram os requisitos e troque cartas (inclusive duplicatas) por recompensas. As cartas usadas são consumidas.')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
            {SBCS.map((s) => (
              <div key={s.id} style={{ borderRadius: 10, padding: 14, border: '1px solid var(--em-border,#2a3340)', background: 'var(--em-panel,#0f131a)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--em-text,#e6edf5)' }}>{s.name}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--em-muted,#8a99ab)', minHeight: 34 }}>{s.desc}</div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                  {ct('Recompensa')}: {s.reward.credits ? <span style={{ color: '#e8c170' }}>🪙 {fmt(s.reward.credits)}</span> : null}
                  {s.reward.card ? <span style={{ color: rarityInfo(s.reward.card).color, marginLeft: s.reward.credits ? 8 : 0 }}> {ct('carta')} {rarityInfo(s.reward.card).label}</span> : null}
                </div>
                <Button variant="primary" onClick={() => { setSbcDef(s); setSbcSel([]); }}>{ct('Fazer desafio')}</Button>
              </div>
            ))}
          </div>
        </DashCard>
      )}

      {/* submeter SBC */}
      {sbcDef && (() => {
        const sel = sbcSel.map((id) => { const o = state.inventory.find((x) => x.id === id); return o ? index.get(o.cardKey) : undefined; }).filter((c): c is UltCard => !!c);
        const chk = checkSbc(sel, sbcDef.req);
        const eligible = state.inventory.filter((o) => o.locked !== 'squad').map((o) => ({ o, card: index.get(o.cardKey) })).filter((x): x is { o: OwnedCard; card: UltCard } => !!x.card).sort((a, b) => b.card.ovr - a.card.ovr);
        const toggle = (id: string) => setSbcSel((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : (cur.length < sbcDef.req.count ? [...cur, id] : cur));
        const submit = () => { const r = submitSbc(sbcDef.id, sbcSel); if (r.ok) { setSbcDef(null); setSbcSel([]); if (r.grantedCard) setReveal([r.grantedCard]); flash(`✅ ${ct('Desafio concluído!')}${r.reward?.credits ? ` +${fmt(r.reward.credits)} 🪙` : ''}`); } else { flash(ct('Requisitos não cumpridos.')); } };
        return (
          <Modal open onClose={() => { setSbcDef(null); setSbcSel([]); }} title={`🧪 ${sbcDef.name}`} size="lg"
            footer={<Button variant="primary" disabled={!chk.ok} onClick={submit}>{ct('Enviar')} ({sbcSel.length}/{sbcDef.req.count})</Button>}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {chk.items.map((it, i) => (
                <span key={i} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 12, border: `1px solid ${it.ok ? '#5ed88a' : '#e58a8a'}`, color: it.ok ? '#5ed88a' : '#e58a8a' }}>{it.ok ? '✓' : '✗'} {it.label}</span>
              ))}
            </div>
            {eligible.length === 0 ? (
              <p className="muted small">{ct('Sem cartas livres. Abra pacotes ou tire cartas do squad.')}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(108px,1fr))', gap: 8, maxHeight: 420, overflowY: 'auto', justifyItems: 'center' }}>
                {eligible.map(({ o, card }) => {
                  const on = sbcSel.includes(o.id);
                  return (
                    <button key={o.id} onClick={() => toggle(o.id)} style={{ position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, outline: on ? '2px solid #5ed88a' : 'none', borderRadius: 10, opacity: on || sbcSel.length < sbcDef.req.count ? 1 : 0.5 }}>
                      <UltCardView card={card} size={104} />
                      {on && <span style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.7rem', fontWeight: 900, width: 18, height: 18, borderRadius: '50%', background: '#5ed88a', color: '#04120a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Modal>
        );
      })()}

      {/* nova temporada */}
      {seasonRoll && (
        <Modal open onClose={() => setSeasonRoll(null)} title={`🗓️ ${ct('Nova temporada!')}`} size="sm"
          footer={<Button variant="primary" onClick={() => setSeasonRoll(null)}>{ct('Continuar')}</Button>}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 0' }}>
            <p className="muted small" style={{ margin: 0 }}>{ct('A temporada virou. Seu RP foi suavizado pra manter a disputa acirrada e você levou um bônus de fim de temporada.')}</p>
            <div style={{ fontSize: '0.95rem', fontWeight: 900 }}>{ct('Novo RP')}: <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{seasonRoll.newElo}</span></div>
            {seasonRoll.credits > 0 && <div style={{ color: '#e8c170', fontWeight: 900 }}>🪙 +{fmt(seasonRoll.credits)}</div>}
          </div>
        </Modal>
      )}

      {/* recompensa diária */}
      {dailyOpen && (
        <Modal open onClose={() => setDailyOpen(false)} title={`🎁 ${ct('Recompensa diária')}`} size="md"
          footer={<Button variant="primary" disabled={!daily.canClaim} onClick={() => { const r = claimDaily(); if (r.claimed) flash(`${ct('Dia')} ${r.day} · +${fmt(r.credits)} 🪙`); setDailyOpen(false); }}>{daily.canClaim ? `${ct('Resgatar dia')} ${daily.day}` : ct('Volte amanhã')}</Button>}>
          <p className="muted small" style={{ marginTop: -2, marginBottom: 10 }}>{ct('Volte todo dia pra manter a sequência. Faltar um dia reseta pro dia 1.')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
            {DAILY_TABLE.map((e) => {
              const done = daily.canClaim ? e.day < daily.day : e.day <= state.profile.daily.streakDay;
              const isCur = daily.canClaim && e.day === daily.day;
              return (
                <div key={e.day} style={{ padding: '8px 4px', borderRadius: 8, textAlign: 'center', border: `1px solid ${isCur ? '#e8c170' : 'var(--em-border,#2a3340)'}`, background: isCur ? 'rgba(232,193,112,0.14)' : done ? 'rgba(94,216,138,0.08)' : 'transparent', opacity: done ? 0.75 : 1 }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 800, color: 'var(--em-muted,#8a99ab)' }}>{ct('Dia')} {e.day}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 900, color: isCur ? '#e8c170' : 'var(--em-text,#e6edf5)' }}>🪙{e.credits >= 1000 ? `${e.credits / 1000}k` : e.credits}</div>
                  {done && <div style={{ fontSize: '0.68rem', color: '#5ed88a' }}>✓</div>}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* títulos */}
      {titlesOpen && (
        <Modal open onClose={() => setTitlesOpen(false)} title={`🏷️ ${ct('Títulos')}`} size="md">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TITLES.map((t) => {
              const owned = state.profile.titles.includes(t.slug);
              const isEq = state.profile.equippedTitle === t.slug;
              return (
                <div key={t.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${owned ? `${t.color}55` : 'var(--em-border,#2a3340)'}`, background: owned ? `${t.color}10` : 'transparent', opacity: owned ? 1 : 0.55 }}>
                  <span style={{ fontWeight: 900, color: owned ? t.color : 'var(--em-muted,#8a99ab)', fontSize: '0.88rem', minWidth: 150 }}>{t.label}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--em-muted,#8a99ab)', flex: 1 }}>{t.desc}</span>
                  {owned ? (isEq ? <span style={{ fontSize: '0.68rem', fontWeight: 800, color: t.color }}>{ct('equipado')}</span> : <button onClick={() => equipTitle(t.slug)} style={sellBtn}>{ct('equipar')}</button>) : <span style={{ fontSize: '0.7rem' }}>🔒</span>}
                </div>
              );
            })}
            {state.profile.equippedTitle && <button onClick={() => equipTitle(null)} style={{ ...sellBtn, alignSelf: 'flex-start' }}>{ct('desequipar')}</button>}
          </div>
        </Modal>
      )}

      {/* reveal do pack */}
      {reveal && (
        <Modal open onClose={() => setReveal(null)} title={`✨ ${ct('Pacote aberto')}`} size="lg"
          footer={<Button variant="primary" onClick={() => { setReveal(null); setTab('club'); }}>{ct('Ver coleção')}</Button>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', padding: '6px 0' }}>
            {reveal.map((c, i) => (
              <div key={`${c.key}-${i}`} className="ult-reveal-card" style={{ animationDelay: `${i * 120}ms` }}>
                <UltCardView card={c} size={132} />
              </div>
            ))}
          </div>
          <style>{`
            .ult-reveal-card { animation: ult-pop .45s cubic-bezier(0.2,0.8,0.2,1) both; }
            @keyframes ult-pop { from { opacity:0; transform: translateY(14px) scale(.82) rotateY(35deg); } to { opacity:1; transform:none; } }
          `}</style>
        </Modal>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '9px 18px', borderRadius: 8, background: 'var(--em-panel-2,#12161e)', border: '1px solid var(--em-border,#2a3340)', fontWeight: 800, fontSize: '0.84rem', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const backBtn: CSSProperties = { padding: '7px 13px', background: 'var(--em-panel-2,#12161e)', color: 'var(--em-text,#e6edf5)', border: '1px solid var(--em-border,#2a3340)', borderRadius: 6, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' };
const sellBtn: CSSProperties = { padding: '4px 10px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', borderRadius: 5, border: '1px solid var(--em-border,#2a3340)', background: 'transparent', color: 'var(--em-muted,#8a99ab)', fontFamily: 'inherit' };
const emptySlot: CSSProperties = { width: 78, height: 94, borderRadius: 10, border: '1.5px dashed var(--em-border,#3a4553)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: 'var(--em-muted,#8a99ab)', fontFamily: 'inherit' };
const iconBtn: CSSProperties = { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--em-border,#2a3340)', background: 'transparent', color: 'var(--em-text,#e6edf5)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' };
const tabBtn = (on: boolean): CSSProperties => ({ padding: '7px 16px', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', borderRadius: 6, border: '1px solid var(--em-border,#2a3340)', background: on ? 'var(--em-gold,#e8c170)' : 'transparent', color: on ? '#1a1205' : 'var(--em-text,#e6edf5)', fontFamily: 'inherit' });
