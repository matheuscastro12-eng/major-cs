// [fase 2 · treino] Tela "Treinos e scrims" da Carreira, estilo FM.
//
// Agenda da semana (7 slots) + intensidade, com a previsão do efeito (quanto
// cada grupo de atributos rende, cansaço, ritmo, risco de lesão); tabela do
// elenco com condição, ritmo, lesão e FOCO INDIVIDUAL (atributo ou função);
// mapas priorizados (familiaridade, via frente de tática); departamento médico
// e relatório da última semana; scrim marcada (com risco de vazamento) e
// bootcamp. A simulação decide (engine/gestao/treino.ts); a tela só mostra.
import type { CSSProperties } from 'react';
import {
  Activity, Bandage, BedDouble, Bomb, Brain, CalendarDays, ClipboardList, Crosshair, Dumbbell, Eye, Map as MapIcon,
  Stethoscope, Swords, Tent, Video,
} from 'lucide-react';
import { Panel, Table, Segmented, Stat, Tag, Avatar, RoleChip, Bar, Button, Alert, InfoTip, type Column } from '../../components/ds/index';
import { ScrimCard } from '../../components/career/ScrimCard';
import type { ScrimMatchReport, ScrimOpponentOption } from '../../engine/scrim';
import type { GestaoState, IndividualFocus, PlayerCondition, TrainingIntensity, TrainingSession } from '../../engine/gestao/model';
import {
  DEFAULT_WEEK, INJURY_LABEL, INTENSITY, ROLE_FOCUS_ATTRS, SESSIONS, SESSION_INFO, LEGACY_FOCUS_ATTR,
  previewGrowthMul, weekFitnessDelta, weekSharpGain, weeklyInjuryRisk, weekFamiliarityPoints, leakAgainst,
  LEAK_CHANCE_REAL, LEAK_CHANCE_SESSION,
} from '../../engine/gestao/treino';
import { isInjured } from '../../engine/gestao/condicao';
import { staffEffects } from '../../engine/gestao/staff';
import { ATTR_CLASS, ATTR_CLASS_LABEL, type AttrClass } from '../../engine/attrs/progression';
import { attrsOf } from '../../engine/attrs/model';
import { ALL_ATTRS, ATTR_LABEL, type AttrKey } from '../../engine/attributes';
import { suggestFocus } from '../../engine/career/training';
import { ct } from '../../state/career-i18n';
import { MAP_LABELS, MAP_POOL, type MapId, type Player, type Role } from '../../types';
import '../../styles/treino.css';

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MAP_FOCUS_MAX = 3;

const SESSION_ICON: Record<TrainingSession, typeof Crosshair> = {
  aim: Crosshair, utility: Bomb, tactics: ClipboardList, vod: Video, scrim: Swords, physical: Dumbbell, mental: Brain, rest: BedDouble,
};
const SESSION_TONE: Record<TrainingSession, string> = {
  aim: 'var(--c-role-entry)', utility: 'var(--c-t)', tactics: 'var(--c-role-igl)', vod: 'var(--c-ct)',
  scrim: 'var(--c-role-rifler)', physical: 'var(--c-win)', mental: 'var(--c-epic)', rest: 'var(--c-ink-faint)',
};

const PRESETS: { id: string; label: string; week: TrainingSession[]; intensity?: TrainingIntensity }[] = [
  { id: 'padrao', label: 'Padrão', week: DEFAULT_WEEK },
  { id: 'mecanica', label: 'Mecânica', week: ['aim', 'aim', 'scrim', 'aim', 'utility', 'physical', 'rest'] },
  { id: 'tatica', label: 'Tática', week: ['tactics', 'tactics', 'scrim', 'vod', 'utility', 'vod', 'rest'] },
  { id: 'pre-jogo', label: 'Pré-jogo', week: ['tactics', 'vod', 'scrim', 'mental', 'tactics', 'rest', 'rest'] },
  { id: 'recuperacao', label: 'Recuperação', week: ['aim', 'vod', 'mental', 'physical', 'rest', 'rest', 'rest'], intensity: 'low' },
];

const CLASSES: AttrClass[] = ['mechanical', 'reflex', 'mental', 'leadership'];

const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
const mulTxt = (v: number) => `×${v.toFixed(2).replace('.', ',')}`;
const fitTone = (f: number) => (f >= 70 ? 'var(--c-win)' : f >= 45 ? 'var(--c-warn)' : 'var(--c-loss)');

