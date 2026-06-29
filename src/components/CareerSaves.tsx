// Gerência de saves da carreira (conta vitalícia): até 5 carreiras, criar e apagar.
// Mostra também saves que estão só na nuvem (outro aparelho) e reconcilia ao continuar.
// Visual redesenhado no padrão em-* (DashCard / Flag / TeamBadge / tokens em-*),
// alinhado com Mercado, OrgSelect e ScenarioPicker.
import { useEffect, useState } from 'react';
import { DashCard } from './career/DashCard';
import { TeamBadge } from './ui';
import {
  listSlots,
  listSlotsCloudMerged,
  deleteSlot,
  slotKey,
  cloudSlot,
  CAREER_SLOTS,
  type SlotSummary,
} from '../state/careerSaves';
import { syncSlot } from '../state/cloud';
import { ct } from '../state/career-i18n';

const money = (n?: number) => (n == null ? '—' : `R$ ${Math.round(n).toLocaleString('pt-BR')}`);

export function CareerSaves({ paid, onPlay, onBack }: { paid: boolean; onPlay: (slot: number) => void; onBack: () => void }) {
  const [slots, setSlots] = useState<SlotSummary[]>(() => listSlots());
  const [loadingCloud, setLoadingCloud] = useState(paid);
  const [confirmSlot, setConfirmSlot] = useState<number | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);

  // puxa os saves da nuvem pra também mostrar o que está em outro aparelho
  useEffect(() => {
    if (!paid) return;
    let alive = true;
    void listSlotsCloudMerged()
      .then((merged) => { if (alive) { setSlots(merged); setLoadingCloud(false); } })
      .catch(() => { if (alive) setLoadingCloud(false); });
    return () => { alive = false; };
  }, [paid]);

  const used = slots.filter((s) => s.exists).length;
  const refresh = () => {
    setSlots(listSlots());
    if (paid) void listSlotsCloudMerged().then(setSlots).catch(() => {});
  };

  const doDelete = (n: number) => { deleteSlot(n); setConfirmSlot(null); refresh(); };

  // entra no slot: se o save está só na nuvem, baixa antes (reconcilia local<-nuvem)
  const go = async (slot: number) => {
    if (busySlot != null) return;
    if (paid) {
      setBusySlot(slot);
      try { await syncSlot(cloudSlot(slot), slotKey(slot)); } catch { /* segue com o que tiver */ }
    }
    onPlay(slot);
  };

  return (
    <div
      className="em-career-saves fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '12px 20px 24px',
        maxWidth: 1000,
        margin: '0 auto',
      }}
    >
      {/* Header banner */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(232,193,112,0.12) 0%, transparent 60%)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
        }}
      >
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            ★ {ct('Conta vitalícia')}
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.6rem', fontWeight: 900, color: 'var(--em-text)', letterSpacing: '-0.3px' }}>
            {ct('Suas carreiras')}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--em-muted)', maxWidth: 620, lineHeight: 1.45 }}>
            {ct('Você pode manter até')} <b style={{ color: 'var(--em-text)' }}>{CAREER_SLOTS}</b> {ct('carreiras salvas ao mesmo tempo e apagar qualquer uma quando quiser para começar outra.')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SlotHudPill used={used} total={CAREER_SLOTS} />
          {loadingCloud && (
            <span style={{ fontSize: '0.72rem', color: 'var(--em-muted)', fontStyle: 'italic' }}>
              ☁ {ct('sincronizando…')}
            </span>
          )}
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '8px 14px',
              background: 'var(--em-panel-2)',
              color: 'var(--em-text)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.84rem',
              cursor: 'pointer',
            }}
          >
            ← {ct('Menu')}
          </button>
        </div>
      </header>

      {/* Grid de slots */}
      <DashCard title={ct('Slots de carreira')} info={`${used}/${CAREER_SLOTS} ${ct('em uso')}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {slots.map((s) => (
            <SlotRow
              key={s.slot}
              slot={s}
              busy={busySlot === s.slot}
              busyLocked={busySlot != null && busySlot !== s.slot}
              confirming={confirmSlot === s.slot}
              onPlay={() => void go(s.slot)}
              onAskDelete={() => setConfirmSlot(s.slot)}
              onConfirmDelete={() => doDelete(s.slot)}
              onCancelDelete={() => setConfirmSlot(null)}
            />
          ))}
        </div>
      </DashCard>

      {/* Como funciona */}
      <DashCard title={ct('Como funciona')}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--em-muted)', lineHeight: 1.55 }}>
          {ct('Cada save é uma carreira independente (org, elenco, títulos, dinheiro). Apagar um save libera o slot na hora e')}{' '}
          <b style={{ color: 'var(--em-text)' }}>{ct('não dá pra desfazer')}</b>.{' '}
          {ct('Como sua conta é vitalícia, seus saves sincronizam na nuvem e aparecem em qualquer aparelho.')}
        </p>
      </DashCard>
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function SlotHudPill({ used, total }: { used: number; total: number }) {
  const pct = used / total;
  const tone: 'green' | 'gold' | 'red' =
    pct < 0.6 ? 'green' : pct < 0.9 ? 'gold' : 'red';
  const colors: Record<typeof tone, { fg: string; bg: string; border: string }> = {
    green: { fg: '#5ed88a', bg: 'rgba(94,216,138,0.12)',  border: 'rgba(94,216,138,0.4)' },
    gold:  { fg: '#e8c170', bg: 'rgba(232,193,112,0.14)', border: 'rgba(232,193,112,0.45)' },
    red:   { fg: '#e58a8a', bg: 'rgba(229,138,138,0.12)', border: 'rgba(229,138,138,0.4)' },
  };
  const c = colors[tone];
  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        padding: '5px 12px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        lineHeight: 1.1,
        minWidth: 70,
      }}
    >
      <span style={{ fontSize: '0.6rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {ct('Slots')}
      </span>
      <b style={{ color: c.fg, fontSize: '0.94rem', fontWeight: 800, fontFamily: '"JetBrains Mono", monospace' }}>
        {used}/{total}
      </b>
    </div>
  );
}

function SlotRow({
  slot,
  busy,
  busyLocked,
  confirming,
  onPlay,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  slot: SlotSummary;
  busy: boolean;
  busyLocked: boolean;
  confirming: boolean;
  onPlay: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  // Slot vazio: card dashed com botão "Novo save"
  if (!slot.exists) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed var(--em-border)',
          borderRadius: 6,
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--em-panel-2)',
            border: '1px dashed var(--em-border)',
            borderRadius: 6,
            color: 'var(--em-muted)',
            fontSize: '1.4rem',
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          +
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--em-muted)' }}>
            {ct('Slot')} {slot.slot} · {ct('vazio')}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--em-muted)' }}>
            {ct('Comece uma carreira nova do zero.')}
          </div>
        </div>
        <button
          type="button"
          disabled={busyLocked}
          onClick={onPlay}
          style={{
            padding: '8px 16px',
            background: busyLocked ? 'var(--em-panel-2)' : 'var(--em-gold)',
            color: busyLocked ? 'var(--em-muted)' : '#1a1205',
            border: busyLocked ? '1px solid var(--em-border)' : 'none',
            borderRadius: 4,
            fontFamily: 'inherit',
            fontWeight: 800,
            fontSize: '0.84rem',
            cursor: busyLocked ? 'not-allowed' : 'pointer',
            letterSpacing: '0.3px',
          }}
        >
          + {ct('Novo save')}
        </button>
      </div>
    );
  }

  // Slot preenchido
  const colors: [string, string] = slot.colors ?? ['#2a3340', '#101418'];
  const orgName = slot.org ?? `${ct('Carreira')} ${slot.slot}`;
  const tag = (slot.tag ?? '??').toUpperCase();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        background: 'var(--em-panel-2)',
        border: `1px solid ${confirming ? '#e58a8a' : 'var(--em-border)'}`,
        borderRadius: 6,
        transition: 'border-color .15s',
      }}
    >
      <TeamBadge tag={tag} colors={colors} size={46} logoUrl={slot.logo} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 800, color: 'var(--em-text)' }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>
            {orgName}
          </span>
          {slot.fromCloud && (
            <span
              title={ct('Save existe só na nuvem (outro aparelho). Vai baixar ao continuar.')}
              style={{
                fontSize: '0.6rem',
                fontWeight: 800,
                letterSpacing: '0.4px',
                color: 'var(--em-gold)',
                background: 'rgba(232,193,112,0.10)',
                border: '1px solid rgba(232,193,112,0.4)',
                padding: '2px 7px',
                borderRadius: 3,
              }}
            >
              ☁ {ct('NUVEM')}
            </span>
          )}
        </div>
        <div
          style={{
            marginTop: 4,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            fontSize: '0.78rem',
            color: 'var(--em-muted)',
            fontFamily: '"JetBrains Mono", monospace',
            flexWrap: 'wrap',
          }}
        >
          <SlotMeta label={ct('Slot')} value={slot.slot} />
          <SlotMeta label={ct('Split')} value={slot.split ?? 1} />
          {slot.tier != null && <SlotMeta label={ct('Tier')} value={`T${slot.tier}`} accent={slot.tier === 1 ? '#e8c170' : slot.tier === 2 ? '#9b6fe8' : '#5fa4e8'} />}
          <SlotMeta label={ct('Títulos')} value={slot.titles ?? 0} accent={(slot.titles ?? 0) > 0 ? '#5ed88a' : undefined} />
          <SlotMeta label={ct('Caixa')} value={money(slot.budget)} accent={(slot.budget ?? 0) > 0 ? '#5ed88a' : '#e58a8a'} />
        </div>
      </div>

      {confirming ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.78rem', color: '#e58a8a', fontWeight: 700 }}>
            {ct('Apagar?')}
          </span>
          <button
            type="button"
            onClick={onConfirmDelete}
            style={{
              padding: '6px 12px',
              background: '#c0392b',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            {ct('Sim, apagar')}
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: 'var(--em-text)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            {ct('Não')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={busyLocked}
            onClick={onPlay}
            style={{
              padding: '8px 18px',
              background: busyLocked ? 'var(--em-panel-2)' : 'var(--em-gold)',
              color: busyLocked ? 'var(--em-muted)' : '#1a1205',
              border: busyLocked ? '1px solid var(--em-border)' : 'none',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 800,
              fontSize: '0.84rem',
              cursor: busyLocked ? 'not-allowed' : 'pointer',
              letterSpacing: '0.3px',
            }}
          >
            {busy ? `⏳ ${ct('Carregando…')}` : `▸ ${ct('Continuar')}`}
          </button>
          <button
            type="button"
            disabled={busyLocked}
            onClick={onAskDelete}
            title={ct('Apagar este save')}
            style={{
              padding: '8px 12px',
              background: 'transparent',
              color: 'var(--em-muted)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.78rem',
              cursor: busyLocked ? 'not-allowed' : 'pointer',
              opacity: busyLocked ? 0.55 : 1,
            }}
            onMouseEnter={(e) => { if (!busyLocked) { (e.currentTarget as HTMLElement).style.borderColor = '#e58a8a'; (e.currentTarget as HTMLElement).style.color = '#e58a8a'; } }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--em-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--em-muted)'; }}
          >
            🗑 {ct('Apagar')}
          </button>
        </div>
      )}
    </div>
  );
}

function SlotMeta({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.62rem', fontFamily: 'inherit' }}>
        {label}
      </span>
      <b style={{ color: accent ?? 'var(--em-text)', fontWeight: 800 }}>
        {value}
      </b>
    </span>
  );
}
