import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { playerOvr } from '../engine/ratings';
import { computeDisplay, mergeLines } from '../engine/match';
import {
  buildDraftForPlayer,
  fetchLobby,
  listOpenLobbies,
  lobbyApi,
  majorStandings,
  majorMatchKey,
  simulateOnlineDuel,
  simulateOnlineMajor,
  type LobbyState,
  type OnlineLineup,
  type OnlineMajorVetoState,
  type OnlinePace,
  type OnlineStrategy,
  type OnlineTactic,
  type OpenRoom,
  type PlaybackSpeed,
  type UltimateRuleset,
} from '../state/online';
import { aiChoice, applyVeto, currentStep, newVeto, vetoDone, vetoMaps } from '../engine/veto';
import { makeRng } from '../engine/rng';
import { pairingBestOf } from '../engine/swiss';
import { useLang } from '../state/i18n';
import { track } from '../state/track';
import type { Account } from '../state/account';
import { fetchMyRank, getLadder, reportResult, type MyRank, type RankRow, type ReportResult } from '../state/ranking';
import type { MapId, Pairing, Phase, Player, PlayerLine, SeriesResult, TeamSeason, Tournament, TournamentPool, TPlayer, TTeam } from '../types';
import { MAP_LABELS, MAP_POOL } from '../types';
import { Scoreboard } from './Scoreboard';
import { TournamentBracket } from './Bracket';
import { Flag, Loader, MapThumb, OvrBadge, PlayerAvatar, TeamBadge } from './ui';
import { logoForTeam } from '../data/media';
import { MatchBanner } from './flags';
import { Panel, Button } from './ds';
import { BackBar, Field, Seg, Check, onlineInputStyle } from './online/bits';

interface SelSeries {
  a: string; // teamId
  b: string;
  series: SeriesResult;
  completed?: boolean;
}

type MatchCenterFilter = 'all' | 'players' | 'mine' | 'finished';

interface Props {
  onBack: () => void;
  initialCode?: string; // código vindo da URL (/online/ABCDE): deep link / F5
  account?: Account | null; // conta logada (ranking salvo é da conta paga)
  casualOnly?: boolean; // modo casual: esconde ranqueada/MMR (salas com amigos)
  preset?: 'duel' | 'party'; // modo pré-selecionado ao abrir (1v1=duel, Major=party)
  forceRanked?: boolean; // entrada ranqueada (Ranked 1v1): salas já nascem valendo MMR
}

const NICK_KEY = 'rtm-nick';
const POLL_MS = 5000; // corte de custo: mais lento = menos invocações de função
const DEFAULT_STRATEGY: OnlineStrategy = {
  tactic: 'balanced', favoriteMap: 'mirage', banMap: 'nuke', pace: 'default', timeoutMap: 0, substituteAfterMap: false,
};
const DEFAULT_LINEUP: OnlineLineup = { captainId: '', reserveId: '' };
const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4, 8];
const VETO_ACTIONS = ['BAN', 'BAN', 'PICK', 'PICK', 'BAN', 'BAN'];

interface SessionProfile {
  points: number;
  wins: number;
  losses: number;
  titles: number;
  history: { label: string; result: string; points: number }[];
}

const EMPTY_SESSION_PROFILE: SessionProfile = { points: 0, wins: 0, losses: 0, titles: 0, history: [] };
const sessionDivision = (points: number) => points >= 2400 ? 'ELITE' : points >= 1400 ? 'OURO' : points >= 700 ? 'PRATA' : 'BRONZE';

function loadSessionProfile(): SessionProfile {
  try {
    const parsed = JSON.parse(sessionStorage.getItem('rtm-online-session-profile') ?? 'null');
    return parsed && typeof parsed.points === 'number' ? parsed : EMPTY_SESSION_PROFILE;
  } catch { return EMPTY_SESSION_PROFILE; }
}

function localVetoStep(veto: NonNullable<LobbyState['lobby']['veto']>, map: MapId, participants: string[]) {
  const action = VETO_ACTIONS[veto.step];
  const by = veto.turn ?? participants[veto.step % 2];
  const remaining = veto.remaining.filter((candidate) => candidate !== map);
  const next = {
    ...veto,
    step: veto.step + 1,
    remaining,
    bans: action === 'BAN' ? [...veto.bans, { map, by }] : veto.bans,
    picks: action === 'PICK' ? [...veto.picks, { map, by }] : veto.picks,
  };
  if (next.step >= VETO_ACTIONS.length) return { ...next, turn: undefined, deadline: undefined, maps: [...next.picks.map((pick) => pick.map), ...remaining] };
  return { ...next, turn: participants[next.step % 2], deadline: Date.now() + 20_000 };
}

const RULESET_OPTIONS: { id: UltimateRuleset; label: string; desc: string }[] = [
  { id: 'open', label: 'Livre', desc: 'Atuais e lendas, sem restrição.' },
  { id: 'current', label: 'Só 2026', desc: 'Apenas cartas do cenário atual.' },
  { id: 'legends', label: 'Só lendas', desc: 'Elencos históricos de todas as eras.' },
  { id: 'brworld', label: 'BR x Mundo', desc: 'Misture brasileiros e estrangeiros.' },
  { id: 'era', label: 'Multiverso', desc: 'Evite repetir a mesma era no cinco.' },
  { id: 'ovrcap', label: 'OVR 84', desc: 'Média acima de 84 recebe penalidade.' },
  { id: 'unique_country', label: 'Nações', desc: 'Não repita a nacionalidade.' },
  { id: 'gauntlet', label: 'Gauntlet', desc: 'Campo mais forte e química decisiva.' },
];

const TACTIC_OPTIONS: { id: OnlineTactic; label: string; desc: string }[] = [
  { id: 'balanced', label: 'Equilibrado', desc: 'Sem bônus ou risco adicional.' },
  { id: 'aggressive', label: 'Agressivo', desc: 'Mais força bruta, menos entrosamento.' },
  { id: 'tactical', label: 'Tático', desc: 'Coach e trabalho coletivo pesam mais.' },
  { id: 'controlled', label: 'Controle', desc: 'Consistência e execução disciplinada.' },
];
const SESSION_POINTS: Record<string, number> = { champion: 1000, runnerup: 650, semi: 420, quarters: 260, playoffs: 160, swiss: 80 };
const RULESET_OBJECTIVES: Record<UltimateRuleset, string> = {
  open: 'Vença 2 partidas no Major', current: 'Leve uma estrela de 2026 aos playoffs', legends: 'Classifique uma lenda aos playoffs',
  brworld: 'Vença com pelo menos 2 brasileiros', era: 'Chegue aos playoffs com múltiplas eras', ovrcap: 'Vença sem estourar a média 84',
  unique_country: 'Vença com cinco nacionalidades', gauntlet: 'Sobreviva às cinco rodadas suíças',
};

const MAP_GAP_UNITS = 2;
const seriesTimelineUnits = (series: SeriesResult) => series.maps.reduce((total, map, index) => total + map.roundLog.length + (index < series.maps.length - 1 ? MAP_GAP_UNITS : 0), 0);
// 8x = "instantâneo": replay limitado a ~1,2s, cai direto no placar/stats (dinâmica de stream)
const seriesDurationMs = (series: SeriesResult, speed: PlaybackSpeed) =>
  speed >= 8 ? Math.min(1200, seriesTimelineUnits(series) * 850 / speed) : seriesTimelineUnits(series) * 850 / speed;

function seriesLiveSnapshot(series: SeriesResult, elapsedMs: number, speed: PlaybackSpeed) {
  let units = Math.max(0, Math.floor(elapsedMs * speed / 850));
  let mapsA = 0;
  let mapsB = 0;
  for (let index = 0; index < series.maps.length; index++) {
    const map = series.maps[index];
    const rounds = map.roundLog.length;
    if (units <= rounds) {
      const round = Math.min(rounds, units);
      const log = map.roundLog.slice(0, round);
      return { done: false, interval: false, mapIndex: index, map: map.map, round, roundScore: [log.filter((side) => side === 0).length, log.filter((side) => side === 1).length] as [number, number], mapScore: [mapsA, mapsB] as [number, number] };
    }
    units -= rounds;
    if (map.winner === 0) mapsA++;
    else mapsB++;
    if (index < series.maps.length - 1 && units <= MAP_GAP_UNITS) {
      return { done: false, interval: true, mapIndex: index, map: map.map, round: rounds, roundScore: map.score, mapScore: [mapsA, mapsB] as [number, number] };
    }
    if (index < series.maps.length - 1) units -= MAP_GAP_UNITS;
  }
  const last = series.maps[series.maps.length - 1];
  return { done: true, interval: false, mapIndex: Math.max(0, series.maps.length - 1), map: last?.map, round: last?.roundLog.length ?? 0, roundScore: last?.score ?? [0, 0], mapScore: series.mapScore };
}

