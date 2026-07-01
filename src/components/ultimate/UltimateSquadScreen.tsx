// Ultimate Squad — tela P1 (Loja + Coleção + reveal de pack). Modo offline,
// cartas do dataset real, moeda `credits`. Padrão em-*/DashCard/Modal/Button.
// Ver docs-but-map.md. Sub-fases futuras: Squad Builder (P2), partida vs IA (P3).

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, Modal } from '../ds';
import { Flag, PlayerAvatar } from '../ui';
import { ultimateCatalog, ultimateIndex, useUltimate } from '../../state/ultimate';
import { PACK_DEFS, type PackDef } from '../../engine/ultimate/packs';
import { rarityInfo } from '../../engine/ultimate/rarities';
import { FORMATIONS, formationById } from '../../engine/ultimate/formations';
import { chemLabel, computeChemistry, roleFitsSlot, type ChemNode } from '../../engine/ultimate/chemistry';
import { activeSquad, EVO_MAX, EVO_COSTS, type MatchOutcome, type OwnedCard } from '../../engine/ultimate/state';
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
import { useAccount } from '../../state/account';
import { UtPanel, UtEmpty } from './UtPanel';
import {
  LayoutGrid, Users, Layers, Shirt, FlaskConical, Store, ArrowLeftRight, Package,
  Swords, ListOrdered, ChevronDown, Coins, Trophy, Zap, Menu, CalendarDays, Lock,
  Check, Gift, Star, Gem, Crown, Wallet, TrendingUp, Medal, Flame, AlertCircle,
  Tag, ArrowLeft, Sparkles, Plus, X, Target,
} from 'lucide-react';
import { evaluateObjectives } from '../../engine/ultimate/objectives';
import { evaluateSeasonTiers } from '../../engine/ultimate/seasonRewards';
import '../../styles/ultimate.css';

const fmt = (n: number) => n.toLocaleString('pt-BR');
// chip de recurso: abrevia valores gigantes pra não estourar a nav.
const fmtChip = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : fmt(n));