/** Barra de condição física (0–100) com o número; usada também no Elenco. */
export function ConditionBar({ fitness, compact = false }: { fitness: number; compact?: boolean }) {
  const f = Math.max(0, Math.min(100, Math.round(fitness)));
  return (
    <span className={`tr-cond${compact ? ' tr-cond--compact' : ''}`} title={`${ct('Condição física')} ${f}/100`}>
      <Bar value={f} tone={fitTone(f)} label={`${ct('Condição física')} ${f}`} />
      <b style={{ color: fitTone(f) }}>{f}</b>
    </span>
  );
}

function classMul(mul: Partial<Record<AttrKey, number>>, cls: AttrClass): number {
  const ks = ALL_ATTRS.filter((k) => ATTR_CLASS[k] === cls);
  return ks.reduce((s, k) => s + (mul[k] ?? 1), 0) / ks.length;
}

function focusId(f: IndividualFocus | undefined): string {
  return !f ? '' : f.kind === 'attr' ? `attr:${f.attr}` : `role:${f.role}`;
}
function parseFocus(id: string): IndividualFocus | null {
  if (!id) return null;
  const [kind, v] = id.split(':');
  return kind === 'role' ? { kind: 'role', role: v as Role } : { kind: 'attr', attr: v as AttrKey };
}

interface Row {
  p: Player;
  cond: PlayerCondition;
  focus?: IndividualFocus;
  risk: number;
  top: [AttrKey, number][];
  suggested?: AttrKey;
}

export interface TrainingTabProps {
  budget: number;
  players: Player[];
  gestao: GestaoState;
  /** aplica uma alteração no bloco gestao (lendo o estado vivo) */
  updateGestao: (fn: (g: GestaoState) => GestaoState) => void;
  openPlayerProfile: (p: Player) => void;
  /** time do próximo jogo oficial (aviso de vazamento) */
  nextOpp?: { id: string; tag: string } | null;
  /** tag por id de time (relatório de vazamento) */
  teamTag: (id: string) => string | undefined;
  scrimsThisSplit: number;
  scrimOpponents: ScrimOpponentOption[];
  scrimReport: ScrimMatchReport | null;
  doScrimVs: (oppId: string) => void;
  onBootcamp?: () => void;
  bootcampUsed?: boolean;
}

