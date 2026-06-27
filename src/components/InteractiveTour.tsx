// InteractiveTour — T8.2 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Tour passo-a-passo com SPOTLIGHT + tooltip posicionado, substitui o modal
// slideshow estático (ONB_SLIDES). Cada step pode opcionalmente apontar pra
// um elemento real do DOM (via CSS selector); se o elemento não existir,
// vira tooltip centralizado fallback.
//
// Sem dependência de lib externa — fetcha bounding rect do alvo e posiciona
// tooltip ao lado, com backdrop escuro e "buraco" iluminado no alvo via
// box-shadow inset enorme + outline gold.

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

export interface TourStep {
  /** CSS selector do elemento alvo. Se ausente/não-encontrado, tooltip vai pro centro. */
  target?: string;
  title: string;
  body: string;
  /** Lado preferido pra renderizar o tooltip em relação ao alvo */
  placement?: 'bottom' | 'top' | 'left' | 'right' | 'center';
}

interface Props {
  steps: TourStep[];
  onClose: () => void;
}

interface Rect {
  top: number; left: number; width: number; height: number;
}

const PAD = 8;          // padding entre spotlight e o alvo
const TIP_W = 320;      // largura fixa do tooltip
const TIP_GAP = 14;     // distância entre tooltip e alvo
const VIEW_PAD = 12;    // margem mínima entre tooltip e borda da viewport

export function InteractiveTour({ steps, onClose }: Props) {
  const [i, setI] = useState(0);
  const step = steps[i];
  const isLast = i === steps.length - 1;
  const isFirst = i === 0;

  // Resolve rect do alvo a cada step + on resize/scroll.
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!step) return;
    const update = () => {
      if (!step.target) { setTargetRect(null); return; }
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) { setTargetRect(null); return; }
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      // garante visibilidade
      const inView = r.top >= 0 && r.bottom <= window.innerHeight;
      if (!inView) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const interval = window.setInterval(update, 400); // segue elemento se layout shifta
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.clearInterval(interval);
    };
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') setI((x) => Math.min(x + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, steps.length]);

  // Posição do tooltip baseado no alvo + placement
  const tipPos = useMemo(() => {
    if (!targetRect) {
      return {
        top: window.innerHeight / 2 - 120,
        left: window.innerWidth / 2 - TIP_W / 2,
      };
    }
    const r = targetRect;
    const place = step.placement ?? 'bottom';
    let top = 0, left = 0;
    switch (place) {
      case 'top':
        top = r.top - TIP_GAP - 200;
        left = r.left + r.width / 2 - TIP_W / 2;
        break;
      case 'left':
        top = r.top + r.height / 2 - 100;
        left = r.left - TIP_GAP - TIP_W;
        break;
      case 'right':
        top = r.top + r.height / 2 - 100;
        left = r.left + r.width + TIP_GAP;
        break;
      case 'center':
        top = window.innerHeight / 2 - 120;
        left = window.innerWidth / 2 - TIP_W / 2;
        break;
      case 'bottom':
      default:
        top = r.top + r.height + TIP_GAP;
        left = r.left + r.width / 2 - TIP_W / 2;
        break;
    }
    // clamp pra viewport
    left = Math.max(VIEW_PAD, Math.min(left, window.innerWidth - TIP_W - VIEW_PAD));
    top = Math.max(VIEW_PAD, Math.min(top, window.innerHeight - 220 - VIEW_PAD));
    return { top, left };
  }, [targetRect, step]);

  if (!step) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Tour interativo"
    >
      {/* Backdrop: escuro em tudo, com "buraco" iluminado no alvo via box-shadow inset */}
      {targetRect ? (
        <div
          style={{
            position: 'absolute',
            top: targetRect.top - PAD,
            left: targetRect.left - PAD,
            width: targetRect.width + PAD * 2,
            height: targetRect.height + PAD * 2,
            borderRadius: 8,
            boxShadow: '0 0 0 9999px rgba(8, 10, 16, 0.78), 0 0 0 2px var(--em-gold), 0 0 0 4px rgba(232,193,112,0.25)',
            pointerEvents: 'none',
            transition: 'all .2s ease',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(8, 10, 16, 0.78)',
            pointerEvents: 'auto',
          }}
          onClick={onClose}
        />
      )}

      {/* Tooltip */}
      <div
        style={{
          position: 'absolute',
          top: tipPos.top,
          left: tipPos.left,
          width: TIP_W,
          background: 'var(--em-panel)',
          border: '1px solid var(--em-gold)',
          borderRadius: 8,
          padding: '16px 18px',
          color: 'var(--em-text)',
          fontFamily: 'inherit',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          transition: 'all .2s ease',
        }}
      >
        {/* Step counter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span
            style={{
              fontSize: '0.6rem',
              fontWeight: 800,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: 'var(--em-gold)',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            Passo {i + 1} / {steps.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            title="Pular tour"
            aria-label="Pular tour"
            style={{
              background: 'transparent',
              color: 'var(--em-muted)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: 0,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: 'var(--em-text)' }}>
          {step.title}
        </h3>
        <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: 'var(--em-text)' }}>
          {step.body}
        </p>

        {/* Dots progress */}
        <div style={{ display: 'flex', gap: 4, marginTop: 12, justifyContent: 'center' }}>
          {steps.map((_, k) => (
            <button
              key={k}
              type="button"
              onClick={() => setI(k)}
              aria-label={`Ir pro passo ${k + 1}`}
              style={{
                width: 6,
                height: 6,
                padding: 0,
                background: k === i ? 'var(--em-gold)' : 'rgba(255,255,255,0.18)',
                border: 'none',
                borderRadius: '50%',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: 'var(--em-muted)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            Pular
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isFirst && (
              <button
                type="button"
                onClick={() => setI((x) => Math.max(x - 1, 0))}
                style={{
                  padding: '6px 12px',
                  background: 'var(--em-panel-2)',
                  color: 'var(--em-text)',
                  border: '1px solid var(--em-border)',
                  borderRadius: 4,
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                ← Voltar
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? onClose() : setI((x) => x + 1))}
              style={{
                padding: '6px 16px',
                background: 'var(--em-gold)',
                color: '#1a1205',
                border: 'none',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              {isLast ? '✓ Começar' : 'Próximo →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