function OnlineMatchCenter({
  items,
  teamsById,
  humanByTeamId,
  viewerTeamId,
  elapsedMs,
  playbackSpeed,
  stageIsLive,
  filter,
  focusedTeamId,
  onFilter,
  onClearFocus,
  onOpen,
}: {
  items: { phase: string; pairing: Pairing }[];
  teamsById: Record<string, TTeam>;
  humanByTeamId: Record<string, string>;
  viewerTeamId?: string;
  elapsedMs: number;
  playbackSpeed: PlaybackSpeed;
  stageIsLive: boolean;
  filter: MatchCenterFilter;
  focusedTeamId: string | null;
  onFilter: (filter: MatchCenterFilter) => void;
  onClearFocus: () => void;
  onOpen: (item: { phase: string; pairing: Pairing }) => void;
}) {
  const filtered = items.filter((item) => {
    if (focusedTeamId && item.pairing.a !== focusedTeamId && item.pairing.b !== focusedTeamId) return false;
    if (filter === 'players') return Boolean(humanByTeamId[item.pairing.a] || humanByTeamId[item.pairing.b]);
    if (filter === 'mine') return Boolean(viewerTeamId && (item.pairing.a === viewerTeamId || item.pairing.b === viewerTeamId));
    if (filter === 'finished') return stageIsLive && seriesLiveSnapshot(item.pairing.result!, elapsedMs, playbackSpeed).done;
    return true;
  });
  return (
    <div className="ut-match-center">
      <div className="ut-mc-head">
        <div><span>MATCH CENTER</span><b>Partidas da rodada</b></div>
        <div className="ut-mc-filters">
          {focusedTeamId && <button className="focus" onClick={onClearFocus}>✕ {teamsById[focusedTeamId]?.tag}</button>}
          {([['all', 'Todas'], ['players', 'Jogadores'], ['mine', 'Minha'], ['finished', 'Encerradas']] as [MatchCenterFilter, string][]).map(([id, label]) => (
            <button key={id} className={filter === id ? 'active' : ''} onClick={() => onFilter(id)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="ut-mc-grid">
        {filtered.map((item) => {
          const a = teamsById[item.pairing.a];
          const b = teamsById[item.pairing.b];
          const live = seriesLiveSnapshot(item.pairing.result!, elapsedMs, playbackSpeed);
          const duration = seriesDurationMs(item.pairing.result!, playbackSpeed);
          const human = humanByTeamId[item.pairing.a] || humanByTeamId[item.pairing.b];
          const status = !stageIsLive ? 'AGUARDANDO' : live.done ? 'FINAL' : live.interval ? 'INTERVALO' : `AO VIVO · R${live.round}`;
          const score = live.done ? live.mapScore : live.roundScore;
          return (
            <button key={`${item.pairing.a}-${item.pairing.b}`} className={`ut-mc-card${live.done ? ' done' : stageIsLive ? ' live' : ''}${viewerTeamId && (item.pairing.a === viewerTeamId || item.pairing.b === viewerTeamId) ? ' mine' : ''}`} onClick={() => onOpen(item)}>
              <div className="ut-mc-status"><span>{status}</span><em>{stageIsLive && live.map ? MAP_LABELS[live.map] : item.pairing.label}</em>{human && <i>JOGADOR</i>}</div>
              <div className={`ut-mc-team${live.done && item.pairing.result!.winner === 1 ? ' loser' : ''}`}><TeamBadge tag={a.tag} colors={a.colors} size={24} logoUrl={a.logoUrl} /><span>{humanByTeamId[a.id] ?? a.name}</span><b>{score[0]}</b></div>
              <div className={`ut-mc-team${live.done && item.pairing.result!.winner === 0 ? ' loser' : ''}`}><TeamBadge tag={b.tag} colors={b.colors} size={24} logoUrl={b.logoUrl} /><span>{humanByTeamId[b.id] ?? b.name}</span><b>{score[1]}</b></div>
              <div className="ut-mc-progress"><i style={{ width: `${stageIsLive ? Math.min(100, elapsedMs / duration * 100) : 0}%` }} /></div>
            </button>
          );
        })}
        {filtered.length === 0 && <div className="ut-mc-empty">Nenhuma partida neste filtro.</div>}
      </div>
    </div>
  );
}

function OnlineQualificationBoard({ teams, humanByTeamId, focusedTeamId, onFocus }: { teams: TTeam[]; humanByTeamId: Record<string, string>; focusedTeamId: string | null; onFocus: (teamId: string | null) => void }) {
  const groups = [
    { id: 'advanced', label: 'CLASSIFICADOS', teams: teams.filter((team) => team.status === 'advanced').sort((a, b) => a.losses - b.losses || b.roundDiff - a.roundDiff) },
    { id: 'alive', label: 'EM DISPUTA', teams: teams.filter((team) => team.status === 'alive').sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.roundDiff - a.roundDiff) },
    { id: 'eliminated', label: 'ELIMINADOS', teams: teams.filter((team) => team.status === 'eliminated').sort((a, b) => b.wins - a.wins || b.roundDiff - a.roundDiff) },
  ];
  return (
    <div className="ut-qualification-board">
      {groups.map((group) => (
        <div key={group.id} className={`ut-q-group ${group.id}`}>
          <div className="ut-q-title"><b>{group.label}</b><span>{group.teams.length}</span></div>
          <div className="ut-q-teams">
            {group.teams.map((team) => <button key={team.id} className={focusedTeamId === team.id ? 'active' : ''} onClick={() => onFocus(focusedTeamId === team.id ? null : team.id)}><TeamBadge tag={team.tag} colors={team.colors} size={20} logoUrl={team.logoUrl} /><span>{humanByTeamId[team.id] ?? team.tag}</span><strong>{team.wins}-{team.losses}</strong></button>)}
            {group.teams.length === 0 && <small>—</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

function OnlineMajorVetoPanel({
  teams,
  participants,
  bestOf,
  veto,
  viewerNick,
  busy,
  onSelect,
  onClose,
}: {
  teams: [TTeam, TTeam];
  participants: [string | null, string | null];
  bestOf: 1 | 3 | 5;
  veto?: OnlineMajorVetoState;
  viewerNick: string;
  busy: boolean;
  onSelect: (map: MapId) => void;
  onClose: () => void;
}) {
  const current: OnlineMajorVetoState = useMemo(() => veto ?? { ...newVeto(bestOf), participants }, [bestOf, participants, veto]);
  const done = Boolean(current.maps?.length) || vetoDone(current);
  const step = done ? null : currentStep(current);
  const expectedPlayer = step && step.team !== -1 ? current.participants[step.team] : null;
  const isMyTurn = Boolean(expectedPlayer && expectedPlayer.toLowerCase() === viewerNick.toLowerCase());
  const isAiTurn = Boolean(step && step.team !== -1 && expectedPlayer === null);
  const canDriveAi = current.participants.some((player) => player?.toLowerCase() === viewerNick.toLowerCase());

  useEffect(() => {
    if (!isAiTurn || !canDriveAi || busy || !step) return;
    const seed = [...`${teams[0].id}|${teams[1].id}|${current.steps.length}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const timer = window.setTimeout(() => onSelect(aiChoice(current, teams, makeRng(seed))), 650);
    return () => window.clearTimeout(timer);
  }, [busy, canDriveAi, current, isAiTurn, onSelect, step, teams]);

  const mapState = new Map(current.steps.filter((entry) => entry.map).map((entry) => [entry.map!, entry]));
  const mdLabel = bestOf === 1 ? 'MD1' : bestOf === 5 ? 'MD5' : 'MD3';
  return (
    <div className="ut-live-overlay fade-in">
      <div className="ut-veto-dialog veto-layout">
        <div className="panel">
          <div className="panel-head">VETO DE MAPAS · {mdLabel}<span className="spacer" /><button className="btn small" onClick={onClose}>Fechar ✕</button></div>
          <div className="panel-body">
            <div className="veto-banner-wrap"><MatchBanner teamA={teams[0]} teamB={teams[1]} center={mdLabel} event="MAJOR ONLINE" sub="Veto oficial" /></div>
            {done ? (
              <div className="veto-action pick"><span className="va-icon">✓</span><span className="va-text"><b>Veto concluído</b><span>Aguardando o host iniciar a rodada.</span></span></div>
            ) : isMyTurn ? (
              <div className={`veto-action ${step!.action === 'ban' ? 'ban' : 'pick'}`}><span className="va-icon">{step!.action === 'ban' ? '🚫' : '✅'}</span><span className="va-text"><b>Sua vez</b><span>{step!.action === 'ban' ? 'BANIR um mapa' : 'ESCOLHER um mapa'}</span></span></div>
            ) : (
              <div className="veto-action waiting"><span className="va-icon">⏳</span><span className="va-text">{isAiTurn ? `${teams[step!.team as 0 | 1].name} está escolhendo…` : `Aguardando ${expectedPlayer}…`}</span></div>
            )}
            <div className={`veto-maps${isMyTurn ? (step!.action === 'ban' ? ' mode-ban' : ' mode-pick') : ''}`}>
              {MAP_POOL.map((map) => {
                const state = mapState.get(map);
                const selectable = isMyTurn && !state && !busy;
                return (
                  <div key={map} className={`mapcard${state ? ` dead ${state.action === 'ban' ? 'banned' : state.action === 'pick' ? 'picked' : 'decider'}` : ''}${selectable ? ' selectable' : ''}`} onClick={() => selectable && onSelect(map)}>
                    <MapThumb map={map} className="mapcard-img" />
                    {state && <span className={`mtag ${state.action === 'ban' ? 'banned' : state.action === 'pick' ? 'picked' : 'decider'}`}>{state.action === 'ban' ? '🚫 BAN' : state.action === 'pick' ? `✅ PICK ${teams[state.team as 0 | 1].tag}` : 'DECIDER'}</span>}
                    {selectable && <span className="map-hover-action">{step!.action === 'ban' ? '🚫 BANIR' : '✅ ESCOLHER'}</span>}
                    <div className="mname">{MAP_LABELS[map]}</div>
                  </div>
                );
              })}
            </div>
            <div className="veto-log">{current.steps.map((entry, index) => entry.map && <div key={`${entry.map}-${index}`}>{index + 1}. <b>{MAP_LABELS[entry.map]}</b> · {entry.action === 'ban' ? 'ban' : entry.action === 'pick' ? `pick ${teams[entry.team as 0 | 1].tag}` : 'decider'}</div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// textos das salas abertas, por idioma (sem mexer no i18n global)
const ONLINE_LOCAL = {
  pt: { title: 'ULTIMATE TEAM', lead: 'Monte seu cinco com estrelas atuais e lendas de todas as eras. Cada atleta é uma carta com atributos próprios; no duelo, as equipes se enfrentam em uma MD3 reproduzida round a round.', current: 'ATUAL', legend: 'LENDA', collection: 'Seleção de cartas', duelLive: 'Duelo ao vivo', demo: 'Testar agora contra um rival', demoNote: 'Demonstração local: fica apenas nesta sessão e não precisa de banco.', publicRoom: 'Sala aberta (qualquer um pode entrar)', openRooms: 'Salas abertas', noRooms: 'Nenhuma sala aberta agora. Crie a sua!', refresh: 'Atualizar', enter: 'Entrar', yourTeam: 'Seu Ultimate Team', emptySlot: 'vazio', rolesLabel: 'Funções', roleEntry: 'Entry', lock: '🔒 Trancar sala', unlock: '🔓 Destrancar sala', locked: 'Sala trancada', kick: 'Expulsar', kicked: 'Você foi removido da sala pelo host.', roomGone: 'A sala expirou ou foi encerrada. Crie ou entre em outra.', nextSeason: '🔁 Nova disputa (novas cartas)', season: 'Temporada', seasonWait: 'Esperando o host iniciar a próxima disputa…' },
  en: { title: 'ULTIMATE TEAM', lead: 'Build your five with current stars and legends from every era. Every athlete is a card with unique attributes; in duels, teams play a best-of-three shown round by round.', current: 'CURRENT', legend: 'LEGEND', collection: 'Card selection', duelLive: 'Live duel', demo: 'Play now against a rival', demoNote: 'Local demo: it only lasts for this session and needs no database.', publicRoom: 'Open room (anyone can join)', openRooms: 'Open rooms', noRooms: 'No open rooms right now. Create yours!', refresh: 'Refresh', enter: 'Join', yourTeam: 'Your Ultimate Team', emptySlot: 'empty', rolesLabel: 'Roles', roleEntry: 'Entry', lock: '🔒 Lock room', unlock: '🔓 Unlock room', locked: 'Room locked', kick: 'Kick', kicked: 'You were removed from the room by the host.', roomGone: 'The room expired or was closed. Create or join another one.', nextSeason: '🔁 New match (new cards)', season: 'Season', seasonWait: 'Waiting for the host to start the next match…' },
  es: { title: 'ULTIMATE TEAM', lead: 'Arma tu cinco con estrellas actuales y leyendas de todas las épocas. Cada atleta es una carta con atributos propios; en el duelo, los equipos juegan una MD3 ronda por ronda.', current: 'ACTUAL', legend: 'LEYENDA', collection: 'Selección de cartas', duelLive: 'Duelo en vivo', demo: 'Probar ahora contra un rival', demoNote: 'Demo local: solo dura esta sesión y no necesita base de datos.', publicRoom: 'Sala abierta (cualquiera puede entrar)', openRooms: 'Salas abiertas', noRooms: 'No hay salas abiertas ahora. ¡Crea la tuya!', refresh: 'Actualizar', enter: 'Entrar', yourTeam: 'Tu Ultimate Team', emptySlot: 'vacío', rolesLabel: 'Funciones', roleEntry: 'Entry', lock: '🔒 Bloquear sala', unlock: '🔓 Desbloquear sala', locked: 'Sala bloqueada', kick: 'Expulsar', kicked: 'El host te quitó de la sala.', roomGone: 'La sala expiró o fue cerrada. Crea o entra en otra.', nextSeason: '🔁 Nueva disputa (nuevas cartas)', season: 'Temporada', seasonWait: 'Esperando que el host inicie la próxima disputa…' },
};

export function OnlineScreen({ onBack, initialCode, account, casualOnly = false, preset, forceRanked = false }: Props) {
  const { t: tr, lang } = useLang();
  const OL = ONLINE_LOCAL[(lang as 'pt' | 'en' | 'es')] ?? ONLINE_LOCAL.pt;
  const [nick, setNick] = useState(() => {
    try {
      return localStorage.getItem(NICK_KEY) ?? '';
    } catch {
      return '';
    }
  });
  // ranking salvo (conta paga). myRank = posição/MMR do jogador; ladder = top.
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [rankFeedback, setRankFeedback] = useState<ReportResult | null>(null);
  const [ladder, setLadder] = useState<RankRow[] | null>(null);
  const paidRank = !!account?.paid;
  useEffect(() => { if (paidRank) void fetchMyRank(nick || account?.nick).then(setMyRank); }, [paidRank, nick, account?.nick]);
  const [codeInput, setCodeInput] = useState('');
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [mode, setMode] = useState<'duel' | 'party'>(preset ?? 'duel');
  const [pool, setPool] = useState<TournamentPool>('world');
  const [ruleset, setRuleset] = useState<UltimateRuleset>('open');
  const [isPublic, setIsPublic] = useState(true); // sala aberta a qualquer um por padrão
  const [ranked, setRanked] = useState(forceRanked); // sala ranqueada (conta MMR)
  const [draftRollouts, setDraftRollouts] = useState(2);
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [code, setCode] = useState('');
  const [state, setState] = useState<LobbyState | null>(null);
  const [myPicks, setMyPicks] = useState<string[]>([]);
  const [myRollouts, setMyRollouts] = useState<number[]>([0, 0, 0, 0, 0]);
  const [coachPick, setCoachPick] = useState('');
  const [myDone, setMyDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selMatch, setSelMatch] = useState<SelSeries | null>(null);
  const [duelReplayOpen, setDuelReplayOpen] = useState(true);
  const [duelFinished, setDuelFinished] = useState(false);
  const [localDemo, setLocalDemo] = useState(false);
  const [watchedMatches, setWatchedMatches] = useState<string[]>([]);
  const [activeReplayKey, setActiveReplayKey] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<OnlineStrategy>(DEFAULT_STRATEGY);
  const [lineup, setLineup] = useState<OnlineLineup>(DEFAULT_LINEUP);
  const [lineupConfirmed, setLineupConfirmed] = useState(false);
  const [vetoNow, setVetoNow] = useState(0);
  const [sessionProfile, setSessionProfile] = useState<SessionProfile>(loadSessionProfile);
  const [shareStatus, setShareStatus] = useState('');
  const [revealedRound, setRevealedRound] = useState(-1);
  const [majorVetoOpen, setMajorVetoOpen] = useState(false);
  const [broadcastNow, setBroadcastNow] = useState(0);
  const [matchCenterFilter, setMatchCenterFilter] = useState<MatchCenterFilter>('all');
  const [focusedTeamId, setFocusedTeamId] = useState<string | null>(null);
  // quantas fases do Major já foram reveladas (experiência rodada a rodada,
  // sem spoiler do campeão); persiste por sala para sobreviver a F5
  const [revealed, setRevealed] = useState(0);
  const pollRef = useRef<number | undefined>(undefined);
  const seedRef = useRef<number | null>(null); // detecta nova temporada (seed muda)
  const runSeedRef = useRef<number | null>(null); // revanche pode manter o draft e trocar apenas a simulacao
  const statusRef = useRef<string | null>(null);
  const stageRef = useRef<number | null>(null);
  const playbackSpeedRef = useRef<PlaybackSpeed | null>(null);
  const progressRef = useRef<string | null>(null);
  const recordedSeasonsRef = useRef(new Set<string>());

  // reveal por temporada: a chave inclui o seed, então cada Major tem o seu
  const seasonSeed = state?.lobby.seed ?? 0;
  const revealKey = `rtm-online-reveal-${code}-${seasonSeed}`;
  const watchedKey = `rtm-online-watched-${code}-${seasonSeed}`;
  useEffect(() => {
    if (!code) return;
    const restore = window.setTimeout(() => {
      try {
        setRevealed(Number(localStorage.getItem(revealKey) ?? '0') || 0);
        const savedWatched = JSON.parse(localStorage.getItem(watchedKey) ?? '[]');
        setWatchedMatches(Array.isArray(savedWatched) ? savedWatched.filter((v): v is string => typeof v === 'string') : []);
      } catch {
        /* sem storage */
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, [code, revealKey, watchedKey]);
  const markWatched = (key: string) => {
    setWatchedMatches((current) => {
      if (current.includes(key)) return current;
      const next = [...current, key];
      try { localStorage.setItem(watchedKey, JSON.stringify(next)); } catch { /* sem storage */ }
      return next;
    });
  };

  const saveNick = (n: string) => {
    setNick(n);
    try {
      localStorage.setItem(NICK_KEY, n);
    } catch {
      /* sem storage: o nick vale só nesta sessão */
    }
  };

  // polling do estado do lobby
  const refresh = useCallback(async () => {
    if (!code || localDemo || document.hidden) return; // demo local não chama backend
    const s = await fetchLobby(code);
    if (s === 'gone') {
      // a sala expirou/foi encerrada no servidor: volta pra entrada com aviso
      // (antes o jogador ficava pendurado numa tela que nunca atualizava)
      setCode('');
      setState(null);
      setMyPicks([]);
      setMyRollouts([0, 0, 0, 0, 0]);
      setMyDone(false);
      setError(OL.roomGone);
      return;
    }
    if (!s) return;
    const prevSeed = seedRef.current;
    const prevRunSeed = runSeedRef.current;
    const prevStatus = statusRef.current;
    const prevStage = stageRef.current;
    const prevPlaybackSpeed = playbackSpeedRef.current;
    const prevProgress = progressRef.current;
    const playbackSpeed = PLAYBACK_SPEEDS.includes(s.lobby.playback_speed ?? 1) ? (s.lobby.playback_speed ?? 1) : 1;
    const progress = `${s.lobby.stage ?? 0}|started:${s.lobby.stage_started_at ?? 0}|speed:${playbackSpeed}|vetos:${JSON.stringify(s.lobby.major_vetos ?? {})}|${s.players.map((p) => `${p.nick}:${p.ready_stage ?? -1}`).join(',')}`;
    // nova temporada: o host gerou um novo seed -> zera o draft local e recomeça
    if (prevSeed !== null && prevSeed !== s.lobby.seed) {
      setMyPicks([]);
      setMyDone(false);
      setCoachPick('');
      setStrategy(DEFAULT_STRATEGY);
      setLineup(DEFAULT_LINEUP);
      setLineupConfirmed(false);
      setRevealedRound(-1);
      setRevealed(0);
      setSelMatch(null);
      setWatchedMatches([]);
      setActiveReplayKey(null);
      setDuelReplayOpen(true);
    }
    const runSeed = s.lobby.run_seed ?? s.lobby.seed;
    if (prevRunSeed !== null && prevRunSeed !== runSeed) {
      setDuelReplayOpen(true);
      setDuelFinished(false);
      setSelMatch(null);
      setWatchedMatches([]);
      setActiveReplayKey(null);
      setRevealed(0);
    }
    seedRef.current = s.lobby.seed;
    runSeedRef.current = runSeed;
    statusRef.current = s.lobby.status;
    stageRef.current = s.lobby.stage ?? 0;
    playbackSpeedRef.current = playbackSpeed;
    progressRef.current = progress;
    // com o Major encerrado o estado é imutável: se nada mudou, NÃO re-seta o
    // state (evita re-simular o Major inteiro a cada poll). Mas segue detectando
    // a transição pra próxima temporada (seed/status diferentes).
    if (
      s.lobby.status === 'done' && s.lobby.mode === 'duel' &&
      prevSeed === s.lobby.seed && prevRunSeed === runSeed && prevStatus === 'done' &&
      prevStage === (s.lobby.stage ?? 0) && prevPlaybackSpeed === playbackSpeed
    ) return;
    if (
      s.lobby.status === 'done' && s.lobby.mode === 'party' &&
      prevSeed === s.lobby.seed && prevRunSeed === runSeed && prevStatus === 'done' && prevProgress === progress
    ) return;
    setState(s);
    const me = s.players.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
    if (!me) {
      // não estou mais na lista durante a espera = fui expulso pelo host
      if (s.lobby.status === 'waiting') {
        setCode('');
        setState(null);
        setMyPicks([]);
        setMyDone(false);
        setError(OL.kicked);
      }
      return;
    }
    if (me.done && !myDone) setMyDone(true);
    // catch-up: adota os picks do servidor apenas quando ele tem MAIS picks que
    // o local (reconexão após F5), nunca regredindo picks otimistas ainda não
    // confirmados. Funciona como restauração e como auto-correção de divergência.
    const serverPicks = Array.isArray(me.picks) ? me.picks : [];
    setMyPicks((local) => (serverPicks.length > local.length ? serverPicks : local));
    const serverRollouts = Array.isArray(me.rollouts) ? me.rollouts : [];
    setMyRollouts((local) => serverRollouts.some((value, index) => value > (local[index] ?? 0)) ? [...serverRollouts, 0, 0, 0, 0, 0].slice(0, 5) : local);
    if (me.coach_pick) setCoachPick((c) => c || me.coach_pick);
    if (me.strategy) setStrategy(me.strategy);
    if (me.lineup?.captainId && me.lineup?.reserveId) {
      setLineup(me.lineup);
      setLineupConfirmed(true);
    }
  }, [code, nick, myDone, localDemo, OL.kicked, OL.roomGone]);

  const lobbyDone = state?.lobby.status === 'done';
  useEffect(() => {
    if (!code || localDemo) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    // depois de 'done' o resultado é imutável (refresh não re-seta o state, então
    // não re-simula), mas seguimos com um poll lento pra detectar quando o host
    // inicia a próxima temporada.
    const syncMs = state?.lobby.status === 'veto' ? 1000 : lobbyDone ? 1500 : POLL_MS;
    pollRef.current = window.setInterval(refresh, syncMs);
    return () => { window.clearTimeout(initial); window.clearInterval(pollRef.current); };
  }, [code, refresh, lobbyDone, localDemo, state?.lobby.mode, state?.lobby.status]);

  useEffect(() => {
    if (state?.lobby.status !== 'veto') return;
    const id = window.setInterval(() => setVetoNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [state?.lobby.status]);

  useEffect(() => {
    if (!(state?.lobby.stage_started_at && state.lobby.stage_started_at > 0)) return;
    const update = () => setBroadcastNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const id = window.setInterval(update, 500);
    return () => { window.clearTimeout(initial); window.clearInterval(id); };
  }, [state?.lobby.stage_started_at]);

  // heartbeat: mantém a sala viva enquanto a aba está aberta. Ao fechar a aba
  // (cleanup), os pings param e o servidor fecha a sala por inatividade.
  useEffect(() => {
    if (!code || localDemo) return;
    const me = nick.trim();
    const ping = () => { if (!document.hidden) lobbyApi({ action: 'ping', code, nick: me }).catch(() => {}); };
    ping();
    const id = window.setInterval(ping, 45000); // corte de custo
    const leave = () => { if (me) lobbyApi({ action: 'leave', code, nick: me }).catch(() => {}); };
    window.addEventListener('beforeunload', leave);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('beforeunload', leave);
      leave(); // saída limpa ao sair da tela (migra host / libera a barreira coletiva)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, localDemo]);

  const startLocalDemo = () => {
    const playerNick = nick.trim() || 'Player';
    if (!nick.trim()) saveNick(playerNick);
    const seed = Math.floor(Math.random() * 2147483647);
    const rivalNicks = mode === 'party' ? ['Rival 1', 'Rival 2', 'Rival 3'] : ['Rival'];
    const rivals = rivalNicks.map((rivalNick, rivalIdx) => {
      const rivalSetup = buildDraftForPlayer(seed, pool, rivalNick, ruleset);
      return {
        nick: rivalNick,
        picks: rivalSetup.sources.map((source) =>
          [...source.players].sort((a, b) => playerOvr(b) - playerOvr(a))[0].id,
        ),
        coach_pick: [...rivalSetup.coachOptions].sort((a, b) => b.coach.rating - a.coach.rating)[0].id,
        done: true,
        ready_stage: 999,
        strategy: {
          tactic: (['aggressive', 'tactical', 'controlled'] as OnlineTactic[])[rivalIdx % 3],
          favoriteMap: MAP_POOL[rivalIdx % MAP_POOL.length],
          banMap: MAP_POOL[(rivalIdx + 3) % MAP_POOL.length],
        },
      };
    });
    setLocalDemo(true);
    setCode('LOCAL');
    setMyPicks([]);
    setMyRollouts([0, 0, 0, 0, 0]);
    setCoachPick('');
    setStrategy(DEFAULT_STRATEGY);
    setLineup(DEFAULT_LINEUP);
    setLineupConfirmed(false);
    setRevealedRound(-1);
    setMyDone(false);
    setDuelReplayOpen(true);
    setDuelFinished(false);
    setRevealed(0);
    setWatchedMatches([]);
    setActiveReplayKey(null);
    setState({
      lobby: { code: 'LOCAL', mode, host: playerNick, status: 'drafting', seed, run_seed: seed, pool, season: 1, stage: 0, stage_started_at: 0, ruleset, playback_speed: 1, draft_rollouts: draftRollouts, major_vetos: {} },
      players: [
        { nick: playerNick, picks: [], coach_pick: '', done: false, ready_stage: -1, strategy: DEFAULT_STRATEGY, lineup: DEFAULT_LINEUP, rollouts: [0, 0, 0, 0, 0], spectator: false },
        ...rivals,
      ],
    });
  };

  const create = async () => {
    if (!nick.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await lobbyApi({ action: 'create', nick: nick.trim(), mode, pool, isPublic, ranked: ranked && mode === 'duel', ruleset, draftRollouts });
      if (r.ok && r.code) {
        setCode(r.code);
        track('online_create', { mode, pool, public: isPublic, ranked });
      } else setError(r.error ?? tr('online.errCreate'));
    } catch {
      setError(tr('online.errServer'));
    }
    setBusy(false);
  };

  // matchmaking ranqueado: acha uma sala ranqueada de duelo aberta perto do meu MMR;
  // se não houver, cria uma pública ranqueada e espera um rival.
  const matchmake = async () => {
    if (!nick.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const rooms = await listOpenLobbies();
      const myMmr = myRank?.mmr ?? 1000;
      const mine = nick.trim().toLowerCase();
      const candidate = rooms
        .filter((r) => r.ranked && r.mode === 'duel' && r.players < r.max && r.host.toLowerCase() !== mine)
        .sort((a, b) => Math.abs((a.host_mmr ?? 1000) - myMmr) - Math.abs((b.host_mmr ?? 1000) - myMmr))[0];
      if (candidate) {
        track('online_matchmake', { joined: true });
        setBusy(false);
        await doJoin(candidate.code, false);
        return;
      }
      const r = await lobbyApi({ action: 'create', nick: nick.trim(), mode: 'duel', pool, isPublic: true, ranked: true, ruleset, draftRollouts });
      if (r.ok && r.code) { setCode(r.code); track('online_matchmake', { joined: false }); }
      else setError(r.error ?? tr('online.errCreate'));
    } catch {
      setError(tr('online.errServer'));
    }
    setBusy(false);
  };

  const join = () => doJoin(codeInput, joinAsSpectator);

  // lista de salas abertas (públicas) enquanto o jogador ainda não entrou numa.
  // Aba em segundo plano não consome API à toa (document.hidden).
  const loadRooms = useCallback(async () => {
    if (!nick.trim() || document.hidden) { return; }
    setOpenRooms(await listOpenLobbies());
  }, [nick]);
  useEffect(() => {
    if (code) return; // já está numa sala
    const initial = window.setTimeout(() => void loadRooms(), 0);
    const id = window.setInterval(loadRooms, 20000); // corte de custo
    return () => { window.clearTimeout(initial); window.clearInterval(id); };
  }, [code, loadRooms]);

  const doJoin = async (raw: string, spectator = false) => {
    const target = raw.trim().toUpperCase();
    if (!nick.trim() || !target || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await lobbyApi({ action: 'join', nick: nick.trim(), code: target, spectator });
      if (r.ok) {
        setCode(target);
        track('online_join', {});
      } else setError(r.error ?? tr('online.errJoin'));
    } catch {
      setError(tr('online.errServer'));
    }
    setBusy(false);
  };

  // deep link: ao abrir /online/<código>, pré-preenche e entra (se já tiver nick)
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoinedRef.current || !initialCode || localDemo || code) return;
    autoJoinedRef.current = true;
    setCodeInput(initialCode);
    if (nick.trim()) void doJoin(initialCode, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  // reflete a sala atual na URL (/online/<código>) pra compartilhar e sobreviver a F5
  useEffect(() => {
    if (localDemo) return;
    const inRoom = !!code && code !== 'LOCAL';
    const want = inRoom ? `/online/${code}` : '/online';
    if (window.location.pathname.toLowerCase() !== want.toLowerCase()) {
      window.history.replaceState(window.history.state, '', `${want}${window.location.search}`);
    }
  }, [code, localDemo]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    await lobbyApi({ action: 'start', nick: nick.trim(), code }).catch(() => {});
    setBusy(false);
    refresh();
  };

  const sendPicks = async (picks: string[], coach: string, done: boolean, plan: OnlineStrategy = strategy, selectedLineup: OnlineLineup = lineup, rollouts: number[] = myRollouts) => {
    if (localDemo) {
      setState((prev) => prev ? {
        ...prev,
        lobby: done && prev.lobby.mode === 'duel'
          ? {
              ...prev.lobby,
              status: 'veto',
              veto: { step: 0, remaining: [...MAP_POOL], bans: [], picks: [], turn: prev.lobby.host, deadline: Date.now() + 20_000 },
            }
          : { ...prev.lobby, status: done ? 'done' : 'drafting' },
        players: prev.players.map((p) => p.nick.toLowerCase() === nick.toLowerCase()
          ? { ...p, picks, coach_pick: coach, strategy: plan, lineup: selectedLineup, rollouts, done }
          : p),
      } : prev);
      return;
    }
    await lobbyApi({ action: 'pick', nick: nick.trim(), code, picks, coachPick: coach, strategy: plan, lineup: selectedLineup, rollouts, done }).catch(() => {});
  };

  const toggleLock = async () => {
    if (busy || !state) return;
    setBusy(true);
    await lobbyApi({ action: 'lock', nick: nick.trim(), code, locked: !state.lobby.locked }).catch(() => {});
    setBusy(false);
    refresh();
  };

  const kick = async (target: string) => {
    if (busy) return;
    setBusy(true);
    await lobbyApi({ action: 'kick', nick: nick.trim(), code, target }).catch(() => {});
    setBusy(false);
    refresh();
  };

  // host inicia a próxima temporada: novo sorteio (transferências) e novo Major
  const nextSeason = async (keepRoster = false) => {
    if (busy) return;
    if (localDemo) {
      if (keepRoster) {
        const nextRunSeed = Math.floor(Math.random() * 2147483647);
        setWatchedMatches([]);
        setActiveReplayKey(null);
        setDuelReplayOpen(true);
        setDuelFinished(false);
        setRevealed(0);
        setState((prev) => prev ? {
          ...prev,
          lobby: prev.lobby.mode === 'duel'
            ? { ...prev.lobby, run_seed: nextRunSeed, season: (prev.lobby.season ?? 1) + 1, stage: 0, status: 'veto', veto: { step: 0, remaining: [...MAP_POOL], bans: [], picks: [], turn: prev.lobby.host, deadline: Date.now() + 20_000 } }
            : { ...prev.lobby, run_seed: nextRunSeed, season: (prev.lobby.season ?? 1) + 1, stage: 0, stage_started_at: 0, status: 'done', major_vetos: {} },
          players: prev.players.map((p, i) => ({ ...p, ready_stage: i === 0 ? -1 : 999 })),
        } : prev);
        return;
      }
      startLocalDemo();
      return;
    }
    setBusy(true);
    await lobbyApi({ action: 'nextSeason', nick: nick.trim(), code, keepRoster }).catch(() => {});
    setBusy(false);
    refresh();
  };

  // o MEU sorteio (cada jogador recebe elencos diferentes, por seed + nick)
  // chaves de CONTEÚDO: o polling traz um objeto `state` novo a cada 1-5s, mas a
  // simulação só muda quando os inputs mudam. Memoizar por [state] re-simulava
  // toda hora -> a série ganhava nova identidade -> o replay reiniciava no round 0
  // (bug do "0x0 que só começa depois de minutos", pior no PC). Estas chaves só
  // mudam quando algo relevante muda, mantendo a série estável durante o replay.
  const setupKey = state ? `${state.lobby.status !== 'waiting'}|${state.lobby.seed}|${state.lobby.pool}|${state.lobby.ruleset ?? 'open'}|${nick}|${myRollouts}` : '';
  const simKey = state
    ? [state.lobby.status, state.lobby.mode, state.lobby.run_seed, state.lobby.pool, state.lobby.ruleset ?? 'open', state.lobby.stage ?? 0,
       ...state.players.map((p) => `${p.nick}:${(p.picks ?? []).join('.')}:${p.coach_pick ?? ''}:${JSON.stringify(p.strategy ?? {})}:${JSON.stringify(p.lineup ?? {})}:${(p.rollouts ?? []).join('.')}`)].join('|')
    : '';
  const setup = useMemo(
    () => (state && state.lobby.status !== 'waiting' ? buildDraftForPlayer(state.lobby.seed, state.lobby.pool, nick, state.lobby.ruleset ?? 'open', myRollouts) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setupKey],
  );
  const major = useMemo(
    () => (state && state.lobby.status === 'done' && state.lobby.mode === 'party' ? simulateOnlineMajor(state) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [simKey],
  );
  const duel = useMemo(
    () => (state && state.lobby.status === 'done' && state.lobby.mode === 'duel' ? simulateOnlineDuel(state) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [simKey],
  );
  const meLobbyPlayer = state?.players.find((player) => player.nick.toLowerCase() === nick.toLowerCase());
  const isSpectator = meLobbyPlayer?.spectator === true;

  useEffect(() => {
    if (major || duel) track('online_done', { players: state?.players.length ?? 0, mode: state?.lobby.mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!major, !!duel]);

  useEffect(() => {
    if (!state || state.lobby.status !== 'done' || isSpectator) return;
    const key = `${state.lobby.code}-${state.lobby.season ?? 1}-${state.lobby.run_seed ?? state.lobby.seed}`;
    if (recordedSeasonsRef.current.has(key)) return;
    let won = false;
    let title = false;
    let points = 0;
    let result = '';
    if (duel) {
      const myIndex = duel.nicks.findIndex((playerNick) => playerNick.toLowerCase() === nick.toLowerCase());
      if (myIndex < 0) return;
      won = duel.series.winner === myIndex;
      points = won ? 180 : 70;
      result = won ? 'Vitória no duelo' : 'Derrota no duelo';
    } else if (major) {
      const human = major.humans.find((entry) => entry.nick.toLowerCase() === nick.toLowerCase());
      if (!human) return;
      won = human.wins > human.losses;
      title = human.placement === 'champion';
      points = SESSION_POINTS[human.placement] ?? 80;
      result = title ? 'Campeão do Major' : `${human.wins}V-${human.losses}D no Major`;
    } else return;
    const timer = window.setTimeout(() => {
      recordedSeasonsRef.current.add(key);
      // ranking salvo (conta paga, só em sala RANQUEADA): manda o resultado e atualiza meu MMR
      if (account?.paid && state.lobby.ranked) void reportResult(won, nick || account.nick).then((r) => { if (r) { setRankFeedback(r); if (r.me) setMyRank(r.me); } });
      setSessionProfile((current) => {
        const next = {
          points: current.points + points,
          wins: current.wins + (won ? 1 : 0),
          losses: current.losses + (won ? 0 : 1),
          titles: current.titles + (title ? 1 : 0),
          history: [{ label: `Temporada ${state.lobby.season ?? 1}`, result, points }, ...current.history].slice(0, 8),
        };
        try { sessionStorage.setItem('rtm-online-session-profile', JSON.stringify(next)); } catch { /* sessão sem storage */ }
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [duel, isSpectator, major, nick, state]);

  // some o feedback de ranking depois de alguns segundos
  useEffect(() => {
    if (!rankFeedback) return;
    const t = window.setTimeout(() => setRankFeedback(null), 6500);
    return () => window.clearTimeout(t);
  }, [rankFeedback]);

  const rankToast = rankFeedback ? createPortal(
    <div className="rtm-rank-toast" onClick={() => setRankFeedback(null)} role="status">
      <div className={`rtm-rank-delta ${rankFeedback.delta >= 0 ? 'up' : 'down'}`}>{rankFeedback.delta >= 0 ? '+' : ''}{rankFeedback.delta}</div>
      <div className="rtm-rank-body">
        <b>{
          rankFeedback.placedNow ? `🎯 Colocação concluída · ${rankFeedback.division}`
            : rankFeedback.placing ? '🎯 Partida de colocação'
              : rankFeedback.promoted ? `⬆ Promovido pra ${rankFeedback.division}!`
                : rankFeedback.demoted ? `⬇ Caiu pra ${rankFeedback.division}`
                  : rankFeedback.delta >= 0 ? 'Vitória ranqueada' : 'Derrota ranqueada'
        }</b>
        <span>MMR {rankFeedback.before} → {rankFeedback.after}{rankFeedback.placing && !rankFeedback.placedNow ? ` · faltam ${rankFeedback.placementLeft} de colocação` : ` · ${rankFeedback.division}`}</span>
      </div>
    </div>, document.body) : null;

  const pickPlayer = (playerId: string) => {
    if (myDone || !setup) return;
    const picks = [...myPicks, playerId];
    setMyPicks(picks);
    sendPicks(picks, coachPick, false);
  };

  const rerollCurrentPack = () => {
    if (myDone || myPicks.length >= 5) return;
    const round = myPicks.length;
    const limit = state?.lobby.draft_rollouts ?? draftRollouts;
    if ((myRollouts[round] ?? 0) >= limit) return;
    const next = myRollouts.map((value, index) => index === round ? value + 1 : value);
    setMyRollouts(next);
    setRevealedRound(-1);
    sendPicks(myPicks, coachPick, false, strategy, lineup, next);
  };

  const pickCoach = (teamId: string) => {
    if (myDone) return;
    setCoachPick(teamId);
    sendPicks(myPicks, teamId, false);
  };

  const confirmStrategy = () => {
    if (myDone) return;
    // feedback explícito em vez de falhar em silêncio
    if (!coachPick) { setError('Escolha um coach antes de confirmar.'); return; }
    if (!lineup.captainId || !lineup.reserveId) { setError('Defina capitão e reserva.'); return; }
    if (strategy.favoriteMap === strategy.banMap) { setError('Mapa favorito e banido não podem ser o mesmo.'); return; }
    // avisa sem travar (em alguns formatos pode ser impossível ter os dois)
    const roles = new Set(pickedCards.map((c) => c.player.role));
    const missing = [!roles.has('AWP') ? 'AWPer' : '', !roles.has('IGL') ? 'IGL' : ''].filter(Boolean);
    if (missing.length && !window.confirm(`Seu cinco está sem ${missing.join(' e ')}. Isso enfraquece bastante o time. Confirmar mesmo assim?`)) return;
    setError('');
    setMyDone(true);
    sendPicks(myPicks, coachPick, true, strategy, lineup);
  };

  const shareResult = async (text: string) => {
    try {
      if (navigator.share) await navigator.share({ title: 'Road to Major · Ultimate Team', text });
      else await navigator.clipboard.writeText(text);
      setShareStatus('Resultado pronto para compartilhar');
    } catch { setShareStatus('Não foi possível compartilhar agora'); }
  };

  // ---------- telas ----------

  if (!code) {
    return (
      <div className="fade-in" style={{ maxWidth: 760, margin: '0 auto' }}>
        <BackBar onExit={onBack} />
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <span style={{ fontSize: '11px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--rtm-blue-bright)', fontWeight: 800 }}>ROAD TO MAJOR</span>
          <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--rtm-font-cond)', fontSize: '32px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>{OL.title}</h1>
          <p style={{ color: 'var(--rtm-dim)', fontSize: '14px', maxWidth: '520px', margin: '8px auto 0', lineHeight: 1.55 }}>{OL.lead}</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '14px' }}>
            {['✦ 2026 + HISTÓRIA', '5 CARTAS + COACH', 'MD3 ROUND A ROUND'].map((feat) => (
              <span key={feat} style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.6px', color: 'var(--rtm-dim)', padding: '4px 11px', borderRadius: 'var(--rtm-radius-pill)', border: '1px solid var(--rtm-border)' }}>{feat}</span>
            ))}
          </div>
        </div>

        <Panel title="Sua identidade" accent="blue" style={{ marginBottom: '16px' }}>
          <Field label={tr('online.yourNick')} style={{ marginBottom: 0 }}>
            <input value={nick} maxLength={20} placeholder="ex: fallenzera" onChange={(e) => saveNick(e.target.value)} style={onlineInputStyle} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '14px', flexWrap: 'wrap' }}>
            <Button variant="gold" size="big" onClick={startLocalDemo}>▶ {OL.demo}</Button>
            <span style={{ flex: 1, minWidth: '180px', fontSize: '12px', color: 'var(--rtm-dim)', lineHeight: 1.45 }}>{OL.demoNote}</span>
          </div>
        </Panel>

            {!casualOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', margin: '0 0 14px', padding: '14px 16px', borderRadius: 'var(--rtm-radius)', background: 'var(--rtm-bg-deep)', border: '1px solid var(--rtm-border-soft)' }}>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--rtm-dim)', fontWeight: 700 }}>Divisão da sessão</div>
                <div style={{ fontFamily: 'var(--rtm-font-cond)', fontWeight: 800, fontSize: '20px', color: 'var(--rtm-gold)' }}>{sessionDivision(sessionProfile.points)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--rtm-font-cond)', fontWeight: 800, fontSize: '22px', color: 'var(--rtm-text-strong)', fontVariantNumeric: 'tabular-nums' }}>{sessionProfile.points}</div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--rtm-dim)', fontWeight: 700 }}>pts</div>
              </div>
              <div style={{ flex: 1, minWidth: '150px', fontSize: '12px', color: 'var(--rtm-dim)' }}>
                {sessionProfile.wins} vitórias · {sessionProfile.losses} derrotas · {sessionProfile.titles} títulos
                {sessionProfile.history.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {sessionProfile.history.slice(0, 3).map((entry) => (
                      <span key={`${entry.label}-${entry.result}`} style={{ fontSize: '11px', color: 'var(--rtm-faint)', padding: '2px 8px', borderRadius: 'var(--rtm-radius-pill)', border: '1px solid var(--rtm-border-soft)' }}>{entry.label}: {entry.result} (+{entry.points})</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}

            {/* RANKING ONLINE SALVO (conta vitalícia) */}
            {!casualOnly && (
            <Panel
              title="🏆 Ranking online"
              accent="gold"
              style={{ marginBottom: '16px' }}
              actions={<Button variant="ghost" size="sm" onClick={async () => { if (ladder) { setLadder(null); } else { setLadder((await getLadder()).ladder); } }}>{ladder ? 'Fechar ladder' : 'Ver ladder'}</Button>}
            >
              {paidRank ? (
                myRank ? (
                  <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span><b style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '22px', color: 'var(--rtm-gold)' }}>{myRank.mmr}</b> <span style={{ fontSize: '12px', color: 'var(--rtm-dim)' }}>MMR</span></span>
                    <span style={{ color: 'var(--rtm-text-strong)', fontWeight: 700 }}>{myRank.division}</span>
                    <span style={{ fontSize: '12px', color: 'var(--rtm-dim)' }}>#{myRank.rank} no mundo</span>
                    <span style={{ fontSize: '12px', color: 'var(--rtm-dim)' }}>{myRank.wins}V · {myRank.losses}D · pico {myRank.peak}</span>
                  </div>
                ) : <span style={{ fontSize: '13px', color: 'var(--rtm-dim)' }}>Jogue uma partida online pra entrar no ranking.</span>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--rtm-dim)', lineHeight: 1.5 }}>O <b style={{ color: 'var(--rtm-text)' }}>ranking salvo</b> é da conta vitalícia. Jogue à vontade de graça; pra valer pontos no ladder, crie a conta na tela inicial.</span>
              )}
              {ladder && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {ladder.length === 0 && <span style={{ fontSize: '13px', color: 'var(--rtm-dim)' }}>Ladder ainda vazio. Seja o primeiro.</span>}
                  {ladder.slice(0, 10).map((r) => (
                    <div key={r.rank} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '5px', background: r.nick === (nick || account?.nick) ? 'rgba(67,130,182,.14)' : (r.rank % 2 ? 'var(--rtm-row-b)' : 'var(--rtm-row-a)') }}>
                      <span style={{ fontFamily: 'var(--rtm-font-cond)', fontWeight: 800, width: 22, color: r.rank <= 3 ? 'var(--rtm-gold)' : 'var(--rtm-faint)' }}>{r.rank}</span>
                      <b style={{ flex: 1, fontSize: '13px', color: 'var(--rtm-text-strong)' }}>{r.nick}</b>
                      <span style={{ fontSize: '12px', color: 'var(--rtm-dim)' }}>{r.division}</span>
                      <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--rtm-gold)' }}>{r.mmr}</b>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            )}

            <Panel title="Regra do evento" accent="blue" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
                {RULESET_OPTIONS.map((option) => {
                  const on = ruleset === option.id;
                  return (
                    <button key={option.id} type="button" onClick={() => setRuleset(option.id)} style={{ textAlign: 'left', cursor: 'pointer', padding: '11px 13px', borderRadius: 'var(--rtm-radius)', border: `1px solid ${on ? 'var(--rtm-blue-bright)' : 'var(--rtm-border-soft)'}`, background: on ? 'rgba(67,130,182,.14)' : 'var(--rtm-bg-deep)' }}>
                      <b style={{ display: 'block', fontFamily: 'var(--rtm-font-cond)', fontSize: '15px', fontWeight: 700, color: on ? 'var(--rtm-blue-bright)' : 'var(--rtm-text-strong)' }}>{option.label}</b>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--rtm-dim)', marginTop: '3px', lineHeight: 1.4 }}>{option.desc}</span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            {!casualOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', margin: '0 0 16px', padding: '16px 18px', borderRadius: 'var(--rtm-radius)', background: 'linear-gradient(120deg, rgba(216,169,67,.16), rgba(13,17,22,.4))', border: '1px solid var(--rtm-gold-soft)' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <b style={{ display: 'block', fontFamily: 'var(--rtm-font-cond)', fontSize: '17px', fontWeight: 800, color: 'var(--rtm-gold)' }}>⚔️ Partida ranqueada</b>
                <span style={{ fontSize: '12px', color: 'var(--rtm-dim)', lineHeight: 1.45 }}>Acha um rival de MMR parecido e vale pro ladder da temporada{account?.paid ? '' : ' (no grátis o MMR não persiste)'}.</span>
              </div>
              <Button variant="gold" onClick={matchmake} disabled={!nick.trim() || busy}>{busy ? '…' : 'Jogar ranqueada'}</Button>
            </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <Panel title={tr('online.createRoom')} accent="gold">
                <Field label="Modo">
                  <Seg accent="gold" value={mode} onChange={(id) => setMode(id as 'duel' | 'party')} options={[{ id: 'duel', label: tr('online.modeDuel') }, { id: 'party', label: tr('online.modeParty') }]} />
                </Field>
                <Field label="Coleção">
                  <Seg accent="gold" value={pool} onChange={(id) => setPool(id as 'world' | 'br')} options={[{ id: 'world', label: tr('online.poolWorld') }, { id: 'br', label: tr('online.poolBr') }]} />
                </Field>
                <Field label="Rerolls por rodada" hint="O host define quantas novas coleções cada jogador pode abrir.">
                  <input type="number" min={0} max={5} value={draftRollouts} onChange={(event) => setDraftRollouts(Math.max(0, Math.min(5, Number(event.target.value) || 0)))} style={onlineInputStyle} />
                </Field>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                  <Check checked={isPublic} onChange={setIsPublic}>{OL.publicRoom}</Check>
                  {!casualOnly && mode === 'duel' && (
                    <Check checked={ranked} onChange={setRanked}>🏆 Ranqueada (conta pro ladder)</Check>
                  )}
                </div>
                <Button variant="gold" style={{ width: '100%' }} onClick={create} disabled={!nick.trim() || busy}>
                  {busy ? tr('online.creating') : tr('online.createRoom')}
                </Button>
              </Panel>
              <Panel title={tr('online.joinWithCode')} accent="blue">
                <Field label={tr('online.roomCode')}>
                  <input
                    value={codeInput}
                    maxLength={5}
                    placeholder="ex: K7KPQ"
                    style={{ ...onlineInputStyle, textTransform: 'uppercase', letterSpacing: 4, fontFamily: 'var(--rtm-font-cond)', fontSize: 18 }}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && join()}
                  />
                </Field>
                <Button variant="primary" style={{ width: '100%' }} onClick={join} disabled={!nick.trim() || !codeInput.trim() || busy}>
                  {busy ? tr('online.joining') : tr('online.joinRoom')}
                </Button>
                <div style={{ marginTop: '10px' }}>
                  <Check checked={joinAsSpectator} onChange={setJoinAsSpectator}>Entrar como espectador</Check>
                </div>
              </Panel>
            </div>

            {/* salas abertas: entra em qualquer uma sem precisar de código */}
            <Panel
              title={OL.openRooms}
              accent="blue"
              actions={<Button variant="ghost" size="sm" onClick={loadRooms} disabled={!nick.trim()}>↻ {OL.refresh}</Button>}
            >
              {openRooms.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--rtm-dim)' }}>{OL.noRooms}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {openRooms.map((r) => {
                    const full = r.players >= r.max;
                    return (
                    <div key={r.code} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 16px', borderRadius: '10px', background: 'var(--rtm-panel-2)', border: '1px solid var(--rtm-border-soft)', opacity: full ? 0.75 : 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '94px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: full ? 'var(--rtm-faint)' : 'var(--rtm-green-bright)', boxShadow: full ? 'none' : '0 0 7px var(--rtm-green-bright)' }} />
                        <span style={{ fontSize: '11px', fontWeight: 700, color: full ? 'var(--rtm-faint)' : 'var(--rtm-green-bright)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{full ? 'Cheia' : 'Aguardando'}</span>
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--rtm-font-cond)', fontWeight: 700, fontSize: '17px', color: 'var(--rtm-text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Sala de {r.host}{r.ranked && <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.5px', color: 'var(--rtm-gold)', background: 'rgba(216,169,67,.16)', border: '1px solid var(--rtm-gold-soft)', padding: '1px 6px', borderRadius: '4px' }}>RANQUEADA</span>}</div>
                        <div style={{ fontSize: '12px', color: 'var(--rtm-dim)' }}>{r.mode === 'duel' ? tr('online.modeDuel') : tr('online.modeParty')} · {r.pool === 'br' ? '🇧🇷 GC' : '🌍 Mundial'}{r.ranked && r.host_mmr != null ? ` · ${r.host_mmr} MMR` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: '64px' }}>
                        <div style={{ fontFamily: 'var(--rtm-font-cond)', fontWeight: 800, fontSize: '18px', color: full ? 'var(--rtm-faint)' : 'var(--rtm-text-strong)', fontVariantNumeric: 'tabular-nums' }}>{r.players}/{r.max}</div>
                        <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', marginTop: '2px' }}>
                          {Array.from({ length: r.max }).map((_, i) => <span key={i} style={{ width: '7px', height: '7px', borderRadius: '2px', background: i < r.players ? 'var(--rtm-blue-bright)' : 'var(--rtm-panel-3)' }} />)}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => doJoin(r.code, true)}>Assistir</Button>
                      <Button variant="gold" size="sm" disabled={busy || full} onClick={() => doJoin(r.code, false)}>{OL.enter}</Button>
                    </div>
                    );
                  })}
                </div>
              )}
            </Panel>
            {error && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--rtm-radius)', background: 'rgba(226,90,90,.12)', border: '1px solid var(--rtm-red, #e25a5a)', color: 'var(--rtm-red-bright, #e88)', fontSize: '13px' }} role="alert">
                {error}
              </div>
            )}
      </div>
    );
  }

  if (!state) {
    return <Loader text={`${tr('online.connecting')} ${code}`} />;
  }

  const isHost = state.lobby.host.toLowerCase() === nick.toLowerCase();
  const activePlayers = state.players.filter((player) => !player.spectator);
  const spectators = state.players.filter((player) => player.spectator);
  const playbackSpeed = state.lobby.playback_speed ?? 1;
  const changePlaybackSpeed = async (speed: PlaybackSpeed) => {
    if (!isHost || speed === playbackSpeed) return;
    setError('');
    setState((prev) => prev ? { ...prev, lobby: { ...prev.lobby, playback_speed: speed } } : prev);
    if (localDemo) return;
    const result = await lobbyApi({ action: 'setPlaybackSpeed', nick: nick.trim(), code, speed }).catch(() => null);
    if (!result?.ok) {
      setError(result?.error ?? 'Não foi possível alterar a velocidade da sala.');
      await refresh();
    }
  };
  const submitVetoMap = async (map: MapId) => {
    const veto = state.lobby.veto;
    if (!veto || veto.turn?.toLowerCase() !== nick.toLowerCase() || !veto.remaining.includes(map) || busy) return;
    setBusy(true);
    if (localDemo) {
      setState((prev) => {
        if (!prev?.lobby.veto) return prev;
        const participants = prev.players.filter((player) => !player.spectator).map((player) => player.nick);
        let nextVeto = localVetoStep(prev.lobby.veto, map, participants);
        // resolve TODOS os passos consecutivos da IA (não só um): se o host não
        // for o índice 0 dos participantes, um único auto-step travava o veto
        let guard = 0;
        while (!nextVeto.maps && nextVeto.turn?.toLowerCase() !== nick.toLowerCase() && nextVeto.remaining.length && guard++ < 8) {
          nextVeto = localVetoStep(nextVeto, nextVeto.remaining[0], participants);
        }
        return { ...prev, lobby: { ...prev.lobby, veto: nextVeto, status: nextVeto.maps ? 'done' : 'veto' } };
      });
      setBusy(false);
      return;
    }
    await lobbyApi({ action: 'vetoAction', nick: nick.trim(), code, map }).catch(() => null);
    await refresh();
    setBusy(false);
  };
  // sala de espera
  if (state.lobby.status === 'waiting') {
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 560, margin: '30px auto' }}>
          <div className="panel-head">
            {tr('online.roomLabel')} {state.lobby.mode === 'duel' ? tr('online.roomDuel') : tr('online.roomParty')}
            <span className="spacer" />
            <button className="btn ghost" onClick={onBack}>
              {tr('common.exit')}
            </button>
          </div>
          <div className="panel-body center">
            <div className="muted small">{tr('online.shareCode')}</div>
            <div className="lobby-code" onClick={() => navigator.clipboard?.writeText(code)} title={tr('online.clickToCopy')}>
              {code}
            </div>
            <button
              className="btn ghost small"
              style={{ marginTop: 6 }}
              onClick={async () => {
                const link = `${window.location.origin}/online/${code}`;
                try {
                  if (navigator.share) await navigator.share({ title: 'Road to Major · Ultimate Team', text: 'Bora jogar?', url: link });
                  else await navigator.clipboard.writeText(link);
                  setShareStatus(tr('online.linkCopied'));
                } catch { /* cancelado */ }
              }}
            >
              🔗 {tr('online.copyLink')}
            </button>
            {shareStatus && <div className="muted small">{shareStatus}</div>}
            <div className="muted small" style={{ marginBottom: 16 }}>
              {state.lobby.pool === 'br' ? tr('online.poolBrLong') : tr('online.poolWorldLong')} · {state.lobby.draft_rollouts ?? 2} rerolls por rodada · {tr('online.clickCodeToCopy')}
            </div>
            <div className="lobby-players">
              {activePlayers.map((p) => (
                <span key={p.nick} className="lobby-player">
                  {p.nick === state.lobby.host ? '★ ' : '• '}
                  {p.nick}
                  {isHost && p.nick !== state.lobby.host && (
                    <button className="kick-btn" title={OL.kick} disabled={busy} onClick={() => kick(p.nick)}>✕</button>
                  )}
                </span>
              ))}
            </div>
            {spectators.length > 0 && (
              <div className="ut-spectators"><b>ESPECTADORES</b>{spectators.map((viewer) => <span key={viewer.nick}>◉ {viewer.nick}</span>)}</div>
            )}
            {isHost && (
              <div style={{ marginTop: 12 }}>
                <button className={`btn ${state.lobby.locked ? 'gold' : 'ghost'} small`} onClick={toggleLock} disabled={busy}>
                  {state.lobby.locked ? OL.unlock : OL.lock}
                </button>
                {state.lobby.locked && <div className="muted small" style={{ marginTop: 4 }}>{OL.locked}</div>}
              </div>
            )}
            {isHost ? (
              <button className="btn gold big" style={{ marginTop: 18 }} onClick={start} disabled={activePlayers.length < 2 || busy}>
                {activePlayers.length < 2 ? tr('online.waitingPlayers') : tr('online.startDraft')}
              </button>
            ) : (
              <div className="muted" style={{ marginTop: 18 }}>
                {tr('online.waitingHost')} {state.lobby.host} {tr('online.waitingHostTail')}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (state.lobby.status === 'veto' && state.lobby.veto) {
    const veto = state.lobby.veto;
    const myTurn = veto.turn?.toLowerCase() === nick.toLowerCase() && !isSpectator;
    const action = VETO_ACTIONS[veto.step] ?? 'DECIDER';
    const seconds = vetoNow ? Math.max(0, Math.ceil(((veto.deadline ?? vetoNow) - vetoNow) / 1000)) : 20;
    return (
      <div className="fade-in ut-live-veto">
        <div className="panel">
          <div className="panel-head">VETO MULTIPLAYER · {code}<span className="spacer" /><button className="btn" onClick={onBack}>Sair</button></div>
          <div className="panel-body">
            <div className="ut-veto-turn">
              <span>{isSpectator ? 'ACOMPANHANDO O VETO' : myTurn ? 'SUA VEZ' : `VEZ DE ${veto.turn}`}</span>
              <b>{action}</b>
              <strong>{seconds}s</strong>
            </div>
            <div className="ut-veto-live-grid">
              {MAP_POOL.map((map) => {
                const banned = veto.bans.find((entry) => entry.map === map);
                const picked = veto.picks.find((entry) => entry.map === map);
                const available = veto.remaining.includes(map);
                return (
                  <button key={map} disabled={!myTurn || !available || busy} className={banned ? 'banned' : picked ? 'picked' : available ? '' : 'removed'} onClick={() => submitVetoMap(map)}>
                    <b>{MAP_LABELS[map]}</b>
                    <span>{banned ? `BAN · ${banned.by}` : picked ? `PICK · ${picked.by}` : available ? (myTurn ? action : 'DISPONÍVEL') : 'FORA'}</span>
                  </button>
                );
              })}
            </div>
            <p className="muted small center">Ban e pick alternados. Se o tempo acabar, o primeiro mapa disponível é escolhido automaticamente.</p>
          </div>
        </div>
      </div>
    );
  }

  // Duelo Ultimate Team: confronto humano direto, sem preencher o lobby com IA.
  if (state.lobby.status === 'done' && duel) {
    return (
      <div className="fade-in ut-duel-page">
        {rankToast}
        <div className="panel">
          <div className="panel-head">
            {OL.duelLive} · {code}{state?.lobby.ranked && <span className="ranked-badge">RANQUEADA</span>}
            <span className="spacer" />
            <button className="btn" onClick={onBack}>{tr('online.exitOnline')}</button>
          </div>
          <div className="panel-body">
            <div className="ut-versus">
            {duel.teams.map((team, idx) => (
                <div key={team.id} className="ut-versus-team">
                  <TeamBadge tag={team.tag} colors={team.colors} size={54} logoUrl={team.logoUrl} />
                  <div>
                    <span className="muted small">{duel.nicks[idx]}</span>
                    <h2>{team.name}</h2>
                    <div className="muted small">{team.players.map((p) => p.nick).join(' · ')}</div>
                  </div>
                  <strong>{Math.round(team.strength)}</strong>
                  <small className="ut-lineup-plan">C {team.onlinePlan?.captainNick} · R {team.onlinePlan?.reserveNick ?? '—'}</small>
                </div>
              ))}
            </div>

            {duelReplayOpen && (
              <MatchReplay
                key={`duel-${state.lobby.run_seed ?? state.lobby.seed}`}
                series={duel.series}
                teams={duel.teams}
                onClose={() => setDuelReplayOpen(false)}
                onFinish={() => setDuelFinished(true)}
                playbackSpeed={playbackSpeed}
                canControlSpeed={isHost}
                onPlaybackSpeedChange={changePlaybackSpeed}
                allowSkip={localDemo}
              />
            )}

            <div className="muted small section-label">{OL.collection}</div>
            <div className="ut-lineups">
              {duel.teams.map((team) => (
                <div key={team.id} className="ut-lineup">
                  <b>{team.name}</b>
                  <div className="ut-mini-cards">
                    {team.players.map((p) => (
                      <div key={p.id} className={`ut-mini-card ${cardTier(p.ovr).className}`}>
                        <PlayerAvatar nick={p.nick} size={38} />
                        <span>{p.nick}</span>
                        <b>{p.ovr}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {!duelReplayOpen && (
              <div className="center" style={{ marginTop: 16 }}>
                <button className="btn gold big" onClick={() => setDuelReplayOpen(true)}>▶ REVER MD3 ROUND A ROUND</button>
              </div>
            )}
            {duelFinished && (
              <div className="center" style={{ marginTop: 16 }}>
                <div className="ut-share-card">
                  <b>{duel.nicks[duel.series.winner]} venceu</b>
                  <span>{duel.series.mapScore[0]} : {duel.series.mapScore[1]} · MD3</span>
                  <button className="btn gold small" onClick={() => shareResult(`Road to Major Ultimate Team: ${duel.nicks[duel.series.winner]} venceu ${duel.nicks[duel.series.winner === 0 ? 1 : 0]} por ${duel.series.mapScore[0]}:${duel.series.mapScore[1]}. Monte seu time em roadtomajor.com.br/online`)}>COMPARTILHAR RESULTADO</button>
                  {shareStatus && <small>{shareStatus}</small>}
                </div>
                {isHost ? (
                  <div className="ut-rematch-actions">
                    <button className="btn gold" onClick={() => nextSeason(true)} disabled={busy}>REVANCHE · MANTER ELENCO</button>
                    <button className="btn" onClick={() => nextSeason(false)} disabled={busy}>NOVAS CARTAS</button>
                  </div>
                ) : (
                  <span className="muted small">{OL.seasonWait}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // resultados: MAJOR completo (jogadores + IA disputam o mesmo torneio)
  if (state.lobby.status === 'done' && major) {
    type HistoryItem = (typeof major.tournament.history)[number];
    const champ = major.teamsById[major.championId];
    const champNick = major.humanByTeamId[major.championId];
    const majorRuleset = state.lobby.ruleset ?? 'open';
    const fullStandings = majorStandings(major);
    const leaders = tournamentLeaders(major.tournament);
    const awards = [
      { label: 'MVP', row: leaders[0] },
      { label: 'FRAG LEADER', row: [...leaders].sort((a, b) => b.stats.kills - a.stats.kills)[0] },
      { label: 'ADR KING', row: [...leaders].sort((a, b) => b.stats.adr - a.stats.adr)[0] },
      { label: 'CLUTCH KING', row: [...leaders].sort((a, b) => b.clutches - a.clutches)[0] },
    ];
    // partidas que envolveram algum jogador humano
    const humanGames = major.tournament.history.filter(
      (h) => h.pairing.result && (major.humanByTeamId[h.pairing.a] || major.humanByTeamId[h.pairing.b]),
    );
    const myTeamId = Object.keys(major.humanByTeamId).find(
      (teamId) => major.humanByTeamId[teamId].toLowerCase() === nick.toLowerCase(),
    );
    const myMajorTeam = myTeamId ? major.teamsById[myTeamId] : null;
    const matchKey = (h: HistoryItem) => `${h.phase}|${h.pairing.a}|${h.pairing.b}`;
    const teamLabel = (id: string) => {
      const t = major.teamsById[id];
      const nk = major.humanByTeamId[id];
      return nk ? `${nk} (${t?.tag ?? ''})` : t?.name ?? id;
    };
    // fase do histórico vem em PT do engine; traduz só na exibição
    const phaseDisplay = (ph: string) => {
      const round = /Rodada (\d+)/.exec(ph);
      if (round) return `${tr('common.round')} ${round[1]}`;
      if (ph === 'GRANDE FINAL') return tr('phase.final');
      if (ph === 'Semifinal') return tr('phase.semi');
      if (ph.startsWith('Quartas')) return tr('phase.quarters');
      return ph;
    };
    const SeriesRow = ({ h, hiddenScore, watchable, watched }: { h: HistoryItem; hiddenScore?: boolean; watchable?: boolean; watched?: boolean }) => {
      const p = h.pairing;
      const res = p.result!;
      const showScore = !hiddenScore || watched;
      const canOpen = showScore || watchable;
      return (
        <div
          className={`matchline${canOpen ? ' clickable' : ''}${watchable ? ' my-live-match' : ''}`}
          onClick={() => {
            if (!canOpen) return;
            setActiveReplayKey(watchable ? matchKey(h) : null);
            setSelMatch({ a: p.a, b: p.b, series: res });
          }}
        >
          <span className={`side${major.humanByTeamId[p.a] ? ' human' : ''}`}>
            <span className="tname">{teamLabel(p.a)}</span>
          </span>
          {!showScore ? (
            <span className="score muted">vs</span>
          ) : (
            <span className="score">
              <span className={res.winner === 0 ? 'w' : 'l'}>{res.mapScore[0]}</span>
              {' : '}
              <span className={res.winner === 1 ? 'w' : 'l'}>{res.mapScore[1]}</span>
            </span>
          )}
          <span className={`side right${major.humanByTeamId[p.b] ? ' human' : ''}`}>
            <span className="tname">{teamLabel(p.b)}</span>
          </span>
          <span className={`major-match-status${watchable ? ' mine' : ''}`}>
            {watchable ? (watched ? '✓ ASSISTIDA' : isSpectator ? '▶ ASSISTIR' : '▶ SUA PARTIDA') : phaseDisplay(h.phase)}
          </span>
        </div>
      );
    };

    // fases na ordem em que aconteceram, para revelar rodada a rodada
    const stages: { phase: string; items: HistoryItem[] }[] = [];
    for (const h of major.tournament.history) {
      const last = stages[stages.length - 1];
      if (last && last.phase === h.phase) last.items.push(h);
      else stages.push({ phase: h.phase, items: [h] });
    }
    const collectiveStage = state.lobby.stage ?? revealed;
    const allRevealed = collectiveStage >= stages.length;

    const confirmCollectiveStage = async () => {
      if (busy) return;
      setBusy(true);
      setError('');
      if (localDemo) {
        setState((prev) => prev ? {
          ...prev,
          players: prev.players.map((p) => p.nick.toLowerCase() === nick.toLowerCase()
            ? { ...p, ready_stage: collectiveStage }
            : p),
        } : prev);
        setSelMatch(null);
        setActiveReplayKey(null);
        setBusy(false);
        return;
      }
      try {
        const result = await lobbyApi({ action: 'readyStage', nick: nick.trim(), code, stage: collectiveStage });
        if (!result.ok) throw new Error(result.error ?? 'Não foi possível confirmar que você assistiu à partida.');
        setState((prev) => prev ? {
          ...prev,
          lobby: { ...prev.lobby, stage: result.stage ?? prev.lobby.stage ?? collectiveStage },
          players: prev.players.map((p) => p.nick.toLowerCase() === nick.toLowerCase()
            ? { ...p, ready_stage: collectiveStage }
            : p),
        } : prev);
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a rodada.');
      } finally {
        setBusy(false);
      }
    };

    // ----- modo rodada a rodada (sem spoiler do campeão) -----
    if (!allRevealed) {
      const stage = stages[collectiveStage];
      const myStageMatch = myTeamId ? stage.items.find((h) => h.pairing.a === myTeamId || h.pairing.b === myTeamId) : undefined;
      const requiredMatchKey = myStageMatch ? matchKey(myStageMatch) : null;
      const personalMatchWatched = !requiredMatchKey || watchedMatches.includes(requiredMatchKey);
      const myLobbyPlayer = state.players.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
      const myStageConfirmed = (myLobbyPlayer?.ready_stage ?? -1) >= collectiveStage;
      const stageStartedAt = state.lobby.stage_started_at ?? 0;
      const stageIsLive = stageStartedAt > 0;
      const elapsedMs = stageIsLive ? Math.max(0, (broadcastNow || stageStartedAt) - stageStartedAt) : 0;
      const pairingParticipants = (item: HistoryItem): [string | null, string | null] => [
        localDemo && major.humanByTeamId[item.pairing.a]?.toLowerCase() !== nick.toLowerCase() ? null : major.humanByTeamId[item.pairing.a] ?? null,
        localDemo && major.humanByTeamId[item.pairing.b]?.toLowerCase() !== nick.toLowerCase() ? null : major.humanByTeamId[item.pairing.b] ?? null,
      ];
      const humanStageMatches = stage.items.filter((item) => pairingParticipants(item).some(Boolean));
      const requiredVetoKeys = humanStageMatches.map((item) => majorMatchKey(collectiveStage, item.pairing));
      const allVetosDone = requiredVetoKeys.every((key) => state.lobby.major_vetos?.[key]?.maps?.length);
      const myMajorVetoKey = myStageMatch ? majorMatchKey(collectiveStage, myStageMatch.pairing) : null;
      const myMajorVeto = myMajorVetoKey ? state.lobby.major_vetos?.[myMajorVetoKey] : undefined;
      const allStageResultsVisible = stage.items.every((item) => elapsedMs >= seriesDurationMs(item.pairing.result!, playbackSpeed));
      const allPlayersReady = state.players.filter((player) => !player.spectator).every((player) => (player.ready_stage ?? -1) >= collectiveStage);
      const visibleHistory = stages.slice(0, collectiveStage).flatMap((visibleStage) => visibleStage.items);
      const completedStageItems = stageIsLive ? stage.items.filter((item) => elapsedMs >= seriesDurationMs(item.pairing.result!, playbackSpeed)) : [];
      const bracketPhase: Phase = stage.phase.startsWith('Suíça')
        ? 'swiss'
        : stage.phase.startsWith('Quartas')
          ? 'quarters'
          : stage.phase === 'Semifinal'
            ? 'semis'
            : 'final';
      const bracketTeams: TTeam[] = major.tournament.teams.map((team) => ({
        ...team,
        wins: 0,
        losses: 0,
        roundDiff: 0,
        status: 'alive',
        isUser: team.id === myTeamId,
      }));
      for (const item of [...visibleHistory, ...completedStageItems]) {
        const result = item.pairing.result;
        if (!result) continue;
        const a = bracketTeams.find((team) => team.id === item.pairing.a)!;
        const b = bracketTeams.find((team) => team.id === item.pairing.b)!;
        const winner = result.winner === 0 ? a : b;
        const loser = result.winner === 0 ? b : a;
        winner.wins++;
        loser.losses++;
        for (const map of result.maps) {
          a.roundDiff += map.score[0] - map.score[1];
          b.roundDiff += map.score[1] - map.score[0];
        }
        if (bracketPhase === 'swiss') {
          if (winner.wins >= 3) winner.status = 'advanced';
          if (loser.losses >= 3) loser.status = 'eliminated';
        } else {
          loser.status = 'eliminated';
        }
      }
      const progressiveTournament: Tournament = {
        ...major.tournament,
        teams: bracketTeams,
        phase: bracketPhase,
        swissRound: Number(/Rodada (\d+)/.exec(stage.phase)?.[1] ?? major.tournament.swissRound),
        history: visibleHistory,
        pairings: stage.items.map((item) => ({
          ...item.pairing,
          result: stageIsLive && elapsedMs >= seriesDurationMs(item.pairing.result!, playbackSpeed) ? item.pairing.result : undefined,
        })),
        championId: undefined,
      };
      const openStageMatch = (item: HistoryItem) => {
        const key = matchKey(item);
        const mine = key === requiredMatchKey;
        if (!isSpectator && myStageMatch && !mine) return;
        if (!stageIsLive) {
          if (mine && !myMajorVeto?.maps && !isSpectator) setMajorVetoOpen(true);
          return;
        }
        if (isSpectator || !myStageMatch || mine) {
          const completed = elapsedMs >= seriesDurationMs(item.pairing.result!, playbackSpeed);
          setActiveReplayKey(completed ? null : key);
          setSelMatch({ a: item.pairing.a, b: item.pairing.b, series: item.pairing.result!, completed });
        }
      };
      const submitMajorVetoAction = async (map: MapId) => {
        if (!myStageMatch || !myMajorVetoKey || busy || stageIsLive) return;
        const participants = pairingParticipants(myStageMatch);
        const bestOf = pairingBestOf(major.tournament, myStageMatch.pairing);
        setBusy(true);
        setError('');
        if (localDemo) {
          const base = myMajorVeto ?? { ...newVeto(bestOf), participants };
          const advanced = applyVeto(base, map);
          const next: OnlineMajorVetoState = {
            ...advanced,
            participants,
            maps: vetoDone(advanced) ? vetoMaps(advanced) : undefined,
          };
          setState((previous) => previous ? { ...previous, lobby: { ...previous.lobby, major_vetos: { ...previous.lobby.major_vetos, [myMajorVetoKey]: next } } } : previous);
          if (next.maps) setMajorVetoOpen(false);
          setBusy(false);
          return;
        }
        const result = await lobbyApi({ action: 'majorVetoAction', nick: nick.trim(), code, map, matchKey: myMajorVetoKey, bestOf, participants }).catch(() => null);
        if (!result?.ok) setError(result?.error ?? 'Não foi possível registrar o veto. Tente novamente.');
        await refresh();
        setBusy(false);
      };
      const startStageBroadcast = async () => {
        // não exige allVetosDone: vetos pendentes viram mapa automático (sim faz auto-veto)
        if (!isHost || stageIsLive || busy) return;
        setBusy(true);
        setError('');
        if (localDemo) {
          setState((previous) => previous ? { ...previous, lobby: { ...previous.lobby, stage_started_at: Date.now() + 3_000 } } : previous);
        } else {
          const result = await lobbyApi({ action: 'startStage', nick: nick.trim(), code, requiredVetoKeys }).catch(() => null);
          if (!result?.ok) setError(result?.error ?? 'Não foi possível iniciar a transmissão da rodada.');
          await refresh();
        }
        setBusy(false);
      };
      const advanceStage = async () => {
        if (!isHost || !allPlayersReady || !stageIsLive || busy) return;
        setBusy(true);
        setError('');
        if (localDemo) {
          setState((previous) => previous ? { ...previous, lobby: { ...previous.lobby, stage: collectiveStage + 1, stage_started_at: 0 } } : previous);
          setRevealed(collectiveStage + 1);
          setWatchedMatches([]);
        } else {
          const result = await lobbyApi({ action: 'advanceStage', nick: nick.trim(), code }).catch(() => null);
          if (!result?.ok) setError(result?.error ?? 'Não foi possível avançar a rodada.');
          await refresh();
        }
        setSelMatch(null);
        setActiveReplayKey(null);
        setBusy(false);
      };
      // host destrava a rodada quando alguém caiu sem confirmar (estado é determinístico)
      const forceAdvanceStage = async () => {
        if (!isHost || !stageIsLive || busy || localDemo) return;
        setBusy(true);
        setError('');
        const result = await lobbyApi({ action: 'advanceStage', nick: nick.trim(), code, force: true }).catch(() => null);
        if (!result?.ok) setError(result?.error ?? 'Não foi possível avançar a rodada.');
        await refresh();
        setSelMatch(null);
        setActiveReplayKey(null);
        setBusy(false);
      };
      const markByeReady = () => {
        if (!myStageMatch && allStageResultsVisible && !myStageConfirmed) void confirmCollectiveStage();
      };
      const liveMatch = selMatch
        ? { a: selMatch.a, b: selMatch.b, series: selMatch.series, key: activeReplayKey, completed: selMatch.completed }
        : stageIsLive && myStageMatch && !personalMatchWatched
          ? { a: myStageMatch.pairing.a, b: myStageMatch.pairing.b, series: myStageMatch.pairing.result!, key: requiredMatchKey, completed: false }
          : null;
      const finishLiveMatch = () => {
        if (liveMatch?.key) markWatched(liveMatch.key);
        setSelMatch(null);
        setActiveReplayKey(null);
        if (!isSpectator && liveMatch?.key === requiredMatchKey && !myStageConfirmed) void confirmCollectiveStage();
      };
      const findStageItem = (pairing: Pairing) => stage.items.find((item) => item.pairing.a === pairing.a && item.pairing.b === pairing.b);
      const openPastSeries = (pairing: Pairing) => {
        const item = visibleHistory.find((history) => history.pairing.a === pairing.a && history.pairing.b === pairing.b && history.pairing.label === pairing.label);
        if (item?.pairing.result) {
          setActiveReplayKey(null);
          setSelMatch({ a: item.pairing.a, b: item.pairing.b, series: item.pairing.result, completed: true });
        }
      };
      return (
        <div className="fade-in ut-major-page">
          {rankToast}
          <div className="panel">
            <div className="panel-head">
              ULTIMATE TEAM · MAJOR {code}
              <span className="spacer" />
              <button className="btn" onClick={onBack}>
                {tr('online.exitOnline')}
              </button>
            </div>
            <div className="panel-body">
              {error && <div className="ut-online-alert" role="alert">{error}</div>}
              {myMajorTeam && (
                <div className="ut-major-squad">
                  <div className="ut-major-squad-copy">
                    <span className="ut-kicker">SUA CAMPANHA</span>
                    <h2>{nick}</h2>
                    <p>{phaseDisplay(stage.phase)} · acompanhe sua partida ao vivo antes de fechar a rodada.</p>
                    <div className="ut-live-objective">OBJETIVO: {RULESET_OBJECTIVES[majorRuleset]}</div>
                  </div>
                  <div className="ut-major-five">
                    {myMajorTeam.players.map((p) => (
                      <div key={p.id} className={`ut-major-player ${cardTier(p.ovr).className}`}>
                        <PlayerAvatar nick={p.nick} size={38} />
                        <span>{p.nick}</span>
                        <b>{p.ovr}</b>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="reveal-progress">
                {stages.map((s, i) => (
                  <span key={i} className={`reveal-chip${i < collectiveStage ? ' done' : i === collectiveStage ? ' now' : ''}`}>
                    {i < collectiveStage ? '✓ ' : ''}
                    {phaseDisplay(s.phase)}
                  </span>
                ))}
              </div>

              <OnlineMatchCenter
                items={stage.items}
                teamsById={major.teamsById}
                humanByTeamId={major.humanByTeamId}
                viewerTeamId={myTeamId}
                elapsedMs={elapsedMs}
                playbackSpeed={playbackSpeed}
                stageIsLive={stageIsLive}
                filter={matchCenterFilter}
                focusedTeamId={focusedTeamId}
                onFilter={setMatchCenterFilter}
                onClearFocus={() => setFocusedTeamId(null)}
                onOpen={(item) => openStageMatch(item as HistoryItem)}
              />

              {bracketPhase === 'swiss' && (
                <OnlineQualificationBoard teams={bracketTeams} humanByTeamId={major.humanByTeamId} focusedTeamId={focusedTeamId} onFocus={setFocusedTeamId} />
              )}

              <TournamentBracket
                t={progressiveTournament}
                onOpen={(pairing) => {
                  const current = findStageItem(pairing);
                  if (current) openStageMatch(current);
                  else openPastSeries(pairing);
                }}
                onPending={(pairing) => {
                  const item = findStageItem(pairing);
                  if (item) openStageMatch(item);
                }}
              />
              {!myStageMatch && (
                <div className="ut-major-bye">{isSpectator ? (stageIsLive ? 'Transmissão ao vivo: clique em qualquer confronto do bracket.' : 'Aguarde o host iniciar a rodada. Nenhuma partida pode ser vista antes da transmissão.') : 'Seu time não joga nesta etapa. Os resultados aparecerão ao vivo no bracket.'}</div>
              )}
              <div className={`ut-broadcast-status${stageIsLive ? ' live' : ''}`}>
                <b>{stageIsLive ? (elapsedMs > 0 ? '● RODADA AO VIVO' : '◉ SINCRONIZANDO TRANSMISSÃO') : '○ PRÉ-RODADA'}</b>
                <span>{stageIsLive ? 'Todas as telas seguem o mesmo relógio da sala.' : `${requiredVetoKeys.filter((key) => state.lobby.major_vetos?.[key]?.maps?.length).length}/${requiredVetoKeys.length} vetos concluídos`}</span>
                {isHost && !stageIsLive && <div className="ut-prestage-speed"><span>VELOCIDADE</span>{PLAYBACK_SPEEDS.map((speed) => <button key={speed} className={`btn ghost small${playbackSpeed === speed ? ' active' : ''}`} onClick={() => void changePlaybackSpeed(speed)} title={speed === 8 ? 'Instantâneo: cai direto no placar' : undefined}>{speed === 8 ? '⚡' : `${speed}x`}</button>)}</div>}
              </div>
              <div className="ut-stage-ready">
                {state.players.filter((player) => !player.spectator).map((p) => {
                  const ready = (p.ready_stage ?? -1) >= collectiveStage;
                  return <span key={p.nick} className={ready ? 'ready' : ''}>{ready ? '✓' : '·'} {p.nick}</span>;
                })}
              </div>
              {!isSpectator && <div className="ut-next-match-cta">
                <span>{myStageMatch ? `${teamLabel(myStageMatch.pairing.a)} vs ${teamLabel(myStageMatch.pairing.b)}` : 'Rodada sem partida para seu time'}</span>
                {!stageIsLive && myStageMatch && !myMajorVeto?.maps ? (
                  <button className="btn gold big" disabled={busy} onClick={() => setMajorVetoOpen(true)}>VETAR MAPAS · FORMATO OFICIAL</button>
                ) : !stageIsLive && isHost ? (
                  <button className="btn gold big" disabled={busy} onClick={startStageBroadcast} title={allVetosDone ? undefined : 'Vetos não concluídos viram mapa automático'}>{allVetosDone ? '▶ INICIAR RODADA AO VIVO' : '▶ INICIAR (vetos pendentes = mapa automático)'}</button>
                ) : !stageIsLive ? (
                  <button className="btn gold big" disabled>AGUARDANDO O HOST INICIAR</button>
                ) : isHost && allPlayersReady ? (
                  <button className="btn gold big" disabled={busy} onClick={advanceStage}>AVANÇAR PARA A PRÓXIMA RODADA</button>
                ) : !myStageMatch && !myStageConfirmed ? (
                  <button className="btn gold big" disabled={!allStageResultsVisible || busy} onClick={markByeReady}>{allStageResultsVisible ? 'MARCAR COMO PRONTO' : 'RODADA EM ANDAMENTO'}</button>
                ) : isHost && myStageConfirmed ? (
                  <button className="btn ghost big" disabled={busy} onClick={forceAdvanceStage} title="Avança ignorando quem caiu/saiu da sala">FORÇAR AVANÇO (jogador ausente)</button>
                ) : (
                  <button className="btn gold big" disabled>{myStageConfirmed ? 'AGUARDANDO O HOST AVANÇAR' : 'SUA PARTIDA ESTÁ AO VIVO'}</button>
                )}
              </div>}
            </div>
          </div>
          {majorVetoOpen && myStageMatch && (
            <OnlineMajorVetoPanel
              teams={[major.teamsById[myStageMatch.pairing.a], major.teamsById[myStageMatch.pairing.b]]}
              participants={pairingParticipants(myStageMatch)}
              bestOf={pairingBestOf(major.tournament, myStageMatch.pairing)}
              veto={myMajorVeto}
              viewerNick={nick}
              busy={busy}
              onSelect={(map) => void submitMajorVetoAction(map)}
              onClose={() => setMajorVetoOpen(false)}
            />
          )}
          {liveMatch && (
            <div className="ut-live-overlay fade-in">
              <div className="ut-live-dialog">
                <MatchReplay
                  key={`${collectiveStage}-${liveMatch.a}-${liveMatch.b}`}
                  series={liveMatch.series}
                  teams={[major.teamsById[liveMatch.a], major.teamsById[liveMatch.b]]}
                  onClose={() => { setSelMatch(null); setActiveReplayKey(null); }}
                  onFinish={liveMatch.key ? finishLiveMatch : undefined}
                  allowSkip={false}
                  playbackSpeed={playbackSpeed}
                  canControlSpeed={isHost && !liveMatch.key}
                  onPlaybackSpeedChange={changePlaybackSpeed}
                  startedAt={liveMatch.key ? stageStartedAt : undefined}
                  lockedLive={Boolean(liveMatch.key && stageIsLive)}
                  initialDone={liveMatch.completed === true}
                />
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="fade-in">
        <div className="panel">
          <div className="panel-head">
            {tr('online.roomMajor')} {code} · {OL.season} {state.lobby.season ?? 1}
            <span className="spacer" />
            <button className="btn" onClick={onBack}>
              {tr('online.exitOnline')}
            </button>
          </div>
          <div className="panel-body">
            <div className="finale" style={{ padding: '10px 0 18px' }}>
              <div className="trophy">🏆</div>
              <h1 style={{ fontSize: 26 }}>
                {champNick ? `${champNick} ${tr('online.champTitleHuman')}` : `${champ?.name} ${tr('online.champTitleAi')}`}
              </h1>
              <div className="muted">
                {champNick ? `${tr('online.champRoster')} ${champ?.players.map((p) => p.nick).join(', ')}` : tr('online.noHumanFinal')}
              </div>
              <div className="ut-share-card">
                <b>{champNick ?? champ?.name} campeão</b>
                <span>Major Ultimate Team · Temporada {state.lobby.season ?? 1}</span>
                <button className="btn gold small" onClick={() => shareResult(`Road to Major Ultimate Team: ${champNick ?? champ?.name} foi campeão do Major. Teste com seus amigos em roadtomajor.com.br/online`)}>COMPARTILHAR RESULTADO</button>
                {shareStatus && <small>{shareStatus}</small>}
              </div>
              {/* continuar a sala: nova temporada com novo draft (transferências) */}
              <div style={{ marginTop: 16 }}>
                {isHost ? (
                  <div className="ut-rematch-actions">
                    <button className="btn gold big" onClick={() => nextSeason(true)} disabled={busy}>NOVO MAJOR · MANTER ELENCOS</button>
                    <button className="btn big" onClick={() => nextSeason(false)} disabled={busy}>REDRAFT COMPLETO</button>
                  </div>
                ) : (
                  <div className="muted small">{OL.seasonWait}</div>
                )}
              </div>
            </div>

            <div className="muted small section-label">PRÊMIOS DO MAJOR</div>
            <div className="ut-session-profile compact">
              <span>DIVISÃO DA SESSÃO</span><b>{sessionDivision(sessionProfile.points)}</b><strong>{sessionProfile.points} pts</strong>
              <small>{sessionProfile.wins}V · {sessionProfile.losses}D · {sessionProfile.titles} títulos</small>
            </div>
            <div className="ut-awards">
              {awards.map(({ label, row }) => row && (
                <div key={label} className="ut-award-card">
                  <span>{label}</span>
                  <PlayerAvatar nick={row.player.nick} size={48} />
                  <b>{row.player.nick}</b>
                  <small>{row.team.tag} · Rating {row.stats.rating.toFixed(2)}</small>
                </div>
              ))}
            </div>

            <div className="muted small section-label">TOP 10 DA SESSÃO</div>
            <div className="ut-session-leaders">
              {leaders.slice(0, 10).map((row, index) => (
                <div key={row.player.id}>
                  <span>{index + 1}</span>
                  <PlayerAvatar nick={row.player.nick} size={28} />
                  <b>{row.player.nick}</b>
                  <small>{row.team.tag}</small>
                  <em>{row.stats.kills}-{row.stats.deaths}</em>
                  <strong>{row.stats.rating.toFixed(2)}</strong>
                </div>
              ))}
            </div>

            {/* resultado de cada jogador */}
            <div className="muted small section-label">{tr('online.howEachPlayer')}</div>
            <div className="human-results">
              {major.humans.map((h) => {
                const tm = major.teamsById[h.teamId];
                return (
                  <div key={h.nick} className={`human-card${h.placement === 'champion' ? ' champ' : ''}`}>
                    <div className="hr-head">
                      <TeamBadge tag={tm?.tag ?? ''} colors={tm?.colors ?? ['#333', '#555']} size={28} logoUrl={tm?.logoUrl} />
                      <b>{h.nick}</b>
                      <span className="spacer" />
                      <span className="hr-place">{tr(`placement.${h.placement}`)}</span>
                    </div>
                    <div className="hr-roster muted small">{tm?.players.map((p) => p.nick).join(', ')}</div>
                    <div className="hr-rec muted small">{tr('online.campaign')} {h.wins}{tr('common.wins')} - {h.losses}{tr('common.losses')}</div>
                    <div className="ut-session-points">+{SESSION_POINTS[h.placement] ?? 0} pontos da sessão</div>
                    <div className={h.wins >= 2 ? 'ut-objective-done' : 'muted small'}>{h.wins >= 2 ? '✓ Objetivo concluído' : 'Objetivo não concluído'}</div>
                  </div>
                );
              })}
            </div>

            <div className="muted small section-label">BRACKET FINAL</div>
            <TournamentBracket
              t={major.tournament}
              onOpen={(pairing) => pairing.result && setSelMatch({ a: pairing.a, b: pairing.b, series: pairing.result })}
            />

            {/* partidas dos jogadores na Suíça */}
            <div className="muted small section-label">{tr('online.playerMatches')}</div>
            <div className="panel-body tight" style={{ padding: 0 }}>
              {humanGames.map((h, i) => (
                <SeriesRow key={i} h={h} />
              ))}
            </div>

            {/* classificação final do Major */}
            <div className="muted small section-label">{tr('online.finalStandings')}</div>
            <table className="stats">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>#</th>
                  <th style={{ textAlign: 'left' }}>{tr('online.team')}</th>
                  <th>{tr('common.wins')}</th>
                  <th>{tr('common.losses')}</th>
                  <th>{tr('online.diff')}</th>
                </tr>
              </thead>
              <tbody>
                {fullStandings.map((s, i) => (
                  <tr key={s.team.id} className={s.isHuman ? 'human-row' : undefined}>
                    <td style={{ textAlign: 'left' }}>{i + 1}</td>
                    <td style={{ textAlign: 'left', fontWeight: s.isHuman ? 700 : 400 }}>
                      {s.team.id === major.championId ? '🏆 ' : ''}
                      {s.isHuman ? `${s.nick} · ` : ''}
                      {s.team.name}
                    </td>
                    <td className="pos">{s.team.wins}</td>
                    <td className="neg">{s.team.losses}</td>
                    <td>{s.team.roundDiff > 0 ? `+${s.team.roundDiff}` : s.team.roundDiff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {selMatch && (
            <MatchReplay
              series={selMatch.series}
              teams={[major.teamsById[selMatch.a], major.teamsById[selMatch.b]]}
              onClose={() => setSelMatch(null)}
              playbackSpeed={playbackSpeed}
              canControlSpeed={isHost}
              onPlaybackSpeedChange={changePlaybackSpeed}
            />
          )}
      </div>
    );
  }

  // draft sincronizado
  if (isSpectator && state.lobby.status === 'drafting') {
    return (
      <div className="fade-in"><div className="panel" style={{ maxWidth: 680, margin: '30px auto' }}>
        <div className="panel-head">MODO ESPECTADOR · {code}<span className="spacer" /><button className="btn" onClick={onBack}>Sair</button></div>
        <div className="panel-body center">
          <h2>Os jogadores estão montando os elencos</h2>
          <p className="muted">Você entrará automaticamente no veto e poderá acompanhar todas as partidas.</p>
          <div className="lobby-players" style={{ justifyContent: 'center' }}>{activePlayers.map((player) => <span key={player.nick} className={`lobby-player${player.done ? ' done' : ''}`}>{player.done ? '✓' : '·'} {player.nick} · {player.picks?.length ?? 0}/5</span>)}</div>
        </div>
      </div></div>
    );
  }
  if (!setup) return null;
  const coachPhase = myPicks.length >= 5 && !coachPick && !myDone;
  const lineupPhase = myPicks.length >= 5 && !!coachPick && !lineupConfirmed && !myDone;
  const strategyPhase = myPicks.length >= 5 && !!coachPick && lineupConfirmed && !myDone;
  const source = setup.sources[Math.min(myPicks.length, 4)];
  const pickedCards = myPicks.map((pid, i) => {
    const pickedSource = setup.sources[i];
    const player = pickedSource?.players.find((p) => p.id === pid);
    return player && pickedSource ? { player, source: pickedSource } : null;
  }).filter((card): card is PickedCard => card !== null);
  const chemistry = ultimateChemistry(pickedCards);
  const pickedIds = new Set(myPicks);
  const reserveOptions = setup.sources
    .flatMap((reserveSource) => reserveSource.players.map((player) => ({ player, source: reserveSource })))
    .filter(({ player }) => !pickedIds.has(player.id))
    .sort((a, b) => playerOvr(b.player) - playerOvr(a.player))
    .slice(0, 10);
  const pickedNicks = new Set(
    myPicks.map((pid, i) => setup.sources[i]?.players.find((p) => p.id === pid)?.nick.toLowerCase()),
  );

  return (
    <div className="fade-in online-draft-layout">
      <div>
        {myDone ? (
          <div className="panel">
            <div className="panel-head">{tr('online.draftSent')}</div>
            <div className="panel-body center">
              <p className="muted">{tr('online.waitingOthers')}</p>
              <div className="lobby-players" style={{ justifyContent: 'center' }}>
                {activePlayers.map((p) => (
                  <span key={p.nick} className={`lobby-player${p.done ? ' done' : ''}`}>
                    {p.done ? '✔' : '·'} {p.nick}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : strategyPhase ? (
          <div className="panel ut-strategy-panel">
            <div className="panel-head">PLANO TÁTICO</div>
            <div className="panel-body">
              <div className="ut-chem-summary">
                <span>QUÍMICA</span><b>{chemistry.score}</b>
                <div><i style={{ width: `${chemistry.score}%` }} /></div>
                <small>{chemistry.links} conexões · {chemistry.roles} funções</small>
              </div>
              <div className="muted small section-label">IDENTIDADE TÁTICA</div>
              <div className="ut-tactic-grid">
                {TACTIC_OPTIONS.map((option) => (
                  <button key={option.id} className={strategy.tactic === option.id ? 'active' : ''} onClick={() => setStrategy((s) => ({ ...s, tactic: option.id }))}>
                    <b>{option.label}</b><span>{option.desc}</span>
                  </button>
                ))}
              </div>
              <div className="ut-veto-plan">
                <div>
                  <div className="muted small section-label">MAPA PREFERIDO</div>
                  <div className="ut-map-options">
                    {MAP_POOL.map((map) => <button key={map} disabled={strategy.banMap === map} className={strategy.favoriteMap === map ? 'pick' : ''} onClick={() => setStrategy((s) => ({ ...s, favoriteMap: map }))}>{MAP_LABELS[map]}</button>)}
                  </div>
                </div>
                <div>
                  <div className="muted small section-label">MAPA A EVITAR</div>
                  <div className="ut-map-options">
                    {MAP_POOL.map((map) => <button key={map} disabled={strategy.favoriteMap === map} className={strategy.banMap === map ? 'ban' : ''} onClick={() => setStrategy((s) => ({ ...s, banMap: map }))}>{MAP_LABELS[map]}</button>)}
                  </div>
                </div>
              </div>
              <div className="muted small section-label">EVENTOS DA SÉRIE</div>
              <div className="ut-match-events">
                <div><b>RITMO</b>{(['aggressive', 'default', 'cautious'] as OnlinePace[]).map((pace) => <button key={pace} className={strategy.pace === pace ? 'active' : ''} onClick={() => setStrategy((current) => ({ ...current, pace }))}>{pace === 'aggressive' ? 'Agressivo' : pace === 'cautious' ? 'Cauteloso' : 'Padrão'}</button>)}</div>
                <div><b>TIMEOUT TÁTICO</b>{[0, 1, 2].map((mapIndex) => <button key={mapIndex} className={strategy.timeoutMap === mapIndex ? 'active' : ''} onClick={() => setStrategy((current) => ({ ...current, timeoutMap: mapIndex }))}>Mapa {mapIndex + 1}</button>)}</div>
                <label><input type="checkbox" checked={strategy.substituteAfterMap === true} onChange={(event) => setStrategy((current) => ({ ...current, substituteAfterMap: event.target.checked }))} /> Usar o reserva entre os mapas</label>
              </div>
              <p className="muted small">Estas são preferências táticas. Antes de cada confronto, o veto oficial completo acontece no mesmo formato do modo carreira e draft.</p>
              <button className="btn gold big" style={{ width: '100%' }} onClick={confirmStrategy}>CONFIRMAR E FICAR PRONTO</button>
            </div>
          </div>
        ) : lineupPhase ? (
          <div className="panel ut-lineup-builder">
            <div className="panel-head">CAPITÃO E ESCALAÇÃO</div>
            <div className="panel-body">
              <div className="muted small section-label">ESCOLHA O CAPITÃO</div>
              <div className="ut-lineup-choices">
                {pickedCards.map(({ player }) => (
                  <button key={player.id} className={lineup.captainId === player.id ? 'active' : ''} onClick={() => setLineup((current) => ({ ...current, captainId: player.id }))}>
                    <PlayerAvatar nick={player.nick} size={40} /><b>{player.nick}</b><span>{player.role} · IGL {player.igl}</span>
                  </button>
                ))}
              </div>
              <div className="muted small section-label">ESCOLHA UM RESERVA</div>
              <div className="ut-reserve-grid">
                {reserveOptions.map(({ player, source: reserveSource }) => (
                  <button key={`${reserveSource.id}-${player.id}`} className={lineup.reserveId === player.id ? 'active' : ''} onClick={() => setLineup((current) => ({ ...current, reserveId: player.id }))}>
                    <PlayerAvatar nick={player.nick} size={34} /><b>{player.nick}</b><span>{reserveSource.tag} · {playerOvr(player)} OVR</span>
                  </button>
                ))}
              </div>
              <button className="btn gold big" style={{ width: '100%' }} disabled={!lineup.captainId || !lineup.reserveId} onClick={() => setLineupConfirmed(true)}>CONFIRMAR ESCALAÇÃO</button>
            </div>
          </div>
        ) : coachPhase ? (
          <div className="panel">
            <div className="panel-head">{tr('online.chooseCoach')}</div>
            <div className="player-cards">
              {setup.coachOptions.map((t) => (
                <button key={t.id} className="pcard" onClick={() => pickCoach(t.id)}>
                  <PlayerAvatar nick={t.coach.nick} size={52} coach />
                  <OvrBadge ovr={t.coach.rating} label="COACH" />
                  <div className="nick">{t.coach.nick}</div>
                  <div className="meta">
                    <span className="role-pill IGL">{tr(`coach.${t.coach.style}`)}</span>
                  </div>
                  <div className="meta muted small" style={{ marginTop: 6, lineHeight: 1.3 }}>
                    {tr(`coach.${t.coach.style}Desc`)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="panel">
            <div className="panel-head">
              {OL.collection} · {myPicks.length + 1} {tr('online.ofFive')}
              <span className="spacer" />
              <button className="btn ghost small" disabled={(myRollouts[myPicks.length] ?? 0) >= (state.lobby.draft_rollouts ?? 2)} onClick={rerollCurrentPack}>
                ↻ REROLL {(state.lobby.draft_rollouts ?? 2) - (myRollouts[myPicks.length] ?? 0)}
              </button>
              <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {tr('online.sameRosters')} {tr('online.roomLabel')} {code}
              </span>
            </div>
            <div className="draft-source">
              <TeamBadge tag={source.tag} colors={source.colors} size={56} logoUrl={source.logoUrl ?? logoForTeam(source)} />
              <div style={{ flex: 1 }}>
                <div className="era-game">
                  {source.game} · {source.era}
                </div>
                <h2>
                  {source.team} <Flag cc={source.country} />
                </h2>
                <div className="honors">{source.honors}</div>
              </div>
            </div>
            {revealedRound !== myPicks.length ? (
              <div className="ut-pack-reveal">
                <button onClick={() => setRevealedRound(myPicks.length)}>
                  <span>RTM</span>
                  <b>ABRIR CARTAS</b>
                  <small>{RULESET_OPTIONS.find((r) => r.id === (state.lobby.ruleset ?? 'open'))?.label}</small>
                </button>
                <p>As cinco opções serão reveladas. Escolha uma para o seu elenco.</p>
              </div>
            ) : (
              <div className="player-cards ut-revealed-cards">
                {source.players.map((p, cardIndex) => {
                  const taken = pickedNicks.has(p.nick.toLowerCase());
                  const violation = ruleViolation(p, source, pickedCards, state.lobby.ruleset ?? 'open');
                  const hasValidChoice = source.players.some((candidate) =>
                    !pickedNicks.has(candidate.nick.toLowerCase()) && !ruleViolation(candidate, source, pickedCards, state.lobby.ruleset ?? 'open'),
                  );
                  return (
                    <UltimatePlayerCard
                      key={p.id}
                      player={p}
                      source={source}
                      taken={taken}
                      blocked={hasValidChoice ? violation : null}
                      currentLabel={OL.current}
                      legendLabel={OL.legend}
                      revealIndex={cardIndex}
                      onPick={() => pickPlayer(p.id)}
                    />
                  );
                })}
              </div>
            )}

            <div className="ut-chem-live">
              <div><span>QUÍMICA DO ELENCO</span><b>{chemistry.score}</b></div>
              <div className="ut-chem-track"><i style={{ width: `${chemistry.score}%` }} /></div>
              <small>{chemistry.links} conexões · regra {RULESET_OPTIONS.find((r) => r.id === (state.lobby.ruleset ?? 'open'))?.label}</small>
            </div>

            {/* time sendo montado: jogadores, funções e o que falta (igual ao draft SP) */}
            {(() => {
              const roster = [0, 1, 2, 3, 4].map((i) => {
                const pid = myPicks[i];
                return pid ? setup.sources[i]?.players.find((x) => x.id === pid) ?? null : null;
              });
              const present = new Set<string>(roster.filter(Boolean).map((p) => p!.role));
              const KEY: { role: string; label: string }[] = [
                { role: 'AWP', label: 'AWP' },
                { role: 'IGL', label: 'IGL' },
                { role: 'Entry', label: OL.roleEntry },
              ];
              return (
                <div className="online-roster">
                  <div className="muted small section-label" style={{ marginTop: 4 }}>
                    {OL.yourTeam} ({myPicks.length}/5)
                  </div>
                  <div className="roster-slots">
                    {roster.map((p, i) => (
                      <div key={i} className={`slot${p ? ' filled' : ''}`}>
                        {p ? (
                          <>
                            <PlayerAvatar nick={p.nick} size={34} />
                            <div className="nick"><Flag cc={p.country} /> {p.nick} <span className="ovr-inline">{playerOvr(p)}</span></div>
                            <span className={`role-pill ${p.role}`}>{p.role}</span>
                          </>
                        ) : (
                          <span className="muted small">{OL.emptySlot}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="roster-roles">
                    <span className="muted small">{OL.rolesLabel}:</span>
                    {KEY.map((k) => (
                      <span key={k.role} className={`role-need ${present.has(k.role) ? 'ok' : 'miss'}`}>
                        {present.has(k.role) ? '✓' : '✗'} {k.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className="panel online-side">
        <div className="panel-head">{tr('online.roomLabel')} {code}</div>
        <div className="panel-body">
          <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
            {tr('online.liveProgress')}
          </div>
          {activePlayers.map((p) => {
            const mine = p.nick.toLowerCase() === nick.toLowerCase();
            const livePicks = mine ? myPicks : (p.picks ?? []);
            // cada jogador tem o próprio sorteio: resolve os nicks pelo setup dele
            const pSetup = mine ? setup : buildDraftForPlayer(state.lobby.seed, state.lobby.pool, p.nick, state.lobby.ruleset ?? 'open', p.rollouts);
            return (
              <div key={p.nick} className="online-progress">
                <div className="op-head">
                  <b>
                    {p.nick === state.lobby.host ? '★ ' : ''}
                    {p.nick}
                    {mine ? ` (${tr('common.you')})` : ''}
                  </b>
                  <span className={p.done || (mine && myDone) ? 'pos small' : 'muted small'}>
                    {p.done || (mine && myDone) ? tr('online.ready') : `${livePicks.length}/5 ${tr('online.picks')}`}
                  </span>
                </div>
                <div className="op-picks">
                  {[0, 1, 2, 3, 4].map((i) => {
                    const pid = livePicks[i];
                    const player = pid ? pSetup.sources[i]?.players.find((x) => x.id === pid) : undefined;
                    return (
                      <span key={i} className={`op-slot${player ? ' filled' : ''}`}>
                        {player ? player.nick : '·'}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="muted small" style={{ marginTop: 12 }}>
            {tr('online.sideExplain')}
          </p>
        </div>
      </div>
    </div>
  );
}

function cardTier(ovr: number): { label: string; className: string } {
  if (ovr >= 92) return { label: 'ICON', className: 'icon' };
  if (ovr >= 88) return { label: 'LEGENDARY', className: 'legendary' };
  if (ovr >= 84) return { label: 'ELITE', className: 'elite' };
  return { label: 'GOLD', className: 'gold' };
}

interface PickedCard { player: Player; source: TeamSeason }

function ultimateChemistry(cards: PickedCard[]) {
  let score = 28;
  const roles = new Set(cards.map((c) => c.player.role));
  for (const role of ['AWP', 'IGL', 'Entry', 'Support']) if (roles.has(role as Player['role'])) score += 10;
  let links = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i].player.country === cards[j].player.country) { score += 4; links++; }
      if (cards[i].source.id === cards[j].source.id) { score += 6; links++; }
      else if (cards[i].source.game === cards[j].source.game) { score += 2; links++; }
    }
  }
  return { score: Math.max(0, Math.min(100, score)), links, roles: roles.size };
}

function ruleViolation(player: Player, source: TeamSeason, picked: PickedCard[], ruleset: UltimateRuleset): string | null {
  if (ruleset === 'unique_country' && picked.some((c) => c.player.country === player.country)) return 'PAÍS REPETIDO';
  if (ruleset === 'era' && picked.filter((c) => c.source.game === source.game).length >= 2) return 'ERA JÁ LOTADA';
  if (ruleset === 'brworld' && picked.length === 4) {
    const final = [...picked, { player, source }];
    const br = final.filter((c) => c.player.country === 'br').length;
    if (br < 2 || final.length - br < 2) return 'PRECISA 2 BR + 2 MUNDO';
  }
  return null;
}

function tournamentLeaders(tournament: Tournament) {
  const acc = new Map<string, { player: TPlayer; team: TTeam; lines: PlayerLine[]; clutches: number }>();
  for (const team of tournament.teams) for (const player of team.players) {
    acc.set(player.id, { player, team, lines: [], clutches: 0 });
  }
  for (const history of tournament.history) for (const map of history.pairing.result?.maps ?? []) {
    for (const [playerId, stats] of Object.entries(map.stats)) {
      const row = acc.get(playerId);
      if (!row) continue;
      row.lines.push(stats.both);
      row.clutches += stats.both.clutchWins;
    }
  }
  return [...acc.values()].filter((row) => row.lines.length > 0).map((row) => ({
    ...row,
    stats: computeDisplay(mergeLines(row.lines)),
  })).sort((a, b) => b.stats.rating - a.stats.rating);
}

function UltimatePlayerCard({
  player,
  source,
  taken,
  blocked,
  currentLabel,
  legendLabel,
  revealIndex,
  onPick,
}: {
  player: Player;
  source: TeamSeason;
  taken: boolean;
  blocked?: string | null;
  currentLabel: string;
  legendLabel: string;
  revealIndex: number;
  onPick: () => void;
}) {
  const ovr = playerOvr(player);
  const tier = cardTier(ovr);
  const current = source.game === 'CS2' && /2026/.test(source.era);
  return (
    <button type="button" title={blocked ?? undefined} style={{ animationDelay: `${revealIndex * 110}ms` }} className={`ut-card ut-pack-card ${tier.className}${taken || blocked ? ' taken' : ''}`} onClick={onPick} disabled={taken || !!blocked}>
      <div className="ut-card-top">
        <span className="ut-card-rating">{ovr}</span>
        <span className="ut-card-tier">{tier.label}</span>
        <span className={`ut-card-era ${current ? 'current' : ''}`}>{current ? currentLabel : legendLabel}</span>
      </div>
      <div className="ut-card-photo"><PlayerAvatar nick={player.nick} size={82} /></div>
      <div className="ut-card-name">{player.nick}</div>
      <div className="ut-card-origin">
        <Flag cc={player.country} /> {source.tag} · {source.era}
      </div>
      <div className="ut-card-role"><span className={`role-pill ${player.role}`}>{player.role}</span></div>
      <div className="ut-card-stats">
        <span><b>{player.aim}</b> AIM</span>
        <span><b>{player.clutch}</b> CLU</span>
        <span><b>{player.consistency}</b> CON</span>
        <span><b>{player.awp}</b> AWP</span>
        <span><b>{player.igl}</b> IGL</span>
      </div>
      <span className="ut-card-pick">{taken ? 'NO ELENCO' : blocked ?? 'CONTRATAR'}</span>
    </button>
  );
}

function LiveStatsSide({ team, stats }: { team: TTeam; stats: Record<string, { k: number; d: number }> }) {
  return (
    <div className="lsb-team">
      <div className="lsb-head">
        <TeamBadge tag={team.tag} colors={team.colors} size={20} logoUrl={team.logoUrl} />
        <span className="lsb-tname">{team.name}</span>
        <span className="lsb-cols">K&nbsp;&nbsp;D&nbsp;&nbsp;+/-</span>
      </div>
      {[...team.players, ...(team.bench ?? [])].map((p) => {
        const s = stats[p.id] ?? { k: 0, d: 0 };
        const diff = s.k - s.d;
        return (
          <div key={p.id} className="lsb-row">
            <PlayerAvatar nick={p.nick} size={24} />
            <span className="lsb-nick"><Flag cc={p.country} /> {p.nick}</span>
            <span className="lsb-kda">{s.k}&nbsp;&nbsp;{s.d}&nbsp;&nbsp;<i className={diff >= 0 ? 'pos' : 'neg'}>{diff > 0 ? `+${diff}` : diff}</i></span>
          </div>
        );
      })}
    </div>
  );
}

// Replay AO VIVO de uma série já calculada (determinístico): o placar sobe
// round a round, com killfeed e K/D acumulados a partir do resultado gravado.
// Assim a partida "acontece" na tela sem quebrar a sincronia entre clientes.
function MatchReplay({
  series,
  teams,
  onClose,
  onFinish,
  allowSkip = true,
  playbackSpeed,
  canControlSpeed,
  onPlaybackSpeedChange,
  startedAt,
  lockedLive = false,
  initialDone = false,
}: {
  series: SeriesResult;
  teams: [TTeam, TTeam];
  onClose: () => void;
  onFinish?: () => void;
  allowSkip?: boolean;
  playbackSpeed: PlaybackSpeed;
  canControlSpeed: boolean;
  onPlaybackSpeedChange: (speed: PlaybackSpeed) => void;
  startedAt?: number;
  lockedLive?: boolean;
  initialDone?: boolean;
}) {
  const [mapIdx, setMapIdx] = useState(0);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(initialDone);
  const finishNotified = useRef(false);

  useEffect(() => {
    if (!done || finishNotified.current) return;
    finishNotified.current = true;
    onFinish?.();
  }, [done, onFinish]);

  useEffect(() => {
    if (done || startedAt) return;
    const map = series.maps[mapIdx];
    if (!map) {
      const finish = window.setTimeout(() => setDone(true), 0);
      return () => window.clearTimeout(finish);
    }
    if (round >= map.roundLog.length) {
      if (mapIdx + 1 >= series.maps.length) {
        const finish = window.setTimeout(() => setDone(true), 0);
        return () => window.clearTimeout(finish);
      }
      const t = setTimeout(() => { setMapIdx(mapIdx + 1); setRound(0); }, 1200 / playbackSpeed);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRound((r) => r + 1), 850 / playbackSpeed);
    return () => clearTimeout(t);
  }, [mapIdx, round, done, series, playbackSpeed, startedAt]);

  useEffect(() => {
    if (!startedAt || done) return;
    const syncToRoomClock = () => {
      let units = Math.max(0, Math.floor((Date.now() - startedAt) * playbackSpeed / 850));
      for (let index = 0; index < series.maps.length; index++) {
        const rounds = series.maps[index].roundLog.length;
        if (units <= rounds) {
          setMapIdx(index);
          setRound(Math.min(rounds, units));
          return;
        }
        units -= rounds;
        if (index < series.maps.length - 1) {
          if (units <= MAP_GAP_UNITS) {
            setMapIdx(index);
            setRound(rounds);
            return;
          }
          units -= MAP_GAP_UNITS;
        }
      }
      setDone(true);
    };
    syncToRoomClock();
    const timer = window.setInterval(syncToRoomClock, 250);
    return () => window.clearInterval(timer);
  }, [done, playbackSpeed, series, startedAt]);

  const idIndex = useMemo(() => {
    const m = new Map<string, { nick: string; team: 0 | 1 }>();
    teams.forEach((tm, ti) => [...tm.players, ...(tm.bench ?? [])].forEach((p) => m.set(p.id, { nick: p.nick, team: ti as 0 | 1 })));
    return m;
  }, [teams]);

  // K/D acumulado até o ponto atual da reprodução
  const kd = useMemo(() => {
    const k: Record<string, { k: number; d: number }> = {};
    const bump = (id: string, key: 'k' | 'd') => { (k[id] = k[id] || { k: 0, d: 0 })[key]++; };
    for (let mi = 0; mi <= mapIdx && mi < series.maps.length; mi++) {
      const lim = mi < mapIdx ? Infinity : round;
      for (const e of series.maps[mi].killFeed) if (e.round <= lim) { bump(e.killerId, 'k'); bump(e.victimId, 'd'); }
    }
    return k;
  }, [mapIdx, round, series]);

  const map = series.maps[mapIdx];
  const tacticalEvent = !done && map
    ? round === 8 && teams[0].onlinePlan?.timeoutMap === mapIdx
      ? `TIMEOUT TÁTICO · ${teams[0].name}`
      : round === 9 && teams[1].onlinePlan?.timeoutMap === mapIdx
        ? `TIMEOUT TÁTICO · ${teams[1].name}`
        : round === 0 && mapIdx > 0
          ? [teams[0], teams[1]].filter((team) => team.onlinePlan?.substituteAfterMap && team.onlinePlan.reserveNick).map((team) => `${team.onlinePlan?.reserveNick} entra por ${team.name}`).join(' · ')
          : ''
    : '';
  // ao terminar, congela no placar FINAL do mapa e inclui o último mapa no
  // placar de mapas (antes o header ficava defasado em relação ao Scoreboard)
  const log = map ? map.roundLog.slice(0, round) : [];
  const sa = done && map ? map.score[0] : log.filter((w) => w === 0).length;
  const sb = done && map ? map.score[1] : log.filter((w) => w === 1).length;
  const playedMaps = done ? series.maps : series.maps.slice(0, mapIdx);
  const mapsA = playedMaps.filter((m) => m.winner === 0).length;
  const mapsB = playedMaps.filter((m) => m.winner === 1).length;
  const feed = map ? map.killFeed.filter((e) => e.round <= round).slice(-7).reverse() : [];
  const lastWinner = round > 0 && map ? map.roundLog[Math.min(round, map.roundLog.length) - 1] : null;

  return (
    <div className="panel match-replay fade-in">
      <div className="panel-head">
        {map ? MAP_LABELS[map.map] : 'FIM'} {!done && `· ${round === 0 ? 'LIVE' : `R${round}`}`}
        <span className="spacer" />
        {!done && (
          <div className="ut-playback-speed" title={canControlSpeed ? 'O host controla a velocidade para toda a sala' : 'Velocidade definida pelo host'}>
            <span>{canControlSpeed ? 'VELOCIDADE DA SALA' : `HOST · ${playbackSpeed}x`}</span>
            {canControlSpeed && PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                className={`btn ghost small${playbackSpeed === speed ? ' active' : ''}`}
                onClick={() => onPlaybackSpeedChange(speed)}
                title={speed === 8 ? 'Instantâneo: cai direto no placar' : undefined}
              >
                {speed === 8 ? '⚡' : `${speed}x`}
              </button>
            ))}
          </div>
        )}
        {!done && allowSkip && <button className="btn ghost small" onClick={() => setDone(true)}>Pular ⏭</button>}
        {!lockedLive && <button className="btn small" onClick={onClose}>Fechar ✕</button>}
      </div>
      <div className="panel-body">
        <div className="qs-board" style={{ marginBottom: 10 }}>
          <div className="qs-side"><TeamBadge tag={teams[0].tag} colors={teams[0].colors} size={40} logoUrl={teams[0].logoUrl} /><div className="qs-name">{teams[0].name}</div><div className="qs-score">{sa}</div></div>
          <div className="qs-mid"><div className="qs-mapscore">{mapsA} - {mapsB} <span className="muted small">mapas</span></div></div>
          <div className="qs-side"><TeamBadge tag={teams[1].tag} colors={teams[1].colors} size={40} logoUrl={teams[1].logoUrl} /><div className="qs-name">{teams[1].name}</div><div className="qs-score">{sb}</div></div>
        </div>
        {tacticalEvent && <div className="ut-tactical-event">{tacticalEvent}</div>}
        {!done && lastWinner !== null && (
          <div className={`ut-round-winner team-${lastWinner}`}>
            ROUND {round} · {teams[lastWinner].name} pontua · {sa}:{sb}
          </div>
        )}
        {!done && (
          <>
            <div className="replay-feed">
              {feed.length === 0 ? <div className="muted small">…</div> : feed.map((e, i) => (
                <div key={i} className="rf-row">
                  <span className="kf-round">R{e.round}</span>
                  <span style={{ color: e.killerTeam === 0 ? '#6fb6ec' : '#f0b35c' }}>{idIndex.get(e.killerId)?.nick ?? '?'}</span>
                  {e.headshot ? ' ◉ ' : ' ▸ '}
                  <span style={{ color: e.victimTeam === 0 ? '#6fb6ec' : '#f0b35c' }}>{idIndex.get(e.victimId)?.nick ?? '?'}</span>
                </div>
              ))}
            </div>
            <div className="live-scoreboard">
              <LiveStatsSide team={teams[0]} stats={kd} />
              <div className="lsb-vs">VS</div>
              <LiveStatsSide team={teams[1]} stats={kd} />
            </div>
          </>
        )}
      </div>
      {done && <Scoreboard series={series} teams={teams} />}
    </div>
  );
}
