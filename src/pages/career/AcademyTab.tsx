// AcademyTab — refatorada (out-of-the-box funcional) no padrão em-*.
//
// O que mudou em relação à versão anterior:
//   - Header banner gold padrão (igual Mercado/OrgSelect)
//   - Liga Academy com `AcademyBadge` real (logo do TIME PAI + "ACADEMY" embaixo,
//     ex.: NAVIJ → logo da NAVI + "Academy")
//   - Matches da Liga JOGÁVEIS: botão "Jogar agora" no primeiro match não-jogado
//     do split — simula com RNG vivo (não-determinístico) e mostra o resultado.
//   - Players do squad academy CLICÁVEIS → abre modal de perfil
//   - Prospects da Academia CLICÁVEIS → abre modal de perfil
//   - Sistema de OFERTAS pra prospects (org maior interessada): determinístico
//     por seed (split + prospectId), 35% chance pra prospect com OVR >= 72.
//     Aceitar adiciona caixa + remove prospect. Recusar mantém na Academia.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DashCard } from '../../components/ds';
import { CareerIcon } from '../../components/career/CareerIcon';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from '../../components/ui';
import { AcademyBadge } from '../../components/AcademyBadge';
import {
  ACADEMY_MAX,
  ACADEMY_SCOUT_COST,
  REGION_CC,
  makeProspect,
  buildUserAcademyTeam,
  type AcademyEntry,
} from '../../components/CareerScreen';
import {
  academyLeague,
  academyParentLogoUrl,
  ACADEMY_CLUBS,
  type AcademyMatch,
} from '../../engine/career/academyLeague';
import {
  buildAcademyUserTeam,
  buildAcademyOpponentTeam,
  seriesToAcademyScore,
  buildAcademyPlayoff,
  autoPlayoffResult,
  applyOverridesToStandings,
  academyPrize,
  type AcademyPlayoffSeed,
  type AcademyPlayoffMatch,
  type AcademyPlayoffState,
} from '../../engine/career/academyMatch';
import { VetoScreen } from '../../components/VetoScreen';
import { MatchScreen } from '../../components/MatchScreen';
import { makeRng } from '../../engine/rng';
import { hashStr } from '../../state/hash';
import { ct } from '../../state/career-i18n';
import { formatMoney, playerOvr } from '../../engine/ratings';
import { macroRegionOf, type MacroRegion } from '../../data/regions';
import type { Signing } from '../../components/CareerScreen';
import type { MapId, Player, SeriesResult, TTeam } from '../../types';

interface ResolvedSigning {
  player: { id: string; nick: string; country: string };
}

interface AskConfirmFn {
  (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
  }): void;
}

interface AcademyTabSave {
  academy?: AcademyEntry[];
  academyTeam?: AcademyEntry[];
  academyFocus?: string | null;
  squad: Signing[];
  region?: MacroRegion;
  org?: { name?: string; tag?: string; colors?: [string, string]; logo?: string } | null;
  budget: number;
  split: number;
  facilities?: Record<string, number>;
  /** Resultados jogados pelo user (vetando ou RNG vivo). Chave: `${split}:${oppId}`. */
  academyPlayed?: Record<string, [number, number]>;
  /** Total de títulos do campeonato Academy ao longo da carreira. */
  academyTrophies?: number;
  /** Splits cujo fechamento já pagou prize money (evita double-pay). */
  academyPaidSplits?: number[];
  /** Estado do playoff Academy do split atual (top 4 mata-mata). */
  academyPlayoff?: AcademyPlayoffState | null;
  /** Prospects promovidos da academia, indexados por id (Vitalícia: rename propaga aqui). */
  youth?: Record<string, Player>;
}

interface Props {
  save: AcademyTabSave;
  update: (patch: Record<string, unknown>) => void;
  promoting: string | null;
  setPromoting: (id: string | null) => void;
  promoteProspect: (prospectId: string, replaceOid?: string) => void;
  /** Promove um prospect da academia (250k) pro TIME ACADEMY (5 jovens que jogam Liga Academy). */
  promoteToAcaTeam: (prospectId: string, replaceAcaId?: string) => void;
  /** Dispensa um jogador do time academy (libera o slot). */
  releaseAcaTeamPlayer: (acaId: string) => void;
  /** Promove um jogador do time academy direto pro elenco principal. */
  promoteAcaTeamToSquad: (acaId: string, replaceOid?: string) => void;
  findSigning: (s: Signing) => ResolvedSigning | null;
  askConfirm: AskConfirmFn;
  /** Abre o modal de perfil do player (mesmo handler do SquadTab). */
  openPlayerProfile: (p: Player) => void;
  /** Vitalícia: pode renomear o nick de prospects da academia e jogadores do time academy. */
  isPaid: boolean;
}

// ─── Ofertas determinísticas pra prospects da academia ───────────────────────
// Org interessada por prospect com OVR ≥ 72 — 35% de chance por split, seed
// estável (prospectId + split). Aceitar = caixa + remove; recusar = ignora
// até o próximo split (seed muda).
const INTERESTED_ORGS = [
  { tag: 'AST',  name: 'Astralis',        colors: ['#0a0a0a', '#fb0a0a'] as [string, string] },
  { tag: 'VIT',  name: 'Team Vitality',   colors: ['#0a0a0a', '#fffd00'] as [string, string] },
  { tag: 'NIP',  name: 'NIP',             colors: ['#0a0a0a', '#f4ed00'] as [string, string] },
  { tag: 'G2',   name: 'G2 Esports',      colors: ['#0a0a0a', '#e6e6e6'] as [string, string] },
  { tag: 'TL',   name: 'Team Liquid',     colors: ['#0a0a0a', '#0066cc'] as [string, string] },
  { tag: 'EG',   name: 'Evil Geniuses',   colors: ['#0a0a0a', '#5b2be0'] as [string, string] },
];

interface ProspectOffer {
  orgTag: string;
  orgName: string;
  orgColors: [string, string];
  fee: number;
}

function prospectOffer(prospectId: string, split: number, ovr: number): ProspectOffer | null {
  if (ovr < 72) return null;
  const h = hashStr(`prospoff:${prospectId}:${split}`);
  if (h % 100 >= 35) return null;
  const org = INTERESTED_ORGS[h % INTERESTED_ORGS.length];
  // fee escala com OVR: 70k base + 30k por ponto acima de 70 + ruído determinístico
  const fee = 70_000 + (ovr - 70) * 30_000 + (h % 60_000);
  return { orgTag: org.tag, orgName: org.name, orgColors: org.colors, fee };
}

// ─── Evolução de prospect ────────────────────────────────────────────────────
// Espelha a lógica de evolveAcademy() em CareerScreen.tsx:
//   - Roll 0-99 determinístico por (id, split): 35% +3, 40% +2, 25% +1 → média 2.1
//   - +1 fixo se em foco (academyFocus)
//   - +trainingLv/3 esperado da facility de treino (0% / 33% / 67% / 100% chance de +1)
//   - Capped pelo potencial
// Usado pra mostrar "próx esperado: +X" e "~Y splits até potencial" na UI.
function expectedEvoPerSplit(focused: boolean, trainingLv: number): number {
  // média do roll base
  const base = 0.35 * 3 + 0.40 * 2 + 0.25 * 1; // = 2.1
  const focusBonus = focused ? 1 : 0;
  const trainingBonus = trainingLv / 3; // chance de +1 (0..1)
  return base + focusBonus + trainingBonus;
}

