import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Player } from '../../types';
import { ct } from '../../state/career-i18n';
import type { FormStatus } from '../../engine/career/form';
import { legendStatus } from '../../engine/legend';
import { rollProSetup } from '../../engine/proSetup';
import { playerOrgId } from '../../state/career-player-route';
import { Flag, PlayerAvatar, TeamBadge } from '../ui';
import { CareerIcon, type CareerIconName } from './CareerIcon';
import { Brain, ChartNoAxesColumn, ChevronLeft, Crosshair, Gauge, IdCard, Trophy, UserRound, Zap, type LucideIcon } from 'lucide-react';
import { Panel as DsPanel, AttrValue, attrBand } from '../ds/index';
import { ATTR_LABEL, MECHANICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, type AttrKey } from '../../engine/attributes';
import { CaPaStars } from './CaPaStars';
import { deriveEventLine, type SeasonEventLine } from '../../engine/career/seasonStats';
import { HAPPINESS_FACTOR_LABEL, type HappinessBreakdown } from '../../engine/career/happiness';
import { physicalStatus, satisfactionStatus, disciplineStatus, reputationStatus } from '../../engine/career/playerStatus';
import { SubRoleStars } from './SubRoleStars';

export type PlayerTab = 'profile' | 'overview' | 'personal' | 'performance' | 'career';

type CareerDerived = {
  rating: number;
  kd: number;
  adr: number;
  kastPct: number;
  maps: number;
  kills: number;
  splits: number;
};

/** abas do perfil. No shell elas viram a subnav (PLAYER_TABS, ícones lucide);
 *  a nav interna (TABS) só aparece quando a página não é controlada. */
export const PLAYER_TABS: { id: PlayerTab; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Perfil', icon: UserRound },
  { id: 'overview', label: 'Visão geral', icon: Gauge },
  { id: 'personal', label: 'Dados pessoais', icon: IdCard },
  { id: 'performance', label: 'Desempenho', icon: ChartNoAxesColumn },
  { id: 'career', label: 'Carreira', icon: Trophy },
];

const TABS: { id: PlayerTab; label: string; icon: CareerIconName }[] = [
  { id: 'profile', label: 'Perfil', icon: 'document' },
  { id: 'overview', label: 'Visão geral', icon: 'brain' },
  { id: 'personal', label: 'Dados pessoais', icon: 'pin' },
  { id: 'performance', label: 'Desempenho', icon: 'chart-bar' },
  { id: 'career', label: 'Carreira', icon: 'trophy' },
];

// #15: preço curto pra UI de listagem (R$ 1,2M / R$ 850k)
function fmtPrice(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}k`;
  return `R$ ${v}`;
}

function fmScale(v: number): number {
  return Math.round(((Math.max(40, Math.min(99, v)) - 40) / 59) * 20 * 10) / 10;
}

function statJitter(nick: string, salt: string, base: number): number {
  let h = 0;
  const s = `${nick}:${salt}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 255;
  return fmScale(base + (h % 7) - 3);
}

