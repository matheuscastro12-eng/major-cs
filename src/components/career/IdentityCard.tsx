// [W5] Card "IDENTIDADE" — rótulo tático emergente do time, a força, a
// estatística que justifica e o aviso de quem te lê. Reusado na página do time
// (CareerTeamPage) e no dashboard (CareerOverview). Só apresenta: toda a
// matemática vem de engine/career/teamIdentity.ts (nada é recalculado aqui).

import { ct } from '../../state/career-i18n';
import {
  COUNTER_HINT, COUNTER_PP, HOME_PP,
  type IdentityLabel,
} from '../../engine/career/teamIdentity';

const KIND_ICON: Record<IdentityLabel['kind'], string> = {
  rush: '🔥', retake: '🛡', iron: '🪙', force: '💰', aggressive: '⚔️', cautious: '🧱',
  system: '⚖', chameleon: '🦎', none: '❔',
};

const pct = (f: number) => `${Math.round(f * 100)}%`;

export function IdentityCard({
  label, title, readBy, opponent, compact,
}: {
  label: IdentityLabel;
  title?: string;
  /** quem te lê: o próximo adversário e quanto ele estuda (scoutingOf) */
  readBy?: { tag: string; scouting: number } | null;
  /** modo "leitura do adversário": mostra como CONTRAR em vez de quem te lê */
  opponent?: boolean;
  compact?: boolean;
}) {
  const readable = label.kind !== 'none' && label.kind !== 'chameleon' && label.strength > 0;
  const homeBonus = HOME_PP * label.strength;
  const counterPenalty = readBy ? COUNTER_PP * label.strength * readBy.scouting : 0;
  return (
    <div className="em-identity-card" style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
      {title && (
        <div style={{ fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--em-muted, #8a99ab)' }}>
          {title}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: compact ? '1.3rem' : '1.7rem', lineHeight: 1 }} aria-hidden>{KIND_ICON[label.kind]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: compact ? '0.95rem' : '1.1rem', display: 'block' }}>{ct(label.label)}</b>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--em-border, #2a3340)', overflow: 'hidden' }}>
              <div style={{ width: pct(label.strength), height: '100%', background: readable ? 'var(--em-red, #e58a8a)' : 'var(--em-muted, #8a99ab)', transition: 'width .25s ease' }} />
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, fontFamily: '"JetBrains Mono", monospace', color: 'var(--em-muted, #8a99ab)', minWidth: 34, textAlign: 'right' }}>
              {ct('força')} {pct(label.strength)}
            </span>
          </div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: '0.78rem' }}>{ct(label.stat)}</p>
      {!compact && <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--em-muted, #8a99ab)' }}>{ct(label.hint)}</p>}
      {opponent ? (
        label.kind !== 'none' && (
          <p style={{ margin: 0, fontSize: '0.76rem', fontWeight: 700, color: readable ? 'var(--em-green, #5ed88a)' : 'var(--em-muted, #8a99ab)' }}>
            {ct('Como contrar:')} {ct(COUNTER_HINT[label.kind])}
            {readable && <> {ct('(até')} +{pct(COUNTER_PP * label.strength)} {ct('no round certo)')}</>}
          </p>
        )
      ) : (
        readable && (
          <p style={{ margin: 0, fontSize: '0.76rem', fontWeight: 700, color: counterPenalty > homeBonus ? 'var(--em-red, #e58a8a)' : 'var(--em-gold, #e8c170)' }}>
            {ct('Chamada de casa:')} +{pct(homeBonus)}
            {readBy && readBy.scouting > 0 && (
              <> · {readBy.tag} {ct('te estuda em')} {pct(readBy.scouting)} → −{pct(counterPenalty)} {ct('quando ela sair')}</>
            )}
          </p>
        )
      )}
    </div>
  );
}
