// Aba Squad — T1.4. Saiu de IIFE inline no CareerScreen (hubTab === 'squad').
// Aba MAIOR: 4 cards (Cinco titular, Química, Coach stints, Scrim, Scouting,
// Gestão do elenco, Playbook, Treino de mapa, Melhores do circuito).

import { DashCard } from '../../components/ds';
import { CareerIcon } from '../../components/career/CareerIcon';
import { Flag } from '../../components/ui';
import { FutCard } from '../../components/FutCard';
import { PlayerLink } from '../../components/career/PlayerLink';
// T9.1: API global de comparação de players
import { openCompare } from '../../components/CompareHost';
import { ChemistryMatrix } from '../../components/career/ChemistryMatrix';
import { CoachStintsCard } from '../../components/career/CoachStintsCard';
import { ScrimCard } from '../../components/career/ScrimCard';
import { ScoutingCard } from '../../components/career/ScoutingCard';
import {
  ROLE_OPTS,
  MAP_FOCUS_MAX,
  MAP_TRAIN_MAX,
  MAP_TRAIN_MIN,
  PLAYBOOK_SWITCH_TO,
  MORALE_DEFAULT,
  mapLevel,
  mapFocusList,
  moraleInfo,
  PHASE_LABEL,
  playerPhase,
  effectiveAge,
  playerPotentialOvr,
  BestPlayers,
  type Signing,
  type SeasonStat,
} from '../../components/CareerScreen';
import type { YouthDebut } from '../../engine/career/playerAge';
import { fatigueBand } from '../../engine/career/fatigue';
import { activeStint as activeCoachStint } from '../../engine/coachCareer';
import { playerOrgId } from '../../state/career-player-route';
import { ct } from '../../state/career-i18n';
import { playerOvr } from '../../engine/ratings';
import { MAP_POOL, MAP_LABELS, PLAYBOOK_LABELS, PLAYBOOK_DESC, type MapId, type Playbook, type Player, type Role } from '../../types';

interface SquadTabSave {
  squad: Signing[];
  roles?: Record<string, Role>;
  trainingFocus?: string | null;
  mapTraining?: Partial<Record<MapId, number>>;
  mapFocus?: MapId[] | null;
  playbook?: Playbook;
  playbookXp?: number;
  playbookMem?: Partial<Record<Playbook, number>>;
  pairChem?: Record<string, number>;
  coachStints?: Array<{ coachNick?: string; [k: string]: unknown }>;
  scrimsThisSplit?: number;
  hiredScoutId?: string | null;
  scoutReports?: unknown[];
  budget: number;
  evo?: Record<string, number>;
  morale?: Record<string, number>;
  fatigue?: Record<string, number>;
  restingPlayers?: string[];
  youthAge?: Record<string, number>;
  youthDebut?: Record<string, YouthDebut>;
  circuit?: { name?: string } | null;
  split: number;
  [key: string]: unknown;
}

interface Props {
  save: SquadTabSave;
  findSigning: (s: Signing) => { player: Player } | null;
  update: (patch: Record<string, unknown>) => void;
  openPlayerProfile: (p: Player) => void;
  doScrim: () => void;
  hireScout: (id: string) => void;
  fireScout: () => void;
  seasonStats: SeasonStat[];
  mySquadIds: Set<string>;
}

