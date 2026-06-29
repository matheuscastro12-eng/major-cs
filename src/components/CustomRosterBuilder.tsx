// Custom Roster Builder — feature EXCLUSIVA de conta Vitalícia.
// Permite criar 5 jogadores manualmente (nick, nome, país, role, atributos
// individuais ou via OVR slider derivando) + coach custom. Os jogadores entram
// direto no save.customPlayers e o squad recebe signings com fromId='__custom__'.
// Sem upload de foto (decisão do user: peso server-side). Sem cap de OVR.
import { useMemo, useState } from 'react';
import type { Player, Role } from '../types';
import { ROLE_OPTS, type Signing } from './CareerScreen';
import { ct } from '../state/career-i18n';
import { attrsFromOvr } from '../state/bo3-edits';
import { Flag } from './ui';

type CoachStyle = 'tactical' | 'aggressive' | 'discipline';
type CustomCoach = { nick: string; name: string; country: string; rating: number; style: CoachStyle };

interface SlotDraft {
  nick: string;
  name: string;
  country: string;
  role: Role;
  ovr: number;
  advanced: boolean;
  aim: number;
  consistency: number;
  clutch: number;
  awp: number;
  igl: number;
}

const BLANK_SLOT = (role: Role): SlotDraft => ({
  nick: '',
  name: '',
  country: 'br',
  role,
  ovr: 70,
  advanced: false,
  ...attrsFromOvr(70, role),
});

const DEFAULT_SLOTS: SlotDraft[] = [
  BLANK_SLOT('AWP'),
  BLANK_SLOT('Rifler'),
  BLANK_SLOT('Entry'),
  BLANK_SLOT('Support'),
  BLANK_SLOT('IGL'),
];

const COMMON_COUNTRIES = [
  'br', 'us', 'ar', 'cl', 'pt', 'mx', 'co', 'pe',
  'ru', 'ua', 'by', 'kz', 'pl', 'cz',
  'fr', 'de', 'gb', 'es', 'it', 'nl', 'se', 'dk', 'fi', 'no',
  'cn', 'kr', 'jp', 'mn', 'au',
];