// ─── Simulação ao vivo de match academy (RNG não-determinístico) ─────────────
// Bypassa a tabela determinística do academyLeague quando o user clica "Jogar".
// Resultado bate em mapas (0-2 / 1-2 / 2-0 / 2-1).
function simulateAcademyMatch(userStrength: number, oppStrength: number): [number, number] {
  // edge: -20..+20 (força) + ruído Math.random gerado AGORA (não-determinístico)
  const noise = Math.floor(Math.random() * 21) - 10;
  const edge = userStrength - oppStrength + noise;
  if (edge > 5) return Math.random() < 0.65 ? [2, 0] : [2, 1];
  if (edge < -5) return Math.random() < 0.65 ? [0, 2] : [1, 2];
  return Math.random() < 0.5 ? [2, 1] : [1, 2];
}

// fallback pra ambientes sem structuredClone (jsdom, navegadores antigos)
function structuredCloneSafe<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

export function AcademyTab({
  save,
  update,
  promoting,
  setPromoting,
  promoteProspect,
  promoteToAcaTeam,
  releaseAcaTeamPlayer,
  promoteAcaTeamToSquad,
  findSigning,
  askConfirm,
  openPlayerProfile,
  isPaid,
}: Props) {
  const aca = useMemo(() => save.academy ?? [], [save.academy]);

  // Rename de nick (Vitalícia). Pra free user, abre o pop-up de ativação.
  // Atualiza tanto save.academy quanto save.academyTeam pra cobrir os dois lugares.
  const renameAcademyPlayer = (id: string, currentNick: string) => {
    if (!isPaid) {
      window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: 'academy-rename', force: true } }));
      return;
    }
    // eslint-disable-next-line no-alert
    const next = window.prompt(ct('Novo nick (max 12 chars):'), currentNick)?.trim();
    if (!next || next === currentNick) return;
    const nick = next.slice(0, 12);
    const academy = (save.academy ?? []).map((p) => p.id === id ? { ...p, nick } : p);
    const academyTeam = (save.academyTeam ?? []).map((p) => p.id === id ? { ...p, nick } : p);
    // Quando o prospect já foi promovido pra youth, atualiza lá tb (mantém consistente).
    const youth = save.youth ? { ...save.youth } : undefined;
    if (youth && youth[id]) youth[id] = { ...youth[id], nick };
    update({ academy, academyTeam, ...(youth ? { youth } : {}) });
  };
  const full = aca.length >= ACADEMY_MAX;
  const squadFull = save.squad.length >= 5;
  // Nível atual da facility de treino (0-3) — influencia evolução esperada.
  const trainingLv = Math.max(0, Math.min(3, Math.floor(save.facilities?.training ?? 0)));
  const acaTeam = save.academyTeam ?? [];
  // Estado pro gerenciamento dos jogadores do time academy (subir/trocar/dispensar).
  // acaTeamManageId = id do jogador sendo gerenciado; acaTeamManageMode = qual ação.
  const [acaTeamManageId, setAcaTeamManageId] = useState<string | null>(null);
  const [acaTeamManageMode, setAcaTeamManageMode] = useState<'promote' | 'sub'>('promote');
  // Estado pro botão 'Pro Academy' nos cards de prospect (só quando o time tá cheio).
  const [acaPromoting, setAcaPromoting] = useState<string | null>(null);
  const acaTeamFull = acaTeam.length >= 5;
  const teamOvr = acaTeam.length
    ? Math.round(acaTeam.reduce((a, p) => a + playerOvr(p), 0) / acaTeam.length)
    : 0;

  // país predominante (pra criar time academy alinhado com sua org)
  const orgCountry = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of save.squad) {
      const c = findSigning(s)?.player.country;
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best = '';
    let bestN = 0;
    for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n; }
    return best || (REGION_CC[save.region ?? 'europe'] ?? REGION_CC.europe)[0];
  }, [save.squad, save.region, findSigning]);

  const league = useMemo(
    () =>
      acaTeam.length
        ? academyLeague(
            {
              name: `${save.org?.name ?? 'Org'} Academy`,
              tag: `${save.org?.tag ?? 'ORG'}A`,
              colors: save.org?.colors ?? ['#101820', '#3a3a3a'],
              strength: teamOvr,
            },
            `${save.org?.tag ?? 'org'}:${save.split}`,
          )
        : null,
    [acaTeam.length, teamOvr, save.org?.name, save.org?.tag, save.org?.colors, save.split],
  );

  // Resultados que o usuário JOGOU (override do determinístico) — persistidos
  // no save em `academyPlayed`. Chave: `${split}:${oppId}` pra reset natural
  // a cada virada de split.
  const playedAll = useMemo(() => save.academyPlayed ?? {}, [save.academyPlayed]);
  const splitPrefix = `${save.split}:`;
  const playedOverride = useMemo(() => {
    const out: Record<string, [number, number]> = {};
    for (const [k, v] of Object.entries(playedAll)) {
      if (k.startsWith(splitPrefix)) out[k.slice(splitPrefix.length)] = v;
    }
    return out;
  }, [playedAll, splitPrefix]);

  const writeOverride = (oppId: string, score: [number, number]) => {
    update({
      academyPlayed: {
        ...playedAll,
        [`${save.split}:${oppId}`]: score,
      },
    });
  };

  const matchesView: AcademyMatch[] = useMemo(() => {
    if (!league) return [];
    return league.userMatches.map((m) => {
      const override = playedOverride[m.oppId];
      if (!override) return m;
      const [us, them] = override;
      return { ...m, userScore: us, oppScore: them, won: us > them };
    });
  }, [league, playedOverride]);

  // Tabela final com overrides aplicados (vitória do user altera classificação)
  const tableFinal = useMemo(() => {
    if (!league) return [];
    return applyOverridesToStandings(league.table, league.userMatches, playedOverride);
  }, [league, playedOverride]);
  const userPlaceFinal = useMemo(
    () => tableFinal.findIndex((t) => t.isUser) + 1,
    [tableFinal],
  );

  // Match "próximo" pra botão "Jogar agora": primeiro do split que NÃO foi
  // jogado pelo user (playedOverride[oppId] undefined).
  const nextPlayable = useMemo(() => {
    if (!league) return null;
    return league.userMatches.find((m) => !playedOverride[m.oppId]) ?? null;
  }, [league, playedOverride]);

  const allMatchesPlayed = league ? league.userMatches.every((m) => playedOverride[m.oppId]) : false;

  const playNext = () => {
    if (!nextPlayable) return;
    const oppClub = ACADEMY_CLUBS.find((c) => c.id === nextPlayable.oppId);
    const oppStr = oppClub ? 62 + (hashStr(`str:${oppClub.id}`) % 13) + (oppClub.players && oppClub.players.length >= 4 ? 2 : 0) : 68;
    const [us, them] = simulateAcademyMatch(teamOvr, oppStr);
    writeOverride(nextPlayable.oppId, [us, them]);
  };

  // ─── FULL MATCH: veto + MatchScreen real ───────────────────────────────────
  // stage 'veto' → 'match' → null. Quando termina, persiste override do match.
  const [fullStage, setFullStage] = useState<null | 'veto' | 'match'>(null);
  const [fullCtx, setFullCtx] = useState<null | {
    oppId: string;
    teams: [TTeam, TTeam];
    userIdx: 0 | 1;
    maps?: { map: MapId; pickedBy: 0 | 1 | -1 }[];
    phaseLabel: string;
    /** Quando vier de uma fase de playoff, ao finalizar o match grava nas semis/final. */
    playoffSlot?: 'semi0' | 'semi1' | 'final';
  }>(null);
  // RNG criado lazy (não durante render — evita regra de pureza). Reseta a cada
  // novo veto pra garantir variabilidade entre matches.
  const rngRef = useRef<ReturnType<typeof makeRng> | null>(null);
  const getRng = (): ReturnType<typeof makeRng> => {
    if (!rngRef.current) {
      rngRef.current = makeRng(Math.floor(Math.random() * 2_000_000_000) + 1);
    }
    return rngRef.current;
  };

  const startFullVeto = (
    oppId: string,
    phaseLabel: string,
    playoffSlot?: 'semi0' | 'semi1' | 'final',
  ) => {
    if (!acaTeam.length) return;
    const oppClub = ACADEMY_CLUBS.find((c) => c.id === oppId);
    if (!oppClub) return;
    const userTeam = buildAcademyUserTeam(acaTeam, save.org, orgCountry);
    const oppTeam = buildAcademyOpponentTeam(oppClub, save.split);
    rngRef.current = makeRng(Math.floor(Math.random() * 2_000_000_000) + 1);
    setFullCtx({ oppId, teams: [userTeam, oppTeam], userIdx: 0, phaseLabel, playoffSlot });
    setFullStage('veto');
  };

  const onVetoDone = (maps: { map: MapId; pickedBy: 0 | 1 | -1 }[]) => {
    if (!fullCtx) return;
    setFullCtx({ ...fullCtx, maps });
    setFullStage('match');
  };

  const onFullMatchFinish = (series: SeriesResult) => {
    if (!fullCtx) return;
    const [winsA, winsB] = series.mapScore;
    const score = seriesToAcademyScore(fullCtx.userIdx, winsA, winsB);
    if (fullCtx.playoffSlot) {
      // grava em playoff
      const po = save.academyPlayoff;
      if (po) {
        const next = structuredCloneSafe(po);
        const winnerId = series.winner === fullCtx.userIdx ? fullCtx.teams[fullCtx.userIdx].id : fullCtx.teams[fullCtx.userIdx === 0 ? 1 : 0].id;
        const result = { winnerId, score: score as [number, number] };
        if (fullCtx.playoffSlot === 'semi0') next.semis[0].result = result;
        else if (fullCtx.playoffSlot === 'semi1') next.semis[1].result = result;
        else if (fullCtx.playoffSlot === 'final' && next.final) {
          next.final.result = result;
          next.champion = winnerId === next.final.a.id ? next.final.a : next.final.b;
        }
        // Promove vencedores das semis pra final automaticamente
        if (next.semis[0].result && next.semis[1].result && !next.final) {
          const w0 = next.semis[0].result.winnerId === next.semis[0].a.id ? next.semis[0].a : next.semis[0].b;
          const w1 = next.semis[1].result.winnerId === next.semis[1].a.id ? next.semis[1].a : next.semis[1].b;
          next.final = { a: w0, b: w1 };
        }
        update({ academyPlayoff: next });
      }
    } else {
      writeOverride(fullCtx.oppId, score);
    }
    setFullStage(null);
    setFullCtx(null);
  };

  // ─── Disparar playoff quando o round-robin termina ─────────────────────────
  // Ao concluir todos os matches do split, monta-se o bracket com o tableFinal.
  // O usuário decide quando JOGAR cada semi/final.
  const startPlayoff = () => {
    if (!league || !allMatchesPlayed) return;
    const bracket = buildAcademyPlayoff(tableFinal, save.split);
    update({ academyPlayoff: bracket });
  };

  // se mudou de split (avanço da carreira), limpa o playoff
  useEffect(() => {
    if (save.academyPlayoff && save.academyPlayoff.split !== save.split) {
      update({ academyPlayoff: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.split]);

  // Para auto-simular um match de playoff onde o user NÃO está envolvido
  const autoSimSlot = (slot: 'semi0' | 'semi1' | 'final') => {
    const po = save.academyPlayoff;
    if (!po) return;
    const next = structuredCloneSafe(po);
    const m =
      slot === 'semi0' ? next.semis[0]
      : slot === 'semi1' ? next.semis[1]
      : next.final;
    if (!m) return;
    m.result = autoPlayoffResult(m.a, m.b);
    if (slot === 'final' && next.final?.result) {
      next.champion = next.final.result.winnerId === next.final.a.id ? next.final.a : next.final.b;
    }
    if (next.semis[0].result && next.semis[1].result && !next.final) {
      const w0 = next.semis[0].result.winnerId === next.semis[0].a.id ? next.semis[0].a : next.semis[0].b;
      const w1 = next.semis[1].result.winnerId === next.semis[1].a.id ? next.semis[1].a : next.semis[1].b;
      next.final = { a: w0, b: w1 };
    }
    update({ academyPlayoff: next });
  };

  // ─── Prize money: paga quando o split fecha (round-robin OU playoff) ───────
  // O pagamento usa o placement final: campeão do playoff > vice > etc.
  // Quando NÃO há playoff (user em 5º+), considera-se o lugar do round-robin.
  useEffect(() => {
    const po = save.academyPlayoff;
    const closedRR = league && allMatchesPlayed;
    if (!closedRR) return;
    const paidSplits = save.academyPaidSplits ?? [];
    if (paidSplits.includes(save.split)) return;

    let place = userPlaceFinal;
    if (po?.champion) {
      const userId = league?.table.find((t) => t.isUser)?.id;
      const champion = po.champion.id === userId;
      // Se o user chegou na final, vira 1º ou 2º
      if (po.final) {
        const inFinal = po.final.a.isUser || po.final.b.isUser;
        if (inFinal) place = champion ? 1 : 2;
        else {
          // semi: 3º ou 4º
          const inSemi = po.semis.some((s) => s.a.isUser || s.b.isUser);
          if (inSemi) place = 3;
        }
      }
      // Só paga DEPOIS do playoff fechar (campeão definido)
      const prize = academyPrize(place);
      const nextPaid = [...paidSplits, save.split];
      update({
        budget: save.budget + prize,
        academyPaidSplits: nextPaid,
        academyTrophies: (save.academyTrophies ?? 0) + (champion ? 1 : 0),
      });
    } else if (!po && userPlaceFinal > 4) {
      // BUG FIX (caça-bugs): só paga por colocação de round-robin quem NÃO tem
      // playoff a disputar (5º+). Antes, terminar o RR em 1º-4º pagava o prêmio
      // de campeão (300k) ANTES de jogar o mata-mata e marcava o split como pago
      // → o playoff perdia prêmio e nunca dava troféu. Top-4 sem playoff iniciado
      // não paga nada aqui; o split só fecha no ramo do po.champion acima.
      const prize = academyPrize(place);
      if (prize > 0) {
        update({
          budget: save.budget + prize,
          academyPaidSplits: [...paidSplits, save.split],
        });
      } else {
        // mesmo zero, marca como pago pra não tentar de novo
        update({ academyPaidSplits: [...paidSplits, save.split] });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.academyPlayoff?.champion, allMatchesPlayed, save.split]);

  // ofertas pra prospects (calculadas na renderização)
  const offersByProspect = useMemo(() => {
    const out = new Map<string, ProspectOffer>();
    for (const p of aca) {
      const off = prospectOffer(p.id, save.split, playerOvr(p));
      if (off) out.set(p.id, off);
    }
    return out;
  }, [aca, save.split]);

  const acceptOffer = (prospect: AcademyEntry, offer: ProspectOffer) => {
    askConfirm({
      title: ct('Aceitar oferta'),
      message: `${offer.orgName} ${ct('quer')} ${prospect.nick} ${ct('por')} ${formatMoney(offer.fee)}. ${ct('Aceitar vende o prospect e libera o slot.')}`,
      confirmLabel: ct('Aceitar'),
      onConfirm: () => {
        update({
          academy: aca.filter((x) => x.id !== prospect.id),
          academyFocus: save.academyFocus === prospect.id ? null : save.academyFocus,
          budget: save.budget + offer.fee,
        });
        if (promoting === prospect.id) setPromoting(null);
      },
    });
  };

  return (
    <div className="em-academy fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header banner */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(232,193,112,0.10) 0%, transparent 60%)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
        }}
      >
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800 }}>
            🎓 {ct('Próxima geração')}
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.4rem', fontWeight: 900, color: 'var(--em-text)', letterSpacing: '-0.3px' }}>
            {save.org?.name ?? 'Org'} Academy
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <HudPill label={ct('Time')} value={acaTeam.length ? `OVR ${teamOvr}` : '—'} tone={acaTeam.length ? 'gold' : 'neutral'} />
          <HudPill label={ct('Liga')} value={league ? `${userPlaceFinal}º` : '—'} tone={league && userPlaceFinal <= 3 ? 'green' : 'neutral'} />
          <HudPill label={ct('Prospects')} value={`${aca.length}/${ACADEMY_MAX}`} tone="neutral" />
          {(save.academyTrophies ?? 0) > 0 && (
            <HudPill label={ct('Títulos')} value={`🏆 ${save.academyTrophies}`} tone="gold" />
          )}
        </div>
      </header>

      {/* Banner "Como evoluem" — antes do time academy pra ficar bem visível no topo */}
      <EvoExplainer trainingLv={trainingLv} />

      {/* ===== TIME ACADEMY ===== */}
      <DashCard
        title={ct('Seu time Academy')}
        info={acaTeam.length ? ct('Clique num jogador pra ver perfil') : undefined}
        actions={acaTeam.length ? <span style={{ fontSize: '0.7rem', color: 'var(--em-muted)' }}>{ct('Disputa a Liga Academy')}</span> : undefined}
      >
        {acaTeam.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--em-muted)', lineHeight: 1.5, maxWidth: 620 }}>
              {ct('Sua org ainda não tem time academy. Monte um agora — entram')}{' '}
              <b style={{ color: 'var(--em-text)' }}>{ct('5 jovens')}</b>{' '}
              {ct('(um por função), todos da nacionalidade do seu time. Eles disputam a Liga Academy contra as principais academies do mundo a cada split.')}
            </p>
            <button
              type="button"
              onClick={() =>
                update({
                  academyTeam: buildUserAcademyTeam(orgCountry, save.org?.tag ?? 'ORG', save.split),
                })
              }
              style={{
                alignSelf: 'flex-start',
                padding: '8px 16px',
                background: 'var(--em-gold)',
                color: '#1a1205',
                border: 'none',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontWeight: 800,
                fontSize: '0.86rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CareerIcon name="search" size={14} /> {ct('Criar time academy')} <Flag cc={orgCountry} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {acaTeam.map((p) => {
              const ovr = playerOvr(p);
              const potPct = Math.max(6, Math.min(100, ((p.potential - 60) / 33) * 100));
              const isManaging = acaTeamManageId === p.id;
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 6,
                    padding: '12px 8px 8px',
                    background: 'var(--em-panel-2)',
                    border: `1px solid ${isManaging ? 'var(--em-gold)' : 'var(--em-border)'}`,
                    borderRadius: 6,
                    fontFamily: 'inherit',
                    color: 'var(--em-text)',
                    textAlign: 'center',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openPlayerProfile(p as unknown as Player)}
                    title={ct('Ver perfil do jogador')}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: 'var(--em-text)',
                    }}
                  >
                    <PlayerAvatar nick={p.nick} size={48} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Flag cc={p.country} />
                      <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--em-text)' }}>{p.nick}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); renameAcademyPlayer(p.id, p.nick); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); renameAcademyPlayer(p.id, p.nick); } }}
                        title={isPaid ? ct('Renomear (Vitalícia)') : ct('Renomear é exclusivo Vitalícia')}
                        style={{ cursor: 'pointer', fontSize: '0.7rem', opacity: 0.6, padding: '0 2px' }}
                      >
                        ✏️
                      </span>
                      <b style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.86rem', fontWeight: 800, color: 'var(--em-gold)' }}>{ovr}</b>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--em-muted)' }}>
                      <span className={`role-pill ${p.role}`}>{p.role}</span>
                      <span>{p.age}a</span>
                    </div>
                    <div title={`${ct('Potencial')} ${p.potential}`} style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
                      <div style={{ width: `${potPct}%`, height: '100%', background: 'var(--em-gold)' }} />
                    </div>
                  </button>
                  {/* Ações: Subir / Trocar / Dispensar (gerenciar time academy) */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (squadFull) setAcaTeamManageId(isManaging && acaTeamManageMode === 'promote' ? null : p.id);
                        else { promoteAcaTeamToSquad(p.id); setAcaTeamManageId(null); }
                        setAcaTeamManageMode('promote');
                      }}
                      title={ct('Subir pro elenco principal')}
                      style={{ flex: 1, padding: '4px 6px', background: 'var(--em-gold)', color: '#1a1205', border: 'none', borderRadius: 3, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.68rem', cursor: 'pointer' }}
                    >
                      ⬆ {ct('Subir')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAcaTeamManageId(isManaging && acaTeamManageMode === 'sub' ? null : p.id); setAcaTeamManageMode('sub'); }}
                      title={ct('Trocar por um prospect da academia')}
                      disabled={aca.length === 0}
                      style={{ flex: 1, padding: '4px 6px', background: 'transparent', color: aca.length === 0 ? 'var(--em-muted)' : 'var(--em-text)', border: '1px solid var(--em-border)', borderRadius: 3, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.68rem', cursor: aca.length === 0 ? 'not-allowed' : 'pointer' }}
                    >
                      ⇄ {ct('Trocar')}
                    </button>
                    <button
                      type="button"
                      onClick={() => askConfirm({
                        title: ct('Dispensar do time academy'),
                        message: `${ct('Dispensar')} ${p.nick} ${ct('do time academy? O slot fica vazio até você encaixar outro prospect.')}`,
                        confirmLabel: ct('Dispensar'),
                        danger: true,
                        onConfirm: () => releaseAcaTeamPlayer(p.id),
                      })}
                      title={ct('Dispensar do time academy')}
                      style={{ padding: '4px 6px', background: 'transparent', color: 'var(--em-muted)', border: '1px solid var(--em-border)', borderRadius: 3, fontFamily: 'inherit', fontSize: '0.68rem', cursor: 'pointer' }}
                    >
                      <CareerIcon name="trash" size={11} />
                    </button>
                  </div>
                  {/* Painel inline: substituir por prospect (mode='sub') */}
                  {isManaging && acaTeamManageMode === 'sub' && aca.length > 0 && (
                    <div style={{ marginTop: 4, padding: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                      <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', marginBottom: 4 }}>{ct('Entra no lugar:')}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {aca.map((pr) => (
                          <button
                            key={pr.id}
                            type="button"
                            onClick={() => { promoteToAcaTeam(pr.id, p.id); setAcaTeamManageId(null); }}
                            style={{ padding: '3px 6px', background: 'var(--em-panel-2)', color: 'var(--em-text)', border: '1px solid var(--em-border)', borderRadius: 3, fontFamily: 'inherit', fontSize: '0.68rem', cursor: 'pointer' }}
                          >
                            {pr.nick} <span className={`role-pill ${pr.role}`} style={{ marginLeft: 2 }}>{pr.role}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Painel inline: escolher quem sai do elenco principal pra subir (mode='promote' + squad cheio) */}
                  {isManaging && acaTeamManageMode === 'promote' && squadFull && (
                    <div style={{ marginTop: 4, padding: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                      <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', marginBottom: 4 }}>{ct('Elenco cheio — sai do time:')}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {save.squad.map((sg) => {
                          const f = findSigning(sg);
                          return (
                            <button
                              key={sg.playerId}
                              type="button"
                              onClick={() => { promoteAcaTeamToSquad(p.id, sg.playerId); setAcaTeamManageId(null); }}
                              style={{ padding: '3px 6px', background: 'var(--em-panel-2)', color: 'var(--em-text)', border: '1px solid var(--em-border)', borderRadius: 3, fontFamily: 'inherit', fontSize: '0.68rem', cursor: 'pointer' }}
                            >
                              {f?.player.nick ?? sg.playerId}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DashCard>

      {/* ===== LIGA ACADEMY ===== */}
      {league && (
        <DashCard
          title={`${ct('Liga Academy')} · Split ${save.split}`}
          info={`${ct('Você está em')} ${userPlaceFinal}º`}
          actions={
            nextPlayable ? (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => startFullVeto(nextPlayable.oppId, `${ct('Liga Academy')} · Split ${save.split}`)}
                  title={ct('Veta, joga round-a-round e controla o ritmo — vale o resultado real')}
                  style={{
                    padding: '6px 14px',
                    background: 'var(--em-gold)',
                    color: '#1a1205',
                    border: 'none',
                    borderRadius: 4,
                    fontFamily: 'inherit',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    letterSpacing: '0.3px',
                  }}
                >
                  🎮 {ct('Jogar')} {nextPlayable.oppTag}
                </button>
                <button
                  type="button"
                  onClick={playNext}
                  title={ct('Resultado rápido por RNG (sem veto)')}
                  style={{
                    padding: '6px 10px',
                    background: 'transparent',
                    color: 'var(--em-text)',
                    border: '1px solid var(--em-border)',
                    borderRadius: 4,
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                  }}
                >
                  ⏩ {ct('Simular')}
                </button>
              </span>
            ) : (
              <span style={{ fontSize: '0.72rem', color: '#5ed88a', fontWeight: 700 }}>
                ✓ {ct('Todos jogados')}
              </span>
            )
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, alignItems: 'start' }}>
            {/* Tabela */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ color: 'var(--em-muted)', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={th}>#</th>
                    <th style={{ ...th, textAlign: 'left' }}>{ct('Academia')}</th>
                    <th style={th}>V</th>
                    <th style={th}>D</th>
                    <th style={th}>+/-</th>
                    <th style={th}>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {tableFinal.map((r, i) => {
                    const club = ACADEMY_CLUBS.find((c) => c.id === r.id);
                    const parentLogo = club ? academyParentLogoUrl(club) : undefined;
                    return (
                      <tr
                        key={r.id}
                        style={{
                          background: r.isUser ? 'rgba(232,193,112,0.10)' : 'transparent',
                          borderTop: '1px solid var(--em-border)',
                        }}
                      >
                        <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace', color: i === 0 ? 'var(--em-gold)' : 'var(--em-text)', fontWeight: 800 }}>{i + 1}</td>
                        <td style={{ ...td, textAlign: 'left' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {r.isUser ? (
                              <TeamBadge tag={r.tag} colors={r.colors} size={26} />
                            ) : (
                              <AcademyBadge
                                parentLogoUrl={parentLogo}
                                colors={r.colors}
                                fallbackTag={r.tag}
                                fallbackColors={r.colors}
                                size={26}
                                showLabel={false}
                              />
                            )}
                            <span style={{ fontWeight: r.isUser ? 800 : 600 }}>
                              {r.name}
                              {r.parentName && (
                                <span style={{ marginLeft: 6, fontSize: '0.66rem', color: 'var(--em-muted)' }}>
                                  ({r.parentName})
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace' }}>{r.w}</td>
                        <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace' }}>{r.l}</td>
                        <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace', color: r.diff > 0 ? '#5ed88a' : r.diff < 0 ? '#e58a8a' : 'var(--em-muted)' }}>
                          {r.diff > 0 ? '+' : ''}{r.diff}
                        </td>
                        <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace', fontWeight: 800 }}>{r.pts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Seus jogos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 800 }}>
                {ct('Seus jogos no split')}
              </div>
              {matchesView.map((m) => {
                const isOverride = !!playedOverride[m.oppId];
                const oppClub = ACADEMY_CLUBS.find((c) => c.id === m.oppId);
                const parentLogo = oppClub ? academyParentLogoUrl(oppClub) : undefined;
                return (
                  <div
                    key={m.oppId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 10px',
                      background: 'var(--em-panel-2)',
                      border: `1px solid ${m.won ? 'rgba(94,216,138,0.4)' : 'rgba(229,138,138,0.35)'}`,
                      borderLeftWidth: 3,
                      borderRadius: 4,
                    }}
                  >
                    <AcademyBadge
                      parentLogoUrl={parentLogo}
                      colors={m.oppColors}
                      fallbackTag={m.oppTag}
                      fallbackColors={m.oppColors}
                      size={22}
                      showLabel={false}
                    />
                    <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--em-text)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.oppName}
                    </span>
                    {isOverride && (
                      <span title={ct('Jogado por você')} style={{ fontSize: '0.6rem', color: 'var(--em-gold)', fontWeight: 800, letterSpacing: '0.3px' }}>
                        ▸
                      </span>
                    )}
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.86rem', fontWeight: 800, color: m.won ? '#5ed88a' : '#e58a8a' }}>
                      {m.userScore}–{m.oppScore}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: '0.74rem', color: 'var(--em-muted)', lineHeight: 1.5 }}>
            {ct('Academies reais (NAVI Junior, MOUZ NXT, Eternal Fire Academy e mais).')} <b style={{ color: 'var(--em-text)' }}>{ct('🎮 Jogar')}</b> {ct('abre VETO de mapas e MD3 round-a-round; ⏩ Simular fecha rápido.')}
          </p>
        </DashCard>
      )}

      {/* ===== PLAYOFFS DA LIGA ACADEMY ===== */}
      {league && allMatchesPlayed && !save.academyPlayoff && (
        <DashCard
          title={`${ct('Playoffs Academy')} · Split ${save.split}`}
          info={ct('Round-robin fechado — top 4 disputa o título')}
          actions={
            userPlaceFinal <= 4 ? (
              <button
                type="button"
                onClick={startPlayoff}
                style={{
                  padding: '6px 14px',
                  background: 'var(--em-gold)',
                  color: '#1a1205',
                  border: 'none',
                  borderRadius: 4,
                  fontFamily: 'inherit',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                🏆 {ct('Disputar playoffs')}
              </button>
            ) : (
              <span style={{ fontSize: '0.72rem', color: 'var(--em-muted)', fontStyle: 'italic' }}>
                {ct('Fora do top 4 — fim do split')}
              </span>
            )
          }
        >
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--em-muted)', lineHeight: 1.5 }}>
            {userPlaceFinal <= 4
              ? ct('Você se classificou para as semifinais. Semis: 1º × 4º e 2º × 3º (MD3). Vencedores fazem a final pelo título.')
              : ct('Não chegou aos playoffs neste split. Mesmo assim a premiação por colocação é paga ao fechar.')}
          </p>
        </DashCard>
      )}
      {save.academyPlayoff && (
        <PlayoffCard
          po={save.academyPlayoff}
          onPlay={(slot, oppId) => startFullVeto(oppId, `${ct('Playoffs')} · ${slot === 'final' ? ct('Final') : ct('Semi')} · Split ${save.split}`, slot)}
          onSim={autoSimSlot}
        />
      )}

      {/* ===== ACADEMIA (PROSPECTOS) ===== */}
      <DashCard
        title={`${ct('Academia')} (${aca.length}/${ACADEMY_MAX})`}
        info={ct('Próximos talentos')}
        actions={
          <button
            type="button"
            disabled={full || save.budget < ACADEMY_SCOUT_COST}
            title={
              full
                ? ct('Academia cheia')
                : save.budget < ACADEMY_SCOUT_COST
                ? ct('Caixa insuficiente')
                : ''
            }
            onClick={() => {
              // a base revela TALENTO LOCAL: região derivada do país da org (não
              // mais fallback fixo 'europe', que fazia um time BR revelar polonês)
              // e forte viés pra nacionalidade da org via homeCountry.
              const region = macroRegionOf(orgCountry) ?? save.region ?? 'americas';
              const seed = `aca:${save.org?.tag ?? 'org'}:${save.split}:${aca.length}:${save.budget}`;
              const p = makeProspect(seed, region, save.split, orgCountry);
              update({ academy: [...aca, p], budget: save.budget - ACADEMY_SCOUT_COST });
            }}
            style={{
              padding: '6px 14px',
              background: full || save.budget < ACADEMY_SCOUT_COST ? 'var(--em-panel-2)' : 'var(--em-gold)',
              color: full || save.budget < ACADEMY_SCOUT_COST ? 'var(--em-muted)' : '#1a1205',
              border: full || save.budget < ACADEMY_SCOUT_COST ? '1px solid var(--em-border)' : 'none',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 800,
              fontSize: '0.78rem',
              cursor: full || save.budget < ACADEMY_SCOUT_COST ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <CareerIcon name="search" size={12} /> {ct('Revelar')} ({formatMoney(ACADEMY_SCOUT_COST)})
          </button>
        }
      >
        {aca.length === 0 ? (
          <p style={{ margin: '8px 0', fontSize: '0.82rem', color: 'var(--em-muted)', fontStyle: 'italic' }}>
            {ct('Academia vazia. Revele um prospecto pra começar a formar a próxima geração.')}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {aca.map((p) => {
              const ovr = playerOvr(p);
              const focused = save.academyFocus === p.id;
              const potPct = Math.max(6, Math.min(100, ((p.potential - 60) / 33) * 100));
              const offer = offersByProspect.get(p.id);
              const atMax = ovr >= p.potential;
              const expEvo = atMax ? 0 : expectedEvoPerSplit(focused, trainingLv);
              const splitsToMax = atMax ? 0 : Math.ceil((p.potential - ovr) / Math.max(0.1, expEvo));
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: 12,
                    background: 'var(--em-panel-2)',
                    border: `1px solid ${focused ? 'var(--em-gold)' : 'var(--em-border)'}`,
                    borderRadius: 6,
                  }}
                >
                  {/* Header clicável -> abre perfil */}
                  <button
                    type="button"
                    onClick={() => openPlayerProfile(p as unknown as Player)}
                    title={ct('Ver perfil')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: 0,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      color: 'var(--em-text)',
                    }}
                  >
                    <PlayerAvatar nick={p.nick} size={42} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.92rem', fontWeight: 800 }}>
                        <Flag cc={p.country} /> {p.nick}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); renameAcademyPlayer(p.id, p.nick); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); renameAcademyPlayer(p.id, p.nick); } }}
                          title={isPaid ? ct('Renomear (Vitalícia)') : ct('Renomear é exclusivo Vitalícia')}
                          style={{ cursor: 'pointer', fontSize: '0.7rem', opacity: 0.55, padding: '0 2px' }}
                        >
                          ✏️
                        </span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--em-muted)' }}>{p.name}</div>
                    </div>
                    <OvrBadge ovr={ovr} />
                  </button>

                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem' }}>
                    <span className={`role-pill ${p.role}`}>{p.role}</span>
                    <span style={{ color: 'var(--em-muted)' }}>{p.age} {ct('anos')}</span>
                  </div>

                  {/* potencial */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.7rem', color: 'var(--em-muted)' }}>
                      <span>{ct('OVR')} <b style={{ color: 'var(--em-text)' }}>{ovr}</b></span>
                      <span>{ct('POT')} <b style={{ color: 'var(--em-gold)' }}>{p.potential}</b></span>
                    </div>
                    <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginTop: 3 }}>
                      <div style={{ width: `${potPct}%`, height: '100%', background: 'var(--em-gold)' }} />
                    </div>
                  </div>

                  {/* Evolução esperada — explicita o ganho por split + ETA até POT */}
                  {atMax ? (
                    <div
                      style={{
                        padding: '5px 8px',
                        background: 'rgba(232,193,112,0.10)',
                        border: '1px solid rgba(232,193,112,0.35)',
                        borderRadius: 3,
                        fontSize: '0.68rem',
                        color: 'var(--em-gold)',
                        fontWeight: 700,
                        textAlign: 'center',
                      }}
                      title={ct('Esse prospect chegou no teto de potencial — não evolui mais (só envelhece).')}
                    >
                      ★ {ct('No potencial máximo')}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 8px',
                        background: focused ? 'rgba(94,216,138,0.10)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${focused ? 'rgba(94,216,138,0.35)' : 'var(--em-border)'}`,
                        borderRadius: 3,
                        fontSize: '0.68rem',
                      }}
                      title={`${ct('Base 2.1 + foco')} ${focused ? '+1' : '+0'} + ${ct('treino')} +${(trainingLv / 3).toFixed(2)} = +${expEvo.toFixed(1)} ${ct('por split (média)')}`}
                    >
                      <span style={{ color: 'var(--em-muted)' }}>
                        {ct('Próx split')}
                      </span>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, color: focused ? '#5ed88a' : 'var(--em-text)' }}>
                        +{expEvo.toFixed(1)} OVR
                      </span>
                      <span style={{ color: 'var(--em-muted)' }}>
                        ~{splitsToMax}s {ct('p/ pot')}
                      </span>
                    </div>
                  )}

                  {/* OFERTA pendente — destaque */}
                  {offer && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        padding: '8px 10px',
                        background: 'rgba(232,193,112,0.10)',
                        border: '1px solid rgba(232,193,112,0.4)',
                        borderRadius: 4,
                      }}
                    >
                      <div style={{ fontSize: '0.62rem', color: 'var(--em-gold)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 800 }}>
                        📨 {ct('Oferta')}
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                        <b>{offer.orgName}</b>{' '}
                        <span style={{ color: 'var(--em-muted)', fontWeight: 600 }}>{ct('quer comprar')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <b style={{ fontFamily: '"JetBrains Mono", monospace', color: '#5ed88a', fontSize: '0.86rem' }}>
                          {formatMoney(offer.fee)}
                        </b>
                        <button
                          type="button"
                          onClick={() => acceptOffer(p, offer)}
                          style={{
                            padding: '4px 10px',
                            background: 'var(--em-gold)',
                            color: '#1a1205',
                            border: 'none',
                            borderRadius: 3,
                            fontFamily: 'inherit',
                            fontWeight: 800,
                            fontSize: '0.74rem',
                            cursor: 'pointer',
                          }}
                        >
                          {ct('Aceitar')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ações */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                    <button
                      type="button"
                      onClick={() =>
                        squadFull
                          ? setPromoting(promoting === p.id ? null : p.id)
                          : promoteProspect(p.id)
                      }
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        background: 'var(--em-gold)',
                        color: '#1a1205',
                        border: 'none',
                        borderRadius: 3,
                        fontFamily: 'inherit',
                        fontWeight: 800,
                        fontSize: '0.74rem',
                        cursor: 'pointer',
                      }}
                    >
                      ⬆ {ct('Promover')}
                    </button>
                    {/* Botão extra: 'Pro Academy' = move o prospect pro TIME ACADEMY
                       (5 jovens que disputam Liga Academy). Só aparece se o user
                       já criou o time academy. Se tá cheio, abre painel de troca. */}
                    {acaTeam.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (acaTeamFull) setAcaPromoting(acaPromoting === p.id ? null : p.id);
                          else { promoteToAcaTeam(p.id); setAcaPromoting(null); }
                        }}
                        title={ct('Mover pro time academy (5 jovens da Liga Academy)')}
                        style={{
                          padding: '6px 10px',
                          background: 'transparent',
                          color: 'var(--em-text)',
                          border: '1px solid var(--em-border)',
                          borderRadius: 3,
                          fontFamily: 'inherit',
                          fontWeight: 700,
                          fontSize: '0.74rem',
                          cursor: 'pointer',
                        }}
                      >
                        🏫
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => update({ academyFocus: focused ? null : p.id })}
                      title={focused
                        ? ct('Tirar do foco de treino (volta a evoluir na média)')
                        : ct('Marcar como foco de treino: +1 OVR garantido por split. Só 1 prospect pode estar em foco por vez.')}
                      style={{
                        padding: '6px 10px',
                        background: focused ? 'rgba(232,193,112,0.18)' : 'transparent',
                        color: focused ? 'var(--em-gold)' : 'var(--em-text)',
                        border: `1px solid ${focused ? 'var(--em-gold)' : 'var(--em-border)'}`,
                        borderRadius: 3,
                        fontFamily: 'inherit',
                        fontWeight: 700,
                        fontSize: '0.74rem',
                        cursor: 'pointer',
                      }}
                    >
                      {focused ? '★' : '☆'}
                    </button>
                    <button
                      type="button"
                      title={ct('Dispensar')}
                      onClick={() =>
                        askConfirm({
                          title: ct('Dispensar prospecto'),
                          message: `${ct('Dispensar')} ${p.nick}? ${ct('Não dá pra desfazer.')}`,
                          confirmLabel: ct('Dispensar'),
                          danger: true,
                          onConfirm: () => {
                            update({
                              academy: aca.filter((x) => x.id !== p.id),
                              academyFocus: save.academyFocus === p.id ? null : save.academyFocus,
                            });
                            if (promoting === p.id) setPromoting(null);
                          },
                        })
                      }
                      style={{
                        padding: '6px 8px',
                        background: 'transparent',
                        color: 'var(--em-muted)',
                        border: '1px solid var(--em-border)',
                        borderRadius: 3,
                        fontFamily: 'inherit',
                        fontSize: '0.74rem',
                        cursor: 'pointer',
                      }}
                    >
                      <CareerIcon name="trash" size={12} />
                    </button>
                  </div>

                  {promoting === p.id && squadFull && (
                    <div style={{ marginTop: 6, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--em-muted)', marginBottom: 4 }}>
                        {ct('Elenco cheio — sai do time:')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {save.squad.map((sg) => {
                          const f = findSigning(sg);
                          return (
                            <button
                              key={sg.playerId}
                              type="button"
                              onClick={() => promoteProspect(p.id, sg.playerId)}
                              style={{
                                padding: '4px 8px',
                                background: 'var(--em-panel-2)',
                                color: 'var(--em-text)',
                                border: '1px solid var(--em-border)',
                                borderRadius: 3,
                                fontFamily: 'inherit',
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                              }}
                            >
                              {f?.player.nick ?? sg.playerId}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setPromoting(null)}
                          style={{
                            padding: '4px 8px',
                            background: 'transparent',
                            color: 'var(--em-muted)',
                            border: '1px solid var(--em-border)',
                            borderRadius: 3,
                            fontFamily: 'inherit',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                          }}
                        >
                          cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Painel: time academy cheio → escolher quem sai pra dar lugar */}
                  {acaPromoting === p.id && acaTeamFull && (
                    <div style={{ marginTop: 6, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--em-muted)', marginBottom: 4 }}>
                        {ct('Time academy cheio — sai:')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {acaTeam.map((ap) => (
                          <button
                            key={ap.id}
                            type="button"
                            onClick={() => { promoteToAcaTeam(p.id, ap.id); setAcaPromoting(null); }}
                            style={{ padding: '4px 8px', background: 'var(--em-panel-2)', color: 'var(--em-text)', border: '1px solid var(--em-border)', borderRadius: 3, fontFamily: 'inherit', fontSize: '0.72rem', cursor: 'pointer' }}
                          >
                            {ap.nick} <span className={`role-pill ${ap.role}`} style={{ marginLeft: 2 }}>{ap.role}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setAcaPromoting(null)}
                          style={{ padding: '4px 8px', background: 'transparent', color: 'var(--em-muted)', border: '1px solid var(--em-border)', borderRadius: 3, fontFamily: 'inherit', fontSize: '0.72rem', cursor: 'pointer' }}
                        >
                          cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DashCard>

      {/* ===== OVERLAY: VETO + MATCH REAL ===== */}
      {fullStage && fullCtx && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(8,10,14,0.96)',
            zIndex: 1000,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 18px',
              borderBottom: '1px solid var(--em-border)',
              background: 'var(--em-panel)',
              position: 'sticky',
              top: 0,
              zIndex: 5,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800 }}>
                {fullStage === 'veto' ? ct('Veto de mapas') : ct('Partida ao vivo')}
              </span>
              <b style={{ fontSize: '0.92rem', color: 'var(--em-text)' }}>{fullCtx.phaseLabel}</b>
            </div>
            <button
              type="button"
              onClick={() => { setFullStage(null); setFullCtx(null); }}
              title={ct('Fechar')}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                color: 'var(--em-muted)',
                border: '1px solid var(--em-border)',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
            >
              ✕ {ct('Sair')}
            </button>
          </div>
          <div style={{ flex: 1, padding: '14px 18px' }}>
            {fullStage === 'veto' && (
              <VetoScreen
                teams={fullCtx.teams}
                userIdx={fullCtx.userIdx}
                rng={() => getRng()()}
                phaseLabel={fullCtx.phaseLabel}
                bestOf={3}
                onDone={onVetoDone}
              />
            )}
            {fullStage === 'match' && fullCtx.maps && (
              <MatchScreen
                teams={fullCtx.teams}
                maps={fullCtx.maps}
                userIdx={fullCtx.userIdx}
                rng={() => getRng()()}
                phaseLabel={fullCtx.phaseLabel}
                bestOf={3}
                onFinish={onFullMatchFinish}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

// ─── Card de Playoffs Academy ────────────────────────────────────────────────
function PlayoffCard({
  po,
  onPlay,
  onSim,
}: {
  po: AcademyPlayoffState;
  onPlay: (slot: 'semi0' | 'semi1' | 'final', oppId: string) => void;
  onSim: (slot: 'semi0' | 'semi1' | 'final') => void;
}) {
  const finalReady = !!(po.semis[0].result && po.semis[1].result);
  return (
    <DashCard
      title={`${ct('Playoffs Academy')} · Split ${po.split}`}
      info={po.champion ? `🏆 ${ct('Campeão')}: ${po.champion.name}` : ct('Mata-mata em andamento')}
      actions={
        po.champion ? (
          <span style={{ fontSize: '0.74rem', color: '#e8c170', fontWeight: 800 }}>
            🏆 {po.champion.tag}
          </span>
        ) : undefined
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'center' }}>
        <PlayoffColumn title={ct('Semifinais')}>
          <PlayoffMatchRow m={po.semis[0]} onPlay={(oppId) => onPlay('semi0', oppId)} onSim={() => onSim('semi0')} />
          <PlayoffMatchRow m={po.semis[1]} onPlay={(oppId) => onPlay('semi1', oppId)} onSim={() => onSim('semi1')} />
        </PlayoffColumn>
        <PlayoffColumn title={ct('Final')}>
          {po.final ? (
            <PlayoffMatchRow m={po.final} onPlay={(oppId) => onPlay('final', oppId)} onSim={() => onSim('final')} />
          ) : (
            <p style={{ margin: '8px 0', fontSize: '0.78rem', color: 'var(--em-muted)', fontStyle: 'italic', textAlign: 'center' }}>
              {finalReady ? ct('Preparando final…') : ct('Aguardando vencedores das semis')}
            </p>
          )}
        </PlayoffColumn>
        <PlayoffColumn title={ct('Campeão')}>
          {po.champion ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 12, background: 'rgba(232,193,112,0.10)', border: '1px solid rgba(232,193,112,0.45)', borderRadius: 6 }}>
              <div style={{ fontSize: '1.6rem' }}>🏆</div>
              <TeamBadge tag={po.champion.tag} colors={po.champion.colors} size={36} />
              <b style={{ fontSize: '0.92rem', color: 'var(--em-gold)', fontWeight: 900, textAlign: 'center' }}>
                {po.champion.name}
              </b>
              {po.champion.isUser && (
                <span style={{ fontSize: '0.7rem', color: '#5ed88a', fontWeight: 800, letterSpacing: '0.5px' }}>
                  ★ {ct('Você venceu o split!')}
                </span>
              )}
            </div>
          ) : (
            <p style={{ margin: '8px 0', fontSize: '0.78rem', color: 'var(--em-muted)', fontStyle: 'italic', textAlign: 'center' }}>
              {ct('Aguardando final')}
            </p>
          )}
        </PlayoffColumn>
      </div>
    </DashCard>
  );
}

function PlayoffColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 800, textAlign: 'center' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function PlayoffMatchRow({
  m,
  onPlay,
  onSim,
}: {
  m: AcademyPlayoffMatch;
  onPlay: (oppId: string) => void;
  onSim: () => void;
}) {
  const done = !!m.result;
  const winnerId = m.result?.winnerId;
  const userInvolved = m.a.isUser || m.b.isUser;
  const oppId = m.a.isUser ? m.b.id : m.a.id;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 10,
        background: 'var(--em-panel-2)',
        border: '1px solid var(--em-border)',
        borderRadius: 6,
      }}
    >
      <PlayoffSide seed={m.a} winner={winnerId === m.a.id} score={m.result?.score[0]} />
      <div style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textAlign: 'center', fontWeight: 700, letterSpacing: '1px' }}>VS</div>
      <PlayoffSide seed={m.b} winner={winnerId === m.b.id} score={m.result?.score[1]} />
      {!done && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {userInvolved ? (
            <>
              <button
                type="button"
                onClick={() => onPlay(oppId)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  background: 'var(--em-gold)',
                  color: '#1a1205',
                  border: 'none',
                  borderRadius: 3,
                  fontFamily: 'inherit',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                }}
              >
                🎮 {ct('Jogar')}
              </button>
              <button
                type="button"
                onClick={onSim}
                style={{
                  padding: '6px 8px',
                  background: 'transparent',
                  color: 'var(--em-text)',
                  border: '1px solid var(--em-border)',
                  borderRadius: 3,
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                }}
              >
                ⏩
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onSim}
              style={{
                flex: 1,
                padding: '6px 8px',
                background: 'var(--em-panel-2)',
                color: 'var(--em-text)',
                border: '1px solid var(--em-border)',
                borderRadius: 3,
                fontFamily: 'inherit',
                fontWeight: 700,
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              ⏩ {ct('Simular')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PlayoffSide({ seed, winner, score }: { seed: AcademyPlayoffSeed; winner: boolean; score?: number }) {
  const accent = winner ? '#5ed88a' : seed.isUser ? '#e8c170' : 'var(--em-text)';
  const club = ACADEMY_CLUBS.find((c) => c.id === seed.id);
  const parentLogo = club ? academyParentLogoUrl(club) : undefined;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {seed.isUser ? (
        <TeamBadge tag={seed.tag} colors={seed.colors} size={20} />
      ) : (
        <AcademyBadge
          parentLogoUrl={parentLogo}
          colors={seed.colors}
          fallbackTag={seed.tag}
          fallbackColors={seed.colors}
          size={20}
          showLabel={false}
        />
      )}
      <span style={{ flex: 1, fontSize: '0.78rem', color: accent, fontWeight: winner || seed.isUser ? 800 : 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {seed.name}
      </span>
      {typeof score === 'number' && (
        <b style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.86rem', color: accent, fontWeight: 800 }}>
          {score}
        </b>
      )}
    </div>
  );
}


function HudPill({ label, value, tone }: { label: string; value: string; tone: 'gold' | 'green' | 'neutral' }) {
  const colors: Record<typeof tone, { fg: string; bg: string; border: string }> = {
    gold:    { fg: '#e8c170', bg: 'rgba(232,193,112,0.14)', border: 'rgba(232,193,112,0.45)' },
    green:   { fg: '#5ed88a', bg: 'rgba(94,216,138,0.12)',  border: 'rgba(94,216,138,0.4)' },
    neutral: { fg: 'var(--em-text)', bg: 'var(--em-panel-2)', border: 'var(--em-border)' },
  };
  const c = colors[tone];
  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        padding: '5px 12px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        lineHeight: 1.1,
        minWidth: 64,
      }}
    >
      <span style={{ fontSize: '0.6rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      <b style={{ color: c.fg, fontSize: '0.84rem', fontWeight: 800, fontFamily: '"JetBrains Mono", monospace' }}>
        {value}
      </b>
    </div>
  );
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 800 };
const td: React.CSSProperties = { padding: '8px', textAlign: 'center' };

// Banner explicativo no DashCard Academia — explica como a evolução funciona.
// Mostra o que cada bônus contribui em OVR/split, e o estado atual da facility.
function EvoExplainer({ trainingLv }: { trainingLv: number }) {
  const trainingBonus = (trainingLv / 3).toFixed(2);
  const base = 2.1;
  const focusedMax = base + 1 + trainingLv / 3;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px',
        background: 'rgba(95,164,232,0.06)',
        border: '1px solid rgba(95,164,232,0.25)',
        borderRadius: 4,
        marginBottom: 10,
        fontSize: '0.78rem',
        color: 'var(--em-text)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.72rem', color: '#5fa4e8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        💡 {ct('Como evoluem')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <EvoLine
          icon="📊"
          label={ct('Base por split')}
          value={`+${base.toFixed(1)} OVR`}
          hint={ct('média (35% +3, 40% +2, 25% +1)')}
        />
        <EvoLine
          icon="★"
          label={ct('Em foco (★)')}
          value="+1 OVR"
          hint={ct('1 prospect por vez')}
          accent="#5ed88a"
        />
        <EvoLine
          icon="🏋️"
          label={`${ct('Centro de treino')} nv ${trainingLv}`}
          value={trainingLv === 0 ? '+0.00' : `+${trainingBonus} OVR`}
          hint={trainingLv === 0
            ? ct('Invista pra acelerar tudo')
            : trainingLv === 3 ? ct('MAX — sempre +1') : `${Math.round((trainingLv / 3) * 100)}% ${ct('chance de +1')}`}
          accent={trainingLv > 0 ? '#e8c170' : undefined}
        />
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--em-muted)', borderTop: '1px solid rgba(95,164,232,0.18)', paddingTop: 6, marginTop: 2 }}>
        <b style={{ color: 'var(--em-text)' }}>{ct('Máximo possível')}</b>: {ct('foco + treino max')} = <b style={{ color: '#5ed88a' }}>+{focusedMax.toFixed(1)} OVR/split</b> · {ct('cresce até o')} <b style={{ color: 'var(--em-gold)' }}>{ct('potencial')}</b> {ct('individual e para.')} {ct('Envelhecem 1 ano a cada 3 splits.')}
      </div>
    </div>
  );
}

function EvoLine({ icon, label, value, hint, accent }: { icon: string; label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '0.92rem' }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
        <span style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
          {label}
        </span>
        <b style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.84rem', color: accent ?? 'var(--em-text)', fontWeight: 800 }}>
          {value}
        </b>
        {hint && (
          <span style={{ fontSize: '0.66rem', color: 'var(--em-muted)', fontStyle: 'italic' }}>
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
