// SeasonRecapModal — FRENTE 1 do feedback de imersão.
//
// Modal cinematográfico de FIM DE SPLIT/TEMPORADA com 4 slides em sequência:
//   1. POSIÇÃO FINAL — circuito + posição + troféu/medalha conquistada
//   2. MVP DO SPLIT — top player do user com OVR + stats destacadas
//   3. RECAP FINANCEIRO — prize + sponsors + payroll + saldo do split
//   4. PRÓXIMOS PASSOS — CTA pro mercado
//
// Pacing narrativo: cada slide tem fade-in + accent gold. ESC pula tudo.
// Inspirado em YearAwardsModal (mesma estética).

import { useEffect, useState } from 'react';
import { Modal, Button } from './ds';
import { Flag, PlayerAvatar } from './ui';

export interface MvpInfo {
  nick: string;
  name: string;
  country: string;
  role: string;
  ovr: number;
  highlight: string;
}

export interface SeasonRecapData {
  split: number;
  circuitName: string;
  /** "1º · CAMPEÃO" / "5º — fora dos playoffs" / etc. */
  placementLabel: string;
  /** 'champion' | 'top4' | 'eliminated' — usado pra accent visual */
  outcome: 'champion' | 'top4' | 'mid' | 'bottom';
  trophy?: boolean;
  mvp: MvpInfo | null;
  finance: {
    prize: number;
    sponsors: number;
    payroll: number;
    upkeep: number;
    /** saldo líquido (entrada - saída) */
    net: number;
    /** caixa atual após tudo */
    cashAfter: number;
  };
  /** "Pago a folha. Próxima janela: contratar/dispensar e renovar contratos." */
  nextStepHint?: string;
}

interface Props {
  data: SeasonRecapData | null;
  onClose: () => void;
}

const fmt = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 2)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
};

const OUTCOME_ACCENT: Record<SeasonRecapData['outcome'], { fg: string; label: string }> = {
  champion: { fg: '#e8c170', label: '🏆 CAMPEÃO' },
  top4: { fg: '#9bd35c', label: '🥇 TOP 4' },
  mid: { fg: '#5fa4e8', label: '⏺ MEIO DA TABELA' },
  bottom: { fg: '#e58a8a', label: '⏬ ZONA DE BAIXO' },
};