export function CustomRosterBuilder({
  orgName,
  orgTag,
  onConfirm,
  onCancel,
}: {
  orgName: string;
  orgTag: string;
  onConfirm: (data: {
    customPlayers: Record<string, Player>;
    squad: Signing[];
    customCoach: CustomCoach;
    coachFromId: string;
  }) => void;
  onCancel: () => void;
}) {
  const [slots, setSlots] = useState<SlotDraft[]>(DEFAULT_SLOTS);
  const [coach, setCoach] = useState<CustomCoach>({
    nick: '',
    name: '',
    country: 'br',
    rating: 70,
    style: 'tactical',
  });

  const updateSlot = (idx: number, patch: Partial<SlotDraft>) => {
    setSlots((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const next = { ...s, ...patch };
      // se mudou OVR ou role e NÃO está em modo avançado, recalcula attrs
      if (!next.advanced && ('ovr' in patch || 'role' in patch)) {
        return { ...next, ...attrsFromOvr(next.ovr, next.role) };
      }
      return next;
    }));
  };

  const slotComplete = (s: SlotDraft) => s.nick.trim().length > 0 && s.name.trim().length > 0;
  const allComplete = useMemo(
    () => slots.every(slotComplete) && coach.nick.trim().length > 0 && coach.name.trim().length > 0,
    [slots, coach],
  );

  const handleConfirm = () => {
    if (!allComplete) return;
    const stamp = Date.now();
    const customPlayers: Record<string, Player> = {};
    const squad: Signing[] = [];
    slots.forEach((s, i) => {
      const id = `custom__${stamp}__${i}`;
      const p: Player = {
        id,
        nick: s.nick.trim(),
        name: s.name.trim(),
        country: s.country,
        role: s.role,
        aim: s.aim,
        consistency: s.consistency,
        clutch: s.clutch,
        awp: s.awp,
        igl: s.igl,
      };
      customPlayers[id] = p;
      squad.push({ playerId: id, fromId: '__custom__' });
    });
    onConfirm({ customPlayers, squad, customCoach: coach, coachFromId: '__custom__' });
  };

  return (
    <div className="em-custom-builder fade-in" style={{ padding: '14px 18px 24px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ padding: '14px 18px', background: 'linear-gradient(135deg, rgba(232,193,112,0.14), transparent 60%)', border: '1px solid var(--em-gold-soft, var(--em-border))', borderRadius: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800, color: 'var(--em-gold)' }}>
              ⭐ {ct('Modo Custom · Vitalícia')}
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: '1.35rem', fontWeight: 900, color: 'var(--em-text)' }}>
              {orgName || ct('Sua org')} {orgTag && <span style={{ color: 'var(--em-muted)', fontWeight: 700, fontSize: '0.9rem' }}>· {orgTag}</span>}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--em-muted)' }}>
              {ct('Crie cada um dos 5 jogadores titulares + o coach. Sem mercado: o elenco entra direto na carreira.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '8px 14px', background: 'transparent', color: 'var(--em-muted)', border: '1px solid var(--em-border)', borderRadius: 4, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
          >
            ← {ct('Voltar')}
          </button>
        </div>
      </header>

      {/* GRID DOS 5 JOGADORES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {slots.map((s, i) => (
          <SlotCard key={i} slot={s} index={i} onChange={(patch) => updateSlot(i, patch)} />
        ))}
      </div>

      {/* COACH */}
      <div style={{ padding: '14px 16px', background: 'var(--em-panel)', border: '1px solid var(--em-border)', borderRadius: 6 }}>
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, color: 'var(--em-muted)', marginBottom: 10 }}>
          🎓 {ct('Coach')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          <Field label={ct('Nick')}>
            <Input value={coach.nick} maxLength={16} onChange={(v) => setCoach((c) => ({ ...c, nick: v }))} placeholder="zews" />
          </Field>
          <Field label={ct('Nome')}>
            <Input value={coach.name} maxLength={40} onChange={(v) => setCoach((c) => ({ ...c, name: v }))} placeholder="Wilton Prado" />
          </Field>
          <Field label={ct('País')}>
            <CountrySelect value={coach.country} onChange={(v) => setCoach((c) => ({ ...c, country: v }))} />
          </Field>
          <Field label={`${ct('Rating')} ${coach.rating}`}>
            <input type="range" min={50} max={99} value={coach.rating} onChange={(e) => setCoach((c) => ({ ...c, rating: Number(e.target.value) }))} style={{ width: '100%' }} />
          </Field>
          <Field label={ct('Estilo')}>
            <select value={coach.style} onChange={(e) => setCoach((c) => ({ ...c, style: e.target.value as CoachStyle }))} className="mf-select" style={{ width: '100%' }}>
              <option value="tactical">{ct('Tático')}</option>
              <option value="aggressive">{ct('Agressivo')}</option>
              <option value="discipline">{ct('Disciplinado')}</option>
            </select>
          </Field>
        </div>
      </div>

      {/* CONFIRM */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'var(--em-panel)', border: '1px solid var(--em-border)', borderRadius: 6, position: 'sticky', bottom: 12, zIndex: 5 }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--em-muted)' }}>
          {allComplete
            ? `✓ ${ct('Pronto — 5 jogadores e coach criados')}`
            : `⚠ ${ct('Preencha nick e nome de todos os 5 jogadores e do coach')}`}
        </span>
        <button
          type="button"
          disabled={!allComplete}
          onClick={handleConfirm}
          style={{ padding: '10px 24px', background: allComplete ? 'var(--em-gold)' : 'var(--em-panel-2)', color: allComplete ? '#1a1205' : 'var(--em-muted)', border: 'none', borderRadius: 4, fontFamily: 'inherit', fontWeight: 900, fontSize: '0.86rem', cursor: allComplete ? 'pointer' : 'not-allowed', letterSpacing: '0.3px' }}
        >
          {ct('Criar elenco e jogar')}
        </button>
      </div>
    </div>
  );
}

