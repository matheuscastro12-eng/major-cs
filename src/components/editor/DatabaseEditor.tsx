// [fase 4 · frente EDITOR] Editor de base de dados do Road to Major, estilo FM.
//
// Seções: Bases (criar, renomear, duplicar, exportar/importar JSON, apagar,
// validação), Jogadores e Times (busca, filtros, ficha de edição). Tudo é
// gravado no aparelho (localStorage 'rtm-db-custom-v1'), FORA do save; a
// Carreira escolhe a base na criação e guarda uma cópia congelada.
// A base oficial mostrada aqui é a mesma da Carreira: dados + edições do admin.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database, Download, FilePlus2, Files, PencilLine, Plus, Search, Shield, Trash2, Upload, UserRound, Users } from 'lucide-react';
import type { Player, Role, TeamSeason } from '../../types';
import type { CustomDatabase } from '../../engine/mundo/model';
import { CS2_REAL_2026 } from '../../data/bo3';
import { applyBo3Edits, fetchBo3Edits, loadBo3Edits, mergeBo3Edits, saveBo3Edits, type Bo3Edits } from '../../state/bo3-edits';
import { isAdminUnlocked } from '../AdminGate';
import { loadCustomDbs, saveCustomDbs } from '../../state/customDb';
import {
  CUSTOM_PLAYER_PREFIX, CUSTOM_TEAM_PREFIX, DB_LIMITS, FREE_TEAM_ID, RETIRED_TEAM_ID, ROLES,
  addPlayer, addTeam, applyCustomDatabase, databaseBytes, emptyDatabase, exportDatabaseJson, importDatabaseJson,
  indexOfficial, isSpecialTeam, movePlayer, newDatabaseId, newEntityId, removeAddedPlayer, removeAddedTeam,
  setRoster, validateDatabase, withPlayerEdit, withTeamEdit, type DbIssue, type DbValidation,
} from '../../engine/mundo/editor';
import { attrsOf } from '../../engine/attrs/model';
import { playerOvr } from '../../engine/ratings';
import { baseAge, prospectIdentity } from '../../engine/career/aiWorld';
import { macroRegionOf, MACRO_REGION_LABELS, MACRO_REGION_ORDER, type MacroRegion } from '../../data/regions';
import { logoForTeam } from '../../data/media';
import {
  Alert, Button, EmptyState, GameShell, Ovr, Panel, RoleChip, Segmented, Table, Tag, useToast,
  type Column, type PaletteItem,
} from '../ds/index';
import { Flag, TeamBadge } from '../ui';
import { confirm } from '../ConfirmDialog';
import { ct, setCareerLang } from '../../state/career-i18n';
import { useLang } from '../../state/i18n';
import { PlayerSheet } from './PlayerSheet';
import { TeamSheet } from './TeamSheet';
import { summaryLine } from './CareerDatabaseChoice';
import {
  generatedPlayer, issueKey, playerDraft, playerEditFromDraft, playerFromDraft, regionLabel, teamDraft, teamFieldsFromDraft,
  type PlayerDraft, type TeamDraft,
} from './editorHelpers';
import '../../styles/editor.css';

type Section = 'bases' | 'players' | 'teams';
type StatusFilter = 'all' | 'edited' | 'added';
const ACTIVE_KEY = 'rtm-db-editor-active';
const PAGE = 80;
const OFFICIAL_IDS = CS2_REAL_2026; // estrutura de ids (elencos, validação) — igual com ou sem edição do admin

const readActive = (): string | null => { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } };
const writeActive = (id: string | null) => { try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch { /* sem storage */ } };
const salt = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const nowIso = () => new Date().toISOString();
const own = <T,>(rec: Record<string, T>, id: string): T | undefined => (Object.prototype.hasOwnProperty.call(rec, id) ? rec[id] : undefined);
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

interface PlayerRow { p: Player; team: TeamSeason; status: 'official' | 'edited' | 'added'; ovr: number; ca: number; pa: number; age: number }
interface TeamRow { t: TeamSeason; status: 'official' | 'edited' | 'added'; ovr: number; region: MacroRegion | null }
interface PlayerSheetState { mode: 'edit' | 'create'; id: string; kind: 'official' | 'added'; edited: boolean; fromTeam: string; draft: PlayerDraft }
interface TeamSheetState { mode: 'edit' | 'create'; id: string; kind: 'official' | 'added'; edited: boolean; draft: TeamDraft }