export function SeasonRecapModal({ data, onClose }: Props) {
  const [slideIdx, setSlideIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  // BUG FIX (caça-bugs): o host mantém este modal SEMPRE montado (só troca a
  // prop `data`), então slideIdx persistia entre aberturas. Abrir um recap com
  // menos slides (ex.: sem MVP = 3 slides) com slideIdx=3 stale → slides[3] é
  // undefined → crash. Reseta o slide a cada novo `data`.
  useEffect(() => { setSlideIdx(0); }, [data]);

  useEffect(() => { setAnimKey((k) => k + 1); }, [slideIdx]);

  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter' || e.key === 'ArrowRight') setSlideIdx((i) => Math.min(i + 1, totalSlides - 1));
      else if (e.key === 'ArrowLeft') setSlideIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, slideIdx]);

  if (!data) return null;

  const hasMvp = !!data.mvp;
  const totalSlides = 3 + (hasMvp ? 1 : 0); // posição + (mvp opcional) + recap + next
  const outcomeData = OUTCOME_ACCENT[data.outcome];

  const slides: ((key: number) => React.ReactNode)[] = [
    // 1. POSIÇÃO FINAL
    (key) => (
      <div key={key} className="rtm-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 12px' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800 }}>
          Fim do Split {data.split}
        </div>
        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--em-text)', textAlign: 'center' }}>
          {data.circuitName}
        </div>
        <div
          style={{
            padding: '14px 28px',
            background: `linear-gradient(180deg, ${outcomeData.fg}24 0%, transparent 100%)`,
            border: `2px solid ${outcomeData.fg}80`,
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.66rem', color: outcomeData.fg, fontWeight: 900, letterSpacing: '1.5px' }}>
            {outcomeData.label}
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--em-text)', marginTop: 4 }}>
            {data.placementLabel}
          </div>
        </div>
        {data.trophy && (
          <div style={{ fontSize: '0.84rem', color: 'var(--em-gold)', fontWeight: 700, fontStyle: 'italic' }}>
            Você levantou o troféu. Esse split vai pros livros.
          </div>
        )}
      </div>
    ),
    // 2. MVP (skip se sem)
    ...(hasMvp ? [(key: number) => (
      <div key={key} className="rtm-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '20px 12px' }}>
        <div style={{ fontSize: '0.66rem', color: 'var(--em-gold)', textTransform: 'uppercase', letterSpacing: '2.5px', fontWeight: 900 }}>
          ★ MVP do Split
        </div>
        <PlayerAvatar nick={data.mvp!.nick} size={88} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '1.4rem', fontWeight: 900, color: 'var(--em-text)' }}>
            <Flag cc={data.mvp!.country} /> {data.mvp!.nick}
          </div>
          <div style={{ fontSize: '0.84rem', color: 'var(--em-muted)', marginTop: 2 }}>
            {data.mvp!.name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ padding: '4px 14px', background: 'rgba(232,193,112,0.16)', border: '1px solid rgba(232,193,112,0.5)', borderRadius: 4, fontFamily: '"JetBrains Mono", monospace', color: 'var(--em-gold)', fontWeight: 900, fontSize: '1.4rem' }}>
            {data.mvp!.ovr}
          </span>
          <span className={`role-pill ${data.mvp!.role}`} style={{ alignSelf: 'center' }}>{data.mvp!.role}</span>
        </div>
        <div style={{ fontSize: '0.86rem', color: 'var(--em-text)', fontStyle: 'italic', textAlign: 'center', maxWidth: 380, lineHeight: 1.5 }}>
          "{data.mvp!.highlight}"
        </div>
      </div>
    )] : []),
    // 3. RECAP FINANCEIRO
    (key) => (
      <div key={key} className="rtm-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '20px 12px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800 }}>
            Fechamento de balanço
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--em-text)', marginTop: 4 }}>
            Split {data.split} · {data.circuitName}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <FinanceRow label="Premiação" value={data.finance.prize} positive />
          <FinanceRow label="Patrocínio" value={data.finance.sponsors} positive />
          <FinanceRow label="Folha" value={-data.finance.payroll} />
          <FinanceRow label="Infraestrutura" value={-data.finance.upkeep} />
        </div>
        <div
          style={{
            padding: '14px 18px',
            background: data.finance.net >= 0 ? 'rgba(94,216,138,0.12)' : 'rgba(229,138,138,0.12)',
            border: `1px solid ${data.finance.net >= 0 ? 'rgba(94,216,138,0.45)' : 'rgba(229,138,138,0.45)'}`,
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Saldo do split
          </div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '1.6rem', fontWeight: 900, color: data.finance.net >= 0 ? '#5ed88a' : '#e58a8a', marginTop: 4 }}>
            {data.finance.net >= 0 ? '+' : ''}{fmt(data.finance.net)}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--em-muted)', marginTop: 6 }}>
            Caixa atual: <b style={{ color: 'var(--em-text)', fontFamily: '"JetBrains Mono", monospace' }}>{fmt(data.finance.cashAfter)}</b>
          </div>
        </div>
      </div>
    ),
    // 4. NEXT
    (key) => (
      <div key={key} className="rtm-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem' }}>📅</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--em-text)' }}>
          Próxima janela
        </div>
        <div style={{ fontSize: '0.86rem', color: 'var(--em-muted)', lineHeight: 1.6, maxWidth: 420 }}>
          {data.nextStepHint ?? 'Renovar contratos vencidos, negociar reforços, treinar mapas e o playbook, e formar jovens na academia. Suas decisões pesam no próximo split.'}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(232,193,112,0.1)', border: '1px solid rgba(232,193,112,0.4)', borderRadius: 999, fontSize: '0.72rem', color: 'var(--em-gold)', fontWeight: 700, letterSpacing: '0.5px' }}>
          ✓ Pronto pro mercado
        </div>
      </div>
    ),
  ];

  const isLast = slideIdx === totalSlides - 1;
  const isFirst = slideIdx === 0;

  return (
    <Modal open={!!data} onClose={onClose} title="" size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 360 }}>
        {/* Step counter */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
          {Array.from({ length: totalSlides }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 22,
                height: 4,
                background: i === slideIdx ? 'var(--em-gold)' : i < slideIdx ? 'rgba(232,193,112,0.4)' : 'rgba(255,255,255,0.12)',
                borderRadius: 2,
                transition: 'all .2s',
              }}
            />
          ))}
        </div>
        {/* Slide */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
          {slides[slideIdx](animKey)}
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', borderTop: '1px solid var(--em-border)', paddingTop: 14 }}>
          <Button variant="ghost" onClick={onClose}>
            {isLast ? 'Fechar' : 'Pular'}
          </Button>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isFirst && (
              <Button variant="ghost" onClick={() => setSlideIdx(slideIdx - 1)}>
                ← Voltar
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => (isLast ? onClose() : setSlideIdx(slideIdx + 1))}
            >
              {isLast ? '⊳ Ir pro mercado' : 'Próximo →'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function FinanceRow({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  const isPositive = positive ?? value >= 0;
  const fg = isPositive ? '#5ed88a' : '#e58a8a';
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--em-panel-2)',
        border: '1px solid var(--em-border)',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
        {label}
      </span>
      <b style={{ fontFamily: '"JetBrains Mono", monospace', color: fg, fontSize: '1.05rem', fontWeight: 800 }}>
        {value >= 0 ? '+' : ''}{fmt(value)}
      </b>
    </div>
  );
}