// As paletas de rank/raridade/química/título foram feitas pra fundo ESCURO.
// No tema claro (.ut-root) usar essas cores como TEXTO sobre branco fica ilegível
// (contraste ~1.5:1). inkOnLight escurece qualquer hex preservando o matiz até
// uma luminância legível (~4:1 no branco). Usar só onde a cor vira TEXTO.
function inkOnLight(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  let r = parseInt(m[1].slice(0, 2), 16);
  let g = parseInt(m[1].slice(2, 4), 16);
  let b = parseInt(m[1].slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum > 0.2) {
    const f = 0.2 / lum;
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
  }
  const h = (x: number) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// carta visual compacta, moldura/glow pela raridade.
const ROLE_CODE: Record<string, string> = { AWP: 'AWP', Entry: 'ENT', Rifler: 'RIF', Lurker: 'LUR', Support: 'SUP', IGL: 'IGL' };
const STAT_ROWS: [keyof UltCard['stats'], string][][] = [
  [['tiro', 'TIR'], ['mira', 'MIR'], ['reflexo', 'REF']],
  [['visao', 'VIS'], ['clutch', 'CLU'], ['util', 'UTI']],
];
const FOIL_RARITIES = new Set(['legendary', 'icon', 'tots', 'major']);
const REGION_CODE: Record<string, string> = { samerica: 'SA', namerica: 'NA', europe: 'EU', cis: 'CIS', asia: 'AS', oceania: 'OCE', africa: 'AF', global: 'GLB' };

// tiers "especiais" ganham fundo ESCURO com brilho + foil; os comuns viram uma
// placa metálica CLARA. Dá hierarquia visual (comum → especial) estilo FUT.
const DARK_TIERS = new Set(['elite', 'legendary', 'icon', 'tots', 'major']);
function cardSkin(rarity: UltCard['rarity']) {
  const c = rarityInfo(rarity).color;
  if (DARK_TIERS.has(rarity)) {
    return {
      dark: true, frame: c,
      bg: `linear-gradient(162deg, ${c}cc 0%, #1d2029 46%, #101118 100%)`,
      sheen: `radial-gradient(130% 62% at 50% -10%, ${c}66, transparent 60%)`,
      ink: '#fdf6e6', sub: 'rgba(253,246,230,0.6)', line: `${c}55`,
      plate: 'rgba(0,0,0,0.30)', label: c, inner: 'rgba(255,255,255,0.10)',
      glow: `0 8px 24px ${c}55`, mark: 'rgba(253,246,230,0.32)', markSlash: 'rgba(226,59,46,0.6)',
    };
  }
  return {
    dark: false, frame: c,
    bg: `linear-gradient(158deg, #ffffff 0%, ${c}26 44%, ${c}44 100%)`,
    sheen: 'radial-gradient(130% 58% at 50% -8%, rgba(255,255,255,0.9), transparent 55%)',
    ink: '#20242e', sub: '#6b7280', line: `${c}66`,
    plate: `${c}26`, label: inkOnLight(c), inner: 'rgba(0,0,0,0.06)',
    glow: `0 5px 16px ${c}3a`, mark: 'rgba(32,36,46,0.26)', markSlash: 'rgba(226,59,46,0.45)',
  };
}

// aplica o nível de evolução (boost) no OVR e nos 6 atributos (clamp 99).
// Mantém key/rarity/playerId — só sobe os números. Base intacta se boost=0.
function boostCard(base: UltCard, boost: number | undefined): UltCard {
  const b = Math.max(0, Math.min(EVO_MAX, Math.floor(boost ?? 0)));
  if (!b) return base;
  const up = (v: number) => Math.min(99, v + b);
  return {
    ...base,
    ovr: Math.min(99, base.ovr + b),
    stats: { tiro: up(base.stats.tiro), mira: up(base.stats.mira), reflexo: up(base.stats.reflexo), visao: up(base.stats.visao), clutch: up(base.stats.clutch), util: up(base.stats.util) },
  };
}

// carta estilo FUT: pele premium por raridade (cardSkin), moldura dupla + sheen,
// placa do OVR, 6 substats, foil nas especiais e marca M//CS. `qs` = quick-sell.
function UltCardView({ card, size = 132, count, qs, evo = 0 }: { card: UltCard; size?: number; count?: number; qs?: number; evo?: number }) {
  const info = rarityInfo(card.rarity);
  const compact = size < 116;
  const h = Math.round(size * 1.4);
  const foil = FOIL_RARITIES.has(card.rarity);
  const s = cardSkin(card.rarity);
  const px = Math.round(size * 0.06);
  return (
    <div style={{ width: size, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: qs != null ? 6 : 0 }}>
      <div style={{ position: 'relative', width: size, height: h, borderRadius: 14, overflow: 'hidden', background: s.bg, border: `1.5px solid ${evo > 0 ? '#22c55e' : s.frame}`, boxShadow: evo > 0 ? `${s.glow}, 0 0 0 2px #22c55e, 0 0 20px rgba(34,197,94,0.4)` : s.glow }}>
        <div style={{ position: 'absolute', inset: 0, background: s.sheen, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 3, borderRadius: 11, border: `1px solid ${s.inner}`, pointerEvents: 'none' }} />
        {foil && <div className="ult-foil" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />}
        {evo > 0 && (
          <span style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: '0.56rem', fontWeight: 900, padding: '1px 6px', borderRadius: 10, background: '#16a34a', color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>✦{evo}</span>
        )}
        {count != null && count > 1 && (
          <span style={{ position: 'absolute', top: evo > 0 ? 25 : 6, right: 6, zIndex: 2, fontSize: '0.6rem', fontWeight: 900, padding: '1px 6px', borderRadius: 10, background: 'rgba(0,0,0,0.55)', color: '#fff' }}>×{count}</span>
        )}
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: `${px}px ${px}px ${Math.round(size * 0.05)}px` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, minWidth: Math.round(size * 0.26), padding: `${Math.round(size * 0.028)}px 2px`, borderRadius: 8, background: s.plate }}>
              <span style={{ fontSize: `${(size / 140) * 1.78}rem`, fontWeight: 900, color: s.ink, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '-0.5px' }}>{card.ovr}</span>
              <span style={{ fontSize: `${(size / 140) * 0.56}rem`, fontWeight: 800, color: s.ink, opacity: 0.9, marginTop: 1 }}>{ROLE_CODE[card.role] ?? card.role}</span>
              <span style={{ marginTop: 3 }}><Flag cc={card.country} /></span>
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <PlayerAvatar nick={card.nick} size={Math.round(size * (compact ? 0.42 : 0.5))} />
            </div>
          </div>
          <div style={{ fontSize: `${(size / 140) * 0.88}rem`, fontWeight: 900, color: s.ink, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>{card.nick}</div>
          {!compact && (
            <>
              <div style={{ height: 1, background: s.line, margin: '4px 6px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, justifyContent: 'center' }}>
                {STAT_ROWS.map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', justifyContent: 'space-around' }}>
                    {row.map(([k, label]) => (
                      <span key={label} style={{ fontSize: `${(size / 140) * 0.6}rem`, fontFamily: '"JetBrains Mono", monospace' }}>
                        <b style={{ color: s.ink, fontWeight: 900 }}>{card.stats[k]}</b> <span style={{ color: s.sub, fontWeight: 700 }}>{label}</span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 2 }}>
            <span style={{ fontSize: `${(size / 140) * 0.54}rem`, fontWeight: 800, color: s.ink, opacity: 0.72 }}>{REGION_CODE[card.region] ?? 'GLB'}</span>
            <span style={{ fontSize: `${(size / 140) * 0.54}rem`, fontWeight: 900, color: s.label, letterSpacing: '0.2px' }}>· {info.label}</span>
          </div>
        </div>
        {!compact && (
          <span style={{ position: 'absolute', bottom: 3, right: 6, zIndex: 1, fontSize: `${(size / 140) * 0.5}rem`, fontWeight: 900, color: s.mark, fontFamily: 'var(--ut-font-cond)', letterSpacing: '0.3px', pointerEvents: 'none' }}>M<span style={{ color: s.markSlash }}>//</span>CS</span>
        )}
      </div>
      {qs != null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.66rem', fontWeight: 800, padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(184,134,11,0.3)', color: '#92600a' }}><Coins size={11} /> +{qs.toLocaleString('pt-BR')}</span>
      )}
    </div>
  );
}

// agrupa o inventário por cardKey → carta + contagem de cópias (+ owned ids).
interface ClubRow { card: UltCard; count: number; ownedIds: string[]; evo: number }

export function UltimateSquadScreen({ onBack }: { onBack: () => void }) {
  const { state, openPack, sell, ensureSquad, placeInSquad, setFormation, recordMatch, claimDaily, syncTitles, equipTitle, claimStarter, submitSbc, tickSeason, buyCard, claimObjective, evolveCard, claimSeasonReward } = useUltimate();
  const index = ultimateIndex();
  const [tab, setTab] = useState<'hub' | 'store' | 'mercado' | 'club' | 'squad' | 'ranked' | 'sbc' | 'ranking'>('hub');
  const [reveal, setReveal] = useState<UltCard[] | null>(null);
  const [revealIdx, setRevealIdx] = useState(0); // walkout: carta atual sendo revelada
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
  const [navMenu, setNavMenu] = useState<'clube' | 'mercado' | 'more' | null>(null);
  const [clubFilter, setClubFilter] = useState<'all' | 'bronze' | 'silver' | 'gold' | 'special'>('all');
  const { account } = useAccount();

  const credits = state.profile.credits;
  const equipped = state.profile.equippedTitle ? titleBySlug(state.profile.equippedTitle) : undefined;
  const daily = computeNextDaily(state.profile.daily.streakDay, state.profile.daily.lastClaim, dateKey(new Date()));
  const displayName = account?.nick || account?.email?.split('@')[0] || 'Manager';
  // navegação por dropdown fecha ao clicar fora
  useEffect(() => {
    if (!navMenu) return;
    const h = () => setNavMenu(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [navMenu]);
  const go = (t: typeof tab) => { setTab(t); setNavMenu(null); };
  const onJogar = () => { if (squadComplete) playMatch(); else setTab('squad'); };
  // contagem regressiva até a próxima recompensa (meia-noite local)
  const msToMidnight = (() => { const d = new Date(); const n = new Date(d); n.setHours(24, 0, 0, 0); return n.getTime() - d.getTime(); })();
  const nextIn = daily.canClaim ? ct('disponível') : `${Math.floor(msToMidnight / 3_600_000)}h ${Math.floor((msToMidnight % 3_600_000) / 60_000)}m`;

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
  // reveal/walkout: começa a revelação na 1ª carta sempre que abre um novo pacote
  useEffect(() => { setRevealIdx(0); }, [reveal]);
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
    // agrupa por carta + nível de evolução (uma Prata +2 é distinta da Prata base).
    const byKey = new Map<string, { card: UltCard; evo: number; ownedIds: string[] }>();
    for (const o of state.inventory) {
      const base = index.get(o.cardKey);
      if (!base) continue;
      const evo = Math.min(EVO_MAX, Math.max(0, o.boost ?? 0));
      const key = `${o.cardKey}#${evo}`;
      const g = byKey.get(key);
      if (g) g.ownedIds.push(o.id);
      else byKey.set(key, { card: boostCard(base, evo), evo, ownedIds: [o.id] });
    }
    const rows: ClubRow[] = [];
    for (const { card, evo, ownedIds } of byKey.values()) {
      rows.push({ card, evo, count: ownedIds.length, ownedIds });
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
    const base = owned ? index.get(owned.cardKey) : undefined;
    return owned && base ? { owned, card: boostCard(base, owned.boost) } : null;
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

  // ── objetivos/missões (profundidade) ──
  const iconsOwned = useMemo(() => {
    const uniq = new Set(state.inventory.map((o) => o.cardKey));
    let n = 0;
    for (const k of uniq) if (index.get(k)?.rarity === 'icon') n++;
    return n;
  }, [state.inventory, index]);
  // "únicas" p/ objetivos = JOGADORES distintos (por cardKey) — não os grupos
  // carta+boost do club (senão evoluir uma duplicata inflaria a métrica).
  const uniquePlayers = new Set(state.inventory.map((o) => o.cardKey)).size;
  const objectives = evaluateObjectives({
    wins: state.profile.w, packsOpened: state.profile.packSeedCounter,
    uniqueCards: uniquePlayers, totalCards, squadOvr: avgOvr, chem: chem.total,
    streak: state.profile.streak, iconsOwned, sbcDone: state.profile.sbcDone.length,
    peakElo: state.profile.peakElo,
  });
  const claimedSet = new Set(state.profile.objectivesClaimed);
  const objClaimable = objectives.filter((o) => o.done && !claimedSet.has(o.def.id));
  const objSorted = [...objectives].sort((a, b) => {
    const aC = a.done && !claimedSet.has(a.def.id), bC = b.done && !claimedSet.has(b.def.id);
    if (aC !== bC) return aC ? -1 : 1;
    const aD = claimedSet.has(a.def.id), bD = claimedSet.has(b.def.id);
    if (aD !== bD) return aD ? 1 : -1;
    return b.pct - a.pct;
  });
  const claimObj = (o: (typeof objectives)[number]) => {
    const r = claimObjective(o.def.id);
    if (r.ok) {
      if (r.grantedCard) setReveal([r.grantedCard]);
      flash(`✅ ${ct('Objetivo concluído')}: ${o.def.name}${r.reward?.credits ? ` · +${fmt(r.reward.credits)} 🪙` : ''}`, 2400);
      syncTitles();
    }
  };

  // ── recompensas de temporada (ladder de RP) ──
  const seasonPeak = state.profile.season?.peak ?? state.profile.elo;
  const seasonClaimedIds = state.profile.season?.claimed ?? [];
  const seasonTiers = evaluateSeasonTiers(seasonPeak, seasonClaimedIds);
  const seasonClaimable = seasonTiers.filter((t) => t.reached && !t.claimed);
  const claimSeason = (t: (typeof seasonTiers)[number]) => {
    const r = claimSeasonReward(t.tier.id);
    if (r.ok) {
      if (r.grantedCard) setReveal([r.grantedCard]);
      flash(`🏆 ${ct('Recompensa de temporada')}: ${t.tier.name}${r.reward?.credits ? ` · +${fmt(r.reward.credits)} 🪙` : ''}`, 2400);
      syncTitles();
    }
  };

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

  const doEvolve = (row: ClubRow) => {
    // prefere evoluir a cópia escalada (fortalece o squad na hora); senão a 1ª.
    const id = row.ownedIds.find((oid) => ownedById.get(oid)?.locked === 'squad') ?? row.ownedIds[0];
    const r = evolveCard(id);
    if (r.ok) flash(`✦ ${ct('Carta evoluída')} → +${r.newBoost} · -${fmt(r.cost ?? 0)} 🪙`, 2200);
    else flash(r.reason === 'maxed' ? ct('Já no nível máximo.') : ct('Créditos insuficientes.'));
  };

  const playMatch = () => {
    if (!squadComplete) return;
    const five = squadPool as PoolPlayer[];
    const userTeam = buildOnlineTeam(ct('Seu Squad'), five, 'ut-user');
    userTeam.strength = userTeam.strength * chem.multiplier; // química influencia a força
    const totalBoost = form.slots.reduce((a, fs) => a + (slotCard(fs.slot)?.owned.boost ?? 0), 0);
    if (totalBoost > 0) userTeam.strength *= 1 + totalBoost * 0.01; // evolução: +1% de força por nível
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
      <div className="ut-root">
        <div className="ut-onboard__hero">
          <div className="ut-onboard__herobox">
            <div className="ut-onboard__lockup">
              <span className="ut-brand__logo" style={{ fontSize: '1.5rem' }}>ROAD TO <span className="ut-brand__slash">MAJOR</span></span>
              <span className="ut-brand__mode"><Sparkles size={13} /> ULTIMATE</span>
            </div>
            <div className="ut-onboard__kicker">{ct('Ultimate Squad')}</div>
            <h1 className="ut-onboard__title">{ct('Monte sua coleção')}</h1>
            <p className="ut-onboard__sub">{ct('Escolha um esquema inicial e receba 5 cartas dos jogadores reais de 2026. Depois abra pacotes, monte o time com química e suba no ranking.')}</p>
          </div>
        </div>
        <div className="ut-onboard__body">
          <UtPanel label={ct('Escolha seu esquema')} icon={<Shirt size={15} className="ut-panel__lead" />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
              {FORMATIONS.map((f) => (
                <button key={f.id} onClick={() => setOnbForm(f.id)} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${onbForm === f.id ? 'var(--ut-gold-2)' : 'var(--em-border)'}`, background: onbForm === f.id ? 'rgba(201,166,60,0.12)' : '#fff', boxShadow: onbForm === f.id ? '0 2px 10px rgba(201,166,60,0.18)' : 'none' }}>
                  <div style={{ fontWeight: 900, fontSize: '0.95rem', color: onbForm === f.id ? '#92600a' : 'var(--em-text)' }}>{f.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--em-muted)', marginTop: 3, lineHeight: 1.35 }}>{f.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button className="ut-jogar" style={{ padding: '12px 26px', fontSize: '1rem' }} onClick={() => { const cards = claimStarter(onbForm); setReveal([...cards].sort((a, b) => b.ovr - a.ovr)); }}><Gift size={17} /> {ct('Receber meu time inicial')}</button>
            </div>
          </UtPanel>
          <div style={{ textAlign: 'center' }}><button onClick={onBack} className="ut-btn ut-btn--ghost">← {ct('Voltar')}</button></div>
        </div>
      </div>
    );
  }

  // partida rolando: substitui a tela pelo replay round-a-round (reusa MatchReplay).
  if (live) {
    return (
      <div className="ut-root" style={{ maxWidth: 960, margin: '0 auto', padding: '14px 16px 40px' }}>
        <button onClick={finishMatch} style={backBtn}>← {ct('Encerrar')}</button>
        <div style={{ margin: '10px 0', textAlign: 'center', fontWeight: 800, fontSize: '0.8rem', color: 'var(--em-muted,#8a99ab)' }}>
          {live.teams[0].name} vs {live.teams[1].name}
        </div>
        <MatchReplay series={live.series} teams={live.teams} playbackSpeed={speed} canControlSpeed onPlaybackSpeedChange={setSpeed} onFinish={finishMatch} onClose={finishMatch} />
      </div>
    );
  }

  return (
    <div className="ut-root">
      <style>{`
        .ult-foil { background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 48%, rgba(255,255,255,0.05) 55%, transparent 70%); background-size: 250% 250%; animation: ult-shimmer 3.2s linear infinite; mix-blend-mode: screen; }
        @keyframes ult-shimmer { 0% { background-position: 120% 0; } 100% { background-position: -60% 0; } }
        .ult-reveal-card { animation: ult-pop .45s cubic-bezier(0.2,0.8,0.2,1) both; }
        @keyframes ult-pop { from { opacity:0; transform: translateY(14px) scale(.82) rotateY(35deg); } to { opacity:1; transform:none; } }
      `}</style>

      {/* ===== TOP NAV (full-width) ===== */}
      <nav className="ut-topbar">
        <div className="ut-topbar__inner">
          <div className="ut-brand">
            <span className="ut-brand__logo">ROAD TO <span className="ut-brand__slash">MAJOR</span></span>
            <span className="ut-brand__mode"><Sparkles size={13} /> ULTIMATE</span>
          </div>
          <div className="ut-nav">
            <button className={`ut-nav__item${tab === 'hub' ? ' is-active' : ''}`} onClick={() => go('hub')}><LayoutGrid size={16} /> {ct('Hub')}</button>
            <div className="ut-nav__group">
              <button className={`ut-nav__item${['club', 'squad', 'sbc'].includes(tab) ? ' is-active' : ''}`} onClick={(e) => { e.stopPropagation(); setNavMenu((m) => m === 'clube' ? null : 'clube'); }}><Users size={16} /> {ct('Meu Clube')} <ChevronDown size={14} /></button>
              {navMenu === 'clube' && (
                <div className="ut-menu" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => go('club')}><Layers size={16} /> {ct('Coleção')} <span className="ut-menu__count">{totalCards}</span></button>
                  <button onClick={() => go('squad')}><Shirt size={16} /> {ct('Squad')}</button>
                  <button onClick={() => go('sbc')}><FlaskConical size={16} /> {ct('Desafios')}</button>
                </div>
              )}
            </div>
            <div className="ut-nav__group">
              <button className={`ut-nav__item${['store', 'mercado'].includes(tab) ? ' is-active' : ''}`} onClick={(e) => { e.stopPropagation(); setNavMenu((m) => m === 'mercado' ? null : 'mercado'); }}><Store size={16} /> {ct('Mercado')} <ChevronDown size={14} /></button>
              {navMenu === 'mercado' && (
                <div className="ut-menu" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => go('store')}><Package size={16} /> {ct('Loja de pacotes')}</button>
                  <button onClick={() => go('mercado')}><ArrowLeftRight size={16} /> {ct('Transfer market')}</button>
                </div>
              )}
            </div>
            <button className={`ut-nav__item${tab === 'ranked' ? ' is-active' : ''}`} onClick={() => go('ranked')}><Swords size={16} /> {ct('Ranqueada')}</button>
            <button className={`ut-nav__item${tab === 'ranking' ? ' is-active' : ''}`} onClick={() => go('ranking')}><ListOrdered size={16} /> {ct('Ranking')}</button>
          </div>
          <span style={{ flex: 1 }} />
          <div className="ut-res">
            <span className="ut-res__chip ut-res__chip--coin"><Coins size={15} /> {fmtChip(credits)}</span>
            <span className="ut-res__chip"><Layers size={15} /> {totalCards}</span>
            <span className="ut-res__chip ut-res__chip--rp"><Trophy size={15} /> {state.profile.elo}</span>
          </div>
          <button className="ut-jogar" onClick={onJogar} title={squadComplete ? ct('Jogar ranqueada') : ct('Montar squad')}><Zap size={16} /> <span>{ct('JOGAR')}</span></button>
          <div className="ut-nav__group">
            <button className="ut-ham" onClick={(e) => { e.stopPropagation(); setNavMenu((m) => m === 'more' ? null : 'more'); }} title={ct('Menu')} aria-label={ct('Menu')}>
              <Menu size={18} />{daily.canClaim && <span className="dot" />}
            </button>
            {navMenu === 'more' && (
              <div className="ut-menu ut-ham__menu" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setDailyOpen(true); setNavMenu(null); }}><Gift size={16} /> {ct('Recompensa diária')}{daily.canClaim ? ' •' : ''}</button>
                <button onClick={() => { setTitlesOpen(true); setNavMenu(null); }}><Tag size={16} /> {ct('Títulos')}{equipped ? ` · ${equipped.label}` : ''}</button>
                <button onClick={() => { onBack(); setNavMenu(null); }}><ArrowLeft size={16} /> {ct('Voltar ao Road to Major')}</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ===== SEASON STRIP ===== */}
      {(() => {
        const s = state.profile.season;
        const ends = s ? new Date(s.endsAt).toLocaleDateString('pt-BR') : null;
        return (
          <div className="ut-season">
            <div className="ut-season__inner">
              <span className="ut-season__tag"><Zap size={12} /> {ct('TEMPORADA')}</span>
              <span className="ut-season__name">Season 1 — Inception</span>
              {ends && <span className="ut-season__meta">· {ct('Termina em')} {ends}</span>}
              <span className="ut-season__user">{ct('logado como')} <b>{displayName}</b></span>
            </div>
          </div>
        );
      })()}

      {/* ===== PAGE ===== */}
      <div className="ut-page">
        <header className="ut-greet">
          <div>
            <div className="ut-greet__kicker">ROAD TO MAJOR · {ct('HUB ONLINE')}</div>
            <h1 className="ut-greet__title">{ct('Olá')}, <span>{displayName}</span></h1>
          </div>
          <button className="ut-outbtn" onClick={() => go('ranking')}><ListOrdered size={15} /> {ct('Leaderboard global')}</button>
        </header>

      {tab === 'hub' && (
        <>
          {/* recompensa diária */}
          <section className="ut-daily">
            <div className="ut-daily__head">
              <span className="ut-daily__icon"><CalendarDays size={20} /></span>
              <div>
                <div className="ut-daily__kicker">{ct('DIÁRIO')}</div>
                <div className="ut-daily__title">{ct('Recompensa Diária')}</div>
              </div>
              <span style={{ flex: 1 }} />
              {daily.canClaim
                ? <button className="ut-btn ut-btn--gold" onClick={() => { const r = claimDaily(); if (r.claimed) flash(`${ct('Dia')} ${r.day} · +${fmt(r.credits)} 🪙`); }}>{ct('Resgatar dia')} {daily.day}</button>
                : <div className="ut-daily__next"><span>{ct('PRÓXIMA EM')}</span><b>{nextIn}</b></div>}
            </div>
            <div className="ut-daily__grid">
              {DAILY_TABLE.map((e, i) => {
                const done = daily.canClaim ? e.day < daily.day : e.day <= state.profile.daily.streakDay;
                const isCur = daily.canClaim && e.day === daily.day;
                const DayIcon = [Coins, Wallet, Gift, Star, Gem, Trophy, Crown][i] ?? Coins;
                return (
                  <div key={e.day} className={`ut-day${isCur ? ' is-current' : ''}${done ? ' is-done' : ''}`}>
                    <div className="ut-day__top"><span>D{e.day}</span>{done ? <Check size={13} strokeWidth={3} /> : <Lock size={12} />}</div>
                    <span className="ut-day__icon"><DayIcon size={24} strokeWidth={1.6} /></span>
                    <div className="ut-day__reward"><Coins size={13} /> {fmt(e.credits)}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* dashboard */}
          <div className="ut-grid">
            <UtPanel label={<>{ct('Match Day')} <em>· {ct('online')}</em></>} icon={<Swords size={15} className="ut-panel__lead" />} info={ct('Entre na fila ranqueada com seu squad ativo.')}>
              {squadComplete ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center', padding: '8px 0' }}>
                  <div className="ut-empty__accent">{ct('PRONTO PRA SUBIR NO RANKING?')}</div>
                  <div style={{ fontSize: '0.86rem', color: 'var(--ut-muted)' }}>{ct('Squad pronto. Entre na fila ranqueada.')}</div>
                  <button className="ut-btn ut-btn--gold" onClick={playMatch} style={{ width: '100%' }}><Zap size={15} /> {ct('JOGAR RANQUEADA')}</button>
                </div>
              ) : (
                <>
                  <UtEmpty accent={ct('PRONTO PRA SUBIR NO RANKING?')} icon={<AlertCircle size={30} />} title={ct('Você não tem squad ativo')} sub={ct('Monte e ative uma formação no Squad Builder pra entrar na fila.')} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="ut-btn ut-btn--gold" onClick={() => go('squad')} style={{ flex: 1 }}><Zap size={15} /> {ct('JOGAR RANQUEADA')}</button>
                    <button className="ut-btn ut-btn--ghost" onClick={() => go('squad')} style={{ flex: 1 }}>{ct('Montar squad')}</button>
                  </div>
                </>
              )}
            </UtPanel>

            <UtPanel label={ct('Rank Atual')} icon={<Medal size={15} className="ut-panel__lead" />} info={ct('Seu elo competitivo na temporada.')}>
              <div className="ut-rank">
                <div className="ut-rank__badge" style={{ color: inkOnLight(rank.color), borderColor: `${rank.color}44` }}><Medal size={26} /></div>
                <div>
                  <div className="ut-rank__name" style={{ color: inkOnLight(rank.color) }}>{rank.name}</div>
                  <div className="ut-rank__rp">{state.profile.elo} <span style={{ fontSize: '0.5em', color: 'var(--ut-muted)' }}>RP</span></div>
                  <div className="ut-rank__wl">{state.profile.w}V · {state.profile.l}D · Peak {state.profile.peakElo}</div>
                </div>
              </div>
              <div className="ut-rank__foot">{ct('pico da temporada')} · {state.profile.peakElo} RP</div>
            </UtPanel>

            <UtPanel label={ct('Economia')} icon={<Wallet size={15} className="ut-panel__lead" />} info={ct('Seus recursos no Ultimate.')}>
              <div className="ut-stats">
                <div><div className="ut-stat__k"><Coins size={12} /> {ct('COINS')}</div><div className="ut-stat__v coin">{fmt(credits)}</div></div>
                <div><div className="ut-stat__k"><Layers size={12} /> {ct('CARTAS')}</div><div className="ut-stat__v">{totalCards}</div></div>
                <div><div className="ut-stat__k"><Sparkles size={12} /> {ct('ÚNICAS')}</div><div className="ut-stat__v">{uniqueCards}</div></div>
              </div>
            </UtPanel>

            <UtPanel label={<>{ct('Histórico de ELO')} <em>· +0 {ct('no período')}</em></>} icon={<TrendingUp size={15} className="ut-panel__lead" />} info={ct('Evolução do seu RP na temporada.')}>
              {state.profile.w + state.profile.l > 0 ? (
                <div style={{ display: 'flex', gap: 22, alignItems: 'baseline', paddingTop: 4 }}>
                  <div><div className="ut-stat__k">{ct('ATUAL')}</div><div className="ut-stat__v">{state.profile.elo}</div></div>
                  <div><div className="ut-stat__k">{ct('PICO')}</div><div className="ut-stat__v">{state.profile.peakElo}</div></div>
                </div>
              ) : (
                <UtEmpty icon={<TrendingUp size={28} />} title={ct('Sem histórico ainda')} sub={ct('O histórico aparece após sua primeira ranqueada.')} />
              )}
            </UtPanel>

            <UtPanel label={<>{ct('Últimas Ranqueadas')} <em>· {state.profile.w}:{state.profile.l}</em></>} icon={<Swords size={15} className="ut-panel__lead" />} info={ct('Resultado das suas partidas recentes.')}>
              {state.profile.w + state.profile.l > 0 ? (
                <div style={{ fontSize: '0.88rem', color: 'var(--ut-muted)', paddingTop: 4 }}>
                  <b style={{ color: 'var(--ut-green)', fontFamily: 'var(--ut-font-mono)' }}>{state.profile.w}V</b> · <b style={{ color: 'var(--ut-red)', fontFamily: 'var(--ut-font-mono)' }}>{state.profile.l}D</b> · {ct('sequência')} <b style={{ color: 'var(--ut-ink)' }}>{state.profile.streak}</b>
                </div>
              ) : (
                <UtEmpty icon={<Swords size={28} />} title={ct('Sem partidas ainda')} sub={ct('Jogue a primeira ranqueada!')} />
              )}
            </UtPanel>

            <UtPanel label={<>{ct('Streak & Forma')}</>} icon={<Flame size={15} className="ut-panel__lead" />} accent="amber"
              right={state.profile.w + state.profile.l > 0 ? `${state.profile.w}W · ${state.profile.l}L · ${Math.round((state.profile.w / (state.profile.w + state.profile.l)) * 100)}%` : '0W · 0L'}
              info={ct('Sua sequência de vitórias.')}>
              {state.profile.w + state.profile.l > 0 ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--ut-font-mono)', fontWeight: 800, fontSize: '2rem', color: state.profile.streak > 0 ? 'var(--ut-green)' : 'var(--ut-ink)' }}>{state.profile.streak}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ut-muted)' }}>{ct('vitórias seguidas')}</span>
                </div>
              ) : (
                <UtEmpty icon={<Flame size={28} />} title={ct('Sem partidas ainda')} sub={ct('Jogue ranqueadas pra construir sua forma.')} />
              )}
            </UtPanel>
          </div>

          <UtPanel label={ct('Objetivos')} icon={<Target size={15} className="ut-panel__lead" />} accent="amber"
            right={objClaimable.length > 0 ? <span style={{ color: '#92600a' }}>{objClaimable.length} {ct('pra resgatar')}</span> : `${claimedSet.size}/${objectives.length}`}
            info={ct('Metas de coleção e competição. Complete pra ganhar credits e cartas.')}>
            <div className="ut-objs">
              {objSorted.map((o) => {
                const claimed = claimedSet.has(o.def.id);
                const claimable = o.done && !claimed;
                return (
                  <div key={o.def.id} className={`ut-obj${claimable ? ' is-claimable' : ''}${claimed ? ' is-claimed' : ''}`}>
                    <div className="ut-obj__name">{o.def.name}</div>
                    <div className="ut-obj__desc">{o.def.desc}</div>
                    <div className="ut-obj__bar"><div className={o.done ? 'done' : ''} style={{ width: `${o.pct}%` }} /></div>
                    <div className="ut-obj__foot">
                      <span className="ut-obj__reward"><Coins size={12} /> {fmt(o.def.reward.credits ?? 0)}{o.def.reward.card ? ` +${rarityInfo(o.def.reward.card).label}` : ''}</span>
                      {claimed ? <span className="ut-obj__done"><Check size={12} strokeWidth={3} /> {ct('resgatado')}</span>
                        : claimable ? <button className="ut-obj__claim" onClick={() => claimObj(o)}>{ct('Resgatar')}</button>
                        : <span className="ut-obj__count">{o.value}/{o.def.target}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </UtPanel>

          <UtPanel label={ct('Recompensas da Temporada')} icon={<Trophy size={15} className="ut-panel__lead" />} accent="green"
            right={seasonClaimable.length > 0 ? <span style={{ color: 'var(--ut-green-deep)' }}>{seasonClaimable.length} {ct('pra resgatar')}</span> : `${ct('pico')} ${seasonPeak} RP`}
            info={ct('Alcance faixas de RP na temporada pra liberar prêmios. Reseta a cada temporada.')}>
            <div className="ut-ladder">
              {seasonTiers.map((t) => {
                const claimable = t.reached && !t.claimed;
                return (
                  <div key={t.tier.id} className={`ut-tier${t.reached ? ' reached' : ''}${t.claimed ? ' claimed' : ''}${claimable ? ' claimable' : ''}`}>
                    <div className="ut-tier__rp">{t.tier.rp} <span>RP</span></div>
                    <div className="ut-tier__name">{t.tier.name}</div>
                    <div className="ut-tier__reward"><Coins size={12} /> {fmt(t.tier.reward.credits ?? 0)}{t.tier.reward.card ? ` +${rarityInfo(t.tier.reward.card).label}` : ''}</div>
                    {t.claimed ? <span className="ut-tier__done"><Check size={12} strokeWidth={3} /> {ct('resgatado')}</span>
                      : claimable ? <button className="ut-obj__claim" onClick={() => claimSeason(t)}>{ct('Resgatar')}</button>
                      : <span className="ut-tier__lock"><Lock size={11} /> {seasonPeak}/{t.tier.rp}</span>}
                  </div>
                );
              })}
            </div>
          </UtPanel>

          {squadComplete && (
            <UtPanel label={ct('Squad Ativo')} icon={<Shirt size={15} className="ut-panel__lead" />} accent="green"
              right={<><span>{ct('OVR')} <b style={{ color: 'var(--ut-ink)' }}>{avgOvr}</b></span> · <span>{ct('química')} <b style={{ color: inkOnLight(cl.color) }}>{chem.total}/15</b></span> · <button className="ut-btn ut-btn--ghost" style={{ padding: '5px 12px', fontSize: '0.76rem' }} onClick={() => go('squad')}>{ct('Editar')}</button></>}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', paddingTop: 4 }}>
                {form.slots.map((fs) => { const sc = slotCard(fs.slot); return sc ? <UltCardView key={fs.slot} card={sc.card} size={100} /> : null; })}
              </div>
            </UtPanel>
          )}
        </>
      )}

      {tab === 'mercado' && (
        <UtPanel label={ct('Transfer market')} icon={<ArrowLeftRight size={15} className="ut-panel__lead" />} info={ct('Cartas à venda por outros jogadores (IA). Renova todo dia.')}>
          <p className="muted small" style={{ marginTop: -2, marginBottom: 10 }}>{ct('Cartas à venda por outros jogadores (IA). O mercado renova todo dia. Compre com credits.')}</p>
          {bazaar.length === 0 ? <p className="muted small">{ct('Sem listagens agora.')}</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, justifyItems: 'center' }}>
              {bazaar.map((l) => {
                const c = index.get(l.cardKey);
                if (!c) return null;
                const afford = credits >= l.price;
                return (
                  <div key={l.id} className="ut-mkt">
                    <UltCardView card={c} size={124} />
                    <div className="ut-mkt__seller">{ct('por')} {l.sellerNick}</div>
                    <button className="ut-mkt__buy" onClick={() => buyFromBazaar(l)} disabled={!afford}><Coins size={12} /> {fmt(l.price)}</button>
                  </div>
                );
              })}
            </div>
          )}
        </UtPanel>
      )}

      {tab === 'ranking' && (
        <UtPanel label={ct('Ranking global')} icon={<ListOrdered size={15} className="ut-panel__lead" />} accent="green">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: '0.8rem', color: 'var(--em-muted,#8a99ab)' }}>
            <span>{ct('Jogadores')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{rankedList.length}</b></span>
            <span>{ct('Sua posição')}: <b style={{ color: '#92600a' }}>#{myRankPos}</b></span>
            <span>{ct('Líder')}: <b style={{ color: 'var(--em-text,#e6edf5)' }}>{rankedList[0]?.nick}</b> ({rankedList[0]?.elo} RP)</span>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14, alignItems: 'flex-end' }}>
            {[1, 0, 2].map((idx) => {
              const p = rankedList[idx];
              if (!p) return null;
              const MedalIcon = idx === 0 ? Crown : Medal;
              const medalColor = idx === 0 ? '#caa53a' : idx === 1 ? '#9aa3ad' : '#cd7f32';
              return (
                <div key={idx} style={{ textAlign: 'center', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--em-border,#2a3340)', background: idx === 0 ? 'rgba(232,193,112,0.1)' : 'var(--em-panel,#0f131a)', minWidth: 108, transform: idx === 0 ? 'scale(1.06)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}><MedalIcon size={24} color={medalColor} /></div>
                  <PlayerAvatar nick={p.nick} size={40} />
                  <div style={{ fontWeight: 900, fontSize: '0.82rem', marginTop: 4 }}>{p.nick}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--em-muted,#8a99ab)', fontFamily: '"JetBrains Mono", monospace' }}>{p.elo} RP</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {rankedList.slice(0, 30).map((p, i) => (
              <div key={p.id} className={`ut-rank-row${p.id === 'you' ? ' is-you' : ''}`}>
                <span className="ut-rank-row__pos">#{i + 1}</span>
                <Flag cc={p.country} /> <b className="ut-rank-row__name">{p.nick}</b>
                <span className="ut-rank-row__wl">{p.w}V-{p.l}D</span>
                <span className="ut-rank-row__elo">{p.elo}</span>
              </div>
            ))}
            {myRankPos > 30 && (
              <div className="ut-rank-row is-you" style={{ marginTop: 6 }}>
                <span className="ut-rank-row__pos">#{myRankPos}</span>
                <Flag cc="br" /> <b className="ut-rank-row__name">{ct('Você')}</b>
                <span className="ut-rank-row__wl">{state.profile.w}V-{state.profile.l}D</span>
                <span className="ut-rank-row__elo">{state.profile.elo}</span>
              </div>
            )}
          </div>
        </UtPanel>
      )}

      {tab === 'store' && (
        <UtPanel label={ct('Loja de pacotes')} icon={<Package size={15} className="ut-panel__lead" />} accent="amber">
          <p className="muted small" style={{ marginTop: -2, marginBottom: 10 }}>
            {ct('Abra pacotes, monte sua coleção dos jogadores reais de 2026. Venda duplicatas por créditos e junte pros pacotes melhores.')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
            {PACK_DEFS.map((pack) => {
              const afford = credits >= pack.cost;
              return (
                <div key={pack.id} className="ut-pack" style={{ background: `linear-gradient(155deg, ${pack.color} 0%, ${pack.color}dd 55%, ${pack.color}aa 100%)` }}>
                  <div className="ut-pack__shine" />
                  <div className="ut-pack__art"><Package size={44} strokeWidth={1.4} /></div>
                  <div className="ut-pack__name">{pack.name}</div>
                  <div className="ut-pack__desc">{pack.desc}</div>
                  <button className="ut-pack__buy" onClick={() => buy(pack)} disabled={!afford} title={afford ? ct('Abrir pacote') : ct('Créditos insuficientes.')}>
                    {afford ? <Coins size={15} /> : <Lock size={14} />} {fmt(pack.cost)}
                  </button>
                </div>
              );
            })}
          </div>
        </UtPanel>
      )}

      {tab === 'club' && (
        <UtPanel
          label={ct('Coleção')}
          icon={<Layers size={15} className="ut-panel__lead" />}
          right={dupCount > 0 ? <button className="ut-btn ut-btn--ghost" style={{ padding: '5px 12px', fontSize: '0.76rem' }} onClick={sellAllDuplicates}>{ct('Vender duplicatas')} ({dupCount})</button> : undefined}
        >
          {uniqueCards === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0' }}>
              <UtEmpty icon={<Layers size={30} />} title={ct('Coleção vazia')} sub={ct('Abra um pacote na Loja pra começar a colecionar os jogadores reais de 2026.')} />
              <button className="ut-btn ut-btn--gold" onClick={() => go('store')}><Package size={15} /> {ct('Ir à Loja')}</button>
            </div>
          ) : (() => {
            const buckets: Record<string, number> = { all: club.length, bronze: 0, silver: 0, gold: 0, special: 0 };
            for (const r of club) { const b = rarityInfo(r.card.rarity).bucket; buckets[b] = (buckets[b] ?? 0) + 1; }
            const filtered = clubFilter === 'all' ? club : club.filter((r) => rarityInfo(r.card.rarity).bucket === clubFilter);
            return (
              <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div className="ut-cstat"><div className="ut-cstat__k"><Layers size={12} /> {ct('CARTAS')}</div><div className="ut-cstat__v">{totalCards}</div></div>
                  <div className="ut-cstat"><div className="ut-cstat__k"><Sparkles size={12} /> {ct('ÚNICAS')}</div><div className="ut-cstat__v">{uniqueCards}</div></div>
                  <div className="ut-cstat"><div className="ut-cstat__k"><Coins size={12} /> {ct('DUPLICATAS')}</div><div className="ut-cstat__v" style={dupCount > 0 ? { color: '#92600a' } : undefined}>{dupCount}</div></div>
                </div>
                <div className="ut-tabs" style={{ marginBottom: 12 }}>
                  {([['all', ct('Todas')], ['bronze', ct('Bronze')], ['silver', ct('Prata')], ['gold', ct('Ouro')], ['special', ct('Especiais')]] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setClubFilter(id)} style={{ ...tabBtn(clubFilter === id), padding: '6px 13px', fontSize: '0.78rem' }}>{label} <span style={{ opacity: 0.65 }}>({buckets[id] ?? 0})</span></button>
                  ))}
                </div>
                {filtered.length === 0 ? (
                  <p className="muted small" style={{ textAlign: 'center', padding: '10px 0' }}>{ct('Nenhuma carta nesse filtro.')}</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, justifyItems: 'center' }}>
                    {filtered.map((row) => {
                      const canEvo = row.evo < EVO_MAX;
                      const evoCost = canEvo ? EVO_COSTS[row.evo] : 0;
                      return (
                        <div key={`${row.card.key}#${row.evo}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <UltCardView card={row.card} count={row.count} size={140} qs={quickSellValue(row.card.rarity, row.card.ovr, row.count > 1)} evo={row.evo} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => sellOne(row)} style={sellBtn} title={ct('Quick-sell')}>
                              {row.count > 1 ? ct('vender dup') : ct('vender')} <Coins size={11} style={{ verticalAlign: '-1px' }} />
                            </button>
                            {canEvo && (
                              <button onClick={() => doEvolve(row)} disabled={credits < evoCost} title={`${ct('Evoluir')} → +${row.evo + 1} OVR`}
                                style={{ ...sellBtn, display: 'inline-flex', alignItems: 'center', gap: 3, borderColor: credits >= evoCost ? 'rgba(34,197,94,0.5)' : 'var(--em-border,#2a3340)', color: credits >= evoCost ? '#16a34a' : 'var(--em-muted,#8a99ab)', cursor: credits >= evoCost ? 'pointer' : 'default' }}>
                                ✦ {fmtChip(evoCost)}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </UtPanel>
      )}

      {tab === 'squad' && (
        <UtPanel label={ct('Montar squad')} icon={<Shirt size={15} className="ut-panel__lead" />} accent="green">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {FORMATIONS.map((f) => (
              <button key={f.id} onClick={() => setFormation(f.id)} title={f.desc} style={tabBtn(form.id === f.id)}>{f.name}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', fontSize: '0.82rem' }}>
            <span>{ct('Química')}: <b style={{ color: inkOnLight(cl.color), fontFamily: '"JetBrains Mono", monospace' }}>{chem.total}/15</b> <span style={{ color: inkOnLight(cl.color), fontWeight: 800 }}>{cl.label}</span></span>
            <span>{ct('Multiplicador')}: <b style={{ fontFamily: '"JetBrains Mono", monospace', color: chem.multiplier >= 1 ? '#16a34a' : '#dc2626' }}>{chem.multiplier.toFixed(2)}×</b></span>
            <span>{ct('OVR médio')}: <b style={{ fontFamily: '"JetBrains Mono", monospace' }}>{avgOvr || '—'}</b></span>
          </div>
          <div style={{ position: 'relative', width: '100%', maxWidth: 520, margin: '0 auto', aspectRatio: '4 / 5', background: 'radial-gradient(ellipse at 50% 32%, rgba(201,166,60,0.14), transparent 58%), linear-gradient(180deg, #1c2029 0%, #14161c 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, boxShadow: 'inset 0 0 44px rgba(0,0,0,0.35)' }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {chem.edges.map((e, i) => {
                const a = form.slots[e.a], b = form.slots[e.b];
                const stroke = e.score >= 1.5 ? '#22c55e' : e.score >= 0.5 ? '#ecc75f' : e.score > 0 ? '#f04438' : 'rgba(255,255,255,0.09)';
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
                      <Plus size={22} strokeWidth={2.4} />
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
        </UtPanel>
      )}

      {tab === 'ranked' && (
        <UtPanel label={<>{ct('Ranqueada')} <em>· vs IA</em></>} icon={<Swords size={15} className="ut-panel__lead" />}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="ut-rank">
              <div className="ut-rank__badge" style={{ color: inkOnLight(rank.color), borderColor: `${rank.color}44` }}><Medal size={28} /></div>
              <div>
                <div className="ut-rank__name" style={{ color: inkOnLight(rank.color) }}>{rank.name}</div>
                <div className="ut-rank__rp">{state.profile.elo} <span style={{ fontSize: '0.5em', color: 'var(--ut-muted)' }}>RP</span></div>
                <div className="ut-rank__wl">{state.profile.w}V · {state.profile.l}D · {ct('pico')} {state.profile.peakElo}</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 210, display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.84rem', color: 'var(--ut-ink-2)' }}>
              <div>{ct('Vitórias')} <b style={{ color: '#16a34a', fontFamily: 'var(--ut-font-mono)' }}>{state.profile.w}</b> · {ct('Derrotas')} <b style={{ color: '#dc2626', fontFamily: 'var(--ut-font-mono)' }}>{state.profile.l}</b> · {ct('sequência')} <b>{state.profile.streak}</b></div>
              <div>{ct('Seu squad')} <b>{avgOvr || '—'} OVR</b> · {ct('química')} <b style={{ color: inkOnLight(cl.color) }}>{chem.total}/15</b> <span style={{ color: 'var(--ut-muted)' }}>({chem.multiplier.toFixed(2)}×)</span></div>
              {!squadComplete && <div style={{ color: 'var(--ut-muted)', fontSize: '0.8rem' }}>{ct('Complete os 5 slots do seu squad (aba Squad) pra entrar na fila.')}</div>}
            </div>
          </div>
          {squadComplete && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 }}>
              {form.slots.map((fs) => { const sc = slotCard(fs.slot); return sc ? <UltCardView key={fs.slot} card={sc.card} size={74} evo={sc.owned.boost ?? 0} /> : null; })}
            </div>
          )}
          <button className="ut-jogar" style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: '13px' }} onClick={playMatch} disabled={!squadComplete}><Zap size={17} /> {ct('ENTRAR NA FILA')}</button>
        </UtPanel>
      )}

      {/* resultado da partida */}
      {result && (
        <Modal open onClose={() => setResult(null)} title={result.won ? ct('Vitória!') : ct('Derrota')} size="sm"
          footer={<><Button variant="ghost" onClick={() => setResult(null)}>{ct('Fechar')}</Button><Button variant="primary" onClick={() => { setResult(null); playMatch(); }} disabled={!squadComplete}>{ct('Jogar de novo')}</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ fontSize: '2rem', fontWeight: 900, fontFamily: '"JetBrains Mono", monospace', color: result.won ? '#16a34a' : '#dc2626' }}>{result.score}</div>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.9rem', fontWeight: 800 }}>
              <span style={{ color: result.outcome.eloDelta >= 0 ? '#16a34a' : '#dc2626' }}>{result.outcome.eloDelta >= 0 ? '▲ +' : '▼ '}{result.outcome.eloDelta} RP</span>
              {result.outcome.credits > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#92600a' }}><Coins size={13} /> +{fmt(result.outcome.credits)}</span>}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--em-muted,#8a99ab)' }}>{rank.name} · {state.profile.elo} RP</span>
          </div>
        </Modal>
      )}

      {/* seletor de carta pro slot */}
      {pickSlot != null && (() => {
        const slotRole = form.slots[pickSlot].role;
        const cands = state.inventory
          .map((o) => { const b = index.get(o.cardKey); return { o, card: b ? boostCard(b, o.boost) : undefined }; })
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
                      <UltCardView card={card} size={116} evo={o.boost ?? 0} />
                      {!fits && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 8, background: 'rgba(229,138,138,0.85)', color: '#fff' }}>{ct('fora')}</span>}
                      {o.locked === 'squad' && <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#9fd6ff' }}>{ct('escalado')}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Modal>
        );
      })()}

      {tab === 'sbc' && (
        <UtPanel label={ct('Desafios (SBC)')} icon={<FlaskConical size={15} className="ut-panel__lead" />} accent="purple">
          <p className="muted small" style={{ marginTop: -2, marginBottom: 10 }}>
            {ct('Monte times que cumpram os requisitos e troque cartas (inclusive duplicatas) por recompensas. As cartas usadas são consumidas.')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
            {SBCS.map((s) => {
              const done = state.profile.sbcDone.includes(s.id);
              return (
                <div key={s.id} className="ut-sbc">
                  <div className="ut-sbc__head">
                    <span className="ut-sbc__name">{s.name}</span>
                    {done && <span className="ut-sbc__done" title={ct('já concluído (repetível)')}><Check size={12} strokeWidth={3} /></span>}
                  </div>
                  <div className="ut-sbc__desc">{s.desc}</div>
                  <div className="ut-sbc__reward">
                    <span style={{ color: 'var(--ut-muted)', fontWeight: 700 }}>{ct('Recompensa')}:</span>
                    {s.reward.credits ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#92600a', fontFamily: 'var(--ut-font-mono)', fontWeight: 800 }}><Coins size={12} /> {fmt(s.reward.credits)}</span> : null}
                    {s.reward.card ? <span style={{ color: inkOnLight(rarityInfo(s.reward.card).color), fontWeight: 800 }}>{ct('carta')} {rarityInfo(s.reward.card).label}</span> : null}
                  </div>
                  <button className="ut-btn ut-btn--ghost" style={{ width: '100%' }} onClick={() => { setSbcDef(s); setSbcSel([]); }}>{ct('Fazer desafio')}</button>
                </div>
              );
            })}
          </div>
        </UtPanel>
      )}

      {/* submeter SBC */}
      {sbcDef && (() => {
        const sel = sbcSel.map((id) => { const o = state.inventory.find((x) => x.id === id); return o ? index.get(o.cardKey) : undefined; }).filter((c): c is UltCard => !!c);
        const chk = checkSbc(sel, sbcDef.req);
        const eligible = state.inventory.filter((o) => o.locked !== 'squad').map((o) => ({ o, card: index.get(o.cardKey) })).filter((x): x is { o: OwnedCard; card: UltCard } => !!x.card).sort((a, b) => b.card.ovr - a.card.ovr);
        const toggle = (id: string) => setSbcSel((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : (cur.length < sbcDef.req.count ? [...cur, id] : cur));
        const submit = () => { const r = submitSbc(sbcDef.id, sbcSel); if (r.ok) { setSbcDef(null); setSbcSel([]); if (r.grantedCard) setReveal([r.grantedCard]); flash(`✅ ${ct('Desafio concluído!')}${r.reward?.credits ? ` +${fmt(r.reward.credits)} 🪙` : ''}`); } else { flash(ct('Requisitos não cumpridos.')); } };
        return (
          <Modal open onClose={() => { setSbcDef(null); setSbcSel([]); }} title={sbcDef.name} size="lg"
            footer={<Button variant="primary" disabled={!chk.ok} onClick={submit}>{ct('Enviar')} ({sbcSel.length}/{sbcDef.req.count})</Button>}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {chk.items.map((it, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: it.ok ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.08)', border: `1px solid ${it.ok ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.4)'}`, color: it.ok ? '#0e9d5b' : '#b42318' }}>{it.ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />} {it.label}</span>
              ))}
            </div>
            {eligible.length === 0 ? (
              <p className="muted small">{ct('Sem cartas livres. Abra pacotes ou tire cartas do squad.')}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(108px,1fr))', gap: 8, maxHeight: 420, overflowY: 'auto', justifyItems: 'center' }}>
                {eligible.map(({ o, card }) => {
                  const on = sbcSel.includes(o.id);
                  return (
                    <button key={o.id} onClick={() => toggle(o.id)} style={{ position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, outline: on ? '2px solid #16a34a' : 'none', borderRadius: 10, opacity: on || sbcSel.length < sbcDef.req.count ? 1 : 0.5 }}>
                      <UltCardView card={card} size={104} />
                      {on && <span style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={11} strokeWidth={3} /></span>}
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
        <Modal open onClose={() => setSeasonRoll(null)} title={ct('Nova temporada!')} size="sm"
          footer={<Button variant="primary" onClick={() => setSeasonRoll(null)}>{ct('Continuar')}</Button>}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 0' }}>
            <p className="muted small" style={{ margin: 0 }}>{ct('A temporada virou. Seu RP foi suavizado pra manter a disputa acirrada e você levou um bônus de fim de temporada.')}</p>
            <div style={{ fontSize: '0.95rem', fontWeight: 900 }}>{ct('Novo RP')}: <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{seasonRoll.newElo}</span></div>
            {seasonRoll.credits > 0 && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#92600a', fontWeight: 900 }}><Coins size={15} /> +{fmt(seasonRoll.credits)}</div>}
          </div>
        </Modal>
      )}

      {/* recompensa diária */}
      {dailyOpen && (
        <Modal open onClose={() => setDailyOpen(false)} title={ct('Recompensa diária')} size="md"
          footer={<Button variant="primary" disabled={!daily.canClaim} onClick={() => { const r = claimDaily(); if (r.claimed) flash(`${ct('Dia')} ${r.day} · +${fmt(r.credits)} 🪙`); setDailyOpen(false); }}>{daily.canClaim ? `${ct('Resgatar dia')} ${daily.day}` : ct('Volte amanhã')}</Button>}>
          <p className="muted small" style={{ marginTop: -2, marginBottom: 12 }}>{ct('Volte todo dia pra manter a sequência. Faltar um dia reseta pro dia 1.')}</p>
          <div className="ut-daily__grid" style={{ padding: 0 }}>
            {DAILY_TABLE.map((e, i) => {
              const done = daily.canClaim ? e.day < daily.day : e.day <= state.profile.daily.streakDay;
              const isCur = daily.canClaim && e.day === daily.day;
              const DayIcon = [Coins, Wallet, Gift, Star, Gem, Trophy, Crown][i] ?? Coins;
              return (
                <div key={e.day} className={`ut-day${isCur ? ' is-current' : ''}${done ? ' is-done' : ''}`}>
                  <div className="ut-day__top"><span>D{e.day}</span>{done ? <Check size={13} strokeWidth={3} /> : <Lock size={12} />}</div>
                  <span className="ut-day__icon"><DayIcon size={22} strokeWidth={1.6} /></span>
                  <div className="ut-day__reward"><Coins size={12} /> {fmt(e.credits)}</div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* títulos */}
      {titlesOpen && (
        <Modal open onClose={() => setTitlesOpen(false)} title={ct('Títulos')} size="md">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TITLES.map((t) => {
              const owned = state.profile.titles.includes(t.slug);
              const isEq = state.profile.equippedTitle === t.slug;
              return (
                <div key={t.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${owned ? `${t.color}55` : 'var(--em-border,#2a3340)'}`, background: owned ? `${t.color}10` : 'transparent', opacity: owned ? 1 : 0.55 }}>
                  <span style={{ fontWeight: 900, color: owned ? inkOnLight(t.color) : 'var(--em-muted,#8a99ab)', fontSize: '0.88rem', minWidth: 150 }}>{t.label}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--em-muted,#8a99ab)', flex: 1 }}>{t.desc}</span>
                  {owned ? (isEq
                    ? <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '3px 11px', borderRadius: 999, background: 'rgba(201,166,60,0.16)', border: '1px solid rgba(201,166,60,0.4)', color: '#92600a' }}>{ct('equipado')}</span>
                    : <button onClick={() => equipTitle(t.slug)} className="ut-btn ut-btn--ghost" style={{ padding: '4px 12px', fontSize: '0.72rem' }}>{ct('equipar')}</button>)
                    : <Lock size={13} style={{ color: 'var(--ut-muted)' }} />}
                </div>
              );
            })}
            {state.profile.equippedTitle && <button onClick={() => equipTitle(null)} className="ut-btn ut-btn--ghost" style={{ alignSelf: 'flex-start', padding: '5px 13px', fontSize: '0.74rem' }}>{ct('desequipar')}</button>}
          </div>
        </Modal>
      )}

      {/* reveal do pack — walkout carta a carta (pior→melhor), clímax na última */}
      {reveal && (() => {
        const wo = [...reveal].sort((a, b) => a.ovr - b.ovr); // melhor por último
        const inWalkout = revealIdx < wo.length;
        const c = wo[Math.min(revealIdx, wo.length - 1)];
        const info = rarityInfo(c.rarity);
        const special = DARK_TIERS.has(c.rarity) || FOIL_RARITIES.has(c.rarity);
        const isBest = revealIdx === wo.length - 1;
        return (
          <Modal open onClose={() => setReveal(null)} title={ct('Pacote aberto')} size="lg"
            footer={inWalkout
              ? <><Button variant="ghost" onClick={() => setRevealIdx(wo.length)}>{ct('Pular')}</Button><Button variant="primary" onClick={() => setRevealIdx((i) => i + 1)}>{isBest ? ct('Concluir') : `${ct('Próxima')} (${revealIdx + 1}/${wo.length})`}</Button></>
              : <Button variant="primary" onClick={() => { setReveal(null); setTab('club'); }}>{ct('Ver coleção')}</Button>}>
            {inWalkout ? (
              <div className="ult-wo" style={{ '--wo': info.color } as CSSProperties} onClick={() => setRevealIdx((i) => i + 1)}>
                <div className="ult-wo__flash" key={`f${revealIdx}`} />
                {special && <div className="ult-wo__rays" />}
                <div className="ult-wo__label">{isBest ? `★ ${ct('MELHOR DO PACOTE')} ★` : `${ct('carta')} ${revealIdx + 1}/${wo.length}`}</div>
                <div className="ult-wo__card" key={`c${revealIdx}`}><UltCardView card={c} size={190} /></div>
                <div className="ult-wo__rarity" style={{ color: info.color }}>{info.label}</div>
                <div className="ult-wo__hint">{ct('toque para continuar')}</div>
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 10, fontFamily: 'var(--ut-font-cond)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '1.6px', textTransform: 'uppercase', color: '#92600a' }}>
                  {reveal.length} {reveal.length === 1 ? ct('carta') : ct('cartas')} · {ct('melhor')} {Math.max(...reveal.map((x) => x.ovr))} OVR
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', padding: '6px 0' }}>
                  {wo.slice().reverse().map((x, i) => (
                    <div key={`${x.key}-${i}`} className="ult-reveal-card" style={{ animationDelay: `${i * 70}ms` }}>
                      <UltCardView card={x} size={132} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </Modal>
        );
      })()}

      {toast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '10px 20px', borderRadius: 10, background: '#1f2430', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', fontWeight: 700, fontSize: '0.84rem', boxShadow: '0 10px 30px rgba(16,24,40,0.3)' }}>
          {toast}
        </div>
      )}
      </div>{/* /.ut-page */}
    </div>
  );
}

const backBtn: CSSProperties = { padding: '7px 13px', background: 'var(--em-panel-2,#12161e)', color: 'var(--em-text,#e6edf5)', border: '1px solid var(--em-border,#2a3340)', borderRadius: 6, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' };
const sellBtn: CSSProperties = { padding: '4px 10px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', borderRadius: 5, border: '1px solid var(--em-border,#2a3340)', background: 'transparent', color: 'var(--em-muted,#8a99ab)', fontFamily: 'inherit' };
const emptySlot: CSSProperties = { width: 78, height: 94, borderRadius: 10, border: '1.5px dashed rgba(236,199,95,0.45)', background: 'rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: 'rgba(255,255,255,0.65)', fontFamily: 'inherit' };
const tabBtn = (on: boolean): CSSProperties => ({ padding: '8px 16px', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', borderRadius: 999, border: `1px solid ${on ? '#c9a63c' : 'var(--em-border,#2a3340)'}`, background: on ? 'linear-gradient(180deg,#ecc75f,#c9a63c)' : 'var(--em-panel,#fff)', color: on ? '#241a06' : 'var(--em-text,#e6edf5)', fontFamily: 'inherit', boxShadow: on ? '0 2px 10px rgba(201,166,60,0.32)' : 'var(--ut-shadow-sm, none)', transition: 'all .15s' });
