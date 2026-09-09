// [W1] CLIFFHANGER DA DEMO — as superfícies do gancho de conversão.
//
// Na última semana grátis (DEMO_WEEKS) o banner mostra a proposta do clube
// maior (clube, salário, função) com "Aceitar/Negociar" TRANCADOS; e a trava
// (RtpDemoGate) reaproveita o card com o relógio de 48h. Regra do prazo e da
// proposta em engine/rtp/demoCliff.ts (puro); aqui só render + Date.now().
//
// Sem CSS novo: reusa as classes de proposta/trava do rtp.css e vars --rtp-*.

import { useEffect, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { setCheckoutSrc, trackRtpDemo } from '../../state/track';
import { TIER_NAME } from '../../engine/rtp/league';
import { cliffCountdown } from '../../engine/rtp/demoCliff';
import { RtpIcon } from './RtpIcon';
import type { DemoCliff, RoadToProSave } from '../../engine/rtp/types';

const SQUAD_LABEL: Record<string, string> = {
  star: ct('Estrela'), starter: ct('Titular'), rotation: ct('Rotação'), bench: ct('Reserva'),
};
const money = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;

// relógio de parede pro countdown (tick a cada 30s — o prazo é em horas).
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

// O CTA do gancho: atribuição própria ('rtp-demo-cliff') pra medir contra a
// trava antiga ('rtp-demo'). First-touch: quem clicou aqui primeiro fica aqui.
export function goUpgradeFromCliff(onUpgrade: () => void): void {
  setCheckoutSrc('rtp-demo-cliff');
  onUpgrade();
}

// Card da proposta (clube · salário · função) — o mesmo na trava e no banner.
export function RtpCliffOfferCard({ cliff, nick, now }: { cliff: DemoCliff; nick: string; now?: number }) {
  const o = cliff.offer;
  return (
    <div className="rtp-demogate-card" style={{ borderLeftColor: o.colors[0] }}>
      <span className="rtp-ct-badge" style={{ background: `linear-gradient(135deg, ${o.colors[0]}, ${o.colors[1]})` }}>{o.tag}</span>
      <div>
        <b>{o.orgName} <span style={{ fontSize: '0.72rem', color: 'var(--rtp-gold)' }}><RtpIcon name="arrowUp" size={11} /> {TIER_NAME[o.tier] ?? o.tier}</span></b>
        <span>{ct('quer o')} <b style={{ display: 'inline', fontSize: 'inherit' }}>{nick}</b> {ct('como')} {SQUAD_LABEL[o.squadRole] ?? o.squadRole} · {money(o.wage)}/{ct('sem')} · {ct('luvas')} {money(o.signingBonus)}</span>
        <em>"{o.note}"{typeof now === 'number' ? ` · ${ct('expira em')} ${cliffCountdown(cliff, now)}` : ''}</em>
      </div>
    </div>
  );
}

// Banner da ÚLTIMA semana grátis: a proposta chegou, mas responder é da
// vitalícia. Fixo no rodapé, por cima do hub — não bloqueia treinar/jogar.
export function RtpDemoCliffBanner({ save, onUpgrade }: { save: RoadToProSave; onUpgrade: () => void }) {
  const cliff = save.demoCliff;
  const [open, setOpen] = useState(true);
  useEffect(() => { if (cliff) trackRtpDemo('cliff_view'); }, [cliff]);
  if (!cliff || cliff.status === 'expired') return null;
  const o = cliff.offer;
  const go = () => goUpgradeFromCliff(onUpgrade);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 60, padding: '10px 14px', border: '1px solid var(--rtp-gold)', background: 'var(--rtp-deck)', color: 'var(--rtp-gold)', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.74rem', letterSpacing: 1, cursor: 'pointer' }}
      >
        📩 {ct('PROPOSTA DE')} {o.tag}
      </button>
    );
  }
  return (
    <div
      className="rtp-offer-stinger"
      role="dialog"
      aria-label={ct('Proposta de transferência')}
      style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 60, width: 'min(420px, calc(100vw - 28px))', display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', border: '1px solid var(--rtp-line)', borderTop: '3px solid var(--rtp-gold)', background: 'var(--rtp-deck)', boxShadow: '0 12px 40px rgba(0,0,0,0.45)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="rtp-demogate-kicker">📩 {ct('SEU EMPRESÁRIO LIGOU')}</span>
        <button type="button" className="rtp-btn-ghost" onClick={() => setOpen(false)} style={{ padding: '2px 8px' }} aria-label={ct('Recolher')}><RtpIcon name="close" size={12} /></button>
      </div>
      <b style={{ fontSize: '1rem', lineHeight: 1.3, color: 'var(--rtp-ink)' }}>{ct('O')} <span style={{ color: 'var(--rtp-gold)' }}>{o.orgName}</span> {ct('quer o')} {save.player.nick}.</b>
      <RtpCliffOfferCard cliff={cliff} nick={save.player.nick} />
      <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--rtp-ink-dim)' }}>
        {ct('A proposta vai pra mesa na virada da semana — e responder (aceitar, negociar) é da vitalícia. Compre e ela continua exatamente esta.')}
      </p>
      <div className="rtp-offer-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="rtp-nextmatch-btn" onClick={go}>🔒 {ct('Aceitar')}</button>
        <button type="button" className="rtp-btn-ghost" onClick={go}>🔒 {ct('Negociar (+salário)')}</button>
        <button type="button" className="rtp-cta" onClick={go} style={{ marginLeft: 'auto' }}>{ct('GARANTIR A VITALÍCIA')} · R$ 20</button>
      </div>
    </div>
  );
}