function SlotCard({ slot, index, onChange }: { slot: SlotDraft; index: number; onChange: (patch: Partial<SlotDraft>) => void }) {
  const derivedOvr = useMemo(() => {
    if (!slot.advanced) return slot.ovr;
    // OVR no modo avançado é calculado pelos atributos (mesma fórmula do playerOvr)
    const spec = Math.max(slot.awp, slot.igl, slot.aim);
    return Math.round(slot.aim * 0.45 + slot.consistency * 0.18 + slot.clutch * 0.12 + spec * 0.25);
  }, [slot]);
  return (
    <div style={{ padding: '12px 14px 14px', background: 'var(--em-panel)', border: '1px solid var(--em-border)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, color: 'var(--em-muted)' }}>
          {ct('Jogador')} {index + 1}
        </span>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '1rem', fontWeight: 900, color: 'var(--em-gold)' }}>
          OVR {derivedOvr}
        </span>
      </div>
      <Field label={ct('Nick')}>
        <Input value={slot.nick} maxLength={12} onChange={(v) => onChange({ nick: v })} placeholder="m0nk3y" />
      </Field>
      <Field label={ct('Nome')}>
        <Input value={slot.name} maxLength={40} onChange={(v) => onChange({ name: v })} placeholder="João Silva" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label={ct('País')}>
          <CountrySelect value={slot.country} onChange={(v) => onChange({ country: v })} />
        </Field>
        <Field label={ct('Função')}>
          <select value={slot.role} onChange={(e) => onChange({ role: e.target.value as Role })} className="mf-select" style={{ width: '100%' }}>
            {ROLE_OPTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
      </div>
      {!slot.advanced ? (
        <>
          <Field label={`OVR · ${slot.ovr}`}>
            <input type="range" min={40} max={99} value={slot.ovr} onChange={(e) => onChange({ ovr: Number(e.target.value) })} style={{ width: '100%' }} />
          </Field>
          <button
            type="button"
            onClick={() => onChange({ advanced: true })}
            style={{ padding: '4px 8px', alignSelf: 'flex-start', background: 'transparent', color: 'var(--em-muted)', border: '1px dashed var(--em-border)', borderRadius: 3, fontFamily: 'inherit', fontSize: '0.7rem', cursor: 'pointer' }}
          >
            ⚙ {ct('Modo avançado')}
          </button>
        </>
      ) : (
        <>
          <AttrSlider label="Aim" max={99} value={slot.aim} onChange={(v) => onChange({ aim: v })} />
          <AttrSlider label={ct('Consistência')} max={99} value={slot.consistency} onChange={(v) => onChange({ consistency: v })} />
          <AttrSlider label="Clutch" max={99} value={slot.clutch} onChange={(v) => onChange({ clutch: v })} />
          <AttrSlider label="AWP" max={slot.role === 'AWP' ? 99 : 80} value={slot.awp} onChange={(v) => onChange({ awp: v })} />
          <AttrSlider label="IGL" max={slot.role === 'IGL' ? 99 : 75} value={slot.igl} onChange={(v) => onChange({ igl: v })} />
          <button
            type="button"
            onClick={() => onChange({ advanced: false, ...attrsFromOvr(slot.ovr, slot.role) })}
            style={{ padding: '4px 8px', alignSelf: 'flex-start', background: 'transparent', color: 'var(--em-muted)', border: '1px dashed var(--em-border)', borderRadius: 3, fontFamily: 'inherit', fontSize: '0.7rem', cursor: 'pointer' }}
          >
            ↩ {ct('Voltar pro OVR slider')}
          </button>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: '0.68rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder, maxLength }: { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number }) {
  return (
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ padding: '7px 9px', background: 'var(--em-panel-2)', color: 'var(--em-text)', border: '1px solid var(--em-border)', borderRadius: 3, fontFamily: 'inherit', fontSize: '0.84rem' }}
    />
  );
}

function CountrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Flag cc={value} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mf-select"
        style={{ flex: 1, padding: '6px 8px', background: 'var(--em-panel-2)', color: 'var(--em-text)', border: '1px solid var(--em-border)', borderRadius: 3, fontFamily: 'inherit', fontSize: '0.82rem' }}
      >
        {COMMON_COUNTRIES.map((cc) => <option key={cc} value={cc}>{cc.toUpperCase()}</option>)}
      </select>
    </div>
  );
}

function AttrSlider({ label, max, value, onChange }: { label: string; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={`${label} · ${value}`}>
      <input
        type="range"
        min={40}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </Field>
  );
}
