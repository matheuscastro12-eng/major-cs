import { useState } from 'react';
import { ct } from '../../state/career-i18n';
import { CATEGORY_META } from '../../engine/rtp/lifeEvents';
import { RtpIcon } from './RtpIcon';
import type { LifeEvent, LifeEventOption, LifeDelta } from '../../engine/rtp/types';

const REL_LABEL: Record<string, string> = {
  team: 'Entrosamento', coach: 'Coach', fans: 'Fãs', family: 'Família', partner: 'Relação',
};

// Converte os deltas de uma escolha em chips legíveis pro outcome.
function deltaChips(d: LifeDelta): { text: string; good: boolean }[] {
  const out: { text: string; good: boolean }[] = [];
  const meter = (label: string, v?: number) => { if (v) out.push({ text: `${label} ${v > 0 ? '+' : ''}${v}`, good: v > 0 }); };
  meter('Energia', d.energy); meter('Físico', d.fitness); meter('Moral', d.morale);
  meter('Foco', d.focus); meter('Fama', d.fame);
  if (d.money) out.push({ text: `${d.money > 0 ? '+' : '−'}R$ ${Math.abs(d.money).toLocaleString('pt-BR')}`, good: d.money > 0 });
  if (d.rel) for (const [k, v] of Object.entries(d.rel)) if (v) out.push({ text: `${REL_LABEL[k] ?? k} ${v > 0 ? '+' : ''}${v}`, good: v > 0 });
  if (d.contractWeeks) out.push({ text: `${ct('Contrato')} +${d.contractWeeks} ${ct('sem')}`, good: true });
  if (d.wageMult) out.push({ text: `${ct('Salário')} ×${d.wageMult.toFixed(2)}`, good: d.wageMult > 1 });
  if (d.addSponsor) out.push({ text: `${ct('Patrocínio')}: ${d.addSponsor.brand}`, good: true });
  if (d.injury) out.push({ text: `${ct('Lesão')}: ${d.injury.kind} ${d.injury.weeks} ${ct('sem')}`, good: false });
  return out;
}

export function LifeEventModal({ event, onResolve }: {
  event: LifeEvent;
  onResolve: (optionId: string) => void;
}) {
  const [chosen, setChosen] = useState<LifeEventOption | null>(null);
  const meta = CATEGORY_META[event.category];

  return (
    <div className="rtp-modal-overlay">
      <div className="rtp-modal" role="dialog" aria-modal="true">
        <div className="rtp-modal-cat"><RtpIcon name={meta.icon} size={14} /> {ct(meta.label)}</div>
        <h2 className="rtp-modal-title">{event.title}</h2>

        {!chosen ? (
          <>
            <p className="rtp-modal-body">{event.body}</p>
            <div className="rtp-modal-opts">
              {event.options.map((o) => (
                <button key={o.id} type="button" className="rtp-modal-opt" onClick={() => setChosen(o)}>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="rtp-modal-body">{chosen.outcome}</p>
            <div className="rtp-modal-deltas">
              {deltaChips(chosen.deltas).map((c, i) => (
                <span key={i} className={`rtp-delta ${c.good ? 'good' : 'bad'}`}>{c.text}</span>
              ))}
              {deltaChips(chosen.deltas).length === 0 && <span className="rtp-delta neutral">{ct('Sem efeitos')}</span>}
            </div>
            <button type="button" className="rtp-cta" onClick={() => onResolve(chosen.id)}>{ct('Continuar')} →</button>
          </>
        )}
      </div>
    </div>
  );
}