export function DatabaseEditor({ onExit, onPlayCareer }: { onExit: () => void; onPlayCareer?: () => void }) {
  const { lang } = useLang();
  setCareerLang(lang);
  const toast = useToast();

  // base oficial = dados + edições globais do admin (a mesma da Carreira)
  const [bo3Edits, setBo3Edits] = useState<Bo3Edits>(() => loadBo3Edits());
  useEffect(() => {
    let alive = true;
    fetchBo3Edits().then((srv) => {
      if (!alive || !srv) return;
      const next = isAdminUnlocked() ? mergeBo3Edits(srv, loadBo3Edits()) : srv;
      setBo3Edits(next);
      saveBo3Edits(next);
    });
    return () => { alive = false; };
  }, []);
  const official = useMemo(() => applyBo3Edits(CS2_REAL_2026, bo3Edits), [bo3Edits]);
  const officialIdx = useMemo(() => indexOfficial(official), [official]);

  const [dbs, setDbs] = useState<CustomDatabase[]>(() => loadCustomDbs(OFFICIAL_IDS).map((x) => x.db));
  const [activeId, setActiveIdRaw] = useState<string | null>(() => {
    const want = readActive();
    const list = loadCustomDbs(OFFICIAL_IDS);
    return list.find((x) => x.db.id === want)?.db.id ?? list[0]?.db.id ?? null;
  });
  const setActiveId = (id: string | null) => { setActiveIdRaw(id); writeActive(id); };
  const active = dbs.find((d) => d.id === activeId) ?? null;
  const [section, setSection] = useState<Section>(() => (active ? 'players' : 'bases'));
  const [storageError, setStorageError] = useState<string | null>(null);

  const check = useMemo<DbValidation | null>(() => (active ? validateDatabase(active, OFFICIAL_IDS) : null), [active]);
  const world = useMemo(() => applyCustomDatabase(official, active), [official, active]);
  const liveTeams = useMemo(() => world.filter((t) => t.id !== RETIRED_TEAM_ID && !t.defunct), [world]);
  const teamById = useMemo(() => new Map(world.map((t) => [t.id, t] as const)), [world]);
  const teamOfPlayer = useMemo(() => {
    const m = new Map<string, TeamSeason>();
    for (const t of world) for (const p of t.players) if (!m.has(p.id)) m.set(p.id, t);
    return m;
  }, [world]);

  // ── gravação ──
  const persist = (list: CustomDatabase[]): boolean => {
    const r = saveCustomDbs(list);
    if (r.ok) { setStorageError(null); return true; }
    setStorageError(r.reason === 'quota'
      ? ct('Sem espaço neste navegador: a última alteração não foi gravada. Exporte a base em JSON para não perder o trabalho.')
      : ct('Este navegador não deixa gravar dados. Exporte a base em JSON para não perder o trabalho.'));
    return false;
  };
  const commit = (next: CustomDatabase): boolean => {
    const stamped = { ...next, updatedAt: nowIso() };
    if (databaseBytes(stamped) > DB_LIMITS.storedBytes) {
      toast.error(ct('Base grande demais (limite de 256 KB). Desfaça algumas edições ou divida em duas bases.'));
      return false;
    }
    const list = dbs.map((d) => (d.id === stamped.id ? stamped : d));
    setDbs(list);
    persist(list);
    return true;
  };

  // ── nomes nos diagnósticos (ids → nick / nome do time) ──
  const nameRef = useCallback((ref?: string) => {
    if (!ref) return ref;
    return ref.split(' · ').map((tok) => teamById.get(tok)?.team ?? teamOfPlayer.get(tok)?.players.find((p) => p.id === tok)?.nick ?? tok).join(' · ');
  }, [teamById, teamOfPlayer]);
  const newIssues = useCallback((next: CustomDatabase): DbIssue[] => {
    const before = new Set((check?.errors ?? []).map(issueKey));
    return validateDatabase(next, OFFICIAL_IDS).errors.filter((e) => !before.has(issueKey(e))).map((e) => ({ ...e, ref: nameRef(e.ref) }));
  }, [check, nameRef]);

  // ── jogadores ──
  const [pq, setPq] = useState('');
  const [pTeam, setPTeam] = useState('');
  const [pRole, setPRole] = useState<Role | ''>('');
  const [pRegion, setPRegion] = useState<MacroRegion | ''>('');
  const [pStatus, setPStatus] = useState<StatusFilter>('all');
  const [pLimit, setPLimit] = useState(PAGE);
  const addedPlayerIds = useMemo(() => new Set(active?.addedPlayers.map((p) => p.id) ?? []), [active]);
  const addedTeamIds = useMemo(() => new Set(active?.addedTeams.map((t) => t.id) ?? []), [active]);
  const playerRows = useMemo<PlayerRow[]>(() => {
    const out: PlayerRow[] = [];
    for (const t of liveTeams) for (const p of t.players) {
      const x = attrsOf(p);
      const status = addedPlayerIds.has(p.id) ? 'added' : active && own(active.playerEdits, p.id) ? 'edited' : 'official';
      out.push({ p, team: t, status, ovr: playerOvr(p), ca: x.ca, pa: x.pa, age: baseAge(p) });
    }
    return out;
  }, [liveTeams, addedPlayerIds, active]);
  const needle = pq.trim().toLowerCase();
  const filteredPlayers = useMemo(() => playerRows.filter((r) =>
    (!needle || r.p.nick.toLowerCase().includes(needle) || r.p.name.toLowerCase().includes(needle))
    && (!pTeam || r.team.id === pTeam)
    && (!pRole || r.p.role === pRole || r.p.role2 === pRole)
    && (!pRegion || macroRegionOf(r.p.country) === pRegion)
    && (pStatus === 'all' || (pStatus === 'edited' ? r.status === 'edited' : r.status === 'added')),
  ), [playerRows, needle, pTeam, pRole, pRegion, pStatus]);
  const statusCount = useMemo(() => ({
    edited: playerRows.filter((r) => r.status === 'edited').length,
    added: playerRows.filter((r) => r.status === 'added').length,
  }), [playerRows]);

  // ── times ──
  const [tq, setTq] = useState('');
  const [tRegion, setTRegion] = useState<MacroRegion | ''>('');
  const [tStatus, setTStatus] = useState<StatusFilter>('all');
  const teamRows = useMemo<TeamRow[]>(() => liveTeams.filter((t) => !isSpecialTeam(t)).map((t) => {
    const top = t.players.slice(0, 5);
    const ovr = top.length ? Math.round(top.reduce((s, p) => s + playerOvr(p), 0) / top.length) : 0;
    const status = addedTeamIds.has(t.id) ? 'added' : active && own(active.teamEdits, t.id) ? 'edited' : 'official';
    return { t, status, ovr, region: macroRegionOf(t.country) ?? null };
  }), [liveTeams, addedTeamIds, active]);
  const tNeedle = tq.trim().toLowerCase();
  const filteredTeams = useMemo(() => teamRows.filter((r) =>
    (!tNeedle || r.t.team.toLowerCase().includes(tNeedle) || r.t.tag.toLowerCase().includes(tNeedle))
    && (!tRegion || r.region === tRegion)
    && (tStatus === 'all' || (tStatus === 'edited' ? r.status === 'edited' : r.status === 'added')),
  ), [teamRows, tNeedle, tRegion, tStatus]);

  // ── fichas ──
  const [pSheet, setPSheet] = useState<PlayerSheetState | null>(null);
  const [tSheet, setTSheet] = useState<TeamSheetState | null>(null);

  const openPlayer = (id: string) => {
    if (!active) return;
    const t = teamOfPlayer.get(id);
    const p = t?.players.find((x) => x.id === id);
    if (!t || !p) return;
    const kind = addedPlayerIds.has(id) ? 'added' : 'official';
    setPSheet({ mode: 'edit', id, kind, edited: !!own(active.playerEdits, id), fromTeam: t.id, draft: playerDraft(p, t.id) });
  };
  const createPlayer = (teamId = FREE_TEAM_ID) => {
    if (!active) return;
    const taken = new Set([...officialIdx.playerById.keys(), ...addedPlayerIds]);
    const id = newEntityId(CUSTOM_PLAYER_PREFIX, taken, salt());
    const base = generatedPlayer(id, '', 'Rifler', 70, 18, 'br');
    setPSheet({ mode: 'create', id, kind: 'added', edited: false, fromTeam: FREE_TEAM_ID, draft: { ...playerDraft(base, teamId), nick: '', name: '' } });
  };
  const applyPlayerDraft = useCallback((db: CustomDatabase, s: PlayerSheetState, d: PlayerDraft): CustomDatabase => {
    if (s.mode === 'create') return addPlayer(OFFICIAL_IDS, db, playerFromDraft(s.id, d), d.teamId === FREE_TEAM_ID ? null : d.teamId);
    let next: CustomDatabase;
    if (s.kind === 'added') {
      const np = playerFromDraft(s.id, d);
      next = { ...db, addedPlayers: db.addedPlayers.map((p) => (p.id === s.id ? np : p)) };
    } else {
      const orig = officialIdx.playerById.get(s.id);
      next = orig ? withPlayerEdit(db, s.id, playerEditFromDraft(orig, d)) : db;
    }
    return d.teamId !== s.fromTeam ? movePlayer(OFFICIAL_IDS, next, s.id, d.teamId) : next;
  }, [officialIdx]);
  const checkPlayer = useCallback((d: PlayerDraft) => (active && pSheet ? newIssues(applyPlayerDraft(active, pSheet, d)) : []), [active, pSheet, newIssues, applyPlayerDraft]);
  const savePlayer = (d: PlayerDraft) => {
    if (!active || !pSheet) return;
    if (commit(applyPlayerDraft(active, pSheet, d))) {
      toast.success(pSheet.mode === 'create' ? ct('Jogador criado') : ct('Jogador salvo'));
      setPSheet(null);
    }
  };

  const openTeam = (id: string) => {
    if (!active) return;
    const t = teamById.get(id);
    if (!t) return;
    const kind = addedTeamIds.has(id) ? 'added' : 'official';
    setTSheet({ mode: 'edit', id, kind, edited: !!own(active.teamEdits, id), draft: teamDraft(t) });
  };
  const createTeam = () => {
    if (!active) return;
    const taken = new Set([...officialIdx.teamById.keys(), ...addedTeamIds]);
    const id = newEntityId(CUSTOM_TEAM_PREFIX, taken, salt());
    setTSheet({
      mode: 'create', id, kind: 'added', edited: false,
      draft: { team: '', tag: '', country: 'br', colors: ['#1d3557', '#f1c453'], teamwork: 70, coach: { nick: '', name: '', country: 'br', rating: 70, style: 'tactical' }, roster: [] },
    });
  };
  const makeGenerated = useCallback((n: number, country: string, taken: Set<string>): Player[] => {
    const roles: Role[] = ['IGL', 'AWP', 'Entry', 'Rifler', 'Support', 'Lurker'];
    const out: Player[] = [];
    for (let i = 0; i < n; i++) {
      const id = newEntityId(CUSTOM_PLAYER_PREFIX, taken, salt());
      taken.add(id);
      const role = roles[(taken.size + i) % roles.length];
      const who = prospectIdentity(id, macroRegionOf(country) ?? 'europe', country);
      const p = generatedPlayer(id, who.nick, role, 64 + ((taken.size * 7 + i * 3) % 10), 17 + ((i * 2) % 4), who.country);
      out.push({ ...p, name: who.name });
    }
    return out;
  }, []);
  const applyTeamDraft = useCallback((db: CustomDatabase, s: TeamSheetState, d: TeamDraft, generated: Player[]): CustomDatabase => {
    let next = db;
    for (const p of generated) next = addPlayer(OFFICIAL_IDS, next, p, null);
    const fields = teamFieldsFromDraft(s.kind === 'official' ? officialIdx.teamById.get(s.id) : undefined, d);
    if (s.mode === 'create') {
      const t: TeamSeason = {
        id: s.id, team: fields.team ?? d.team.trim(), tag: fields.tag ?? d.tag.trim().toUpperCase(), country: d.country, colors: d.colors,
        teamwork: d.teamwork, coach: fields.coach ?? d.coach, era: '2026', game: 'CS2', honors: '', mapPrefs: {}, players: [],
      };
      return addTeam(OFFICIAL_IDS, next, t, d.roster);
    }
    if (s.kind === 'added') {
      next = {
        ...next,
        addedTeams: next.addedTeams.map((t) => (t.id === s.id ? {
          ...t, team: d.team.trim(), tag: d.tag.trim().toUpperCase(), country: d.country, colors: d.colors, teamwork: d.teamwork,
          coach: fields.coach ?? { ...d.coach, nick: d.coach.nick.trim(), name: d.coach.name.trim() || d.coach.nick.trim() },
        } : t)),
      };
    } else {
      const cur = own(next.teamEdits, s.id);
      const e = { ...fields, ...(cur?.roster ? { roster: cur.roster } : {}) };
      next = withTeamEdit(next, s.id, Object.keys(e).length ? e : null);
    }
    const now = teamById.get(s.id)?.players.map((p) => p.id) ?? [];
    const changed = now.length !== d.roster.length || now.some((id, i) => id !== d.roster[i]);
    return changed ? setRoster(OFFICIAL_IDS, next, s.id, d.roster) : next;
  }, [officialIdx, teamById]);
  const checkTeam = useCallback((d: TeamDraft, generated: Player[]) => (active && tSheet ? newIssues(applyTeamDraft(active, tSheet, d, generated)) : []), [active, tSheet, newIssues, applyTeamDraft]);
  const saveTeam = (d: TeamDraft, generated: Player[]) => {
    if (!active || !tSheet) return;
    if (commit(applyTeamDraft(active, tSheet, d, generated))) {
      toast.success(tSheet.mode === 'create' ? ct('Time criado') : ct('Time salvo'));
      setTSheet(null);
    }
  };

  // ── bases ──
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<DbValidation | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const full = dbs.length >= DB_LIMITS.databases;
  const createDb = () => {
    if (full) return;
    const db = emptyDatabase(newName.trim() || `${ct('Minha base')} ${dbs.length + 1}`, dbs.map((d) => d.id), nowIso(), salt());
    const list = [...dbs, db];
    setDbs(list);
    persist(list);
    setActiveId(db.id);
    setNewName('');
    toast.success(ct('Base criada'));
    setSection('players');
  };
  const duplicateDb = (db: CustomDatabase) => {
    if (full) return;
    const copy: CustomDatabase = { ...structuredClone(db), id: newDatabaseId(dbs.map((d) => d.id), salt()), name: `${db.name} (${ct('cópia')})`.slice(0, DB_LIMITS.dbNameLen), createdAt: nowIso(), updatedAt: nowIso() };
    const list = [...dbs, copy];
    setDbs(list);
    persist(list);
    toast.success(ct('Base duplicada'));
  };
  const renameDb = () => {
    if (!renaming) return;
    const name = renaming.name.trim().slice(0, DB_LIMITS.dbNameLen);
    const db = dbs.find((d) => d.id === renaming.id);
    if (db && name) commit({ ...db, name });
    setRenaming(null);
  };
  const deleteDb = async (db: CustomDatabase) => {
    const ok = await confirm({
      title: ct('Apagar base?'),
      message: `${db.name}: ${ct('as carreiras que já usam esta base continuam com a cópia delas. Não tem volta.')}`,
      confirmLabel: ct('Apagar'), cancelLabel: ct('Cancelar'), danger: true,
    });
    if (!ok) return;
    const list = dbs.filter((d) => d.id !== db.id);
    setDbs(list);
    persist(list);
    if (activeId === db.id) setActiveId(list[0]?.id ?? null);
    toast.success(ct('Base apagada'));
  };
  const exportDb = (db: CustomDatabase) => {
    try {
      const blob = new Blob([exportDatabaseJson(db)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${db.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'base'}.road-to-major.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(ct('Base exportada'));
    } catch {
      toast.error(ct('Não foi possível exportar neste navegador.'));
    }
  };
  const runImport = (text: string) => {
    const r = importDatabaseJson(text, OFFICIAL_IDS, dbs.map((d) => d.id), salt(), nowIso());
    setImportResult(r);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > DB_LIMITS.importBytes) {
      setImportResult({ ok: false, db: null, errors: [{ level: 'error', code: 'file-too-big', text: 'Arquivo grande demais (limite de 1 MB)' }], warnings: [], bytes: 0 });
      return;
    }
    try { runImport(await f.text()); } catch { setImportResult({ ok: false, db: null, errors: [{ level: 'error', code: 'read', text: 'Não foi possível ler o arquivo' }], warnings: [], bytes: 0 }); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const confirmImport = () => {
    if (!importResult?.ok || !importResult.db || full) return;
    const list = [...dbs, importResult.db];
    setDbs(list);
    persist(list);
    setActiveId(importResult.db.id);
    setImportResult(null);
    setImportText('');
    toast.success(ct('Base importada'));
  };
  const openRef = (ref?: string) => {
    if (!ref) return;
    const id = ref.split(' · ')[0];
    if (teamById.has(id) && !isSpecialTeam({ id })) { setSection('teams'); openTeam(id); }
    else if (teamOfPlayer.has(id)) { setSection('players'); openPlayer(id); }
  };

  // ── colunas ──
  const statusTag = (s: 'official' | 'edited' | 'added') => (s === 'edited' ? <Tag tone="accent">{ct('Editado')}</Tag> : s === 'added' ? <Tag tone="win">{ct('Novo')}</Tag> : null);
  const pCols: Column<PlayerRow>[] = [
    {
      key: 'nick', header: ct('Jogador'), sort: (r) => r.p.nick.toLowerCase(),
      cell: (r) => (
        <span className="edb-who">
          <span className="edb-who__txt">
            <b>{r.p.nick}</b>
            <small><Flag cc={r.p.country} /> {r.p.name}</small>
          </span>
        </span>
      ),
    },
    { key: 'team', header: ct('Time'), sort: (r) => r.team.team, cell: (r) => (r.team.id === FREE_TEAM_ID ? <span className="edb-dim">{ct('Sem time')}</span> : r.team.tag) },
    { key: 'role', header: ct('Função'), sort: (r) => r.p.role, cell: (r) => <RoleChip role={r.p.role} /> },
    { key: 'age', header: ct('Idade'), num: true, sort: (r) => r.age, cell: (r) => r.age },
    { key: 'ovr', header: 'OVR', num: true, sort: (r) => r.ovr, cell: (r) => <Ovr value={r.ovr} size="sm" /> },
    { key: 'ca', header: ct('CA'), num: true, sort: (r) => r.ca, cell: (r) => r.ca },
    { key: 'pa', header: ct('PA'), num: true, sort: (r) => r.pa, cell: (r) => r.pa },
    { key: 'st', header: '', cell: (r) => statusTag(r.status) },
  ];
  const tCols: Column<TeamRow>[] = [
    {
      key: 'team', header: ct('Time'), sort: (r) => r.t.team.toLowerCase(),
      cell: (r) => (
        <span className="edb-who">
          <TeamBadge tag={r.t.tag} colors={r.t.colors} size={28} logoUrl={r.status === 'added' ? undefined : (r.t.logoUrl ?? logoForTeam(r.t))} />
          <span className="edb-who__txt">
            <b>{r.t.team}</b>
            <small><Flag cc={r.t.country} /> {regionLabel(r.t.country)}</small>
          </span>
        </span>
      ),
    },
    { key: 'tag', header: ct('Tag'), sort: (r) => r.t.tag, cell: (r) => r.t.tag },
    { key: 'n', header: ct('Elenco'), num: true, sort: (r) => r.t.players.length, cell: (r) => r.t.players.length },
    { key: 'ovr', header: 'OVR', num: true, sort: (r) => r.ovr, cell: (r) => <Ovr value={r.ovr} size="sm" /> },
    { key: 'tw', header: ct('Entros.'), num: true, sort: (r) => r.t.teamwork, cell: (r) => r.t.teamwork },
    { key: 'coach', header: ct('Técnico'), sort: (r) => r.t.coach.nick, cell: (r) => r.t.coach.nick },
    { key: 'st', header: '', cell: (r) => statusTag(r.status) },
  ];

  // ── paleta de comandos: jogadores e times da base ──
  const search = (q: string): PaletteItem[] => {
    const n = q.trim().toLowerCase();
    if (n.length < 2 || !active) return [];
    const ps = playerRows.filter((r) => r.p.nick.toLowerCase().includes(n)).slice(0, 8)
      .map((r) => ({ id: `p-${r.p.id}`, label: r.p.nick, sub: r.team.team, group: ct('Jogadores'), icon: UserRound, run: () => { setSection('players'); openPlayer(r.p.id); } }));
    const ts = teamRows.filter((r) => r.t.team.toLowerCase().includes(n) || r.t.tag.toLowerCase().includes(n)).slice(0, 5)
      .map((r) => ({ id: `t-${r.t.id}`, label: r.t.team, sub: r.t.tag, group: ct('Times'), icon: Shield, run: () => { setSection('teams'); openTeam(r.t.id); } }));
    return [...ps, ...ts];
  };

  const regionOpts = MACRO_REGION_ORDER.map((r) => <option key={r} value={r}>{ct(MACRO_REGION_LABELS[r])}</option>);
  const noBase = (
    <EmptyState
      icon={<Database size={28} />}
      title={ct('Nenhuma base aberta')}
      action={<Button variant="primary" onClick={() => setSection('bases')}>{ct('Criar ou abrir uma base')}</Button>}
    >
      {ct('Crie uma base (ela começa igual à oficial) ou importe um arquivo JSON para editar jogadores e times.')}
    </EmptyState>
  );
  const invalidAlert = check && !check.ok && (
    <Alert tone="warn" title={`${check.errors.length} ${check.errors.length === 1 ? ct('problema nesta base') : ct('problemas nesta base')}`} action={<Button size="sm" variant="ghost" onClick={() => setSection('bases')}>{ct('Ver')}</Button>}>
      {ct('Enquanto houver erro, esta base não aparece para uma carreira nova.')}
    </Alert>
  );

  let body;
  if (section === 'players') {
    body = !active ? noBase : (
      <>
        {invalidAlert}
        <Panel flush icon={<UserRound size={16} />} title={ct('Jogadores')} actions={<Button size="sm" variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => createPlayer()}>{ct('Adicionar jogador')}</Button>}>
          <div className="edb-toolbar">
            <input className="edb-input" type="search" placeholder={ct('Buscar por nick ou nome…')} aria-label={ct('Buscar jogador')} value={pq} onChange={(e) => { setPq(e.target.value); setPLimit(PAGE); }} />
            <select className="edb-select" aria-label={ct('Time')} value={pTeam} onChange={(e) => { setPTeam(e.target.value); setPLimit(PAGE); }}>
              <option value="">{ct('Todos os times')}</option>
              <option value={FREE_TEAM_ID}>{ct('Sem time (free agent)')}</option>
              {[...teamRows].sort((a, b) => a.t.team.localeCompare(b.t.team, 'pt-BR')).map((r) => <option key={r.t.id} value={r.t.id}>{r.t.team}</option>)}
            </select>
            <select className="edb-select" aria-label={ct('Função')} value={pRole} onChange={(e) => { setPRole(e.target.value as Role | ''); setPLimit(PAGE); }}>
              <option value="">{ct('Todas as funções')}</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className="edb-select" aria-label={ct('Região')} value={pRegion} onChange={(e) => { setPRegion(e.target.value as MacroRegion | ''); setPLimit(PAGE); }}>
              <option value="">{ct('Todas as regiões')}</option>
              {regionOpts}
            </select>
            <Segmented label={ct('Mostrar')} value={pStatus} onChange={(v) => { setPStatus(v); setPLimit(PAGE); }} items={[
              { value: 'all', label: ct('Todos') },
              { value: 'edited', label: ct('Editados'), count: statusCount.edited },
              { value: 'added', label: ct('Novos'), count: statusCount.added },
            ]} />
          </div>
          <div className="edb-count">{filteredPlayers.length} {filteredPlayers.length === 1 ? ct('jogador') : ct('jogadores')}</div>
          <Table
            columns={pCols}
            rows={filteredPlayers.slice(0, pLimit)}
            rowKey={(r) => r.p.id}
            caption={ct('Jogadores da base')}
            onRowClick={(r) => openPlayer(r.p.id)}
            defaultSort={{ key: 'ovr', dir: 'desc' }}
            empty={<EmptyState title={ct('Nenhum jogador com esses filtros')} />}
          />
          {filteredPlayers.length > pLimit && (
            <div className="edb-more"><Button variant="secondary" onClick={() => setPLimit((n) => n + PAGE * 2)}>{ct('Mostrar mais')} ({filteredPlayers.length - pLimit})</Button></div>
          )}
        </Panel>
      </>
    );
  } else if (section === 'teams') {
    body = !active ? noBase : (
      <>
        {invalidAlert}
        <Panel flush icon={<Users size={16} />} title={ct('Times')} actions={<Button size="sm" variant="primary" icon={<Plus size={15} aria-hidden />} disabled={(active.addedTeams.length ?? 0) >= DB_LIMITS.addedTeams} onClick={createTeam}>{ct('Adicionar time')}</Button>}>
          <div className="edb-toolbar">
            <input className="edb-input" type="search" placeholder={ct('Buscar por nome ou tag…')} aria-label={ct('Buscar time')} value={tq} onChange={(e) => setTq(e.target.value)} />
            <select className="edb-select" aria-label={ct('Região')} value={tRegion} onChange={(e) => setTRegion(e.target.value as MacroRegion | '')}>
              <option value="">{ct('Todas as regiões')}</option>
              {regionOpts}
            </select>
            <Segmented label={ct('Mostrar')} value={tStatus} onChange={setTStatus} items={[
              { value: 'all', label: ct('Todos') },
              { value: 'edited', label: ct('Editados'), count: teamRows.filter((r) => r.status === 'edited').length },
              { value: 'added', label: ct('Novos'), count: teamRows.filter((r) => r.status === 'added').length },
            ]} />
          </div>
          <div className="edb-count">{filteredTeams.length} {filteredTeams.length === 1 ? ct('time') : ct('times')}</div>
          <Table
            columns={tCols}
            rows={filteredTeams}
            rowKey={(r) => r.t.id}
            caption={ct('Times da base')}
            onRowClick={(r) => openTeam(r.t.id)}
            defaultSort={{ key: 'ovr', dir: 'desc' }}
            empty={<EmptyState title={ct('Nenhum time com esses filtros')} />}
          />
        </Panel>
      </>
    );
  } else {
    body = (
      <>
        {storageError && <Alert tone="danger">{storageError}</Alert>}
        <Panel icon={<Database size={16} />} title={`${ct('Suas bases')} · ${dbs.length}/${DB_LIMITS.databases}`}>
          <p className="edb-note">{ct('Cada base guarda só o que você mudou em cima da base oficial (elencos reais + ajustes da equipe). Ela fica neste aparelho, fora do save; uma carreira nova escolhe a base na criação e guarda uma cópia.')}</p>
          {dbs.length === 0 ? (
            <EmptyState icon={<Database size={28} />} title={ct('Nenhuma base ainda')}>{ct('Dê um nome e crie a primeira, ou importe um arquivo.')}</EmptyState>
          ) : (
            <div className="edb-bases">
              {dbs.map((db) => {
                const v = db.id === active?.id && check ? check : validateDatabase(db, OFFICIAL_IDS);
                return (
                  <div key={db.id} className="edb-base" data-active={db.id === active?.id}>
                    <div className="edb-base__head">
                      {renaming?.id === db.id ? (
                        <input className="edb-input edb-grow" autoFocus value={renaming.name} maxLength={DB_LIMITS.dbNameLen} aria-label={ct('Nome da base')}
                          onChange={(e) => setRenaming({ id: db.id, name: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') renameDb(); if (e.key === 'Escape') setRenaming(null); }}
                          onBlur={renameDb} />
                      ) : <b title={db.name}>{db.name}</b>}
                      {v.ok ? <Tag tone="win">{ct('Válida')}</Tag> : <Tag tone="loss">{v.errors.length} {v.errors.length === 1 ? ct('erro') : ct('erros')}</Tag>}
                    </div>
                    <span className="edb-base__meta">{summaryLine(db)}</span>
                    <span className="edb-dim">{db.updatedAt ? new Date(db.updatedAt).toLocaleString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''} · {kb(databaseBytes(db))}</span>
                    <div className="edb-base__actions">
                      <Button size="sm" variant={db.id === active?.id ? 'secondary' : 'primary'} icon={<PencilLine size={14} aria-hidden />} onClick={() => { setActiveId(db.id); setSection('players'); }}>{db.id === active?.id ? ct('Editando') : ct('Editar')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRenaming({ id: db.id, name: db.name })}>{ct('Renomear')}</Button>
                      <Button size="sm" variant="ghost" icon={<Files size={14} aria-hidden />} disabled={full} onClick={() => duplicateDb(db)}>{ct('Duplicar')}</Button>
                      <Button size="sm" variant="ghost" icon={<Download size={14} aria-hidden />} onClick={() => exportDb(db)}>{ct('Exportar')}</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} aria-hidden />} aria-label={`${ct('Apagar')} ${db.name}`} onClick={() => { void deleteDb(db); }}>{ct('Apagar')}</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="edb-sec">{ct('Nova base')}</div>
          <div className="edb-new">
            <input className="edb-input" placeholder={ct('Nome da base (ex.: Minha liga)')} aria-label={ct('Nome da nova base')} value={newName} maxLength={DB_LIMITS.dbNameLen} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createDb()} />
            <Button variant="primary" icon={<FilePlus2 size={15} aria-hidden />} disabled={full} onClick={createDb}>{ct('Criar base')}</Button>
          </div>
          {full && <p className="edb-dim">{ct('Limite de 5 bases neste aparelho: apague ou exporte uma para criar outra.')}</p>}
        </Panel>

        <div className="edb-grid2">
          <Panel icon={<Upload size={16} />} title={ct('Importar base (JSON)')}>
            <p className="edb-note">{ct('Arquivo exportado pelo editor do Road to Major, até 1 MB. Tudo é validado antes de entrar: nada quebra o jogo.')}</p>
            <div className="edb-new">
              <input ref={fileRef} type="file" accept="application/json,.json" className="edb-input edb-grow" aria-label={ct('Escolher arquivo')} onChange={(e) => { void onFile(e.target.files?.[0]); }} />
            </div>
            <div className="edb-sec">{ct('Ou cole o JSON')}</div>
            <textarea className="edb-text" value={importText} maxLength={DB_LIMITS.importBytes + 1} aria-label={ct('JSON da base')} onChange={(e) => setImportText(e.target.value)} placeholder='{"v":1,"id":"cdb_…","name":"…"}' />
            <div className="edb-new">
              <Button variant="secondary" disabled={!importText.trim()} onClick={() => runImport(importText)}>{ct('Validar')}</Button>
            </div>
            {importResult && (
              importResult.ok && importResult.db ? (
                <Alert tone="success" title={`${ct('Pronta para importar')}: ${importResult.db.name}`} action={<Button variant="primary" size="sm" disabled={full} onClick={confirmImport}>{ct('Importar')}</Button>}>
                  {summaryLine(importResult.db)}{importResult.warnings.length ? ` · ${importResult.warnings.length} ${ct('avisos')}` : ''}
                </Alert>
              ) : (
                <Alert tone="danger" title={ct('Arquivo recusado')}>
                  <ul className="edb-issues">
                    {importResult.errors.slice(0, 8).map((i, n) => <li key={n} className="edb-issue" data-level="error"><b>{ct(i.text)}</b>{i.ref && <small>{i.ref}</small>}</li>)}
                  </ul>
                  {importResult.errors.length > 8 && <span className="edb-dim">+{importResult.errors.length - 8}</span>}
                </Alert>
              )
            )}
          </Panel>

          <Panel icon={<Search size={16} />} title={active ? `${ct('Validação')} · ${active.name}` : ct('Validação')}>
            {!active || !check ? <p className="edb-dim">{ct('Abra uma base para ver a validação.')}</p> : (
              <>
                {check.ok
                  ? <Alert tone="success">{ct('Base válida: pode ser escolhida numa carreira nova.')}</Alert>
                  : <Alert tone="warn">{ct('Enquanto houver erro, esta base não aparece para uma carreira nova.')}</Alert>}
                {(check.errors.length > 0 || check.warnings.length > 0) && (
                  <ul className="edb-issues">
                    {[...check.errors, ...check.warnings].slice(0, 30).map((i, n) => (
                      <li key={n} className="edb-issue" data-level={i.level}>
                        <b>{ct(i.text)}</b>
                        {i.ref && <button type="button" onClick={() => openRef(i.ref)}>{nameRef(i.ref)}</button>}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="edb-dim">{kb(check.bytes)} {ct('de')} {kb(DB_LIMITS.storedBytes)}</p>
              </>
            )}
          </Panel>
        </div>
      </>
    );
  }

  const sectionTitle = section === 'players' ? ct('Jogadores') : section === 'teams' ? ct('Times') : ct('Bases');
  return (
    <GameShell
      mode="carreira"
      identity={{ title: ct('Editor de base'), subtitle: active ? active.name : ct('Nenhuma base aberta'), badge: <Database size={26} aria-hidden /> }}
      nav={[{
        id: 'editor', label: ct('Editor de base'), items: [
          { id: 'bases', label: ct('Bases'), short: ct('Bases'), icon: Database, badge: check && !check.ok ? check.errors.length : undefined, badgeTone: 'loss' },
          { id: 'players', label: ct('Jogadores'), short: ct('Jogadores'), icon: UserRound },
          { id: 'teams', label: ct('Times'), short: ct('Times'), icon: Shield },
        ],
      }]}
      active={section}
      onNav={(id) => { if (id === 'bases' || id === 'players' || id === 'teams') setSection(id); }}
      mobileNav={['bases', 'players', 'teams']}
      title={sectionTitle}
      crumbs={[{ label: ct('Editor de base'), onGo: () => setSection('bases') }]}
      search={search}
      searchPlaceholder={ct('Buscar jogador ou time da base…')}
      next={onPlayCareer
        ? { label: ct('Carreira'), detail: check?.ok ? `${ct('Nova carreira')} · ${active?.name ?? ''}` : ct('Voltar para a carreira'), onGo: onPlayCareer }
        : { label: ct('Sair'), detail: ct('Voltar ao início'), onGo: onExit }}
    >
      <div className="edb">{body}</div>
      {pSheet && active && (
        <PlayerSheet
          key={pSheet.id}
          open
          mode={pSheet.mode}
          kind={pSheet.kind}
          edited={pSheet.edited}
          initial={pSheet.draft}
          teams={liveTeams}
          check={checkPlayer}
          onSave={savePlayer}
          onReset={() => { if (commit(withPlayerEdit(active, pSheet.id, null))) { toast.success(ct('Jogador restaurado')); setPSheet(null); } }}
          onDelete={() => { if (commit(removeAddedPlayer(active, pSheet.id))) { toast.success(ct('Jogador apagado')); setPSheet(null); } }}
          onClose={() => setPSheet(null)}
        />
      )}
      {tSheet && active && (
        <TeamSheet
          key={tSheet.id}
          open
          mode={tSheet.mode}
          kind={tSheet.kind}
          edited={tSheet.edited}
          teamId={tSheet.id}
          initial={tSheet.draft}
          teams={liveTeams}
          check={checkTeam}
          makeGenerated={makeGenerated}
          onSave={saveTeam}
          onReset={() => { if (commit(withTeamEdit(active, tSheet.id, null))) { toast.success(ct('Time restaurado')); setTSheet(null); } }}
          onDelete={() => { if (commit(removeAddedTeam(active, tSheet.id))) { toast.success(ct('Time apagado')); setTSheet(null); } }}
          onClose={() => setTSheet(null)}
        />
      )}
    </GameShell>
  );
}
