import { useMemo, useState } from 'react';
import { RtpFrame } from './RtpFrame';
import { ct } from '../../state/career-i18n';
import { Flag } from '../ui';
import { RtpIcon } from './RtpIcon';
import { hashStr } from '../../state/hash';
import { makeRng, randomSeed } from '../../engine/rng';
import { TryoutModal } from './TryoutModal';
import { type Role, type Playstyle, PLAYSTYLE_LABELS, PLAYSTYLE_ICONS } from '../../types';
import {
  type PlayerPersonality, PERSONALITY_LABEL, PERSONALITY_DESC,
} from '../../engine/career/personality';
import {
  MECHANICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, type AttrKey,
} from '../../engine/attributes';
import {
  ARCHETYPES, archetypeDef, CREATE_BUDGET, seedAttributes, createRtpSave,
  type CreateRtpInput,
} from '../../engine/rtp/createSave';
import { proOvr } from '../../engine/rtp/coreStats';
import type { RoadToProSave, Tier } from '../../engine/rtp/types';

const ROLES: { role: Role; desc: string }[] = [
  { role: 'Entry', desc: 'Abre os bombsites' },
  { role: 'AWP', desc: 'O sniper do time' },
  { role: 'Rifler', desc: 'Fragger de rifle' },
  { role: 'Support', desc: 'Utilitário e trades' },
  { role: 'Lurker', desc: 'Joga os flancos' },
  { role: 'IGL', desc: 'Chama as jogadas' },
];

const PLAYSTYLES: Playstyle[] = ['aggressive', 'balanced', 'passive'];
const PERSONALITIES: PlayerPersonality[] = ['leader', 'prodigy', 'resilient', 'hothead', 'mercenary'];

// Países comuns no cenário de CS (ISO alpha-2 lowercase pra bandeira).
const COUNTRIES: { cc: string; name: string }[] = [
  { cc: 'br', name: 'Brasil' }, { cc: 'us', name: 'EUA' }, { cc: 'dk', name: 'Dinamarca' },
  { cc: 'se', name: 'Suécia' }, { cc: 'ru', name: 'Rússia' }, { cc: 'ua', name: 'Ucrânia' },
  { cc: 'fr', name: 'França' }, { cc: 'de', name: 'Alemanha' }, { cc: 'pl', name: 'Polônia' },
  { cc: 'fi', name: 'Finlândia' }, { cc: 'ba', name: 'Bósnia' }, { cc: 'gb', name: 'Reino Unido' },
  { cc: 'ca', name: 'Canadá' }, { cc: 'au', name: 'Austrália' }, { cc: 'pt', name: 'Portugal' },
  { cc: 'ar', name: 'Argentina' },
];

const CAT_META: { key: 'mechanical' | 'mental' | 'physical'; label: string; sub: string; color: string; attrs: AttrKey[] }[] = [
  { key: 'mechanical', label: ct('Mecânica'), sub: ct('Mira, spray, reflexo'), color: 'var(--rtp-loss)', attrs: MECHANICAL_KEYS },
  { key: 'mental', label: ct('Mental'), sub: ct('Leitura, decisão, calls'), color: '#1f6feb', attrs: MENTAL_KEYS },
  { key: 'physical', label: ct('Físico'), sub: ct('Stamina, disciplina, APM'), color: 'var(--rtp-win)', attrs: PHYSICAL_KEYS },
];

