// [fase 2 · frente STAFF] Comissão técnica — Time › Comissão técnica.
// Tela estilo FM: tabela da comissão com atributos 1–20 coloridos (visões Geral ·
// Atributos · Contratos), o que a comissão rende no time (staffEffects contra a
// linha de base), vagas abertas, perfil do membro (impacto dele nos efeitos) e o
// mercado de staff com ex-jogadores aposentados. Contratar/demitir/renovar
// respeitam o teto de folha que a diretoria dá para a comissão.
import { useMemo, useState, type ReactNode } from 'react';
import { BadgeCheck, Briefcase, Search, ShieldHalf, UserMinus, UserPlus, Users } from 'lucide-react';
import {
  Panel, Table, Segmented, AttrValue, AttrLegend, Avatar, Button, Stat, Tag, Sheet, ProgressBar, Alert, EmptyState,
  useToast, type Column,
} from '../../components/ds/index';
import { Flag } from '../../components/ui';
import { CoachStintsCard } from '../../components/career/CoachStintsCard';
import { useCareerConfirm } from '../../components/career/ConfirmModal';
import { activeStint, startStint, type CoachStint } from '../../engine/coachCareer';
import type { CoachScar } from '../../engine/career/scars';
import { migrateGestao } from '../../engine/gestao/gestaoMigration';
import type { GestaoState, StaffAttrKey, StaffEffects, StaffMember, StaffRole, StaffState, TrainingSession } from '../../engine/gestao/model';
import {
  STAFF_ATTRS, STAFF_ROLES, STAFF_ROLE_MAX, ROLE_WEIGHTS, CUSTOM_COACH_ID,
  staffEffects, staffRoleRating, staffPayroll, staffWageCap, staffContractLeft, staffSeverance, staffAge,
  staffMarket, hireStaff, fireStaff, renewStaff, coachFromStaff,
} from '../../engine/gestao/staff';
import { retiredStaffSources } from '../../engine/gestao/staffData';
import { retireeStaffSources } from '../../engine/mundo/juventudeMundo';
import type { MundoJuv } from '../../engine/mundo/juventude';
import type { CustomDatabase } from '../../engine/mundo/model';
import { applyCustomDatabase, resolveCareerDatabase } from '../../engine/mundo/editor';
import { CS2_REAL_2026 } from '../../data/bo3';
import { formatMoney } from '../../engine/ratings';
import { coachForMatch, coachMatchImpact, stylePower, STYLE_ATTR } from '../../engine/career/equilibrio';
import type { CoachStyle } from '../../types';
import { ct } from '../../state/career-i18n';
import '../../styles/staff.css';

export const ROLE_LABEL: Record<StaffRole, string> = {
  headCoach: 'Técnico principal', assistant: 'Auxiliar técnico', analyst: 'Analista',
  psychologist: 'Psicólogo', performance: 'Preparador físico', scout: 'Olheiro',
};
const ROLE_SHORT: Record<StaffRole, string> = {
  headCoach: 'Técnico', assistant: 'Auxiliar', analyst: 'Analista', psychologist: 'Psicólogo', performance: 'Preparador', scout: 'Olheiro',
};
const ROLE_WHAT: Record<StaffRole, string> = {
  headCoach: 'Tática, leitura de mapa e gestão do vestiário. Pesa em tudo um pouco.',
  assistant: 'Treino de mira e de utilitária, scrims e formação dos jovens.',
  analyst: 'VOD, leitura do adversário (anti-strat) e familiaridade nos mapas.',
  psychologist: 'Treino mental e recuperação da moral do elenco.',
  performance: 'Preparação física, descanso, risco e recuperação de lesão.',
  scout: 'Avalia CA/PA: estreita a faixa de potencial de quem você observa.',
};
export const ATTR_LABEL: Record<StaffAttrKey, string> = {
  tactics: 'Tática', mapKnowledge: 'Leitura de mapa', aimCoaching: 'Treino de mira', mentalCoaching: 'Treino mental',
  fitness: 'Preparação física', analysis: 'Análise', judgingAbility: 'Avaliar habilidade', judgingPotential: 'Avaliar potencial',
  motivating: 'Motivação', discipline: 'Disciplina', manManagement: 'Gestão de pessoas', youthDevelopment: 'Formação de jovens',
};
const ATTR_SHORT: Record<StaffAttrKey, string> = {
  tactics: 'TÁT', mapKnowledge: 'MAP', aimCoaching: 'MIR', mentalCoaching: 'MEN', fitness: 'FÍS', analysis: 'ANÁ',
  judgingAbility: 'HAB', judgingPotential: 'POT', motivating: 'MOT', discipline: 'DIS', manManagement: 'GES', youthDevelopment: 'JOV',
};
const ATTR_GROUPS: { label: string; keys: StaffAttrKey[] }[] = [
  { label: 'Treino', keys: ['tactics', 'mapKnowledge', 'aimCoaching', 'mentalCoaching', 'fitness'] },
  { label: 'Análise e olheiro', keys: ['analysis', 'judgingAbility', 'judgingPotential'] },
  { label: 'Gestão', keys: ['motivating', 'discipline', 'manManagement', 'youthDevelopment'] },
];
const SESSION_LABEL: Record<TrainingSession, string> = {
  aim: 'Treino de mira', utility: 'Treino de utilitária', tactics: 'Treino tático', vod: 'Análise de VOD',
  scrim: 'Scrims', physical: 'Preparação física', mental: 'Treino mental', rest: 'Descanso',
};

