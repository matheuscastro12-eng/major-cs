// Modal de Patch Notes + Botão flutuante "Novidades" — T6.3 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Comportamento:
//   - PatchNotesHost monta o modal + o botão flutuante.
//   - Na primeira abertura por user que ainda não viu o CURRENT_PATCH_ID,
//     o modal abre automaticamente UMA VEZ (controlado por localStorage).
//   - O botão flutuante (canto inferior esquerdo) reabre o modal a qualquer
//     momento; exibe um ponto laranja se há patch novo.
//   - Fechar o modal marca o patch atual como visto.
//
// Pra adicionar patch novo: editar src/data/patchNotes.ts (ver doc lá).

import { useEffect, useState } from 'react';
import { Modal } from './ds';
import {
  CURRENT_PATCH_ID,
  PATCHES,
  hasUnseenPatch,
  markPatchSeen,
  type PatchNote,
  type PatchNoteItem,
} from '../data/patchNotes';

function KindBadge({ kind }: { kind: PatchNoteItem['kind'] }) {
  const palette: Record<PatchNoteItem['kind'], { bg: string; fg: string; label: string }> = {
    feature: { bg: 'var(--em-gold)', fg: '#1a1205', label: 'NOVO' },
    fix: { bg: 'var(--em-green, #4caf50)', fg: '#fff', label: 'FIX' },
    tweak: { bg: 'var(--em-panel-2)', fg: 'var(--em-muted)', label: 'AJUSTE' },
  };
  const p = palette[kind];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 56,
        padding: '2px 8px',
        borderRadius: 3,
        fontSize: '0.66rem',
        fontWeight: 800,
        letterSpacing: '0.5px',
        background: p.bg,
        color: p.fg,
        border: kind === 'tweak' ? '1px solid var(--em-border)' : 'none',
      }}
    >
      {p.label}
    </span>
  );
}

function PatchEntry({ patch }: { patch: PatchNote }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '1px solid var(--em-border)', paddingBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: 'var(--em-text)' }}>{patch.title}</h3>
        <span style={{ fontSize: '0.74rem', color: 'var(--em-muted)' }}>{patch.date}</span>
      </header>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {patch.items.map((it, i) => (
          <li key={i} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'start' }}>
            <KindBadge kind={it.kind} />
            <div style={{ fontSize: '0.86rem', color: 'var(--em-text)', lineHeight: 1.4 }}>
              <span style={{ color: 'var(--em-muted)', fontWeight: 600, marginRight: 6 }}>{it.area}:</span>
              {it.text}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PatchNotesHost() {
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(() => hasUnseenPatch());

  // Auto-abre uma vez na primeira mount de quem ainda não viu o patch atual.
  // Atrasamos 600ms pra não competir com Landing/login na 1ª impressão.
  useEffect(() => {
    if (!hasUnseenPatch()) return;
    const timer = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const close = () => {
    setOpen(false);
    if (CURRENT_PATCH_ID) {
      markPatchSeen(CURRENT_PATCH_ID);
      setHasNew(false);
    }
  };

  return (
    <>
      {/* Botão flutuante canto inferior esquerdo */}
      <button
        type="button"
        className="patch-notes-trigger"
        onClick={() => setOpen(true)}
        title="Novidades"
        style={{
          position: 'fixed',
          left: 14,
          bottom: 14,
          zIndex: 90,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: 'var(--em-panel)',
          border: '1px solid var(--em-border)',
          borderRadius: 999,
          color: 'var(--em-text)',
          fontFamily: 'inherit',
          fontSize: '0.78rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,.35)',
        }}
      >
        Novidades
        {hasNew && (
          <span
            aria-label="patch novo"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--em-gold)',
              boxShadow: '0 0 0 2px var(--em-panel)',
            }}
          />
        )}
      </button>

      <Modal open={open} onClose={close} title="Novidades" size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxHeight: '60vh', overflowY: 'auto', padding: '2px 4px' }}>
          {PATCHES.map((p) => (
            <PatchEntry key={p.id} patch={p} />
          ))}
        </div>
      </Modal>
    </>
  );
}