export function RTPCreate({ onExit, onCreated }: {
  onExit: () => void;
  onCreated: (save: RoadToProSave) => void;
}) {
  const [nick, setNick] = useState('');
  const [country, setCountry] = useState('br');
  const [role, setRole] = useState<Role>('Rifler');
  const [playstyle, setPlaystyle] = useState<Playstyle | null>(null);
  const [personality, setPersonality] = useState<PlayerPersonality>('prodigy');
  const [archetype, setArchetype] = useState(ARCHETYPES[0].kind);
  const [age, setAge] = useState(17);
  const [points, setPoints] = useState({ mechanical: 4, mental: 4, physical: 4 });

  const spent = points.mechanical + points.mental + points.physical;
  const remaining = CREATE_BUDGET - spent;

  const setPt = (k: 'mechanical' | 'mental' | 'physical', delta: number) => {
    setPoints((p) => {
      const next = p[k] + delta;
      if (next < 0) return p;
      if (delta > 0 && remaining <= 0) return p;
      return { ...p, [k]: next };
    });
  };

  // Preview estável: seed derivada das seleções (atualiza ao mexer, mas não
  // "tremula" pra uma mesma config). Não é o save final — só a prévia.
  const preview = useMemo(() => {
    const input: CreateRtpInput = {
      nick: nick || 'rookie', country, role, playstyle: playstyle ?? undefined,
      personality, archetype, age, categoryPoints: points,
      seed: hashStr(`${nick}:${role}:${archetype}:${points.mechanical}:${points.mental}:${points.physical}`),
    };
    const rng = makeRng(input.seed!);
    const attrs = seedAttributes(input, rng);
    const ovr = proOvr(attrs, role);
    const catAvg = CAT_META.map((c) => ({
      ...c,
      avg: Math.round((c.attrs.reduce((a, k) => a + attrs[k], 0) / c.attrs.length) * 5),
    }));
    return { ovr, catAvg };
  }, [nick, country, role, playstyle, personality, archetype, age, points]);

  const canCreate = nick.trim().length >= 2 && remaining === 0;

  // Peneira: guarda a seed (compartilhada entre o reveal e o createRtpSave, pra o
  // time revelado ser o time real) + o OVR do build (peso leve na nota).
  const [tryout, setTryout] = useState<{ seed: number; ovr: number } | null>(null);

  const baseInput = (): CreateRtpInput => ({
    nick: nick.trim(), country, role, playstyle: playstyle ?? undefined,
    personality, archetype, age, categoryPoints: points,
  });

  // "Criar" agora ABRE A PENEIRA; o save só nasce quando ela termina (com o tier).
  const handleCreate = () => {
    if (!canCreate) return;
    setTryout({ seed: randomSeed(), ovr: preview.ovr });
  };

  const finishTryout = (startTier: Tier, tryoutStrong: boolean) => {
    const t = tryout;
    if (!t) return;
    const save = createRtpSave({ ...baseInput(), seed: t.seed, startTier, tryoutStrong });
    setTryout(null);
    onCreated(save);
  };

  return (
    <RtpFrame onExit={onExit}>
      <div className="rtp-create-head">
        <h1>{ct('Crie seu jogador')}</h1>
        <p>{ct('Comece como uma promessa de academia. Suas escolhas dentro e fora do servidor definem até onde você chega.')}</p>
      </div>

      <div className="rtp-create-grid">
        {/* Coluna esquerda — formulário */}
        <div>
          {/* Identidade */}
          <div className="rtp-section">
            <span className="rtp-label">{ct('Identidade')}</span>
            <div className="rtp-row2">
              <input
                className="rtp-input"
                placeholder={ct('Seu nick (ex.: zr1)')}
                value={nick}
                maxLength={14}
                onChange={(e) => setNick(e.target.value)}
              />
              <select className="rtp-select" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c.cc} value={c.cc}>{c.name}</option>)}
              </select>
            </div>
            <div className="rtp-chips" style={{ marginTop: 10 }}>
              {[16, 17, 18].map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`rtp-chip${age === a ? ' on' : ''}`}
                  onClick={() => setAge(a)}
                  title={a === 16 ? ct('Mais cru, porém mais potencial') : a === 18 ? ct('Mais pronto, menos teto') : ct('Equilíbrio entre talento e teto')}
                >
                  {a} {ct('anos')}
                </button>
              ))}
            </div>
          </div>

          {/* Função */}
          <div className="rtp-section">
            <span className="rtp-label">{ct('Função')}</span>
            <div className="rtp-chips">
              {ROLES.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  className={`rtp-chip${role === r.role ? ' on' : ''}`}
                  onClick={() => setRole(r.role)}
                >
                  {r.role}
                  <small>{r.desc}</small>
                </button>
              ))}
            </div>
          </div>

          {/* Estilo de jogo */}
          <div className="rtp-section">
            <span className="rtp-label">{ct('Estilo de jogo')}</span>
            <div className="rtp-chips">
              {PLAYSTYLES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`rtp-chip${playstyle === p ? ' on' : ''}`}
                  onClick={() => setPlaystyle(p)}
                >
                  {PLAYSTYLE_ICONS[p]} {PLAYSTYLE_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Personalidade */}
          <div className="rtp-section">
            <span className="rtp-label">{ct('Personalidade')}</span>
            <div className="rtp-chips">
              {PERSONALITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`rtp-chip${personality === p ? ' on' : ''}`}
                  title={PERSONALITY_DESC[p]}
                  onClick={() => setPersonality(p)}
                >
                  {PERSONALITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Arquétipo */}
          <div className="rtp-section">
            <span className="rtp-label">{ct('Arquétipo inicial')}</span>
            <div className="rtp-arch-grid">
              {ARCHETYPES.map((a) => (
                <button
                  key={a.kind}
                  type="button"
                  className={`rtp-arch${archetype === a.kind ? ' on' : ''}`}
                  onClick={() => setArchetype(a.kind)}
                >
                  <span className="rtp-arch-icon"><RtpIcon name={a.icon} size={26} /></span>
                  <div className="rtp-arch-name">{a.label}</div>
                  <div className="rtp-arch-desc">{a.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Distribuição de pontos */}
          <div className="rtp-section">
            <span className="rtp-label">{ct('Pontos de talento')}</span>
            <div className="rtp-budget-hint">
              {ct('Distribua seu talento bruto entre as 3 frentes. Restam')} <b>{remaining}</b> {ct('ponto(s)')}.
            </div>
            <div className="dash-card">
              <div className="dash-card-body">
                {CAT_META.map((c) => (
                  <div key={c.key} className="rtp-stepper">
                    <div className="rtp-stepper-name">
                      {c.label}
                      <small>{c.sub}</small>
                    </div>
                    <div className="rtp-stepper-ctl">
                      <button type="button" className="rtp-stepbtn" onClick={() => setPt(c.key, -1)} disabled={points[c.key] <= 0}>−</button>
                      <span className="rtp-stepval">{points[c.key]}</span>
                      <button type="button" className="rtp-stepbtn" onClick={() => setPt(c.key, +1)} disabled={remaining <= 0}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Coluna direita — preview */}
        <div className="rtp-preview">
          <div className="dash-card">
            <header className="dash-card-head"><b>{ct('Prévia')}</b></header>
            <div className="dash-card-body">
              <div className="rtp-preview-ovr">
                <b>{preview.ovr}</b>
                <span>{ct('OVR inicial')}</span>
              </div>
              <div className="rtp-preview-meta">
                <Flag cc={country} /> <b>{nick.trim() || ct('seu nick')}</b><br />
                {role} · {age} {ct('anos')} · {playstyle ? PLAYSTYLE_LABELS[playstyle] : ct('estilo livre')}
              </div>

              {preview.catAvg.map((c) => (
                <div key={c.key} className="rtp-catbar">
                  <div className="rtp-catbar-top">
                    <span>{c.label}</span>
                    <span>{c.avg}</span>
                  </div>
                  <div className="rtp-catbar-track">
                    <div className="rtp-catbar-fill" style={{ width: `${c.avg}%`, background: c.color }} />
                  </div>
                </div>
              ))}

              <div className="rtp-preview-meta" style={{ marginTop: 12, marginBottom: 14 }}>
                {ct('Arquétipo')}: <b>{archetypeDef(archetype).label}</b><br />
                {ct('Personalidade')}: <b>{PERSONALITY_LABEL[personality]}</b>
              </div>

              <button type="button" className="rtp-cta" disabled={!canCreate} onClick={handleCreate}>
                {ct('Começar carreira')}
              </button>
              {!canCreate && (
                <div className="rtp-budget-hint" style={{ marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
                  {nick.trim().length < 2 ? ct('Escolha um nick.') : ct('Distribua todos os pontos.')}
                </div>
              )}
            </div>
          </div>

          <div className="rtp-footer-actions">
            <button type="button" className="rtp-btn-ghost" onClick={onExit}>{ct('Cancelar')}</button>
          </div>
        </div>
      </div>

      {tryout && (
        <TryoutModal
          country={country}
          seed={tryout.seed}
          ovr={tryout.ovr}
          onDone={(tier, strong) => finishTryout(tier, strong)}
          onCancel={() => setTryout(null)}
        />
      )}
    </RtpFrame>
  );
}
