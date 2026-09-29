// PLANO DE JOGO (Carreira › Time) — a tática por mapa estilo FM (realismo FM,
// fase 2). Seletor de mapa, quadro com os 5 titulares e o papel de cada um no
// mapa, setup de CT, repertório de execuções do T, instruções (gerais e por
// mapa), familiaridade e o relatório do próximo adversário com a sugestão de
// anti-strat. "A simulação decide, a interface mostra": tudo o que aparece aqui
// sai das MESMAS funções que o motor usa (engine/gestao/tatica.ts).
import { useMemo, useState, type ReactNode } from 'react';
import { Binoculars, Crosshair, Gauge, ListChecks, Map as MapIcon, Shield, SlidersHorizontal, Users } from 'lucide-react';
import {
  Alert, Avatar, Bar, Button, CardButton, EmptyState, InfoTip, Panel, ProgressBar, RoleChip, Segmented, Stat, Tag, type TagTone,
} from '../../components/ds/index';
import {
  CHANGE_COST, CT_SETUPS, CT_SETUP_DESC, CT_SETUP_LABEL, DEFAULT_INSTR, INSTR_DESC, INSTR_LABEL, MAP_ROLES, MAP_ROLE_DESC, MAP_ROLE_LABEL,
  MAX_EXECUTES, NATURAL_MAP_ROLE, RPS, T_EXECUTES, T_EXECUTE_DESC, T_EXECUTE_LABEL, FAM_NEUTRAL, TIMEOUTS_PER_MAP,
  aiTactics, bestExecVs, bestSetupVs, editInstructions, editMapTactic, famLogit, logitToRoundPp, mapRoleOf, mapTacticOf,
  planEdge, prepareAntiStrat, resolveTeamPlan, roleFitBand, roleFitPts,
} from '../../engine/gestao/tatica';
import type { CtSetup, MapRole, TExecute, TacticsState, TeamInstructions } from '../../engine/gestao/model';
import { scoutingOf } from '../../engine/career/teamIdentity';
import { ct } from '../../state/career-i18n';
import { MAP_LABELS, MAP_POOL, type MapId, type Player, type TTeam } from '../../types';
import '../../styles/tatica.css';

export interface GamePlanScreenProps {
  tactics: TacticsState;
  onChange: (next: TacticsState) => void;
  /** titulares (ids da org, com a função atual do Elenco) */
  players: Player[];
  /** próximo adversário (null = sem partida marcada) */
  opp: TTeam | null;
  /** quanto do plano do adversário a comissão revela (antiStratReveal) */
  reveal: number;
  gamePlan?: string;
  onOpenPlayer?: (p: Player) => void;
}

type InstrKey = keyof TeamInstructions;
const INSTR_KEYS: InstrKey[] = ['tempo', 'aggression', 'utility', 'ecoPolicy', 'timeoutPolicy'];
const INSTR_NAME: Record<InstrKey, string> = {
  tempo: 'Ritmo', aggression: 'Agressividade', utility: 'Utilitária', ecoPolicy: 'Política de eco', timeoutPolicy: 'Timeouts',
};

