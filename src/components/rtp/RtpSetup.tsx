import { useState } from 'react';
import { ct } from '../../state/career-i18n';
import { RtpIcon } from './RtpIcon';
import { DashCard } from '../career/DashCard';
import {
  PERIPHERALS, PSYCH_TIERS, TIER_NAMES, setupLevel, buyGear, hirePsych, psychDef,
  type PeripheralDef,
} from '../../engine/rtp/setup';
import type { RoadToProSave, GearTier } from '../../engine/rtp/types';

const money = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;
const CAT_LABEL: Record<string, string> = { mechanical: ct('mecânica'), mental: ct('mental'), physical: ct('físico') };

// Efeitos cumulativos de um periférico no tier atual.
function gearEffect(def: PeripheralDef, tier: GearTier) {
  const train = def.cat && tier > 0 ? Math.round(def.trainPer * tier * 100) : 0;
  const match = tier === 0 ? def.t0Penalty : Math.round(def.matchPer * tier * 100) / 100;
  return { train, match };
}

export function RtpSetup({ save, onUpdate }: {
  save: RoadToProSave;
  onUpdate: (next: RoadToProSave) => void;
}) {
  const [flash, setFlash] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const setup = save.setup;
  const level = setupLevel(setup);

  const doBuy = (slot: PeripheralDef['slot']) => {
    const res = buyGear(save, slot);
    if (!res.ok) { setNote(res.reason ?? ct('Não foi possível.')); setFlash(null); return; }
    setNote(null); setFlash(res.feedback ?? ct('Upgrade!'));
    onUpdate(res.save);
  };
  const doHirePsych = () => {
    const res = hirePsych(save);
    if (!res.ok) { setNote(res.reason ?? ct('Não foi possível.')); setFlash(null); return; }
    setNote(null); setFlash(res.feedback ?? ct('Contratado!'));
    onUpdate(res.save);
  };

  const psych = psychDef(setup.psychTier ?? 0);
  const psychNext = (setup.psychTier ?? 0) < 4 ? PSYCH_TIERS[(setup.psychTier ?? 0) + 1] : null;

  return (
    <DashCard
      title={ct('Setup — periféricos & mente')}
      actions={<span className="rtp-actions-left">{ct('Nível')} {level}/36</span>}
    >
      <div className="rtp-setup-levelbar"><div style={{ width: `${(level / 36) * 100}%` }} /></div>
      {flash && <div className="rtp-feedback rtp-setup-flash"><b>{flash}</b></div>}
      {note && <div className="rtp-note">{note}</div>}

      <div className="rtp-setup-grid">
        {PERIPHERALS.map((def) => {
          const tier = (setup.gear[def.slot] ?? 0) as GearTier;
          const eff = gearEffect(def, tier);
          const maxed = tier >= 4;
          const price = maxed ? 0 : def.prices[tier];
          const afford = save.life.money >= price;
          const nextEff = maxed ? null : gearEffect(def, (tier + 1) as GearTier);
          return (
            <div key={def.slot} className={`rtp-gear-card${tier === 0 ? ' junk' : ''}`}>
              <div className="rtp-gear-top">
                <span className="rtp-gear-ico"><RtpIcon name={def.icon} size={20} /></span>
                <div className="rtp-gear-id">
                  <b>{def.label}</b>
                  <span>{TIER_NAMES[tier]}</span>
                </div>
              </div>
              <div className="rtp-gear-pips">
                {[1, 2, 3, 4].map((p) => <i key={p} className={p <= tier ? 'on' : ''} />)}
              </div>
              <div className="rtp-gear-effects">
                {eff.train > 0 && <span className="rtp-gear-chip good">+{eff.train}% {CAT_LABEL[def.cat!]}</span>}
                <span className={`rtp-gear-chip ${eff.match >= 0 ? 'good' : 'bad'}`}>
                  {eff.match >= 0 ? '+' : ''}{eff.match}% {ct('partida')}
                </span>
              </div>
              <div className="rtp-gear-blurb">{def.blurb}</div>
              {maxed ? (
                <button type="button" className="rtp-gear-buy" disabled><RtpIcon name="check" size={13} /> {ct('Máximo')}</button>
              ) : (
                <button type="button" className="rtp-gear-buy rtp-lift" disabled={!afford} onClick={() => doBuy(def.slot)}>
                  <span>{ct('Melhorar')} · {money(price)}</span>
                  {nextEff && <small>→ {TIER_NAMES[(tier + 1) as GearTier]}</small>}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Psicólogo — trilho mental */}
      <div className={`rtp-psych-card${(setup.psychTier ?? 0) > 0 ? ' active' : ''}`}>
        <div className="rtp-psych-head">
          <span className="rtp-psych-ico"><RtpIcon name="brain" size={22} /></span>
          <div>
            <b>{psych.label}</b>
            <span>{(setup.psychTier ?? 0) > 0 ? `${money(psych.retainer)}/${ct('sem')} · ${ct('mensalidade')}` : ct('Cuide da cabeça: menos tilt, recuperação e foco em quadra.')}</span>
          </div>
        </div>
        <div className="rtp-psych-stats">
          <div><span>{ct('Anti-tilt')}</span><b>{Math.round(psych.tiltResist * 100)}%</b></div>
          <div><span>{ct('Recuperação')}</span><b>+{psych.recovery}</b></div>
          <div><span>{ct('Partida')}</span><b>+{psych.matchPct}%</b></div>
        </div>
        {psychNext ? (
          <button type="button" className="rtp-psych-cta rtp-lift" disabled={save.life.money < psychNext.buyPrice} onClick={doHirePsych}>
            {(setup.psychTier ?? 0) === 0 ? ct('Contratar') : ct('Melhorar')} · {money(psychNext.buyPrice)}
            <small>+{Math.round(psychNext.tiltResist * 100)}% anti-tilt · {money(psychNext.retainer)}/{ct('sem')}</small>
          </button>
        ) : (
          <button type="button" className="rtp-psych-cta" disabled><RtpIcon name="check" size={13} /> {ct('Melhor psicólogo')}</button>
        )}
      </div>
    </DashCard>
  );
}
