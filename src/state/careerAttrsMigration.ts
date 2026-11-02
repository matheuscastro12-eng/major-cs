// [realismo FM · frente B] Migração do save da Carreira v26 → v27: grava os
// atributos (fonte da verdade) de todo jogador guardado no save.
//
//   - elenco: `playerSnapshot.attrs` = atributos da base do jogador e, para quem
//     já tinha evolução escalar (`evo` + viés do foco), `attrEvo[id]` = a mesma
//     evolução expressa atributo a atributo (os 5 números resultantes batem com
//     os que o save mostrava);
//   - prospectos promovidos (`youth`), elenco do Custom Roster (`customPlayers`)
//     e vendidos a clubes da IA (`extraOnTeam`): `attrs` gravados.
// Pura e idempotente: só preenche o que falta.
import type { VersionedSave } from './saveMigrations';
import { attrsOf, type AttrsSource, type PlayerAttrs } from '../engine/attrs/model';
import { attrDeltaFromScalarEvo, normalizeAttrEvo, type AttrEvoMap } from '../engine/career/attrEvo';
import type { Role } from '../types';

type PlayerLike = AttrsSource & { attrs?: PlayerAttrs | null };

const ROLES: Role[] = ['AWP', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'];
function isPlayerLike(p: unknown): p is PlayerLike {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.id === 'string' && ROLES.includes(o.role as Role)
    && ['aim', 'awp', 'igl', 'clutch', 'consistency'].every((k) => typeof o[k] === 'number' && Number.isFinite(o[k] as number));
}

function stamp<T>(p: T): T {
  if (!isPlayerLike(p) || (p.attrs && p.attrs.v === 1)) return p;
  return { ...p, attrs: attrsOf(p) };
}

export function migrateCareerAttrs(save: VersionedSave): VersionedSave {
  const evo = (save.evo && typeof save.evo === 'object' ? save.evo : {}) as Record<string, number>;
  const bias = (save.evoAttrBias && typeof save.evoAttrBias === 'object' ? save.evoAttrBias : {}) as Record<string, Record<string, number>>;
  const attrEvo: AttrEvoMap = normalizeAttrEvo(save.attrEvo);

  const squad = Array.isArray(save.squad)
    ? (save.squad as { playerId?: unknown; playerSnapshot?: unknown }[]).map((sig) => {
      if (!sig || typeof sig !== 'object') return sig;
      const snap = sig.playerSnapshot;
      if (!isPlayerLike(snap)) return sig;
      const pid = typeof sig.playerId === 'string' ? sig.playerId : snap.id;
      const d = evo[pid];
      if (!(pid in attrEvo) && typeof d === 'number' && Number.isFinite(d)) {
        attrEvo[pid] = attrDeltaFromScalarEvo(snap, d, bias[pid]);
      }
      return { ...sig, playerSnapshot: stamp(snap) };
    })
    : save.squad;

  const stampRecord = (rec: unknown) => {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return rec;
    return Object.fromEntries(Object.entries(rec as Record<string, unknown>).map(([k, p]) => [k, stamp(p)]));
  };
  const extraOnTeam = save.extraOnTeam && typeof save.extraOnTeam === 'object' && !Array.isArray(save.extraOnTeam)
    ? Object.fromEntries(Object.entries(save.extraOnTeam as Record<string, unknown>).map(([team, list]) => [
      team,
      Array.isArray(list) ? list.map((e) => (e && typeof e === 'object' ? { ...e, player: stamp((e as { player?: unknown }).player) } : e)) : list,
    ]))
    : save.extraOnTeam;

  return {
    ...save,
    squad,
    youth: stampRecord(save.youth),
    customPlayers: stampRecord(save.customPlayers),
    extraOnTeam,
    attrEvo,
  };
}
