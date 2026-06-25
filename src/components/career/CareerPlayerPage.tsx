import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Player } from '../../types';
import { ct } from '../../state/career-i18n';
import { playerOrgId } from '../../state/career-player-route';
import { FutCard } from '../FutCard';
import { Flag, PlayerAvatar, TeamBadge } from '../ui';
import { CareerIcon, type CareerIconName } from './CareerIcon';
import { IconChevronLeft } from './DashIcons';

type PlayerTab = 'card' | 'overview' | 'personal' | 'performance' | 'career';

type CareerDerived = {
  rating: number;
  kd: number;
  adr: number;
  kastPct: number;
  maps: number;
  kills: number;
  splits: number;
};

const TABS: { id: PlayerTab; label: string; icon: CareerIconName }[] = [
  { id: 'card', label: 'Cartão', icon: 'document' },
  { id: 'overview', label: 'Visão geral', icon: 'brain' },
  { id: 'personal', label: 'Dados pessoais', icon: 'pin' },
  { id: 'performance', label: 'Desempenho', icon: 'chart-bar' },
  { id: 'career', label: 'Carreira', icon: 'trophy' },
];

function fmScale(v: number): number {
  return Math.round(((Math.max(40, Math.min(99, v)) - 40) / 59) * 20 * 10) / 10;
}