// Linhas de efeito: multiplicador (1 = linha de base) ou fração (0–1).
type EffectRow = { key: string; label: string; get: (e: StaffEffects) => number; kind: 'mult' | 'lowerBetter' | 'frac'; hint: string };
const EFFECT_ROWS: EffectRow[] = [
  ...(['aim', 'utility', 'tactics', 'vod', 'scrim', 'physical', 'mental', 'rest'] as TrainingSession[]).map((s): EffectRow => ({
    key: `t:${s}`, label: SESSION_LABEL[s], get: (e) => e.training[s], kind: 'mult', hint: 'Ganho do treino nesta sessão',
  })),
  { key: 'fam', label: 'Familiaridade tática', get: (e) => e.familiarityGain, kind: 'mult', hint: 'Quanto o time assimila do plano por mapa' },
  { key: 'morale', label: 'Recuperação de moral', get: (e) => e.moraleRecovery, kind: 'mult', hint: 'Quanto a moral baixa volta ao normal por split' },
  { key: 'youth', label: 'Evolução dos jovens', get: (e) => e.youthGrowth, kind: 'mult', hint: 'Ritmo de evolução da academia' },
  { key: 'injR', label: 'Risco de lesão', get: (e) => e.injuryRisk, kind: 'lowerBetter', hint: 'Abaixo de 100% é bom' },
  { key: 'injC', label: 'Recuperação de lesão', get: (e) => e.injuryRecovery, kind: 'mult', hint: 'Velocidade de volta de lesionados' },
  { key: 'anti', label: 'Leitura do adversário', get: (e) => e.antiStratRead, kind: 'frac', hint: 'Quanto das tendências do rival o analista revela' },
  { key: 'scout', label: 'Precisão dos olheiros', get: (e) => e.scoutAccuracy, kind: 'frac', hint: 'Estreita a faixa de CA/PA dos observados' },
];
function effectText(r: EffectRow, v: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (r.kind === 'frac') return { text: `${Math.round(v * 100)}%`, tone: v >= 0.43 ? 'up' : v > 0 ? 'flat' : 'down' };
  const pct = Math.round((v - 1) * 100);
  const good = r.kind === 'lowerBetter' ? -pct : pct;
  return { text: pct === 0 ? '±0%' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, tone: good > 0 ? 'up' : good < 0 ? 'down' : 'flat' };
}
function effectDelta(r: EffectRow, a: StaffEffects, b: StaffEffects): number {
  const d = r.get(b) - r.get(a);
  return r.kind === 'lowerBetter' ? -d : d;
}

// [equilíbrio] o que o técnico rende NA PARTIDA (bônus-base + estilo pela potência)
const STYLE_LABEL: Record<CoachStyle, string> = { tactical: 'Tático', aggressive: 'Agressivo', discipline: 'Disciplinador' };
const STYLE_WHAT: Record<CoachStyle, string> = {
  tactical: 'Forte no mapa que vocês escolhem e quando falta IGL. Potência pela Tática.',
  aggressive: 'Pressão no lado T e compra forçada mais cedo. Potência pela Motivação.',
  discipline: 'Recupera o time depois de perder um round. Potência pela Disciplina.',
};
const COACH_STYLES: CoachStyle[] = ['tactical', 'aggressive', 'discipline'];
const decTxt = (v: number) => { const x = Math.abs(v).toFixed(1); return ct('de força') === 'de força' ? x.replace('.', ',') : x; };
export function coachImpactOf(m: StaffMember, style?: CoachStyle) {
  return coachMatchImpact(coachForMatch(coachFromStaff(m), style ? { ...m, style } : m));
}
export function matchLine(i: { points: number; pp: number }): string {
  const sign = i.points > 0 ? '+' : i.points < 0 ? '−' : '±';
  const ppSign = i.pp > 0 ? '+' : i.pp < 0 ? '−' : '±';
  return `${ct('Na partida:')} ${sign}${decTxt(i.points)} (≈ ${ppSign}${Math.abs(i.pp)} ${ct('pp por série')})`;
}