function StatCol({ title, accent, score, items }: {
  title: string;
  accent: string;
  score: number;
  items: { label: string; value: number }[];
}) {
  return (
    <div className="pp-stat-col">
      <div className="pp-stat-col-head" style={{ borderLeftColor: accent }}>
        <span>{title}</span>
        <b>{score.toFixed(1)}</b>
      </div>
      <ul className="pp-stat-col-list">
        {items.map((it) => (
          <li key={it.label}>
            <span>{it.label}</span>
            <b className={it.value >= 15 ? 'hi' : ''}>{it.value.toFixed(1)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ title, icon, children, action }: {
  title: string;
  icon?: CareerIconName;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="pp-panel">
      <div className="pp-panel-head">
        <h3>{icon && <CareerIcon name={icon} size={14} />}{ct(title)}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function attrGroups(player: Player) {
  const n = player.nick;
  return {
    mech: {
      score: fmScale((player.aim + player.consistency + player.awp) / 3),
      items: [
        { label: ct('Mira'), value: statJitter(n, 'm1', player.aim) },
        { label: ct('AWP'), value: statJitter(n, 'm2', player.awp) },
        { label: ct('Consistência'), value: statJitter(n, 'm3', player.consistency) },
        { label: ct('Spray'), value: statJitter(n, 'm4', player.consistency - 2) },
        { label: ct('Entry'), value: statJitter(n, 'm5', player.aim + (player.role === 'Entry' ? 4 : -2)) },
        { label: ct('Headshot'), value: statJitter(n, 'm6', player.aim + 1) },
        { label: ct('Crosshair'), value: statJitter(n, 'm7', player.aim) },
        { label: ct('Pré-mira'), value: statJitter(n, 'm8', player.consistency) },
        { label: ct('Off-angles'), value: statJitter(n, 'm9', player.clutch - 1) },
      ],
    },
    mental: {
      score: fmScale((player.igl + player.clutch) / 2),
      items: [
        { label: ct('Game sense'), value: statJitter(n, 'n1', player.igl + 2) },
        { label: ct('Decisões'), value: statJitter(n, 'n2', player.igl) },
        { label: ct('Compostura'), value: statJitter(n, 'n3', player.clutch) },
        { label: ct('Concentração'), value: statJitter(n, 'n4', player.consistency) },
        { label: ct('Posicionamento'), value: statJitter(n, 'n5', player.igl + 1) },
        { label: ct('Trabalho em equipe'), value: statJitter(n, 'n6', player.igl + 3) },
        { label: ct('Comunicação'), value: statJitter(n, 'n7', player.igl) },
        { label: ct('Liderança'), value: statJitter(n, 'n8', player.role === 'IGL' ? player.igl + 4 : player.igl - 4) },
        { label: ct('Adaptabilidade'), value: statJitter(n, 'n9', player.consistency - 1) },
        { label: ct('Visão de jogo'), value: statJitter(n, 'n10', player.igl + 1) },
        { label: ct('Clutch'), value: statJitter(n, 'n11', player.clutch) },
        { label: ct('Anti-eco'), value: statJitter(n, 'n12', player.consistency + 1) },
      ],
    },
    phys: {
      score: fmScale((player.aim + player.clutch) / 2 - 1),
      items: [
        { label: ct('Reflexos'), value: statJitter(n, 'p1', player.aim + 1) },
        { label: ct('Reação'), value: statJitter(n, 'p2', player.aim) },
        { label: ct('Resistência'), value: statJitter(n, 'p3', player.consistency - 3) },
        { label: ct('Disciplina'), value: statJitter(n, 'p4', player.consistency + 2) },
        { label: ct('Coordenação'), value: statJitter(n, 'p5', player.aim) },
        { label: 'APM', value: statJitter(n, 'p6', player.clutch - 2) },
      ],
    },
  };
}

// ── Perfil (FM): atributos 1–20 em 3 colunas ────────────────────────────────
const ATTR_COLS: { title: string; icon: LucideIcon; keys: AttrKey[] }[] = [
  { title: 'Mecânica', icon: Crosshair, keys: MECHANICAL_KEYS },
  { title: 'Mental', icon: Brain, keys: MENTAL_KEYS },
  { title: 'Físico', icon: Zap, keys: PHYSICAL_KEYS },
];
function ProfileAttributes({ attributes }: { attributes: Record<string, number> }) {
  return (
    <DsPanel icon={<ChartNoAxesColumn size={16} />} title={ct('Atributos')} actions={<span className="pp-fm-scale">{ct('Escala 1–20')}</span>}>
      <div className="pp-fm-attrs">
        {ATTR_COLS.map((col) => (
          <section key={col.title} className="pp-fm-col" aria-label={ct(col.title)}>
            <h3 className="pp-fm-col__head"><col.icon size={15} aria-hidden /> {ct(col.title)}</h3>
            <ul>
              {col.keys.map((k) => {
                const v = Math.max(1, Math.min(20, Math.round(attributes[k] ?? 1)));
                return (
                  <li key={k} className="pp-fm-row">
                    <span className="pp-fm-row__label">{ct(ATTR_LABEL[k])}</span>
                    <span className="pp-fm-row__bar" data-band={attrBand(v)} aria-hidden><i style={{ width: `${(v / 20) * 100}%` }} /></span>
                    <AttrValue value={v} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </DsPanel>
  );
}

const NOTES_KEY = 'rtm-player-notes-v1';

export function CareerPlayerPage({
  player,
  orgName,
  orgTag,
  orgColors,
  orgLogo,
  split,
  age,
  pot,
  potTier,
  phaseLabel,
  ovr,
  peakOvr,
  personalityLabel,
  personalityDesc,
  morale,
  moraleIcon,
  fatigue,
  sharpness,
  injuryNote,
  valueLabel,
  wageLabel,
  contractLeft,
  evoTotal,
  developmentProgress,
  focused,
  reducedLoad,
  trainingLevel,
  career,
  seasonLines,
  potBoost = 0,
  happiness = null,
  bond,
  listedPrice = null,
  marketValue,
  onList,
  focusAttr = null,
  focusSuggested,
  focusOptions,
  onFocusAttr,
  stints,
  watch = null,
  form,
  cur,
  seasonGames,
  seasonWins,
  titles,
  onToggleFocus,
  onToggleRest,
  onBack,
  onTalk,
  onEditAge,
  retired = false,
  attributes,
  ca,
  paRange,
  tab: tabProp,
  onTab,
}: {
  player: Player;
  orgName: string;
  orgTag?: string;
  orgColors?: [string, string];
  orgLogo?: string;
  split: number;
  age: number;
  pot: number;
  potTier: string;
  phaseLabel: string;
  ovr: number;
  peakOvr: number;
  personalityLabel: string;
  personalityDesc: string;
  morale: number;
  moraleLabel: string;
  moraleIcon: CareerIconName;
  fatigue: number;
  /** [fase 2 · treino] ritmo de jogo 0–100 (condição) */
  sharpness?: number;
  /** [fase 2 · treino] lesão atual ("Punho (LER) · 2 sem.") */
  injuryNote?: string | null;
  valueLabel: string;
  wageLabel: string;
  contractLeft: string;
  evoTotal: number;
  developmentProgress: number;
  focused: boolean;
  reducedLoad: boolean;
  trainingLevel: number;
  career: CareerDerived | null;
  seasonLines?: SeasonEventLine[]; // #13/#26: linhas por evento (mais recente primeiro)
  potBoost?: number; // #17: pontos de teto FURADOS por performance (0 = potencial scouted puro)
  happiness?: HappinessBreakdown | null; // #16: satisfação composta (5 fatores legíveis)
  bond?: number; // #31: vínculo com você (0-100)
  listedPrice?: number | null; // #15: preço pedido se listado à venda
  marketValue?: number; // #15: valor de mercado atual (base das ofertas de listagem)
  onList?: (price: number | null) => void; // #15: listar (preço) / retirar (null)
  focusAttr?: string | null; // #22: atributo em foco no treino
  focusSuggested?: string; // #22: sugestão do staff (maior lacuna × relevância da role)
  focusOptions?: { id: string; label: string; biased: number }[]; // #22: catálogo + viés já acumulado
  onFocusAttr?: (attr: string | null) => void; // #22: definir/limpar o foco
  /** #40: passagens do jogador pelo SEU clube (entrada/saída com OVR) */
  stints?: { team: string; from: number; to: number | null; startOvr: number; endOvr?: number }[];
  /** #41: observatório de scouting — só pra jogador de FORA do elenco.
   *  level 0 = não acompanhado (mostra o botão Acompanhar). */
  watch?: {
    level: number;
    maxLevel: number;
    band: number;             // ± da faixa de OVR aparente (0 = exato)
    apparent: number;         // centro da faixa (OVR aparente do relatório)
    showPersonality: boolean;
    showSubRole: boolean;
    showPotential: boolean;
    hasScout: boolean;        // com olheiro o nível sobe todo split
    onToggle: () => void;
  } | null;
  /** Forma recente (janela de ratings por série) — chip colorido no Status. */
  form?: FormStatus;
  cur?: { rating: number; kd: number; adr: number; maps?: number };
  seasonGames: number;
  seasonWins: number;
  titles: number;
  onToggleFocus: () => void;
  onToggleRest: () => void;
  /** T3.7 — abre PlayerTalkModal pra conversar com o jogador. */
  onTalk?: () => void;
  /** Vitalícia: edita a idade de jogador CRIADO (Custom Roster Builder). */
  onEditAge?: (age: number) => void;
  /** T3.9 — flag indicando que o jogador já se aposentou. Renderiza chip. */
  retired?: boolean;
  /** T3.1 — 28 atributos FM-style. Se passado, renderiza section. */
  attributes?: Record<string, number>;
  /** [realismo FM] habilidade atual (1–200) e faixa do potencial do relatório de olheiro */
  ca?: number;
  paRange?: [number, number];
  onBack: () => void;
  /** aba controlada pelo shell (subnav); sem isso a página usa a nav interna */
  tab?: PlayerTab;
  onTab?: (tab: PlayerTab) => void;
}) {
  const [tabState, setTabState] = useState<PlayerTab>('profile');
  const tab = tabProp ?? tabState;
  const setTab = (t: PlayerTab) => { if (onTab) onTab(t); else setTabState(t); };
  // edição de idade (Vitalícia, só jogador criado): null = fechado
  const [ageDraft, setAgeDraft] = useState<number | null>(null);
  const oid = playerOrgId(player.id);
  const notesKey = `${NOTES_KEY}:${oid}`;
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(true);

  useEffect(() => {
    try { setNotes(localStorage.getItem(notesKey) ?? ''); } catch { setNotes(''); }
  }, [notesKey]);

  const saveNotes = useCallback((v: string) => {
    setNotes(v);
    setNotesSaved(false);
    try { localStorage.setItem(notesKey, v); setNotesSaved(true); } catch { /* ok */ }
  }, [notesKey]);

  const groups = useMemo(() => attrGroups(player), [player]);
  // #49: aura de lenda geracional por pico de carreira (null = jogador comum)
  const legend = legendStatus(ovr, peakOvr);
  // #52: ficha técnica determinística por nick (flavor da cena)
  const setup = useMemo(() => rollProSetup(player.nick), [player.nick]);
  const role2Tag = player.role2 ? player.role2.toUpperCase().slice(0, 4) : null;


  const fitness = Math.max(0, 100 - fatigue);
  const satisfaction = morale;

  const coachFooter = (
    <section className="pp-coach">
      <div className="pp-coach-head">
        <h3><CareerIcon name="document" size={14} /> {ct('Notas do Coach')}</h3>
        <span className={`pp-coach-status${notesSaved ? ' saved' : ''}`}>{notesSaved ? ct('Salvo') : '…'}</span>
      </div>
      <div className="pp-coach-actions">
        {retired && (
          <span
            className="pp-coach-tag"
            style={{
              background: 'color-mix(in srgb, var(--c-loss) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--c-loss) 55%, transparent)',
              color: 'var(--c-loss)',
              fontWeight: 700,
              cursor: 'default',
            }}
            title={ct('Este jogador anunciou aposentadoria — pode continuar no elenco mas perde OVR a cada split.')}
          >
            {ct('Aposentado')}
          </span>
        )}
        <button type="button" className="pp-coach-tag">{ct('Alvo de transferência')}</button>
        <button type="button" className="pp-coach-tag">{ct('Renovar')}</button>
        <button type="button" className="pp-coach-tag">{ct('Vender')}</button>
        <button type="button" className="pp-coach-tag">{ct('Ficar de olho')}</button>
        <button type="button" className={`pp-coach-tag${focused ? ' on' : ''}`} onClick={onToggleFocus}>
          {focused ? ct('Tirar do treino') : ct('Pôr em treino')}
        </button>
        <button type="button" className={`pp-coach-tag${reducedLoad ? ' on' : ''}`} onClick={onToggleRest}>
          {reducedLoad ? ct('Carga reduzida') : ct('Dar carga reduzida')}
        </button>
        {onTalk && (
          <button type="button" className="pp-coach-tag" onClick={onTalk}>
            {ct('Conversar')}
          </button>
        )}
      </div>
      <textarea
        className="pp-coach-notes"
        value={notes}
        onChange={(e) => saveNotes(e.target.value)}
        placeholder={ct('Anote insights sobre este jogador (estilo, contrato, características)…')}
        maxLength={500}
        rows={3}
      />
      <span className="pp-coach-count">{notes.length}/500</span>
    </section>
  );

  return (
    <div className="pp-page">
      {/* ===== CABEÇALHO (FM): avatar, nome, ficha; OVR, forma e valor ===== */}
      <header className="pp-fm-head">
        {!onTab && (
          <button type="button" className="pp-back" onClick={onBack} aria-label={ct('Voltar')}>
            <ChevronLeft size={18} aria-hidden />
          </button>
        )}
        <div className="pp-fm-avatar"><PlayerAvatar nick={player.nick} size={92} /></div>
        <div className="pp-fm-id">
          <div className="pp-fm-name">
            <h1>{player.nick}</h1>
            {player.name && <span className="pp-fm-real">{player.name}</span>}
            {legend && (
              <span className={`pp-legend t-${legend.tier}${legend.legacy ? ' legacy' : ''}`} title={legend.desc}>
                {ct(legend.label)}
              </span>
            )}
          </div>
          <p className="pp-fm-meta">
            <b className={`pp-fm-role ${player.role}`}>{player.role}{role2Tag ? ` / ${player.role2}` : ''}</b>
            <span>{age} {ct('anos')}</span>
            <span className="pp-fm-cc"><Flag cc={player.country} /> {player.country?.toUpperCase()}</span>
            {orgName && (
              <span className="pp-fm-team">
                {orgTag && orgColors && <TeamBadge tag={orgTag} colors={orgColors} size={18} logoUrl={orgLogo} />}
                {orgName}
              </span>
            )}
            <span>{ct('Contrato')}: {contractLeft}</span>
            <span>Pot. {potTier} · {phaseLabel}</span>
          </p>
          {ca != null && paRange && <CaPaStars ca={ca} paRange={paRange} />}
        </div>
        <dl className="pp-fm-kpis">
          <div className="pp-fm-kpi pp-fm-kpi--ovr"><dt>OVR</dt><dd>{ovr}</dd></div>
          <div className="pp-fm-kpi" title={form?.label}>
            <dt>{ct('Forma')}</dt>
            <dd style={form?.avg != null ? { color: form.color } : undefined}>
              {form?.avg != null ? form.avg.toFixed(2).replace('.', ',') : cur?.rating ? cur.rating.toFixed(2).replace('.', ',') : '—'}
            </dd>
          </div>
          <div className="pp-fm-kpi"><dt>{ct('Valor')}</dt><dd>{valueLabel}</dd></div>
        </dl>
      </header>

      {/* ===== TABS (fora do shell) ===== */}
      {!onTab && (
        <nav className="pp-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'on' : ''}
              onClick={() => setTab(t.id)}
            >
              <CareerIcon name={t.icon} size={14} />
              <span className="pp-tab-label">{ct(t.label)}</span>
            </button>
          ))}
        </nav>
      )}

      {/* ===== TAB CONTENT ===== */}
      <div className="pp-body">
        {tab === 'profile' && attributes && <ProfileAttributes attributes={attributes} />}

        {tab === 'overview' && (
          <div className="pp-overview-tab">
            <div className="pp-overview-cols">
              <StatCol title={ct('Mecânica')} accent="#e74c3c" score={groups.mech.score} items={groups.mech.items} />
              <StatCol title={ct('Mental')} accent="#3498db" score={groups.mental.score} items={groups.mental.items} />
              <StatCol title={ct('Físico')} accent="#2ecc71" score={groups.phys.score} items={groups.phys.items} />
            </div>
            <aside className="pp-overview-side">
              <Panel title="Status">
                <div className="pp-status-grid">
                  <div>
                    <span>{ct('Forma')}</span>
                    {form ? (
                      <b
                        className="pp-form-pill"
                        style={{ color: form.color }}
                        title={form.avg != null ? `${ct('Média das últimas séries:')} ${form.avg.toFixed(2)}` : ct('Precisa de pelo menos 2 séries recentes')}
                      >
                        {ct(form.label)}{form.avg != null ? ` · ${form.avg.toFixed(2)}` : ''}
                      </b>
                    ) : (
                      <b>{cur ? cur.rating.toFixed(2) : ct('Sem dados')}</b>
                    )}
                  </div>
                  {/* #32: números crus viram TIERS legíveis (pill com cor) */}
                  {(() => {
                    const phys = physicalStatus(fatigue);
                    const sat = satisfactionStatus(happiness ? happiness.overall : satisfaction);
                    const disc = disciplineStatus(player);
                    const rep = reputationStatus(peakOvr, titles);
                    const pill = (s: { label: string; color: string; value: number }) => (
                      <b style={{ color: s.color }} title={`${s.value}/100`}>{ct(s.label)}</b>
                    );
                    return (
                      <>
                        <div><span>{ct('Físico')}</span>{pill(phys)}</div>
                        <div><span>{ct('Satisfação')}</span>{pill(sat)}</div>
                        <div><span>{ct('Disciplina')}</span>{pill(disc)}</div>
                        <div><span>{ct('Reputação')}</span>{pill(rep)}</div>
                      </>
                    );
                  })()}
                  <div><span>{ct('Treino')}</span><b>{focused ? ct('Ativo') : ct('Inativo')}</b></div>
                </div>
              </Panel>
              <Panel title="Felicidade & vínculo">
                {/* #16: satisfação COMPOSTA — 5 fatores legíveis explicam o porquê */}
                <div className="pp-happy-score"><b>{happiness ? happiness.overall : Math.round((morale + fitness) / 2)}</b><span>/100</span></div>
                <div className="pp-bar-list">
                  {happiness ? (
                    (Object.keys(happiness.factors) as (keyof typeof happiness.factors)[]).map((k) => (
                      <div key={k} className="pp-bar-item">
                        <span>{ct(HAPPINESS_FACTOR_LABEL[k])}</span>
                        <div className="pp-bar-track"><i style={{ width: `${happiness.factors[k]}%` }} /></div>
                        <b>{happiness.factors[k]}%</b>
                      </div>
                    ))
                  ) : (
                    [
                      { label: ct('Moral'), pct: morale },
                      { label: ct('Condição física'), pct: fitness },
                      { label: ct('Desenvolvimento'), pct: developmentProgress },
                      { label: ct('Centro de treino'), pct: Math.min(100, trainingLevel * 25) },
                    ].map((b) => (
                      <div key={b.label} className="pp-bar-item">
                        <span>{b.label}</span>
                        <div className="pp-bar-track"><i style={{ width: `${b.pct}%` }} /></div>
                        <b>{b.pct}%</b>
                      </div>
                    ))
                  )}
                  {/* #31: a relação com VOCÊ é um eixo próprio — conversas constroem, atritos corroem */}
                  {bond != null && (
                    <div className="pp-bar-item pp-bond">
                      <span>{ct('Vínculo com você')}</span>
                      <div className="pp-bar-track"><i style={{ width: `${bond}%` }} /></div>
                      <b>{Math.round(bond)}%</b>
                    </div>
                  )}
                </div>
              </Panel>
              <Panel title="Função principal">
                <span className={`pp-role-big ${player.role}`}>{player.role}</span>
                {player.role2 && <span className="pp-role-big alt">{player.role2}</span>}
              </Panel>
              {/* #22: FOCO DE TREINO — qual atributo este jogador trabalha */}
              {onFocusAttr && focusOptions && focusOptions.length > 0 && (
                <Panel title="Foco individual de treino" icon="brain">
                  <div className="pp-focus-grid">
                    {focusOptions.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`pp-focus-btn${focusAttr === o.id ? ' on' : ''}`}
                        onClick={() => onFocusAttr(focusAttr === o.id ? null : o.id)}
                        title={o.biased > 0 ? `${ct('Especialização acumulada')}: +${o.biased}` : undefined}
                      >
                        {ct(o.label)}
                        {o.biased > 0 && <em>+{o.biased}</em>}
                        {focusSuggested === o.id && <span className="pp-focus-reco">★ {ct('recomendado')}</span>}
                      </button>
                    ))}
                  </div>
                  <p className="pp-focus-hint">{ct('O foco individual redistribui o treino da semana: o atributo escolhido rende ×2,2 (o resto cede um pouco); o foco na função rende ×1,45 nos atributos dela. A agenda e a intensidade ficam em Treinos e scrims. ★ = maior lacuna da função.')}</p>
                </Panel>
              )}
              {/* #40: PASSAGENS — a biografia do jogador na sua org */}
              {stints && stints.length > 0 && (
                <Panel title="Passagens" icon="calendar">
                  <div className="pp-stints">
                    {[...stints].reverse().map((st, i) => (
                      <div key={i} className="pp-stint">
                        <b>{st.team}</b>
                        <span>
                          {ct('split')} {st.from} → {st.to == null ? ct('atual') : `${ct('split')} ${st.to}`}
                          {st.startOvr > 0 && <> · OVR {st.startOvr}{st.endOvr != null ? ` → ${st.endOvr}` : ''}</>}
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
              {/* #15: LISTAR À VENDA — a IA dá lances a cada fechamento de split */}
              {onList && marketValue != null && (
                <Panel title="Mercado" icon="chart-bar">
                  {listedPrice != null ? (
                    <div className="pp-listing">
                      <p className="pp-listing-on">
                        🏷️ {ct('Listado por')} <b>{fmtPrice(listedPrice)}</b>
                        <span> · {ct('a IA avalia a cada fechamento de split')}</span>
                      </p>
                      <button type="button" className="pp-listing-btn off" onClick={() => onList(null)}>{ct('Retirar do mercado')}</button>
                    </div>
                  ) : (
                    <div className="pp-listing">
                      <p className="pp-listing-hint">{ct('Valor de mercado')}: <b>{fmtPrice(marketValue)}</b>. {ct('Preço baixo vende rápido; ganância encalha.')}</p>
                      {[
                        { label: ct('Venda rápida'), mult: 0.8 },
                        { label: ct('Preço justo'), mult: 1.0 },
                        { label: ct('Valorizado'), mult: 1.3 },
                      ].map((o) => (
                        <button key={o.mult} type="button" className="pp-listing-btn" onClick={() => onList(Math.round(marketValue * o.mult))}>
                          {o.label} · {fmtPrice(Math.round(marketValue * o.mult))}
                        </button>
                      ))}
                    </div>
                  )}
                </Panel>
              )}
              {/* #41: OBSERVATÓRIO — scouting progressivo de alvo fora do elenco */}
              {watch && (
                <Panel title="Observatório" icon="search">
                  {watch.level <= 0 ? (
                    <div className="pp-listing">
                      <p className="pp-listing-hint">{ct('Marque este jogador pra acompanhar. A cada fechamento de split o relatório fica mais preciso — com olheiro contratado, duas vezes mais rápido.')}</p>
                      <button type="button" className="pp-listing-btn" onClick={watch.onToggle}>
                        🔭 {ct('Acompanhar jogador')}
                      </button>
                    </div>
                  ) : (
                    <div className="pp-listing">
                      <p className="pp-listing-on">
                        🔭 {ct('Nível de relatório')} <b>{watch.level}/{watch.maxLevel}</b>
                        <span> · {watch.hasScout ? ct('olheiro no caso: sobe todo split') : ct('sem olheiro: sobe a cada 2 splits')}</span>
                      </p>
                      <p className="pp-listing-hint">
                        {ct('OVR estimado')}: <b>{watch.band > 0 ? `${watch.apparent - watch.band}–${watch.apparent + watch.band}` : String(watch.apparent)}</b>
                        {watch.showPotential && <span> · {ct('Potencial')}: <b>{pot}</b> ({potTier})</span>}
                      </p>
                      <p className="pp-listing-hint">
                        {ct('Revelado')}: {ct('função')}
                        {watch.showPersonality ? ` · ${ct('personalidade')}` : ''}
                        {watch.showSubRole ? ` · ${ct('sub-função')}` : ''}
                        {watch.showPotential ? ` · ${ct('potencial')}` : ''}
                        {watch.level < watch.maxLevel ? ` — ${ct('próximo relatório afina a leitura')}` : ` — ${ct('dossiê completo')}`}
                      </p>
                      <button type="button" className="pp-listing-btn off" onClick={watch.onToggle}>{ct('Parar de acompanhar')}</button>
                    </div>
                  )}
                </Panel>
              )}
            </aside>
          </div>
        )}

        {tab === 'personal' && (
          <div className="pp-personal-tab">
            <div className="pp-personal-row">
              <Panel title="Personalidade" icon="pin">
                <span className="pp-personality-tag">{personalityLabel}</span>
                <p className="pp-personality-desc">{personalityDesc}</p>
                <div className="pp-personal-meta">
                  <div><span>{ct('Nacionalidade')}</span><b><Flag cc={player.country} /> {player.country.toUpperCase()}</b></div>
                  <div>
                    <span>{ct('Idade')}</span>
                    {ageDraft == null ? (
                      <b>
                        {age} {ct('anos')}
                        {onEditAge && (
                          <button
                            type="button"
                            title={ct('Editar idade (Vitalícia — jogador criado)')}
                            onClick={() => setAgeDraft(age)}
                            style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--em-gold)', fontSize: '0.82rem', padding: 0 }}
                          >✎</button>
                        )}
                      </b>
                    ) : (
                      <b style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="number"
                          min={16}
                          max={40}
                          value={ageDraft}
                          autoFocus
                          onChange={(e) => setAgeDraft(Number(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && ageDraft >= 16 && ageDraft <= 40) { onEditAge?.(ageDraft); setAgeDraft(null); }
                            if (e.key === 'Escape') setAgeDraft(null);
                          }}
                          style={{ width: 58, padding: '3px 6px', background: 'var(--em-panel-2)', color: 'var(--em-text)', border: '1px solid var(--em-gold)', borderRadius: 4, fontFamily: 'inherit', fontSize: '0.84rem' }}
                        />
                        <button
                          type="button"
                          disabled={!(ageDraft >= 16 && ageDraft <= 40)}
                          onClick={() => { onEditAge?.(ageDraft); setAgeDraft(null); }}
                          style={{ background: 'var(--em-gold)', color: '#1a1205', border: 'none', borderRadius: 4, padding: '3px 9px', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer' }}
                        >{ct('Salvar')}</button>
                        <button
                          type="button"
                          onClick={() => setAgeDraft(null)}
                          style={{ background: 'none', color: 'var(--em-muted)', border: '1px solid var(--em-border)', borderRadius: 4, padding: '3px 9px', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}
                        >{ct('Cancelar')}</button>
                      </b>
                    )}
                  </div>
                </div>
              </Panel>
              <Panel title="Contrato" icon="coin">
                <div className="pp-kv-grid">
                  <div><span>{ct('Salário/split')}</span><b className="neg">{wageLabel}</b></div>
                  <div><span>{ct('Valor de mercado')}</span><b>{valueLabel}</b></div>
                  <div><span>{ct('Contrato')}</span><b>{contractLeft}</b></div>
                  <div><span>{ct('Time atual')}</span><b>{orgName || '—'}</b></div>
                  <div><span>{ct('Satisfação')}</span><b>{morale}/100</b></div>
                  <div><span>{ct('Potencial')}</span><b>{pot} ({potTier}){potBoost > 0 && <span className="pp-bt-chip" title={ct('Teto furado por performance')}> 🚀 +{potBoost}</span>}</b></div>
                </div>
              </Panel>
            </div>
            <Panel title="Indicadores" icon="chart">
              <div className="pp-kv-grid">
                <div><span>{ct('Moral')}</span><b><CareerIcon name={moraleIcon} size={12} /> {morale}/100</b></div>
                <div><span>{ct('Condição física')}</span><b>{Math.max(0, 100 - fatigue)}/100</b></div>
                {sharpness != null && <div><span>{ct('Ritmo de jogo')}</span><b>{sharpness}/100</b></div>}
                {injuryNote && <div><span>{ct('Lesão')}</span><b style={{ color: 'var(--c-loss)' }}>{injuryNote}</b></div>}
                <div><span>{ct('Evolução na carreira')}</span><b>{evoTotal > 0 ? `+${evoTotal}` : '0'}</b></div>
                <div><span>{ct('Pico OVR')}</span><b>{peakOvr}</b></div>
                <div><span>{ct('Margem de crescimento')}</span><b>{Math.max(0, pot - ovr)}</b></div>
                <div><span>{ct('Progresso ao teto')}</span><b>{developmentProgress}%</b></div>
              </div>
            </Panel>
            <Panel title="Plano de desenvolvimento" icon="focus">
              <div className="pp-dev-track"><i style={{ width: `${developmentProgress}%` }} /></div>
              <p className="pp-dev-note">
                {ct('Fase:')} <b>{phaseLabel}</b> · {ct('Centro de treino nível')} {trainingLevel}
                {focused && <> · <b>{ct('Foco individual ativo')}</b></>}
                {reducedLoad && <> · <b>{ct('Carga reduzida')}</b></>}
              </p>
            </Panel>
            {/* #52 — ficha técnica do pro (determinística por nick, só flavor) */}
            <Panel title="Setup de jogo" icon="pin">
              <div className="pp-kv-grid">
                <div><span>eDPI</span><b>{setup.edpi} ({setup.dpi} × {setup.sens})</b></div>
                <div><span>{ct('Polling')}</span><b>{setup.hz} Hz</b></div>
                <div><span>{ct('Resolução')}</span><b>{setup.resolution}</b></div>
                <div><span>{ct('Crosshair')}</span><b>{setup.crosshair}</b></div>
                <div><span>{ct('Mouse')}</span><b>{setup.mouse}</b></div>
                <div><span>{ct('Monitor')}</span><b>{setup.monitor}</b></div>
                <div><span>{ct('Teclado')}</span><b>{setup.keyboard}</b></div>
                <div><span>{ct('Headset')}</span><b>{setup.headset}</b></div>
              </div>
            </Panel>
          </div>
        )}

        {tab === 'performance' && (
          <div className="pp-perf-tab">
            <Panel title="Sumário do split" icon="chart">
              <div className="pp-stat-grid compact">
                <div className="pp-stat-box"><span>{ct('Jogos')}</span><b>{seasonGames || cur?.maps || 0}</b></div>
                <div className="pp-stat-box"><span>{ct('Vitórias')}</span><b>{seasonWins}</b></div>
                <div className="pp-stat-box"><span>Rating</span><b>{cur?.rating?.toFixed(2) ?? '0.00'}</b></div>
                <div className="pp-stat-box"><span>K/D</span><b>{cur?.kd?.toFixed(2) ?? '—'}</b></div>
                <div className="pp-stat-box"><span>ADR</span><b>{cur?.adr ? Math.round(cur.adr) : '0'}</b></div>
                <div className="pp-stat-box"><span>MVPs</span><b>0</b></div>
              </div>
              {!cur && (
                <p className="pp-empty">{ct('Sem dados de treino ainda. Avance o split para ver as notas.')}</p>
              )}
            </Panel>
            <Panel title="Campeonatos">
              {career && career.maps > 0 ? (
                <div className="pp-kv-grid">
                  <div><span>{ct('Mapas')}</span><b>{career.maps}</b></div>
                  <div><span>Rating 2.0</span><b>{career.rating.toFixed(2)}</b></div>
                  <div><span>K/D</span><b>{career.kd.toFixed(2)}</b></div>
                  <div><span>ADR</span><b>{Math.round(career.adr)}</b></div>
                  <div><span>KAST</span><b>{career.kastPct.toFixed(0)}%</b></div>
                  <div><span>{ct('Abates')}</span><b>{career.kills}</b></div>
                </div>
              ) : (
                <p className="pp-empty">{ct('Nenhum campeonato disputado ainda.')}</p>
              )}
            </Panel>

            {/* #13/#26: histórico POR EVENTO — como o jogador foi em CADA campeonato */}
            {seasonLines && seasonLines.length > 0 && (
              <Panel title={ct('Temporadas')} icon="chart">
                <table className="pp-seasons">
                  <thead>
                    <tr>
                      <th>{ct('Split')}</th><th>{ct('Campeonato')}</th>
                      <th className="n">{ct('Mapas')}</th><th className="n">K–D</th>
                      <th className="n">Rating</th><th className="n">{ct('Colocação')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonLines.slice(0, 12).map((l, i) => {
                      const d = deriveEventLine(l);
                      return (
                        <tr key={`${l.split}:${l.event}:${i}`}>
                          <td>{l.split}.{l.event}</td>
                          <td className="ev">{l.eventName}</td>
                          <td className="n">{l.maps}</td>
                          <td className="n">{l.k}–{l.d}</td>
                          <td className="n"><b>{d ? d.rating.toFixed(2) : '—'}</b></td>
                          <td className="n">{l.champion ? '🏆' : l.placement != null ? `${l.placement}º` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
        )}

        {tab === 'career' && (
          <div className="pp-career-tab">
            <div className="pp-career-row">
              <Panel title="Conquistas" icon="trophy">
                <div className="pp-stat-grid compact">
                  <div className="pp-stat-box"><span>{ct('Títulos')}</span><b>{titles}</b></div>
                  <div className="pp-stat-box"><span>MVPs</span><b>0</b></div>
                  <div className="pp-stat-box"><span>{ct('Jogos')}</span><b>{career?.maps ?? 0}</b></div>
                  <div className="pp-stat-box"><span>{ct('Vitórias')}</span><b>{seasonWins}</b></div>
                </div>
              </Panel>
              <Panel title="Marcos" icon="star">
                <ul className="pp-milestones">
                  <li><span>{ct('OVR atual')}</span><b>{ovr}</b></li>
                  <li><span>{ct('Pico de OVR')}</span><b>{peakOvr}</b></li>
                  <li><span>{ct('Potencial')}</span><b>{potTier} ({pot})</b></li>
                  <li><span>{ct('Splits jogados')}</span><b>{career?.splits ?? 0}</b></li>
                </ul>
              </Panel>
            </div>
            <Panel title="Histórico de carreira" icon="globe" action={<span className="pp-panel-tag">1 {ct('passagem')}</span>}>
              <div className="pp-history-item">
                <div className="pp-history-team">
                  {orgTag && orgColors && <TeamBadge tag={orgTag} colors={orgColors} size={28} logoUrl={orgLogo} />}
                  <div>
                    <b>{orgName}</b>
                    <span>Split {split} → {ct('atual')}</span>
                  </div>
                  <span className="pp-history-badge">{ct('ATUAL')}</span>
                </div>
                <p className="pp-history-stats">
                  {career?.maps ?? 0} {ct('mapas')} · Rating {career?.rating.toFixed(2) ?? '—'} · OVR {ovr}
                  {evoTotal > 0 && <> · <span className="pos">+{evoTotal} {ct('evolução')}</span></>}
                </p>
              </div>
            </Panel>
          </div>
        )}
      </div>

      {/* T3.3: sub-roles derivadas (entry/lurker/awper/etc) */}
      <div style={{ marginTop: 14 }}>
        <SubRoleStars player={player} />
      </div>

      {coachFooter}
    </div>
  );
}
