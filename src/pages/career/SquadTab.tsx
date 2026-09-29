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
import { ScoutingCard } from '../../components/career/ScoutingCard';
import {
  ROLE_OPTS,
  PLAYBOOK_SWITCH_TO,
  MORALE_DEFAULT,
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
import type { PlayerCondition, TacticsState } from '../../engine/gestao/model';
import { mapTacticOf } from '../../engine/gestao/tatica';
import { fatigueBand } from '../../engine/career/fatigue';
import { formStatus } from '../../engine/career/form';
import { activeStint as activeCoachStint } from '../../engine/coachCareer';
import { playerOrgId } from '../../state/career-player-route';
import { ct } from '../../state/career-i18n';
import { playerOvr, playerWage, formatMoney } from '../../engine/ratings';
import { teamChemistry } from '../../engine/chemistry';
import { ElencoPanel, type ElencoRow } from './ElencoPanel';
import { Panel, Bar } from '../../components/ds/index';
import { Sparkles, Target, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
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
  scars?: import('../../engine/career/scars').CoachScar[]; // [W4]
  scrimsThisSplit?: number;
  hiredScoutId?: string | null;
  scoutReports?: unknown[];
  budget: number;
  evo?: Record<string, number>;
  morale?: Record<string, number>;
  fatigue?: Record<string, number>;
  // forma recente: janela deslizante de ratings por série (cap 6) por jogador
  recentRatings?: Record<string, number[]>;
  restingPlayers?: string[];
  youthAge?: Record<string, number>;
  youthDebut?: Record<string, YouthDebut>;
  circuit?: { name?: string } | null;
  split: number;
  [key: string]: unknown;
}

export type SquadSection = 'sq' | 'dy' | 'pl' | 'tr' | 'st' | 'sc';

interface Props {
  /** seção da sidebar estilo FM (Elenco, Dinâmica, Plano de jogo, Treinos, Comissão, Olheiros) */
  section?: SquadSection;
  save: SquadTabSave;
  findSigning: (s: Signing) => { player: Player } | null;
  update: (patch: Record<string, unknown>) => void;
  openPlayerProfile: (p: Player) => void;
  /** [fase 2 · treino] condição por jogador (barra de condição no Elenco) */
  condition?: Record<string, PlayerCondition>;
  hireScout: (id: string) => void;
  fireScout: () => void;
  seasonStats: SeasonStat[];
  mySquadIds: Set<string>;
  /** [fase 2] tela "Plano de jogo" (tática por mapa) — renderizada na seção 'pl' */
  gamePlan?: ReactNode;
  /** [fase 3 · vestiário] escalação e banco (seção 'sq') */
  lineup?: ReactNode;
  /** [fase 3 · vestiário] dinâmica do vestiário (seção 'dy') */
  dinamica?: ReactNode;
  /** [fase 3 · vestiário] status/escalação/valor por jogador na tabela do Elenco */
  squadInfo?: Record<string, { status: string; slot: 'starter' | 'bench'; valueMul: number }>;
}

export function SquadTab({
  section = 'sq',
  save,
  findSigning,
  update,
  openPlayerProfile,
  condition,
  hireScout,
  fireScout,
  seasonStats,
  mySquadIds,
  gamePlan,
  lineup,
  dinamica,
  squadInfo,
}: Props) {
  const rows = save.squad.map((sig) => findSigning(sig)?.player).filter(Boolean) as Player[];
  const hasAwp = rows.some((p) => p.role === 'AWP' || p.role2 === 'AWP');
  const hasIgl = rows.some((p) => p.role === 'IGL' || p.role2 === 'IGL');

  const setRole = (pid: string, role: Role) =>
    update({ roles: { ...(save.roles ?? {}), [pid]: role } });
  const setFocus = (pid: string) =>
    update({ trainingFocus: save.trainingFocus === pid ? null : pid });
  const setPlaybook = (pb: Playbook) => {
    if (pb === save.playbook) return;
    const mem = { ...(save.playbookMem ?? {}) };
    if (save.playbook) mem[save.playbook] = save.playbookXp ?? 0;
    const restored = mem[pb] ?? PLAYBOOK_SWITCH_TO;
    update({ playbook: pb, playbookXp: restored, playbookMem: mem });
  };
  const fam = save.playbookXp ?? 0;

  // ── linhas da tabela do Elenco (FM) ──
  const elencoRows: ElencoRow[] = rows.map((p) => {
    const rid = `user__${p.id}`;
    const st = seasonStats.find((x) => x.id === rid);
    const until = (save.contracts as Record<string, number> | undefined)?.[p.id];
    const mor = save.morale?.[p.id] ?? MORALE_DEFAULT;
    return {
      p, oid: p.id,
      age: effectiveAge(p, save.split, save.youthAge, save.youthDebut),
      morale: mor, moraleLabel: moraleInfo(mor).label,
      fatigue: save.fatigue?.[p.id] ?? 0,
      cond: condition?.[p.id] ?? null,
      contractLeft: until != null ? until - save.split + 1 : null,
      rating: st?.rating, maps: st?.maps, kd: st?.kd, adr: st?.adr,
      recent: save.recentRatings?.[p.id],
      status: squadInfo?.[p.id]?.status,
      slot: squadInfo?.[p.id]?.slot,
      valueMul: squadInfo?.[p.id]?.valueMul,
    };
  });
  const chemAvg = teamChemistry({ pairChem: save.pairChem }, rows.map((p) => playerOrgId(p.id)));
  const chemLabel = chemAvg >= 80 ? ct('Excelente') : chemAvg >= 60 ? ct('Boa') : chemAvg >= 40 ? ct('Regular') : ct('Fraca');
  const payroll = rows.reduce((sum, p) => sum + playerWage(p), 0);
  // [fase 2] domínio do mapa = familiaridade do plano (Plano de jogo)
  const tacticsNow = (save.gestao as { tactics?: TacticsState } | undefined)?.tactics;
  const mapsSorted = [...MAP_POOL].map((m) => ({ m, fam: mapTacticOf(tacticsNow, m).familiarity })).sort((x, y) => y.fam - x.fam);

  return (
    <div className={`em-tab em-squad em-squad--${section}`}>
      {section === 'sq' && (
        <>
          {lineup}
          <ElencoPanel rows={elencoRows} onOpen={openPlayerProfile} />
          <div className="squad-trio">
            <Panel icon={<Sparkles size={16} />} title={ct('Química')}>
              <div className="squad-big">
                <span className="ds-big" style={{ color: chemAvg >= 60 ? 'var(--c-win)' : chemAvg >= 40 ? 'var(--c-warn)' : 'var(--c-loss)' }}>{chemAvg}</span>
                <span className="ds-dim">{chemLabel} · {ct('média entre os titulares')}</span>
              </div>
              <Bar value={chemAvg} tone={chemAvg >= 60 ? 'var(--c-win)' : chemAvg >= 40 ? 'var(--c-warn)' : 'var(--c-loss)'} lg label={`${ct('Química')} ${chemAvg}`} />
            </Panel>
            <Panel icon={<Target size={16} />} title={ct('Mapas · familiaridade')} flush>
              {[mapsSorted[0], mapsSorted[1], mapsSorted[mapsSorted.length - 1]].filter(Boolean).map((x, i) => {
                const strong = i === 0 && x.fam >= 60, weak = i === 2 && x.fam < 40;
                return (
                  <div key={x.m} className="ds-row">
                    <b style={{ width: 80 }}>{MAP_LABELS[x.m]}</b>
                    <span style={{ color: strong ? 'var(--c-win)' : weak ? 'var(--c-loss)' : 'var(--c-ink-dim)', fontWeight: 600 }}>
                      {strong ? ct('Mapa forte') : weak ? ct('Evitar no veto') : ct('Sólido')}
                    </span>
                    <span className="ds-dim" style={{ marginLeft: 'auto' }}>{Math.round(x.fam)}</span>
                  </div>
                );
              })}
            </Panel>
            <Panel icon={<Wallet size={16} />} title={ct('Folha salarial')}>
              <div className="squad-big">
                <span className="ds-big">{formatMoney(payroll)}</span>
                <span className="ds-dim">/ split · {ct('caixa')} {formatMoney(save.budget)}</span>
              </div>
            </Panel>
          </div>
          <DashCard title={`${ct('Melhores do')} ${save.circuit?.name ?? ct('circuito')}`}>
            <BestPlayers stats={seasonStats.slice(0, 8)} mine={mySquadIds} ranked />
          </DashCard>
        </>
      )}

      {section === 'dy' && (
        <>
      {dinamica}
      {/* T3.4: matriz de química do elenco */}
      {rows.length >= 2 && (
        <ChemistryMatrix
          state={{ pairChem: save.pairChem }}
          players={rows.map((p) => ({ id: playerOrgId(p.id), nick: p.nick }))}
          title={ct('Química do elenco')}
        />
      )}

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
                  {(() => {
                    // chip de forma recente (média da janela de ratings por série)
                    const fs = formStatus(save.recentRatings?.[p.id]);
                    return (
                      <span
                        className="cs-form"
                        style={{ color: fs.color }}
                        title={fs.avg != null
                          ? `${ct('Forma recente:')} ${ct(fs.label)} (${ct('média')} ${fs.avg.toFixed(2)})`
                          : ct('Forma recente: precisa de pelo menos 2 séries')}
                      >
                        {fs.avg != null ? ct(fs.label) : '—'}
                      </span>
                    );
                  })()}
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

        </>
      )}

      {section === 'pl' && gamePlan}

      {section === 'pl' && !gamePlan && (
        <>
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

        </>
      )}

      {section === 'pl' && (
        <>
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

        </>
      )}

      {section === 'st' && (
        <>
      {/* T3.11: carreira do coach */}
      <CoachStintsCard
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stints={(save.coachStints ?? []) as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        coachNick={activeCoachStint((save.coachStints ?? []) as any)?.coachNick}
        scars={save.scars}
        split={save.split}
      />

        </>
      )}

      {section === 'sc' && (
        <>
      {/* T3.12: scouting */}
      <ScoutingCard
        hiredScoutId={save.hiredScoutId ?? null}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        scoutReports={(save.scoutReports ?? []) as any}
        budget={save.budget}
        onHire={hireScout}
        onFire={fireScout}
      />

        </>
      )}
    </div>
  );
}