const keyAttrs = (role: StaffRole): StaffAttrKey[] =>
  (Object.entries(ROLE_WEIGHTS[role]) as [StaffAttrKey, number][]).sort((x, y) => y[1] - x[1]).map(([k]) => k);

interface StaffTabSave {
  gestao?: GestaoState;
  split: number;
  budget: number;
  tier?: number;
  board?: number;
  region?: string;
  coachFromId?: string | null;
  org?: { name?: string; tag?: string } | null;
  coachStints?: CoachStint[];
  scars?: CoachScar[];
  [key: string]: unknown;
}

interface Props {
  save: StaffTabSave;
  /** patrocínio por split (entra no teto da folha da comissão) */
  sponsorIncome: number;
  update: (patch: Record<string, unknown>) => void;
}

type View = 'geral' | 'attrs' | 'contracts';
type Picked = { m: StaffMember; mode: 'member' | 'candidate' } | null;

export function StaffTab({ save, sponsorIncome, update }: Props) {
  const toast = useToast();
  const { askConfirm } = useCareerConfirm();
  const [view, setView] = useState<View>('geral');
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'all'>('all');
  const [picked, setPicked] = useState<Picked>(null);

  const gestao: GestaoState = save.gestao ?? (migrateGestao(save as Record<string, unknown>).gestao as GestaoState);
  const staff = gestao.staff;
  const members = staff.members;
  const split = save.split;
  const effects = useMemo(() => staffEffects(staff), [staff]);
  const payroll = staffPayroll(staff);
  const cap = staffWageCap({ tier: save.tier, board: save.board, sponsorIncome });
  const expiring = members.filter((m) => staffContractLeft(m, split) <= 1 && m.role !== 'headCoach');
  const headCoach = members.find((m) => m.role === 'headCoach');
  const coachImpact = headCoach ? coachImpactOf(headCoach) : null;
  // [equilíbrio] o estilo (a função) do técnico é escolha sua; a potência vem do atributo certo
  const setCoachStyle = (style: CoachStyle) => {
    if (!headCoach || headCoach.style === style) return;
    const next = { ...staff, members: members.map((x) => (x.id === headCoach.id ? { ...x, style } : x)) };
    const custom = save.coachFromId === CUSTOM_COACH_ID && save.customCoach ? { customCoach: { ...(save.customCoach as object), style } } : {};
    update({ gestao: { ...gestao, staff: next }, ...custom });
    setPicked((p) => (p && p.m.id === headCoach.id ? { ...p, m: { ...p.m, style } } : p));
    toast.success(`${ct('Estilo do técnico')}: ${ct(STYLE_LABEL[style])}`);
  };

  // [fase 4 · editor] base da Carreira (a customizada congelada no save, se houver)
  const dbSnap = (save.mundo as { database?: CustomDatabase | null } | undefined)?.database ?? null;
  const dbId = (save.mundo as { databaseId?: string | null } | undefined)?.databaseId ?? null;
  const careerBase = useMemo(() => applyCustomDatabase(CS2_REAL_2026, resolveCareerDatabase({ databaseId: dbId, database: dbSnap }, CS2_REAL_2026).db), [dbId, dbSnap]);
  const market = useMemo(
    // [fase 4 · juventude] quem se aposentou no mundo e virou comissão entra no pool
    () => staffMarket({ split, region: save.region, tier: save.tier, retired: [...retiredStaffSources(), ...retireeStaffSources(save.mundo as MundoJuv | undefined, careerBase)], exclude: members.map((m) => m.id) }),
    [split, save.region, save.tier, members, save.mundo, careerBase],
  );
  const shownMarket = market
    .filter((c) => roleFilter === 'all' || c.role === roleFilter)
    .sort((a, b) => staffRoleRating(b.attrs, b.role) - staffRoleRating(a.attrs, a.role));

  const vacancies = STAFF_ROLES.map((r) => ({ role: r, open: STAFF_ROLE_MAX[r] - members.filter((m) => m.role === r).length }))
    .filter((v) => v.open > 0);

  const commit = (next: StaffState, cost: number, extra: Record<string, unknown> = {}) => {
    update({ budget: save.budget - cost, gestao: { ...gestao, staff: next }, ...extra });
  };

  const doHire = (cand: StaffMember, term: number, replaceId?: string) => {
    const isHc = cand.role === 'headCoach';
    const c = isHc ? { ...cand, sourceCoachId: CUSTOM_COACH_ID } : cand;
    const r = hireStaff(staff, c, { split, budget: save.budget, cap, term, replaceId });
    if (!r.ok) { toast.error(ct(r.reason)); return; }
    let extra: Record<string, unknown> = {};
    if (isHc) {
      // o técnico principal é quem o motor lê: vira o técnico do save
      const coach = coachFromStaff(c);
      const stints = save.coachStints ?? [];
      const cur = activeStint(stints);
      extra = {
        coachFromId: CUSTOM_COACH_ID,
        customCoach: coach,
        coachStints: cur?.coachNick === coach.nick ? stints : startStint(stints, {
          coachId: CUSTOM_COACH_ID, coachNick: coach.nick, orgName: save.org?.name ?? '', orgTag: save.org?.tag,
          tier: save.tier ?? 3, startSplit: split,
        }),
      };
    }
    commit(r.staff, r.cost, extra);
    setPicked(null);
    toast.success(`${ct('Contratado')}: ${cand.nick ?? cand.name} · ${ct(ROLE_LABEL[cand.role])}`);
  };
  const doFire = (m: StaffMember) => {
    const r = fireStaff(staff, m.id, split);
    if (!r.ok) { toast.error(ct(r.reason)); return; }
    askConfirm({
      title: `${ct('Demitir')} ${m.nick ?? m.name}?`,
      message: `${ct('Multa rescisória')}: ${formatMoney(r.cost)}. ${ct('A vaga fica aberta até você contratar outro.')}`,
      confirmLabel: ct('Demitir'),
      danger: true,
      onConfirm: () => { commit(r.staff, r.cost); setPicked(null); toast.info(`${m.nick ?? m.name} ${ct('deixou o clube')}`); },
    });
  };
  const doRenew = (m: StaffMember) => {
    const r = renewStaff(staff, m.id, { split, budget: save.budget, cap });
    if (!r.ok) { toast.error(ct(r.reason)); return; }
    commit(r.staff, r.cost);
    setPicked(null);
    toast.success(`${m.nick ?? m.name} ${ct('renovou por 2 splits')}`);
  };

  // ── colunas ──
  const who = (m: StaffMember, extra?: ReactNode) => (
    <span className="staff-who">
      <Avatar name={m.nick ?? m.name} size={36} />
      <span className="staff-who__txt">
        <b>{m.nick ?? m.name}{extra}</b>
        <small><Flag cc={m.country} /> {m.nick ? m.name : ct(ROLE_SHORT[m.role])}</small>
      </span>
    </span>
  );
  const rating = (m: StaffMember) => staffRoleRating(m.attrs, m.role);
  const attrCol = (k: StaffAttrKey): Column<StaffMember> => ({
    key: k, header: <abbr title={ct(ATTR_LABEL[k])}>{ATTR_SHORT[k]}</abbr>, num: true, views: ['attrs'],
    sort: (m) => m.attrs[k], cell: (m) => <AttrValue value={m.attrs[k]} size="sm" />,
  });
  const strengths = (m: StaffMember) => (
    <span className="staff-keys">
      {keyAttrs(m.role).slice(0, 3).map((k) => (
        <span key={k} className="staff-key" title={ct(ATTR_LABEL[k])}><small>{ATTR_SHORT[k]}</small><AttrValue value={m.attrs[k]} size="sm" /></span>
      ))}
    </span>
  );
  const contractCell = (m: StaffMember) => {
    const left = staffContractLeft(m, split);
    return <span className={left <= 1 ? 'staff-warn' : undefined}>{left <= 1 ? ct('último split') : `${left} splits`}</span>;
  };

  const memberCols: Column<StaffMember>[] = [
    { key: 'who', header: ct('Nome'), sort: (m) => (m.nick ?? m.name).toLowerCase(), cell: (m) => who(m, m.sourcePlayerId ? <Tag className="staff-ex">{ct('ex-jogador')}</Tag> : null) },
    { key: 'role', header: ct('Cargo'), sort: (m) => STAFF_ROLES.indexOf(m.role), cell: (m) => ct(ROLE_LABEL[m.role]) },
    { key: 'age', header: ct('Idade'), num: true, views: ['geral', 'contracts'], sort: (m) => staffAge(m, split), cell: (m) => staffAge(m, split) },
    { key: 'nota', header: ct('Nota'), num: true, sort: rating, cell: (m) => <AttrValue value={rating(m)} /> },
    { key: 'keys', header: ct('Pontos do cargo'), views: ['geral'], cell: strengths },
    ...STAFF_ATTRS.map(attrCol),
    { key: 'wage', header: ct('Salário/split'), num: true, views: ['geral', 'contracts'], sort: (m) => m.wage, cell: (m) => formatMoney(m.wage) },
    { key: 'contract', header: ct('Contrato'), num: true, views: ['geral', 'contracts'], sort: (m) => m.contractUntil, cell: contractCell },
    {
      key: 'act', header: <span className="ds-sr-only">{ct('Ações')}</span>, views: ['contracts'],
      cell: (m) => (
        <span className="staff-actions" onClick={(e) => e.stopPropagation()}>
          {m.role !== 'headCoach' && staffContractLeft(m, split) <= 1 && <Button size="sm" onClick={() => doRenew(m)}>{ct('Renovar')}</Button>}
          {m.role !== 'headCoach' && <Button size="sm" variant="ghost" onClick={() => doFire(m)}>{ct('Demitir')}</Button>}
        </span>
      ),
    },
  ];
  const marketCols: Column<StaffMember>[] = [
    { key: 'who', header: ct('Nome'), sort: (m) => (m.nick ?? m.name).toLowerCase(), cell: (m) => who(m, m.sourcePlayerId ? <Tag className="staff-ex">{ct('ex-jogador')}</Tag> : null) },
    { key: 'role', header: ct('Cargo'), sort: (m) => STAFF_ROLES.indexOf(m.role), cell: (m) => ct(ROLE_SHORT[m.role]) },
    { key: 'age', header: ct('Idade'), num: true, sort: (m) => m.age, cell: (m) => m.age },
    { key: 'nota', header: ct('Nota'), num: true, sort: rating, cell: (m) => <AttrValue value={rating(m)} /> },
    { key: 'keys', header: ct('Pontos do cargo'), cell: strengths },
    { key: 'wage', header: ct('Pede/split'), num: true, sort: (m) => m.wage, cell: (m) => <span className={payroll + m.wage > cap && m.role !== 'headCoach' ? 'staff-warn' : undefined}>{formatMoney(m.wage)}</span> },
    {
      key: 'match', header: ct('Na partida'), num: true, sort: (m) => (m.role === 'headCoach' ? coachImpactOf(m).points : -99),
      cell: (m) => {
        if (m.role !== 'headCoach') return <span className="ds-dim">—</span>;
        const i = coachImpactOf(m);
        return <span className="staff-match-cell" data-tone={i.points > 0 ? 'up' : i.points < 0 ? 'down' : 'flat'} title={matchLine(i)}>{i.points > 0 ? '+' : i.points < 0 ? '−' : '±'}{decTxt(i.points)} <small>≈{i.pp > 0 ? '+' : i.pp < 0 ? '−' : '±'}{Math.abs(i.pp)} pp</small></span>;
      },
    },
  ];

  const payTone = payroll > cap ? 'loss' : payroll > cap * 0.85 ? 'warn' : 'accent';

  return (
    <div className="em-tab staff-tab">
      <Panel icon={<ShieldHalf size={16} />} title={`${ct('Comissão técnica')} · ${save.org?.name ?? ''}`} tone="accent" className="staff-summary">
        <div className="staff-stats">
          <Stat label={ct('Folha da comissão')} value={formatMoney(payroll)} hint={`${ct('teto da diretoria')} ${formatMoney(cap)}`} />
          <Stat label={ct('Membros')} value={`${members.length}/${STAFF_ROLES.reduce((s, r) => s + STAFF_ROLE_MAX[r], 0)}`} hint={vacancies.length ? `${vacancies.length} ${ct('cargo(s) com vaga')}` : ct('comissão completa')} />
          <Stat label={ct('Contratos no fim')} value={expiring.length} hint={expiring.length ? ct('renove em Contratos') : ct('nenhum vencendo')} />
          <Stat label={ct('Caixa')} value={formatMoney(save.budget)} />
        </div>
        <ProgressBar value={payroll} max={cap} tone={payTone} label={ct('Uso do teto de folha')} valueText={`${Math.round((payroll / Math.max(1, cap)) * 100)}%`} />
      </Panel>

      <div className="staff-grid">
        <Panel icon={<BadgeCheck size={16} />} title={ct('O que a comissão rende')} className="staff-effects">
          {headCoach && (
            <p className="staff-match" data-tone={coachImpact!.points > 0 ? 'up' : coachImpact!.points < 0 ? 'down' : 'flat'}>
              <b>{matchLine(coachImpact!)}</b>
              <small>{`${ct('Técnico')} ${headCoach.nick ?? headCoach.name} · ${ct(STYLE_LABEL[headCoach.style ?? 'tactical'])}. ${ct('Técnico de nota 10 = 0; o analista melhora a leitura automática do adversário.')}`}</small>
            </p>
          )}
          <p className="staff-note">{ct('Contra a comissão mediana (100%). Cargo vago é coberto no improviso e rende abaixo.')}</p>
          <ul className="staff-eff-list">
            {EFFECT_ROWS.map((r) => {
              const v = r.get(effects);
              const t = effectText(r, v);
              return (
                <li key={r.key} className="staff-eff" title={ct(r.hint)}>
                  <span>{ct(r.label)}</span>
                  <b data-tone={t.tone}>{t.text}</b>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel
          icon={<Users size={16} />}
          title={ct('Sua comissão')}
          flush
          className="staff-members"
          actions={(
            <Segmented<View>
              label={ct('Visão de colunas')}
              value={view}
              onChange={setView}
              items={[
                { value: 'geral', label: ct('Geral') },
                { value: 'attrs', label: ct('Atributos') },
                { value: 'contracts', label: ct('Contratos') },
              ]}
            />
          )}
        >
          <Table<StaffMember>
            columns={memberCols}
            rows={[...members].sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role))}
            rowKey={(m) => m.id}
            view={view}
            caption={ct('Comissão técnica')}
            onRowClick={(m) => setPicked({ m, mode: 'member' })}
            empty={ct('Sem comissão técnica.')}
          />
          {view === 'attrs' && <div className="staff-legend"><AttrLegend /></div>}
          {vacancies.length > 0 && (
            <div className="staff-vacancies">
              <span className="ds-eyebrow">{ct('Vagas abertas')}</span>
              <div className="staff-vac-list">
                {vacancies.map((v) => (
                  <button key={v.role} type="button" className="staff-vac" onClick={() => { setRoleFilter(v.role); document.getElementById('staff-market')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                    <b>{ct(ROLE_LABEL[v.role])}{v.open > 1 ? ` ×${v.open}` : ''}</b>
                    <small>{ct(ROLE_WHAT[v.role])}</small>
                    <span className="staff-vac__go"><Search size={13} aria-hidden /> {ct('Procurar')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        id="staff-market"
        icon={<Briefcase size={16} />}
        title={ct('Mercado de staff')}
        flush
        className="staff-market"
        actions={(
          <Segmented<StaffRole | 'all'>
            label={ct('Filtrar por cargo')}
            value={roleFilter}
            onChange={setRoleFilter}
            items={[{ value: 'all', label: ct('Todos') }, ...STAFF_ROLES.map((r) => ({ value: r, label: ct(ROLE_SHORT[r]), count: market.filter((c) => c.role === r).length }))]}
          />
        )}
      >
        <p className="staff-note staff-note--pad">
          {ct('O mercado muda a cada split. Luvas de 1 salário; o técnico principal contratado aqui assume o time (e o banco na partida).')}
        </p>
        <Table<StaffMember>
          columns={marketCols}
          rows={shownMarket}
          rowKey={(m) => m.id}
          caption={ct('Mercado de staff')}
          onRowClick={(m) => setPicked({ m, mode: 'candidate' })}
          empty={<EmptyState title={ct('Ninguém disponível neste cargo')}>{ct('Volte no próximo split.')}</EmptyState>}
        />
      </Panel>

      <CoachStintsCard
        stints={save.coachStints ?? []}
        coachNick={members.find((m) => m.role === 'headCoach')?.nick ?? activeStint(save.coachStints ?? [])?.coachNick}
        scars={save.scars}
        split={split}
      />

      {picked && (
        <StaffProfile
          pick={picked}
          staff={staff}
          effects={effects}
          split={split}
          budget={save.budget}
          cap={cap}
          onClose={() => setPicked(null)}
          onHire={doHire}
          onFire={doFire}
          onRenew={doRenew}
          onStyle={setCoachStyle}
        />
      )}
    </div>
  );
}

// ── Perfil do membro / candidato (sheet) ──
function StaffProfile({ pick, staff, effects, split, budget, cap, onClose, onHire, onFire, onRenew, onStyle }: {
  pick: NonNullable<Picked>;
  staff: StaffState;
  effects: StaffEffects;
  split: number;
  budget: number;
  cap: number;
  onClose: () => void;
  onHire: (m: StaffMember, term: number, replaceId?: string) => void;
  onFire: (m: StaffMember) => void;
  onRenew: (m: StaffMember) => void;
  onStyle: (style: CoachStyle) => void;
}) {
  const { m, mode } = pick;
  const [term, setTerm] = useState<'1' | '2' | '3'>('2');
  const same = staff.members.filter((x) => x.role === m.role);
  const full = mode === 'candidate' && m.role !== 'headCoach' && same.length >= STAFF_ROLE_MAX[m.role];
  const [replaceId, setReplaceId] = useState<string | undefined>(full ? same[0]?.id : undefined);
  const nota = staffRoleRating(m.attrs, m.role);

  // impacto: comissão COM × SEM ele (membro) ou COM a contratação × hoje (candidato)
  const other: StaffEffects = useMemo(() => {
    if (mode === 'member') return staffEffects({ ...staff, members: staff.members.filter((x) => x.id !== m.id) });
    const rep = m.role === 'headCoach' ? same[0]?.id : replaceId;
    return staffEffects({ ...staff, members: [...staff.members.filter((x) => x.id !== rep), m] });
  }, [mode, staff, m, replaceId, same]);
  const [before, after] = mode === 'member' ? [other, effects] : [effects, other];
  const impact = EFFECT_ROWS
    .map((r) => ({ r, d: effectDelta(r, before, after), v: r.get(after) }))
    .filter((x) => Math.abs(x.d) >= 0.005)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 6);

  const preview = mode === 'candidate'
    ? hireStaff(staff, m, { split, budget, cap, term: Number(term), replaceId: m.role === 'headCoach' ? undefined : replaceId })
    : null;
  const left = staffContractLeft(m, split);

  const footer = mode === 'candidate' ? (
    <div className="staff-foot">
      {preview && !preview.ok && <span className="staff-warn">{ct(preview.reason)}</span>}
      <Button variant="primary" icon={<UserPlus size={16} aria-hidden />} disabled={!preview?.ok} onClick={() => onHire(m, Number(term), replaceId)}>
        {ct('Contratar')}{preview?.ok ? ` · ${formatMoney(preview.cost)}` : ''}
      </Button>
    </div>
  ) : m.role !== 'headCoach' ? (
    <div className="staff-foot">
      {left <= 1 && <Button onClick={() => onRenew(m)}>{ct('Renovar por 2 splits')}</Button>}
      <Button variant="danger" icon={<UserMinus size={16} aria-hidden />} onClick={() => onFire(m)}>
        {ct('Demitir')} · {formatMoney(staffSeverance(m, split))}
      </Button>
    </div>
  ) : undefined;

  return (
    <Sheet open onClose={onClose} size="lg" title={<>{m.nick ?? m.name} <small className="staff-sheet-role">{ct(ROLE_LABEL[m.role])}</small></>} footer={footer}>
      <div className="staff-profile">
        <header className="staff-profile__head">
          <Avatar name={m.nick ?? m.name} size={56} />
          <div className="staff-profile__id">
            <b>{m.name}</b>
            <span><Flag cc={m.country} /> {mode === 'member' ? staffAge(m, split) : m.age} {ct('anos')}{m.sourcePlayerId ? ` · ${ct('ex-jogador profissional')}` : ''}{m.style ? ` · ${ct(m.style === 'tactical' ? 'Tático' : m.style === 'aggressive' ? 'Agressivo' : 'Disciplinador')}` : ''}</span>
            <small>{ct(ROLE_WHAT[m.role])}</small>
          </div>
          <div className="staff-profile__nota">
            <AttrValue value={nota} size="lg" />
            <small>{ct('nota no cargo')}</small>
          </div>
        </header>

        <div className="staff-attr-groups">
          {ATTR_GROUPS.map((g) => (
            <section key={g.label} className="staff-attr-group">
              <h3 className="ds-eyebrow">{ct(g.label)}</h3>
              {g.keys.map((k) => (
                <div key={k} className={`staff-attr${ROLE_WEIGHTS[m.role][k] ? ' is-key' : ''}`}>
                  <span>{ct(ATTR_LABEL[k])}</span>
                  <AttrValue value={m.attrs[k]} />
                </div>
              ))}
            </section>
          ))}
        </div>

        {m.role === 'headCoach' && (
          <section className="staff-coach-style">
            <h3 className="ds-eyebrow">{ct('Estilo do técnico na partida')}</h3>
            <p className="staff-match" data-tone={coachImpactOf(m).points > 0 ? 'up' : coachImpactOf(m).points < 0 ? 'down' : 'flat'}><b>{matchLine(coachImpactOf(m))}</b></p>
            {mode === 'member' ? (
              <div className="staff-style-list" role="radiogroup" aria-label={ct('Estilo do técnico na partida')}>
                {COACH_STYLES.map((st) => {
                  const on = (m.style ?? 'tactical') === st;
                  const pow = stylePower(m.attrs[STYLE_ATTR[st]]);
                  return (
                    <button key={st} type="button" role="radio" aria-checked={on} className={`staff-style${on ? ' is-on' : ''}`} onClick={() => onStyle(st)}>
                      <b>{ct(STYLE_LABEL[st])}</b>
                      <small>{ct(STYLE_WHAT[st])}</small>
                      <span className="staff-style__pow">{ct(ATTR_LABEL[STYLE_ATTR[st]])} {m.attrs[STYLE_ATTR[st]]} · {ct('potência')} {decTxt(pow)} · {matchLine(coachImpactOf(m, st)).replace(`${ct('Na partida:')} `, '')}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="staff-note">{`${ct('Estilo')}: ${ct(STYLE_LABEL[m.style ?? 'tactical'])}. ${ct('Depois de contratado, você escolhe o estilo; a potência vem do atributo dele.')}`}</p>
            )}
          </section>
        )}

        <section className="staff-impact">
          <h3 className="ds-eyebrow">{mode === 'member' ? ct('O que ele rende na comissão') : ct('O que muda se contratar')}</h3>
          {impact.length === 0 ? (
            <p className="staff-note">{mode === 'member' ? ct('Hoje ele não muda nada: alguém do mesmo cargo cobre melhor.') : ct('Não melhora a comissão atual.')}</p>
          ) : (
            <ul className="staff-eff-list staff-eff-list--impact">
              {impact.map(({ r, d, v }) => {
                const t = effectText(r, v);
                const pts = Math.max(1, Math.round(Math.abs(d) * 100));
                return (
                  <li key={r.key} className="staff-eff">
                    <span>{ct(r.label)}</span>
                    <b data-tone={d > 0 ? 'up' : 'down'}>{d > 0 ? '+' : '−'}{pts}{r.kind === 'frac' ? ' p.p.' : '%'}</b>
                    <small>{ct('fica')} {t.text}</small>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {mode === 'candidate' ? (
          <section className="staff-deal">
            <h3 className="ds-eyebrow">{ct('Proposta')}</h3>
            <div className="staff-deal__row"><span>{ct('Salário por split')}</span><b>{formatMoney(m.wage)}</b></div>
            <div className="staff-deal__row">
              <span>{ct('Duração')}</span>
              <Segmented<'1' | '2' | '3'> label={ct('Duração do contrato')} value={term} onChange={setTerm} items={[{ value: '1', label: '1 split' }, { value: '2', label: '2 splits' }, { value: '3', label: '3 splits' }]} />
            </div>
            {m.role === 'headCoach' && same[0] && (
              <Alert tone="warn" title={ct('Troca de técnico')}>
                {`${same[0].nick ?? same[0].name} ${ct('sai com multa de')} ${formatMoney(staffSeverance(same[0], split))}. ${ct('O novo técnico assume o banco nas partidas.')}`}
              </Alert>
            )}
            {full && (
              <div className="staff-deal__row staff-deal__row--col">
                <span>{ct('Vaga cheia: quem ele substitui?')}</span>
                <Segmented<string>
                  label={ct('Substituir')}
                  value={replaceId ?? ''}
                  onChange={setReplaceId}
                  items={same.map((x) => ({ value: x.id, label: `${x.nick ?? x.name} (${staffRoleRating(x.attrs, x.role).toFixed(0)})` }))}
                />
              </div>
            )}
            <div className="staff-deal__row"><span>{ct('Folha da comissão depois')}</span><b className={preview?.ok ? undefined : 'staff-warn'}>{formatMoney(staffPayroll(staff) - (full ? same.find((x) => x.id === replaceId)?.wage ?? 0 : m.role === 'headCoach' ? same[0]?.wage ?? 0 : 0) + m.wage)} / {formatMoney(cap)}</b></div>
          </section>
        ) : (
          <section className="staff-deal">
            <h3 className="ds-eyebrow">{ct('Contrato')}</h3>
            <div className="staff-deal__row"><span>{ct('Salário por split')}</span><b>{formatMoney(m.wage)}</b></div>
            <div className="staff-deal__row"><span>{ct('Até o split')}</span><b>{m.contractUntil} <small className="ds-dim">({left <= 1 ? ct('último split') : `${left} splits`})</small></b></div>
            {m.role !== 'headCoach' && <div className="staff-deal__row"><span>{ct('Multa rescisória')}</span><b>{formatMoney(staffSeverance(m, split))}</b></div>}
            {m.role === 'headCoach' && <p className="staff-note">{ct('O técnico principal renova sozinho no fim do contrato. Para trocar, contrate outro no mercado.')}</p>}
          </section>
        )}
      </div>
    </Sheet>
  );
}