function statJitter(nick: string, salt: string, base: number): number {
  let h = 0;
  const s = `${nick}:${salt}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 255;
  return fmScale(base + (h % 7) - 3);
}

function AttrRadar({ attrs }: { attrs: { label: string; value: number }[] }) {
  const n = attrs.length;
  const cx = 130, cy = 108, R = 78;
  const norm = (v: number) => Math.max(0.08, Math.min(1, v / 20));
  const pt = (i: number, r: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const grid = [0.25, 0.5, 0.75, 1].map((f) => attrs.map((_, i) => pt(i, R * f).join(',')).join(' '));
  const shape = attrs.map((d, i) => pt(i, R * norm(d.value)).join(',')).join(' ');
  return (
    <svg viewBox="0 0 260 220" className="pp-radar" role="img" aria-label={ct('Perfil de atributos')}>
      <g stroke="rgba(255,255,255,0.08)" fill="none" strokeWidth="0.8">
        {grid.map((g, i) => <polygon key={i} points={g} />)}
        {attrs.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} />; })}
      </g>
      <polygon points={shape} fill="rgba(192,57,43,0.18)" stroke="var(--em-red)" strokeWidth="2" />
      {attrs.map((d, i) => {
        const [lx, ly] = pt(i, R + 18);
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="pp-radar-label">
            {d.label}
          </text>
        );
      })}
    </svg>
  );
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

function profileDimensions(player: Player) {
  const mech = (player.aim + player.consistency) / 2;
  const mental = (player.igl + player.clutch) / 2;
  const physical = (player.aim + player.clutch + player.consistency) / 3 - 2;
  return [
    { label: ct('Mecânica'), value: fmScale(mech) },
    { label: ct('Mental'), value: fmScale(mental) },
    { label: ct('Físico'), value: fmScale(physical) },
    { label: ct('Mira'), value: fmScale(player.aim) },
    { label: ct('Utilidade'), value: fmScale(player.consistency * 0.55 + player.igl * 0.45) },
    { label: ct('Clutch'), value: fmScale(player.clutch) },
  ];
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
  moraleLabel,
  moraleIcon,
  fatigue,
  valueLabel,
  wageLabel,
  contractLeft,
  evoTotal,
  developmentProgress,
  focused,
  reducedLoad,
  trainingLevel,
  career,
  cur,
  seasonGames,
  seasonWins,
  titles,
  onToggleFocus,
  onToggleRest,
  onBack,
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
  valueLabel: string;
  wageLabel: string;
  contractLeft: string;
  evoTotal: number;
  developmentProgress: number;
  focused: boolean;
  reducedLoad: boolean;
  trainingLevel: number;
  career: CareerDerived | null;
  cur?: { rating: number; kd: number; adr: number; maps?: number };
  seasonGames: number;
  seasonWins: number;
  titles: number;
  onToggleFocus: () => void;
  onToggleRest: () => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<PlayerTab>('card');
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

  const dims = useMemo(() => profileDimensions(player), [player]);
  const groups = useMemo(() => attrGroups(player), [player]);
  const roleTag = (player.role || 'PRO').toUpperCase().slice(0, 4);
  const role2Tag = player.role2 ? player.role2.toUpperCase().slice(0, 4) : null;

  const statTiles = [
    { label: ct('Jogos'), value: String(seasonGames || career?.maps || 0) },
    { label: ct('Vitórias'), value: String(seasonWins) },
    { label: 'Rating', value: career ? career.rating.toFixed(2) : cur?.rating?.toFixed(2) ?? '0.00' },
    { label: 'K/D', value: career ? career.kd.toFixed(2) : cur?.kd?.toFixed(2) ?? '—' },
    { label: 'ADR', value: career ? String(Math.round(career.adr)) : cur?.adr ? String(Math.round(cur.adr)) : '0' },
    { label: 'MVPs', value: '0' },
    { label: ct('Títulos'), value: String(titles) },
    { label: ct('Pico OVR'), value: String(peakOvr) },
  ];

  const fitness = Math.max(0, 100 - fatigue);
  const satisfaction = morale;

  const coachFooter = (
    <section className="pp-coach">
      <div className="pp-coach-head">
        <h3><CareerIcon name="document" size={14} /> {ct('Notas do Coach')}</h3>
        <span className={`pp-coach-status${notesSaved ? ' saved' : ''}`}>{notesSaved ? ct('Salvo') : '…'}</span>
      </div>
      <div className="pp-coach-actions">
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
      {/* ===== HEADER ===== */}
      <header className="pp-hero">
        <button type="button" className="pp-back" onClick={onBack} aria-label={ct('Voltar')}>
          <IconChevronLeft size={18} />
        </button>

        <div className="pp-hero-body">
          <div className="pp-hero-left">
            <div className="pp-photo">
              <PlayerAvatar nick={player.nick} size={96} />
            </div>
            <div className="pp-identity">
              <div className="pp-name-row">
                <h1>{player.nick}</h1>
                <Flag cc={player.country} />
                <span className={`pp-role ${player.role}`}>{roleTag}</span>
                {role2Tag && <span className="pp-role alt">{role2Tag}</span>}
              </div>
              <p className="pp-realname">{player.name}</p>
              <p className="pp-meta">
                {age} {ct('anos')} · Pot. {potTier} · {phaseLabel}
              </p>
              {orgName && (
                <p className="pp-team">
                  {orgTag && orgColors && (
                    <TeamBadge tag={orgTag} colors={orgColors} size={18} logoUrl={orgLogo} />
                  )}
                  {orgName}{orgTag ? ` (${orgTag})` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="pp-hero-right">
            <div className="pp-finance">
              <div><span>{ct('Valor')}</span><b>{valueLabel}</b></div>
              <div><span>{ct('Salário')}</span><b className="neg">{wageLabel}{ct('/split')}</b></div>
              <div><span>{ct('Contrato')}</span><b>{contractLeft}</b></div>
            </div>
            <div className="pp-badges">
              <div className="pp-badge ovr" title="OVR"><b>{ovr}</b></div>
              <div className={`pp-badge pot pot-${potTier.toLowerCase()}`} title={ct('Potencial')}><b>{potTier}</b></div>
            </div>
          </div>
        </div>
      </header>

      {/* ===== TABS ===== */}
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

      {/* ===== TAB CONTENT ===== */}
      <div className="pp-body">
        {tab === 'card' && (
          <div className="pp-card-tab">
            <aside className="pp-card-aside">
              <FutCard player={player} size="lg" />
              <div className="pp-pot-reveal">
                <span>{ct('Potencial revelado')}</span>
                <b className={`pot-${potTier.toLowerCase()}`}>{potTier}</b>
              </div>
            </aside>
            <div className="pp-card-main">
              <Panel title="Perfil de atributos">
                <div className="pp-attr-block">
                  <AttrRadar attrs={dims} />
                  <div className="pp-attr-grid">
                    {dims.map((d) => (
                      <div key={d.label} className="pp-attr-cell">
                        <span>{d.label}</span>
                        <b>{d.value.toFixed(1)}</b>
                      </div>
                    ))}
                  </div>
                  <span className="pp-scale-hint">{ct('Escala 0–20')}</span>
                </div>
              </Panel>
              <div className="pp-stat-grid">
                {statTiles.map((s) => (
                  <div key={s.label} className="pp-stat-box">
                    <span>{s.label}</span>
                    <b>{s.value}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
                  <div><span>{ct('Forma')}</span><b>{cur ? cur.rating.toFixed(2) : ct('Sem dados')}</b></div>
                  <div><span>{ct('Físico')}</span><b>{fitness}/100</b></div>
                  <div><span>{ct('Satisfação')}</span><b>{moraleLabel} {satisfaction}/100</b></div>
                  <div><span>{ct('Disciplina')}</span><b>{morale >= 60 ? ct('Boa') : ct('Instável')}</b></div>
                  <div><span>{ct('Fadiga')}</span><b>{fatigue}/100</b></div>
                  <div><span>{ct('Treino')}</span><b>{focused ? ct('Ativo') : ct('Inativo')}</b></div>
                </div>
              </Panel>
              <Panel title="Felicidade & vínculo">
                <div className="pp-happy-score"><b>{Math.round((morale + fitness) / 2)}</b><span>/100</span></div>
                <div className="pp-bar-list">
                  {[
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
                  ))}
                </div>
              </Panel>
              <Panel title="Função principal">
                <span className={`pp-role-big ${player.role}`}>{player.role}</span>
                {player.role2 && <span className="pp-role-big alt">{player.role2}</span>}
              </Panel>
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
                  <div><span>{ct('Idade')}</span><b>{age} {ct('anos')}</b></div>
                </div>
              </Panel>
              <Panel title="Contrato" icon="coin">
                <div className="pp-kv-grid">
                  <div><span>{ct('Salário/split')}</span><b className="neg">{wageLabel}</b></div>
                  <div><span>{ct('Valor de mercado')}</span><b>{valueLabel}</b></div>
                  <div><span>{ct('Contrato')}</span><b>{contractLeft}</b></div>
                  <div><span>{ct('Time atual')}</span><b>{orgName || '—'}</b></div>
                  <div><span>{ct('Satisfação')}</span><b>{morale}/100</b></div>
                  <div><span>{ct('Potencial')}</span><b>{pot} ({potTier})</b></div>
                </div>
              </Panel>
            </div>
            <Panel title="Indicadores" icon="chart">
              <div className="pp-kv-grid">
                <div><span>{ct('Moral')}</span><b><CareerIcon name={moraleIcon} size={12} /> {morale}/100</b></div>
                <div><span>{ct('Fadiga')}</span><b>{fatigue}/100</b></div>
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

      {coachFooter}
    </div>
  );
}