const pp = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} pp`;
const toneOf = (v: number, eps = 0.05): TagTone => (v > eps ? 'win' : v < -eps ? 'loss' : 'neutral');
const famTone = (f: number): 'win' | 'warn' | 'loss' => (f >= 65 ? 'win' : f >= 40 ? 'warn' : 'loss');
const famColor = (f: number) => (f >= 65 ? 'var(--c-win)' : f >= 40 ? 'var(--c-warn)' : 'var(--c-loss)');

/** Os confrontos da matriz: contra quem este setup é forte/fraco. */
function setupMatchups(s: CtSetup): { strong: TExecute[]; weak: TExecute[] } {
  const row = T_EXECUTES.map((e) => ({ e, v: RPS[s][e] }));
  return {
    strong: row.filter((x) => x.v <= -0.9).sort((a, b) => a.v - b.v).map((x) => x.e),
    weak: row.filter((x) => x.v >= 0.8).sort((a, b) => b.v - a.v).map((x) => x.e),
  };
}
function execMatchups(e: TExecute): { strong: CtSetup[]; weak: CtSetup[] } {
  const col = CT_SETUPS.map((s) => ({ s, v: RPS[s][e] }));
  return {
    strong: col.filter((x) => x.v >= 0.8).sort((a, b) => b.v - a.v).map((x) => x.s),
    weak: col.filter((x) => x.v <= -0.9).sort((a, b) => a.v - b.v).map((x) => x.s),
  };
}

export function GamePlanScreen({ tactics, onChange, players, opp, reveal, gamePlan, onOpenPlayer }: GamePlanScreenProps) {
  const [map, setMap] = useState<MapId>(MAP_POOL[0]);
  const [scope, setScope] = useState<'all' | 'map'>('all');
  const mt = mapTacticOf(tactics, map);
  const roleBase = useMemo(() => Object.fromEntries(players.map((p) => [p.id, NATURAL_MAP_ROLE[p.role]])) as Record<string, MapRole>, [players]);

  const oppTac = useMemo(() => (opp ? aiTactics(opp, { id: 'user', scouting: scoutingOf(opp) }) : null), [opp]);
  const mine = resolveTeamPlan(tactics, map, players, 'user', opp?.id ?? null);
  const theirs = opp && oppTac ? resolveTeamPlan(oppTac, map, opp.players, opp.id, 'user') : null;
  const edge = theirs ? planEdge(mine, theirs) : null;

  const edit = (patch: Parameters<typeof editMapTactic>[2]) => onChange(editMapTactic(tactics, map, patch, roleBase));

  // ── papéis ──
  const roleOf = (p: Player) => mapRoleOf(mt, p);
  const counts = new Map<MapRole, number>();
  for (const p of players) counts.set(roleOf(p), (counts.get(roleOf(p)) ?? 0) + 1);
  const iglP = players.find((p) => roleOf(p) === 'igl');
  const warnings: string[] = [];
  if (!counts.get('awp')) warnings.push(ct('Ninguém com a AWP neste mapa: o time joga só de rifle.'));
  if ((counts.get('awp') ?? 0) > 1) warnings.push(ct('Dois AWPs: só o primeiro compra a AWP.'));
  if (!iglP) warnings.push(ct('Sem IGL definido: quem tiver a melhor leitura chama.'));
  else if (iglP.role !== 'IGL' && iglP.role2 !== 'IGL') warnings.push(`${iglP.nick} ${ct('não é IGL: chama pior e duela pior (sem IGL de verdade o time perde força).')}`);
  if ((counts.get('igl') ?? 0) > 1) warnings.push(ct('Dois IGLs: só o primeiro chama.'));

  // ── adversário (o que a comissão revela) ──
  const readiness = opp && tactics.antiStrat?.opponentTeamId === opp.id ? tactics.antiStrat.readiness : 0;
  const readLabel = reveal >= 0.8 ? ct('Leitura completa') : reveal >= 0.5 ? ct('Boa leitura') : ct('Leitura parcial');
  const shownExec = theirs ? Math.min(theirs.t.length, Math.ceil(theirs.t.length * Math.min(1, 0.4 + reveal))) : 0;
  const famSpread = Math.round((1 - reveal) * 20);
  const sugCt = theirs ? bestSetupVs(theirs.t) : null;
  const sugT = theirs ? bestExecVs(theirs.ct) : null;

  const famPp = logitToRoundPp(famLogit(mt.familiarity));
  const execCount = mt.t.length;

  return (
    <div className="tac">
      {/* ── seletor de mapa ── */}
      <Panel
        icon={<MapIcon size={16} />}
        title={ct('Plano de jogo')}
        className="tac-maps"
        actions={opp ? <Tag tone="accent">{ct('Próximo')}: {opp.tag || opp.name}</Tag> : undefined}
      >
        <p className="tac-lede">
          {ct('Prepare cada mapa: papéis, setup de CT, execuções do T e instruções. A familiaridade mostra o quanto o time domina o plano.')}
        </p>
        <div className="tac-maplist" role="radiogroup" aria-label={ct('Mapa')}>
          {MAP_POOL.map((m) => {
            const f = mapTacticOf(tactics, m).familiarity;
            const on = m === map;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                className="tac-map"
                data-on={on || undefined}
                onClick={() => setMap(m)}
              >
                <span className="tac-map__name">{MAP_LABELS[m]}</span>
                <span className="tac-map__fam" style={{ color: famColor(f) }}>{Math.round(f)}</span>
                <Bar value={f} tone={famColor(f)} label={`${ct('Familiaridade')} ${Math.round(f)}`} />
                {tactics.maps[m]?.instr && <span className="tac-map__tag">{ct('instruções próprias')}</span>}
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="tac-grid">
        <div className="tac-col">
          {/* ── quadro: papéis ── */}
          <Panel icon={<Users size={16} />} title={`${ct('Papéis')} · ${MAP_LABELS[map]}`} flush>
            <ul className="tac-board">
              {players.map((p) => {
                const r = roleOf(p);
                const band = roleFitBand(p, r);
                const pts = roleFitPts(p, r);
                return (
                  <li key={p.id} className="tac-row">
                    <button type="button" className="tac-who" onClick={onOpenPlayer ? () => onOpenPlayer(p) : undefined} data-peek={`career:${p.id}`}>
                      <Avatar name={p.nick} role={p.role} size={36} />
                      <span className="tac-who__txt"><b>{p.nick}</b><RoleChip role={p.role} /></span>
                    </button>
                    <label className="tac-role">
                      <span className="ds-sr-only">{ct('Papel de')} {p.nick} {ct('em')} {MAP_LABELS[map]}</span>
                      <select className="tac-select" value={r} onChange={(e) => edit({ roles: { [p.id]: e.target.value as MapRole } })}>
                        {MAP_ROLES.map((x) => <option key={x} value={x}>{ct(MAP_ROLE_LABEL[x])}</option>)}
                      </select>
                    </label>
                    <span className="tac-fit">
                      <Tag tone={band === 'natural' ? 'win' : band === 'adapted' ? 'warn' : 'loss'}>
                        {band === 'natural' ? ct('Natural') : band === 'adapted' ? ct('Adaptado') : ct('Fora da função')}
                      </Tag>
                      {pts < 0 && <span className="tac-num tac-dim">{pts.toFixed(1)}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="tac-board__foot">
              {warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
              <p className="tac-hint">
                {ct('O papel decide quem entra em cada duelo (abertura, meio do round, pós-plant), quem compra a AWP e quem chama. Fora da função o jogador perde pontos de atributo no duelo; a versatilidade (oculta) atenua.')}{' '}
                <span className="tac-dim">{ct('Trocar um papel custa')} {CHANGE_COST.role} {ct('de familiaridade.')}</span>
              </p>
              <details className="tac-legend">
                <summary>{ct('O que faz cada papel')}</summary>
                <dl>
                  {MAP_ROLES.map((x) => (<div key={x}><dt>{ct(MAP_ROLE_LABEL[x])}</dt><dd>{ct(MAP_ROLE_DESC[x])}</dd></div>))}
                </dl>
              </details>
            </div>
          </Panel>

          {/* ── setup de CT ── */}
          <Panel icon={<Shield size={16} />} title={ct('Setup de CT')} actions={<Tag tone="ct">CT</Tag>}>
            <div className="tac-cards">
              {CT_SETUPS.map((s) => {
                const mu = setupMatchups(s);
                const on = mt.ct === s;
                return (
                  <CardButton key={s} selected={on} className="tac-card" onClick={() => !on && edit({ ct: s })}>
                    <span className="tac-card__top"><b>{ct(CT_SETUP_LABEL[s])}</b>{!on && <span className="tac-cost">−{CHANGE_COST.ct} {ct('fam.')}</span>}</span>
                    <span className="tac-card__desc">{ct(CT_SETUP_DESC[s])}</span>
                    <MatchupLine strong={mu.strong.map((e) => T_EXECUTE_LABEL[e])} weak={mu.weak.map((e) => T_EXECUTE_LABEL[e])} />
                  </CardButton>
                );
              })}
            </div>
          </Panel>

          {/* ── execuções do T ── */}
          <Panel
            icon={<Crosshair size={16} />}
            title={ct('Execuções do T')}
            actions={<><Tag tone="t">T</Tag><span className="tac-num tac-dim">{execCount}/{MAX_EXECUTES}</span></>}
          >
            <p className="tac-hint tac-hint--top">
              {ct('O repertório é uma mistura: mais execuções deixam o time imprevisível, mas cada uma fica menos treinada (a familiaridade se divide).')}
            </p>
            <div className="tac-cards tac-cards--exec">
              {T_EXECUTES.map((e) => {
                const on = mt.t.includes(e);
                const mu = execMatchups(e);
                const blocked = !on && execCount >= MAX_EXECUTES;
                const last = on && execCount <= 1;
                return (
                  <CardButton
                    key={e}
                    selected={on}
                    className="tac-card"
                    disabled={blocked || last}
                    onClick={() => edit({ t: on ? mt.t.filter((x) => x !== e) : [...mt.t, e] })}
                  >
                    <span className="tac-card__top">
                      <b>{ct(T_EXECUTE_LABEL[e])}</b>
                      <span className="tac-cost">{on ? (last ? ct('mínimo 1') : `−${CHANGE_COST.dropExec} ${ct('fam.')}`) : blocked ? ct('máx. 4') : `−${CHANGE_COST.newExec} ${ct('fam.')}`}</span>
                    </span>
                    <span className="tac-card__desc">{ct(T_EXECUTE_DESC[e])}</span>
                    <MatchupLine strong={mu.strong.map((s) => CT_SETUP_LABEL[s])} weak={mu.weak.map((s) => CT_SETUP_LABEL[s])} />
                  </CardButton>
                );
              })}
            </div>
          </Panel>

          {/* ── instruções ── */}
          <Panel
            icon={<SlidersHorizontal size={16} />}
            title={ct('Instruções')}
            actions={(
              <Segmented
                label={ct('Onde valem as instruções')}
                value={scope}
                onChange={setScope}
                items={[{ value: 'all', label: ct('Gerais') }, { value: 'map', label: `${ct('Só em')} ${MAP_LABELS[map]}` }]}
              />
            )}
          >
            <div className="tac-instr">
              {INSTR_KEYS.map((key) => {
                const general = tactics.instr?.[key] ?? DEFAULT_INSTR[key];
                const override = mt.instr?.[key];
                const value = scope === 'map' ? override ?? general : general;
                const labels = INSTR_LABEL[key] as Record<string, string>;
                const setVal = (v: string) => {
                  if (scope === 'all') onChange(editInstructions(tactics, { [key]: v } as Partial<TeamInstructions>));
                  else {
                    const next = { ...(mt.instr ?? {}) } as Record<string, string>;
                    if (v === general) delete next[key]; else next[key] = v;
                    edit({ instr: next as Partial<TeamInstructions> });
                  }
                };
                return (
                  <div key={key} className="tac-instr__row">
                    <span className="tac-instr__name">
                      {ct(INSTR_NAME[key])}
                      <InfoTip label={`${ct('Sobre')} ${ct(INSTR_NAME[key])}`}>{ct(INSTR_DESC[key])}</InfoTip>
                      {scope === 'map' && override && <Tag tone="accent">{ct('deste mapa')}</Tag>}
                    </span>
                    <Segmented
                      label={ct(INSTR_NAME[key])}
                      value={value}
                      onChange={setVal}
                      items={Object.keys(labels).map((v) => ({ value: v, label: ct(labels[v]) }))}
                    />
                  </div>
                );
              })}
            </div>
            <p className="tac-hint">
              {scope === 'all'
                ? `${ct('Mudar uma instrução geral custa')} ${CHANGE_COST.instr} ${ct('de familiaridade em todos os mapas.')}`
                : `${ct('Sobrescrever neste mapa custa')} ${CHANGE_COST.instr} ${ct('de familiaridade só aqui. Escolher o valor geral volta a herdar.')}`}{' '}
              {ct('A chamada ao vivo (rush, retake, postura) manda no round: ritmo e agressividade preparados saem naquele round.')}{' '}
              {`${TIMEOUTS_PER_MAP} ${ct('timeouts automáticos por mapa.')}`}
            </p>
          </Panel>
        </div>

        <div className="tac-col tac-col--side">
          {/* ── familiaridade ── */}
          <Panel icon={<Gauge size={16} />} title={`${ct('Familiaridade')} · ${MAP_LABELS[map]}`}>
            <div className="tac-fam">
              <Stat label={ct('Domínio do plano')} value={<span style={{ color: famColor(mt.familiarity) }}>{Math.round(mt.familiarity)}</span>} size="lg" />
              <div className="tac-fam__side">
                <ProgressBar value={mt.familiarity} tone={famTone(mt.familiarity)} label={ct('Familiaridade')} valueText={`${Math.round(mt.familiarity)}/100`} />
                <span className="tac-dim">
                  {Math.abs(famPp) < 0.05
                    ? ct('Coordenação neutra (50 não soma nem tira).')
                    : <>{mt.familiarity >= FAM_NEUTRAL ? ct('Coordenação a favor:') : ct('Coordenação contra:')}{' '}
                      <b className="tac-num" style={{ color: famColor(mt.familiarity) }}>{pp(famPp)}</b> {ct('por round')}</>}
                </span>
              </div>
            </div>
            <ul className="tac-facts">
              <li>{ct('Sobe com treino de tática e scrim no mapa e +3 por mapa jogado.')}</li>
              <li>{ct('Cai 1,5 por série nos mapas que você não joga (piso 20).')}</li>
              <li>{ct('Também escala o setup e as execuções: plano bem treinado bate mais forte.')}</li>
            </ul>
          </Panel>

          {/* ── adversário ── */}
          <Panel icon={<Binoculars size={16} />} title={opp ? `${ct('Adversário')} · ${opp.tag || opp.name}` : ct('Adversário')}>
            {!opp || !theirs ? (
              <EmptyState title={ct('Sem partida marcada')}>{ct('Quando houver um próximo adversário, o analista mostra o plano dele aqui.')}</EmptyState>
            ) : (
              <div className="tac-opp">
                <div className="tac-opp__head">
                  <Tag tone={reveal >= 0.5 ? 'win' : 'warn'}>{readLabel}</Tag>
                  <InfoTip label={ct('Sobre a leitura')}>
                    {ct('A comissão técnica (analista) decide quanto do plano adversário você enxerga e quão rápido a preparação sobe.')}
                  </InfoTip>
                </div>
                <dl className="tac-opp__facts">
                  <div><dt>{ct('Setup de CT')}</dt><dd>{ct(CT_SETUP_LABEL[theirs.ct])} {reveal < 0.5 && <span className="tac-dim">({ct('provável')})</span>}</dd></div>
                  <div>
                    <dt>{ct('Execuções do T')}</dt>
                    <dd>
                      {theirs.t.slice(0, shownExec).map((e) => ct(T_EXECUTE_LABEL[e])).join(', ')}
                      {shownExec < theirs.t.length && <span className="tac-dim"> + {theirs.t.length - shownExec} ?</span>}
                    </dd>
                  </div>
                  <div><dt>{ct('Ritmo · agressividade')}</dt><dd>{reveal >= 0.55 ? `${ct(INSTR_LABEL.tempo[theirs.instr.tempo])} · ${ct(INSTR_LABEL.aggression[theirs.instr.aggression])}` : '?'}</dd></div>
                  <div><dt>{ct('Política de eco')}</dt><dd>{reveal >= 0.55 ? ct(INSTR_LABEL.ecoPolicy[theirs.instr.ecoPolicy]) : '?'}</dd></div>
                  <div><dt>{ct('Familiaridade')}</dt><dd className="tac-num">{famSpread ? `${Math.max(0, theirs.fam - famSpread)}–${Math.min(100, theirs.fam + famSpread)}` : theirs.fam}</dd></div>
                </dl>

                <div className="tac-anti">
                  <ProgressBar value={readiness} tone={readiness >= 60 ? 'win' : 'accent'} label={ct('Preparação de anti-strat')} valueText={`${readiness}/100`} />
                  {readiness === 0 ? (
                    <Button variant="primary" onClick={() => onChange(prepareAntiStrat(tactics, opp.id, reveal))}>
                      {ct('Preparar anti-strat')}
                    </Button>
                  ) : (
                    <span className="tac-dim">{ct('Sessões de VOD na semana aumentam a preparação. Ela é usada na próxima série contra eles.')}</span>
                  )}
                  {gamePlan === 'antistrat' && readiness > 0 && (
                    <Alert tone="info">{ct('Com o plano "Anti-strat" na partida, o time foca esta preparação (leitura ×1,5) no lugar do bônus genérico.')}</Alert>
                  )}
                </div>

                <div className="tac-sug">
                  <span className="tac-sug__title">{ct('Sugestão do analista')}</span>
                  {sugCt && (
                    <div className="tac-sug__row">
                      <span>{ct('No CT')}: <b>{ct(CT_SETUP_LABEL[sugCt])}</b> {ct('contra as execuções deles')}</span>
                      {mt.ct === sugCt
                        ? <Tag tone="win">{ct('Já está')}</Tag>
                        : <Button size="sm" onClick={() => edit({ ct: sugCt })}>{ct('Usar')} (−{CHANGE_COST.ct})</Button>}
                    </div>
                  )}
                  {sugT && (
                    <div className="tac-sug__row">
                      <span>{ct('No T')}: <b>{ct(T_EXECUTE_LABEL[sugT])}</b> {ct('contra o setup deles')}</span>
                      {mt.t.includes(sugT)
                        ? <Tag tone="win">{ct('Já está')}</Tag>
                        : <Button size="sm" disabled={execCount >= MAX_EXECUTES} onClick={() => edit({ t: [...mt.t, sugT] })}>{ct('Adicionar')} (−{CHANGE_COST.newExec})</Button>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Panel>

          {/* ── impacto ── */}
          {edge && (
            <Panel icon={<ListChecks size={16} />} title={`${ct('Impacto no mapa')} · ${MAP_LABELS[map]}`}>
              <p className="tac-hint tac-hint--top">{ct('Chance por round contra este adversário, só pela preparação (fora força, forma e economia).')}</p>
              <div className="tac-impact">
                <ImpactCell side="t" label={ct('No T')} total={logitToRoundPp(edge.totalT)} parts={[[ct('Familiaridade'), logitToRoundPp(edge.fam)], [ct('Execução × setup'), logitToRoundPp(edge.rpsT)]]} />
                <ImpactCell side="ct" label={ct('No CT')} total={logitToRoundPp(edge.totalCT)} parts={[[ct('Familiaridade'), logitToRoundPp(edge.fam)], [ct('Setup × execução'), logitToRoundPp(edge.rpsCT)]]} />
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchupLine({ strong, weak }: { strong: string[]; weak: string[] }) {
  return (
    <span className="tac-mu">
      {strong.length > 0 && <span><span className="tac-mu__k tac-mu__k--win">{ct('Forte contra')}</span> {strong.map((x) => ct(x)).join(', ')}</span>}
      {weak.length > 0 && <span><span className="tac-mu__k tac-mu__k--loss">{ct('Fraco contra')}</span> {weak.map((x) => ct(x)).join(', ')}</span>}
    </span>
  );
}

function ImpactCell({ side, label, total, parts }: { side: 'ct' | 't'; label: string; total: number; parts: [string, number][] }): ReactNode {
  return (
    <div className="tac-impact__cell" data-side={side}>
      <span className="tac-impact__label"><Tag tone={side}>{side.toUpperCase()}</Tag> {label}</span>
      <span className="tac-impact__total tac-num" data-tone={toneOf(total)}>{pp(total)}</span>
      <ul>
        {parts.map(([k, v]) => (
          <li key={k}><span>{k}</span><span className="tac-num" data-tone={toneOf(v)}>{pp(v)}</span></li>
        ))}
      </ul>
    </div>
  );
}