export function TrainingTab({
  budget, players, gestao, updateGestao, openPlayerProfile, nextOpp, teamTag,
  scrimsThisSplit, scrimOpponents, scrimReport, doScrimVs, onBootcamp, bootcampUsed = false,
}: TrainingTabProps) {
  const t = gestao.training;
  const staff = staffEffects(gestao.staff);
  const setTraining = (patch: Partial<GestaoState['training']>) => updateGestao((g) => ({ ...g, training: { ...g.training, ...patch } }));
  const setDay = (i: number, s: TrainingSession) => updateGestao((g) => {
    const week = [...g.training.week];
    week[i] = s;
    return { ...g, training: { ...g.training, week } };
  });
  const setFocus = (pid: string, id: string) => updateGestao((g) => {
    const focus = { ...g.training.focus };
    const f = parseFocus(id);
    if (f) focus[pid] = f; else delete focus[pid];
    return { ...g, training: { ...g.training, focus } };
  });
  const toggleMap = (m: MapId) => updateGestao((g) => {
    const cur = g.training.mapFocus;
    const mapFocus = cur.includes(m) ? cur.filter((x) => x !== m) : cur.length < MAP_FOCUS_MAX ? [...cur, m] : cur;
    return { ...g, training: { ...g.training, mapFocus } };
  });

  // ── previsões da agenda atual ──
  const teamMul = previewGrowthMul(t, null, staff);
  const fitDelta = weekFitnessDelta(t);
  const sharpGain = weekSharpGain(t);
  const famPts = weekFamiliarityPoints(t, staff);
  const activePreset = PRESETS.find((p) => p.week.every((s, i) => t.week[i] === s))?.id;

  const rows: Row[] = players.map((p) => {
    const cond = gestao.condition[p.id] ?? { fitness: 100, sharpness: 70, injury: null };
    const focus = t.focus[p.id];
    const mul = previewGrowthMul(t, focus, staff);
    // o que a agenda + o foco mudam para ESTE jogador: até 2 que sobem e 1 que cede
    const ent = Object.entries(mul) as [AttrKey, number][];
    const ups = ent.filter(([, v]) => v > 1.02).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const downs = ent.filter(([, v]) => v < 0.98).sort((a, b) => a[1] - b[1]).slice(0, 1);
    const top = [...ups, ...downs];
    const proneness = attrsOf(p).h.injuryProneness;
    return {
      p, cond, focus, top,
      risk: isInjured(cond) ? 0 : weeklyInjuryRisk(t, cond.fitness + weekFitnessDelta(t), proneness, staff, 2),
      suggested: LEGACY_FOCUS_ATTR[suggestFocus(p)],
    };
  });
  const injured = rows.filter((r) => isInjured(r.cond));
  const healthy = rows.filter((r) => !isInjured(r.cond));
  const avgRisk = healthy.length ? healthy.reduce((s, r) => s + r.risk, 0) / healthy.length : 0;
  const avgFit = rows.length ? rows.reduce((s, r) => s + r.cond.fitness, 0) / rows.length : 100;
  const avgSharp = rows.length ? rows.reduce((s, r) => s + r.cond.sharpness, 0) / rows.length : 70;
  const scrimDays = t.week.filter((s) => s === 'scrim').length;
  const nextLeak = nextOpp ? leakAgainst(t, nextOpp.id) : 0;
  const last = t.lastWeek;

  const focusSelect = (r: Row) => {
    const roleAttrs = ROLE_FOCUS_ATTRS[r.p.role] ?? [];
    const others = ALL_ATTRS.filter((k) => !roleAttrs.includes(k));
    return (
      <select
        className="tr-focus"
        value={focusId(r.focus)}
        onChange={(e) => setFocus(r.p.id, e.target.value)}
        aria-label={`${ct('Foco individual de')} ${r.p.nick}`}
      >
        <option value="">{ct('Sem foco (treino do time)')}</option>
        <option value={`role:${r.p.role}`}>{ct('Função')}: {r.p.role}</option>
        <optgroup label={`${ct('Atributos da função')} ${r.p.role}`}>
          {roleAttrs.map((k) => <option key={k} value={`attr:${k}`}>{ATTR_LABEL[k]}{r.suggested === k ? ' ★' : ''}</option>)}
        </optgroup>
        <optgroup label={ct('Outros atributos')}>
          {others.map((k) => <option key={k} value={`attr:${k}`}>{ATTR_LABEL[k]}{r.suggested === k ? ' ★' : ''}</option>)}
        </optgroup>
      </select>
    );
  };

  const columns: Column<Row>[] = [
    {
      key: 'nick', header: ct('Jogador'), sort: (r) => r.p.nick.toLowerCase(),
      cell: (r) => (
        <button type="button" className="elenco-who" data-peek={`career:${r.p.id}`} onClick={() => openPlayerProfile(r.p)}>
          <Avatar name={r.p.nick} role={r.p.role} size={34} />
          <span className="elenco-who__txt"><b>{r.p.nick}</b><small>{r.p.name}</small></span>
        </button>
      ),
    },
    { key: 'role', header: ct('Função'), sort: (r) => r.p.role, cell: (r) => <RoleChip role={r.p.role} /> },
    {
      key: 'cond', header: ct('Condição'), sort: (r) => (isInjured(r.cond) ? -1 : r.cond.fitness),
      cell: (r) => isInjured(r.cond)
        ? <Tag tone="loss" icon={<Bandage size={12} aria-hidden />}>{ct(INJURY_LABEL[r.cond.injury!.kind])} · {Math.ceil(r.cond.injury!.weeksLeft)} {ct('sem.')}</Tag>
        : <ConditionBar fitness={r.cond.fitness} />,
    },
    { key: 'sharp', header: ct('Ritmo'), num: true, sort: (r) => r.cond.sharpness, cell: (r) => <span style={{ color: r.cond.sharpness >= 70 ? 'var(--c-win)' : r.cond.sharpness >= 45 ? 'var(--c-ink)' : 'var(--c-loss)' }}>{Math.round(r.cond.sharpness)}</span> },
    { key: 'risk', header: ct('Risco/sem.'), num: true, sort: (r) => r.risk, cell: (r) => (isInjured(r.cond) ? '—' : <span className={r.risk >= 0.04 ? 'elenco-warn' : undefined}>{pct(r.risk)}</span>) },
    { key: 'focus', header: ct('Foco individual'), cell: (r) => focusSelect(r) },
    {
      key: 'top', header: ct('Rende mais'),
      cell: (r) => (
        <span className="tr-top">
          {r.top.length === 0 && <span className="tr-muted">{ct('Equilibrado')} {mulTxt(1)}</span>}
          {r.top.map(([k, v]) => <span key={k}><b>{ATTR_LABEL[k]}</b> <small className={v > 1.02 ? 'is-up' : 'is-down'}>{mulTxt(v)}</small></span>)}
        </span>
      ),
    },
  ];

  return (
    <div className="em-tab tr-screen">
      {injured.length > 0 && (
        <Alert tone="warn" title={`${injured.length} ${injured.length > 1 ? ct('jogadores lesionados') : ct('jogador lesionado')}`}>
          {injured.map((r) => `${r.p.nick} (${ct(INJURY_LABEL[r.cond.injury!.kind])}, ~${Math.ceil(r.cond.injury!.weeksLeft)} ${ct('sem.')})`).join(' · ')}
          {'. '}{ct('Lesionado não joga: entra o jovem da base da mesma função (ou um reserva).')}
        </Alert>
      )}
      {nextOpp && nextLeak > 0 && (
        <Alert tone="danger" title={`${ct('Estratégia vazada para')} ${nextOpp.tag}`}>
          {ct('Eles viram seus defaults em scrim. No próximo jogo sua preparação rende menos')} ({ct('vazamento')} {Math.round(nextLeak * 100)}%{ct(', esfria a cada semana')}).
        </Alert>
      )}

      <div className="tr-top-grid">
        <Panel
          icon={<CalendarDays size={16} />}
          title={ct('Agenda da semana')}
          tone="accent"
          className="tr-week-panel"
          actions={(
            <div className="tr-presets" role="group" aria-label={ct('Modelos de agenda')}>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="ds-seg__btn"
                  aria-pressed={activePreset === p.id}
                  onClick={() => setTraining({ week: [...p.week], ...(p.intensity ? { intensity: p.intensity } : {}) })}
                >
                  {ct(p.label)}
                </button>
              ))}
            </div>
          )}
        >
          <ol className="tr-week" aria-label={ct('Sessões da semana')}>
            {t.week.map((s, i) => {
              const Icon = SESSION_ICON[s];
              return (
                <li key={i} className="tr-day" style={{ '--tone': SESSION_TONE[s] } as CSSProperties} data-rest={s === 'rest' || undefined}>
                  <span className="tr-day__dow">{ct(DAYS[i])}</span>
                  <Icon size={22} aria-hidden className="tr-day__icon" />
                  <span className="tr-day__name">{ct(SESSION_INFO[s].label)}</span>
                  <span className="tr-day__load" aria-hidden>
                    {Array.from({ length: 4 }, (_, k) => <i key={k} data-on={k < Math.round(SESSION_INFO[s].load * INTENSITY[t.intensity].load) || undefined} />)}
                  </span>
                  <select
                    className="tr-day__sel"
                    value={s}
                    onChange={(e) => setDay(i, e.target.value as TrainingSession)}
                    aria-label={`${ct(DAYS[i])}: ${ct('sessão de treino')}`}
                    title={ct(SESSION_INFO[s].desc)}
                  >
                    {SESSIONS.map((x) => <option key={x} value={x}>{ct(SESSION_INFO[x].label)}</option>)}
                  </select>
                </li>
              );
            })}
          </ol>
          <div className="tr-intensity">
            <span className="tr-label">{ct('Intensidade')}</span>
            <Segmented<TrainingIntensity>
              label={ct('Intensidade do treino')}
              value={t.intensity}
              onChange={(v) => setTraining({ intensity: v })}
              items={(['low', 'normal', 'high'] as TrainingIntensity[]).map((v) => ({ value: v, label: ct(INTENSITY[v].label) }))}
            />
            <span className="tr-intensity__note">
              {ct('Ganho')} {mulTxt(INTENSITY[t.intensity].gain)} · {ct('carga')} {mulTxt(INTENSITY[t.intensity].load)} · {ct('risco de lesão')} {mulTxt(INTENSITY[t.intensity].injury)}
            </span>
          </div>
          <p className="tr-hint">
            {ct('Cada série oficial fecha uma semana de treino. Os pontos acumulam no split e, na virada, viram evolução por atributo — com o teto no potencial, a idade e o profissionalismo mandando. A agenda padrão em intensidade normal rende ×1,00 em tudo.')}
          </p>
        </Panel>

        <Panel icon={<Activity size={16} />} title={ct('Efeito por semana')} className="tr-effect">
          <div className="tr-stats">
            <Stat label={ct('Condição física')} value={`${fitDelta > 0 ? '+' : ''}${Math.round(fitDelta)}`} hint={ct('sem contar as partidas')} />
            <Stat label={ct('Ritmo de jogo')} value={`+${sharpGain.toFixed(1).replace('.', ',')}`} hint={ct('+2,5 por mapa oficial')} />
            <Stat label={ct('Risco de lesão')} value={pct(avgRisk)} hint={ct('média do elenco, por semana')} />
            <Stat label={ct('Familiaridade')} value={famPts > 0 ? `+${famPts.toFixed(1).replace('.', ',')}` : '—'} hint={t.mapFocus.length ? ct('por mapa priorizado') : ct('priorize mapas abaixo')} />
          </div>
          <div className="tr-classes" aria-label={ct('Rendimento por grupo de atributos')}>
            {CLASSES.map((c) => {
              const v = classMul(teamMul, c);
              return (
                <div key={c} className="tr-class">
                  <span>{ct(ATTR_CLASS_LABEL[c])}</span>
                  <Bar value={Math.min(100, (v / 2.2) * 100)} tone={v > 1.05 ? 'var(--c-win)' : v < 0.95 ? 'var(--c-warn)' : 'var(--c-ct)'} label={`${ct(ATTR_CLASS_LABEL[c])} ${mulTxt(v)}`} />
                  <b className={v > 1.05 ? 'is-up' : v < 0.95 ? 'is-down' : undefined}>{mulTxt(v)}</b>
                </div>
              );
            })}
          </div>
          <div className="tr-effect__foot">
            <span>{ct('Elenco')}: <b style={{ color: fitTone(avgFit) }}>{Math.round(avgFit)}</b> {ct('de condição')} · <b>{Math.round(avgSharp)}</b> {ct('de ritmo')}</span>
            <InfoTip label={ct('Como a condição pesa na partida')}>
              {ct('Ritmo acima de 70 dá um pouco de mira e decisão em todo duelo; abaixo, tira mais. Condição física abaixo de 70 pesa no duelo e aumenta o desgaste de mapa a mapa numa série. Abaixo de 12, o burnout vira sorteio semanal.')}
            </InfoTip>
          </div>
        </Panel>
      </div>

      <Panel icon={<Crosshair size={16} />} title={ct('Elenco: condição e foco individual')} flush className="tr-squad">
        <Table<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.p.id}
          tall
          caption={ct('Condição e foco individual do elenco')}
          empty={ct('Sem jogadores no elenco.')}
        />
        <p className="elenco-hint">
          {ct('Foco num atributo: ele rende ×2,2 e o resto cede um pouco. Foco na função: ×1,45 nos 6 atributos dela. ★ = maior lacuna da função. "Rende mais" = multiplicador previsto com a agenda atual.')}
        </p>
      </Panel>

      <div className="tr-bottom-grid">
        <Panel
          icon={<MapIcon size={16} />}
          title={<>{ct('Mapas priorizados')} <span className="tr-count">{t.mapFocus.length}/{MAP_FOCUS_MAX}</span></>}
          flush
        >
          <div className="tr-maps">
            {MAP_POOL.map((m) => {
              const on = t.mapFocus.includes(m);
              const full = !on && t.mapFocus.length >= MAP_FOCUS_MAX;
              const fam = Math.round(gestao.tactics.maps[m]?.familiarity ?? 0);
              return (
                <button key={m} type="button" className="tr-map" aria-pressed={on} disabled={full} onClick={() => toggleMap(m)}
                  title={on ? ct('Priorizado: tática e scrim rendem familiaridade aqui (clique pra tirar)') : full ? `${ct('Máximo de')} ${MAP_FOCUS_MAX} ${ct('mapas')}` : ct('Priorizar este mapa no treino')}>
                  <span className="tr-map__name">{MAP_LABELS[m]}</span>
                  <Bar value={fam} tone={fam >= 70 ? 'var(--c-win)' : fam >= 35 ? 'var(--c-ct)' : 'var(--c-ink-faint)'} label={`${ct('Familiaridade')} ${fam}`} />
                  <span className="tr-map__fam">{fam}</span>
                </button>
              );
            })}
          </div>
          <p className="elenco-hint">
            {ct('Tática, scrim, utilitária e VOD rendem familiaridade nos mapas priorizados a cada semana (1 mapa rende mais que 3). A familiaridade é o quanto o time domina o plano do mapa (Plano de jogo).')}
          </p>
        </Panel>

        <Panel icon={<Stethoscope size={16} />} title={ct('Departamento médico')} className="tr-med">
          {injured.length === 0 ? (
            <p className="tr-muted">{ct('Ninguém no departamento médico.')}</p>
          ) : (
            <ul className="tr-list">
              {injured.map((r) => (
                <li key={r.p.id}>
                  <Bandage size={14} aria-hidden />
                  <b>{r.p.nick}</b>
                  <span>{ct(INJURY_LABEL[r.cond.injury!.kind])}</span>
                  <span className="tr-list__end">~{Math.ceil(r.cond.injury!.weeksLeft)} {ct('sem.')}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="tr-med__risk">
            <span>{ct('Risco semanal por intensidade (elenco atual)')}</span>
            {(['low', 'normal', 'high'] as TrainingIntensity[]).map((it) => {
              const r = healthy.length ? healthy.reduce((s, x) => s + weeklyInjuryRisk({ week: t.week, intensity: it }, x.cond.fitness, attrsOf(x.p).h.injuryProneness, staff, 2), 0) / healthy.length : 0;
              return <span key={it} className={it === t.intensity ? 'is-on' : undefined}>{ct(INTENSITY[it].label)} <b>{pct(r)}</b></span>;
            })}
          </div>
          {last && (
            <div className="tr-report">
              <span className="tr-label">{ct('Última semana')} · {ct('split')} {last.split}</span>
              <ul className="tr-list">
                {last.injuries.map((i) => <li key={`i${i.playerId}`}><Bandage size={14} aria-hidden /><b>{i.nick}</b><span>{ct(INJURY_LABEL[i.kind])}</span><span className="tr-list__end">{Math.ceil(i.weeks)} {ct('sem.')}</span></li>)}
                {last.recovered.map((i) => <li key={`r${i.playerId}`}><Activity size={14} aria-hidden /><b>{i.nick}</b><span>{ct('voltou')}</span></li>)}
                {last.leak && <li><Eye size={14} aria-hidden /><b>{teamTag(last.leak.teamId) ?? ct('rival')}</b><span>{ct('viu seus defaults em scrim')}</span></li>}
                {last.familiarity.map((f) => <li key={`f${f.map}`}><MapIcon size={14} aria-hidden /><b>{MAP_LABELS[f.map]}</b><span>{ct('familiaridade')}</span><span className="tr-list__end">+{f.points.toFixed(1).replace('.', ',')}</span></li>)}
                {!last.injuries.length && !last.recovered.length && !last.leak && !last.familiarity.length && <li className="tr-muted">{ct('Semana tranquila.')}</li>}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="tr-bottom-grid">
        <div className="tr-scrim">
          <ScrimCard
            scrimsThisSplit={scrimsThisSplit}
            budget={budget}
            opponents={scrimOpponents}
            report={scrimReport}
            onScrim={doScrimVs}
          />
          <p className="tr-hint">
            {ct('Scrim contra time do seu circuito')}: {Math.round(LEAK_CHANCE_REAL * 100)}% {ct('de chance de vazar seus defaults para ele. Cada sessão de scrim da agenda')} ({scrimDays}×) {ct('tem')} {Math.round(LEAK_CHANCE_SESSION * 100)}%.
          </p>
        </div>
        {onBootcamp && (
          <Panel icon={<Tent size={16} />} title={ct('Bootcamp do time')}>
            <p className="tr-muted" style={{ marginTop: 0 }}>
              {ct('Duas semanas de imersão: +5 de moral pra todo o elenco e 30 de condição física recuperada. Uma vez por split: chegue inteiro no momento decisivo.')}
            </p>
            <Button
              variant="primary"
              disabled={bootcampUsed || budget < 60_000}
              onClick={onBootcamp}
              title={bootcampUsed ? ct('Bootcamp já usado neste split.') : undefined}
            >
              {bootcampUsed ? ct('Bootcamp concluído neste split') : `${ct('Fazer bootcamp')} · R$ 60 mil`}
            </Button>
          </Panel>
        )}
      </div>
    </div>
  );
}
