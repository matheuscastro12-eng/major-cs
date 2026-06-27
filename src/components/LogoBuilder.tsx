// LogoBuilder — T7.2 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// UI reusável pro Logo Builder. Recebe config inicial + handler de salvar e
// devolve. Preview grande à esquerda, controles à direita.
//
// Pode ser embutido em qualquer tela. O LogoBuilderHost monta em Modal global.

import { useState } from 'react';
import {
  buildLogoDataUrl,
  DEFAULT_LOGO_CONFIG,
  LOGO_SHAPES,
  type LogoConfig,
} from '../lib/logoBuilder';

interface Props {
  initial?: Partial<LogoConfig>;
  onSave: (dataUrl: string, cfg: LogoConfig) => void;
  onCancel?: () => void;
}

export function LogoBuilder({ initial, onSave, onCancel }: Props) {
  const [cfg, setCfg] = useState<LogoConfig>({
    ...DEFAULT_LOGO_CONFIG,
    ...initial,
    initials: (initial?.initials ?? DEFAULT_LOGO_CONFIG.initials).slice(0, 3).toUpperCase(),
  });

  const update = <K extends keyof LogoConfig>(key: K, value: LogoConfig[K]) =>
    setCfg((prev) => ({ ...prev, [key]: value }));

  const dataUrl = buildLogoDataUrl(cfg);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, maxWidth: 720 }}>
      {/* Preview grande à esquerda */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 200,
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--em-panel-2)',
            border: '1px solid var(--em-border)',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <img src={dataUrl} alt="Preview" style={{ width: 176, height: 176 }} />
        </div>
        {/* Mini-thumbs em vários tamanhos pra mostrar como vai ficar in-game */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <img src={dataUrl} alt="" width={20} height={20} title="Lista" />
          <img src={dataUrl} alt="" width={32} height={32} title="Bracket" />
          <img src={dataUrl} alt="" width={48} height={48} title="Header" />
        </div>
        <span style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Pré-visualização
        </span>
      </div>

      {/* Controles à direita */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Shape */}
        <Field label="Forma">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {LOGO_SHAPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => update('shape', s.id)}
                title={s.label}
                style={{
                  padding: 4,
                  background: cfg.shape === s.id ? 'var(--em-gold)' : 'var(--em-panel-2)',
                  border: `1px solid ${cfg.shape === s.id ? 'var(--em-gold)' : 'var(--em-border)'}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={buildLogoDataUrl({ ...cfg, shape: s.id })}
                  alt={s.label}
                  width={28}
                  height={28}
                />
              </button>
            ))}
          </div>
        </Field>

        {/* Cores */}
        <Field label="Cores">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={swatch}>
              <input
                type="color"
                value={cfg.primary}
                onChange={(e) => update('primary', e.target.value)}
                style={swatchInput}
              />
              <span style={swatchPreview(cfg.primary)} />
              <span style={swatchLabel}>Primária</span>
            </label>
            <label style={swatch}>
              <input
                type="color"
                value={cfg.secondary}
                onChange={(e) => update('secondary', e.target.value)}
                style={swatchInput}
              />
              <span style={swatchPreview(cfg.secondary)} />
              <span style={swatchLabel}>Texto</span>
            </label>
            <button
              type="button"
              onClick={() => {
                // Inverte as duas cores rapidinho
                update('primary', cfg.secondary);
                update('secondary', cfg.primary);
              }}
              title="Trocar cores"
              style={{
                padding: '6px 10px',
                background: 'transparent',
                color: 'var(--em-muted)',
                border: '1px solid var(--em-border)',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              ⇄
            </button>
          </div>
        </Field>

        {/* Iniciais */}
        <Field label="Iniciais (1-3 letras)">
          <input
            type="text"
            value={cfg.initials}
            maxLength={3}
            onChange={(e) => update('initials', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            style={{
              padding: '6px 10px',
              background: 'var(--em-panel-2)',
              color: 'var(--em-text)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '1.1rem',
              fontWeight: 800,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              width: 100,
            }}
          />
        </Field>

        {/* Layout */}
        <Field label="Posição do texto">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['centered', 'lower'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => update('layout', opt)}
                style={chip(cfg.layout === opt)}
              >
                {opt === 'centered' ? 'Centralizado' : 'Embaixo'}
              </button>
            ))}
          </div>
        </Field>

        {/* Contorno */}
        <Field label="Contorno">
          <button
            type="button"
            onClick={() => update('outlined', !cfg.outlined)}
            style={chip(cfg.outlined)}
          >
            {cfg.outlined ? 'Com contorno' : 'Sem contorno'}
          </button>
        </Field>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--em-border)', paddingTop: 14, marginTop: 4 }}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                color: 'var(--em-text)',
                border: '1px solid var(--em-border)',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave(dataUrl, cfg)}
            style={{
              padding: '8px 20px',
              background: 'var(--em-gold)',
              color: '#1a1205',
              border: 'none',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Salvar logo
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, fontWeight: 700 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const swatch: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  cursor: 'pointer',
};

const swatchInput: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0,
  cursor: 'pointer',
};

function swatchPreview(color: string): React.CSSProperties {
  return {
    width: 38,
    height: 38,
    background: color,
    border: '1px solid var(--em-border)',
    borderRadius: 4,
    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.06)',
  };
}

const swatchLabel: React.CSSProperties = {
  fontSize: '0.66rem',
  color: 'var(--em-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    background: active ? 'var(--em-gold)' : 'var(--em-panel-2)',
    color: active ? '#1a1205' : 'var(--em-text)',
    border: `1px solid ${active ? 'var(--em-gold)' : 'var(--em-border)'}`,
    borderRadius: 4,
    fontFamily: 'inherit',
    fontWeight: 700,
    fontSize: '0.8rem',
    cursor: 'pointer',
  };
}