export function SquadTab({
  save,
  findSigning,
  update,
  openPlayerProfile,
  doScrim,
  hireScout,
  fireScout,
  seasonStats,
  mySquadIds,
}: Props) {
  const rows = save.squad.map((sig) => findSigning(sig)?.player).filter(Boolean) as Player[];
  const hasAwp = rows.some((p) => p.role === 'AWP' || p.role2 === 'AWP');
  const hasIgl = rows.some((p) => p.role === 'IGL' || p.role2 === 'IGL');

  const setRole = (pid: string, role: Role) =>
    update({ roles: { ...(save.roles ?? {}), [pid]: role } });
  const setFocus = (pid: string) =>
    update({ trainingFocus: save.trainingFocus === pid ? null : pid });
  const setMapFocus = (m: MapId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur = mapFocusList(save as any);
    if (cur.includes(m)) {
      update({ mapFocus: cur.filter((x) => x !== m) });
    } else if (cur.length < MAP_FOCUS_MAX) {
      update({ mapFocus: [...cur, m] });
    }
  };
  const setPlaybook = (pb: Playbook) => {
    if (pb === save.playbook) return;
    const mem = { ...(save.playbookMem ?? {}) };
    if (save.playbook) mem[save.playbook] = save.playbookXp ?? 0;
    const restored = mem[pb] ?? PLAYBOOK_SWITCH_TO;
    update({ playbook: pb, playbookXp: restored, playbookMem: mem });
  };
  const fam = save.playbookXp ?? 0;

  return (
    <div className="em-tab em-squad">
      <DashCard
        title={ct('Cinco titular')}
        actions={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {/* T9.1: comparar todos os titulares de uma vez */}
            {rows.length >= 2 && (
              <button
                type="button"
                onClick={() => openCompare(rows.slice(0, 4))}
                title={ct('Comparar os 4 primeiros titulares lado a lado')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--em-text)',
                  border: '1px solid var(--em-border)',
                  borderRadius: 3,
                }}
              >
                ⇄ {ct('Comparar')}
              </button>
            )}
            <span className="em-ovr-badge">
              {rows.length ? Math.round(rows.reduce((a, p) => a + playerOvr(p), 0) / rows.length) : 0} OVR
            </span>
          </span>
        }
      >
        <div className="em-fut-row">
          {rows.map((p) => <FutCard key={p.id} player={p} onClick={() => openPlayerProfile(p)} />)}
        </div>
      </DashCard>

      {/* T3.4: matriz de química do elenco */}
      {rows.length >= 2 && (
        <ChemistryMatrix
          state={{ pairChem: save.pairChem }}
          players={rows.map((p) => ({ id: playerOrgId(p.id), nick: p.nick }))}
          title={ct('Química do elenco')}
        />
      )}

      {/* T3.11: carreira do coach */}
      <CoachStintsCard
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stints={(save.coachStints ?? []) as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        coachNick={activeCoachStint((save.coachStints ?? []) as any)?.coachNick}
      />

      {/* T3.8: scrim semanal */}
      <ScrimCard
        scrimsThisSplit={save.scrimsThisSplit ?? 0}
        budget={save.budget}
        onScrim={doScrim}
      />

      {/* T3.12: scouting */}
      <ScoutingCard
        hiredScoutId={save.hiredScoutId ?? null}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        scoutReports={(save.scoutReports ?? []) as any}
        budget={save.budget}
        onHire={hireScout}
        onFire={fireScout}
      />

      <div className="em-squad-grid">
        <DashCard title={ct('Gestão do elenco')}>
          {(!hasAwp || !hasIgl) && (
            <div className="role-warn">
              ⚠️ {ct('Seu time está sem')} {!hasAwp && !hasIgl ? ct('AWP e IGL') : !hasAwp ? 'AWPer' : 'IGL'}.
              {ct('Ajuste a função de um jogador abaixo para cobrir.')}
            </div>
          )}
          <div className="career-squad big">
            {rows.map((p) => {
              const rid = `user__${p.id}`;
              const st = seasonStats.find((s) => s.id === rid);
              const focused = save.trainingFocus === p.id;
              const grew = save.evo?.[p.id] ?? 0;
              const mor = save.morale?.[p.id] ?? MORALE_DEFAULT;
              const mi = moraleInfo(mor);
              const fatigue = save.fatigue?.[p.id] ?? 0;
              const reduced = save.restingPlayers?.includes(p.id) ?? false;
              const age = effectiveAge(p, save.split, save.youthAge, save.youthDebut);
              const potential = playerPotentialOvr(p, age);
              const phase = playerPhase(p.id, age);
              return (
                <div key={p.id} className={`cs-row${focused ? ' cs-focused' : ''}`}>
                  <PlayerLink player={p} onOpen={openPlayerProfile} className="cs-open" avatarSize={32}>
                    <span className="cs-nick">
                      <Flag cc={p.country} /> {p.nick}
                      {grew > 0 && <span className="cs-grew" title={`+${grew} ${ct('de evolução na carreira')}`}> ▲{grew}</span>}
                    </span>
                  </PlayerLink>
                  <span className={`cs-morale ${mi.cls}`} title={`${ct('Moral:')} ${mi.label} (${mor}/100)`}>
                    <CareerIcon name={mi.icon} size={14} /> {mor}
                  </span>
                  <span className={`cs-fatigue ${fatigueBand(fatigue)}`} title={`${ct('Fadiga:')} ${fatigue}/100`}>
                    <CareerIcon name="battery" size={14} /> {fatigue}
                  </span>
                  <span
                    className={`cs-development ${phase}`}
                    title={`${ct('Potencial (teto de OVR)')}: ${potential} · ${ct(PHASE_LABEL[phase])}`}
                  >
                    POT {potential} {phase === 'rising' ? '↗' : phase === 'declining' ? '↘' : '→'}
                  </span>
                  <select
                    className={`role-select ${p.role}`}
                    value={p.role}
                    onChange={(e) => setRole(p.id, e.target.value as Role)}
                    title={ct('Definir a função deste jogador')}
                  >
                    {ROLE_OPTS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    className={`cs-train${focused ? ' on' : ''}`}
                    onClick={() => setFocus(p.id)}
                    title={focused ? ct('Em foco de treino neste split') : ct('Pôr em foco de treino (desenvolve mais rápido)')}
                  >
                    <CareerIcon name="focus" size={14} />
                  </button>
                  <button
                    className={`cs-rest${reduced ? ' on' : ''}`}
                    disabled={!reduced && (save.restingPlayers?.length ?? 0) >= 2}
                    onClick={() =>
                      update({
                        restingPlayers: reduced
                          ? (save.restingPlayers ?? []).filter((id) => id !== p.id)
                          : [...(save.restingPlayers ?? []), p.id],
                      })
                    }
                    title={reduced ? ct('Remover carga reduzida') : ct('Aplicar carga reduzida na próxima série')}
                  >
                    <CareerIcon name="bed" size={14} />
                  </button>
                  <span className="cs-stat">{st ? `rat ${st.rating.toFixed(2)}` : '-'}</span>
                  <span className="cs-ovr">{playerOvr(p)}</span>
                </div>
              );
            })}
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Clique no jogador pra ver o <b>perfil completo</b>. Defina a <b>{ct('função')}</b>{' '}
            (no CS são flexíveis: tenha 1 AWP e 1 IGL) e o
            <b> {ct('foco de treino')}</b> do split (esse jogador evolui mais rápido). Você não edita os atributos: eles
            <b> sobem sozinhos</b> conforme o jogador se desenvolve e joga. A <b>{ct('carga reduzida')}</b>{' '}
            recupera fadiga, mas tira um pouco de ritmo na próxima série.
          </p>
        </DashCard>

        <div className="em-col">
          <DashCard title={ct('Playbook tático')}>
            <div className="pb-fam">
              <span className="muted small">{ct('Entrosamento')}</span>
              <span className="pb-bar">
                <i className={fam >= 70 ? 'good' : fam >= 40 ? 'warn' : 'bad'} style={{ width: `${fam}%` }} />
              </span>
              <b className="small">{fam}%</b>
            </div>
            <div className="pb-list">
              {(Object.keys(PLAYBOOK_LABELS) as Playbook[]).map((pb) => (
                <button
                  key={pb}
                  className={`pb-opt${save.playbook === pb ? ' on' : ''}`}
                  onClick={() => setPlaybook(pb)}
                >
                  <span className="pb-name">{ct(PLAYBOOK_LABELS[pb])}{save.playbook === pb ? ' ✓' : ''}</span>
                  <span className="pb-desc muted small">{ct(PLAYBOOK_DESC[pb])}</span>
                </button>
              ))}
            </div>
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              O entrosamento sobe a cada split mantendo o esquema;{' '}
              <b>trocar volta pra {PLAYBOOK_SWITCH_TO}%</b>
              {ct('. Quanto maior, mais o esquema pesa na partida — pro bem e pro mal, conforme o contexto.')}
            </p>
          </DashCard>

          <DashCard
            title={
              <>
                {ct('Treino de mapa')}{' '}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <span className="muted small" style={{ fontWeight: 400 }}>
                  ({mapFocusList(save as any).length}/{MAP_FOCUS_MAX} em foco)
                </span>
              </>
            }
          >
            <div className="map-train">
              {MAP_POOL.map((m) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const lvl = mapLevel(save as any, m);
                const pct = Math.round(((lvl - MAP_TRAIN_MIN) / (MAP_TRAIN_MAX - MAP_TRAIN_MIN)) * 100);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const foc = mapFocusList(save as any).includes(m);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const full = !foc && mapFocusList(save as any).length >= MAP_FOCUS_MAX;
                const cls = lvl >= 1 ? 'good' : lvl <= -1 ? 'bad' : 'warn';
                return (
                  <button
                    key={m}
                    className={`mt-row${foc ? ' on' : ''}`}
                    onClick={() => setMapFocus(m)}
                    disabled={full}
                    title={
                      foc
                        ? 'Em treino neste split (clique pra tirar)'
                        : full
                        ? `${ct('Máximo de')} ${MAP_FOCUS_MAX} ${ct('mapas em treino')}`
                        : 'Treinar este mapa neste split'
                    }
                  >
                    <span className="mt-name">
                      {foc && <CareerIcon name="focus" size={12} />} {MAP_LABELS[m]}
                    </span>
                    <span className="mt-bar"><i className={cls} style={{ width: `${pct}%` }} /></span>
                    <span className={`mt-lvl ${cls}`}>{lvl > 0 ? '+' : ''}{lvl.toFixed(1)}</span>
                  </button>
                );
              })}
            </div>
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              {ct('Treine até')} <b>{MAP_FOCUS_MAX} mapas</b>{' '}
              {ct('por split; os outros decaem um pouco. É de propósito: ninguém é forte em todos, mas dá pra montar um pool sólido.')}
            </p>
          </DashCard>

          <DashCard title={`${ct('Melhores do')} ${save.circuit?.name ?? ct('circuito')}`}>
            <BestPlayers stats={seasonStats.slice(0, 8)} mine={mySquadIds} ranked />
          </DashCard>
        </div>
      </div>
    </div>
  );
}
