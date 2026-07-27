import { useState } from 'react';
import { ct } from '../../state/career-i18n';
import { RtpIcon } from './RtpIcon';
import { DashCard } from '../career/DashCard';
import {
  PERIPHERALS, PSYCH_TIERS, TIER_NAMES, setupLevel, buyGear, hirePsych, psychDef,
  type PeripheralDef,
} from '../../engine/rtp/setup';
import {
  HOUSING_TIERS, housingDef, buyHousing, buyFamilyHome, invest, redeem,
  FAMILY_HOME_PRICE, FAMILY_HOME_RECOVERY, INVEST_STEPS, investRate,
} from '../../engine/rtp/lifestyle';
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

      {/* ── VIDA DE PRO (RTP v16) — gastos de longo prazo ─────────────────── */}
      <LifestyleSection save={save} onUpdate={onUpdate} onFlash={(f, n) => { setFlash(f); setNote(n); }} />
    </DashCard>
  );
}

// ── Vida de pro: moradia + casa da família + investimentos ──────────────────
function LifestyleSection({ save, onUpdate, onFlash }: {
  save: RoadToProSave;
  onUpdate: (next: RoadToProSave) => void;
  onFlash: (flash: string | null, note: string | null) => void;
}) {
  const ls = save.lifestyle;
  const house = housingDef(ls.housing);
  const nextHouse = ls.housing < 4 ? HOUSING_TIERS[ls.housing + 1] : null;
  const run = (res: { ok: boolean; save: RoadToProSave; reason?: string; feedback?: string }) => {
    if (!res.ok) { onFlash(null, res.reason ?? ct('Não foi possível.')); return; }
    onFlash(res.feedback ?? ct('Feito!'), null);
    onUpdate(res.save);
  };
  // taxa da PRÓXIMA virada (mesmo seed/tick que o investWeekTick vai usar) — o
  // jogador vê a régua honesta do que está contratando, não uma promessa.
  const nextRate = investRate(save.rng.seed, save.rng.tick + 1);

  return (
    <div className="rtp-lifestyle">
      <div className="rtp-lifestyle-kicker"><RtpIcon name="home" size={15} /> {ct('Vida de pro')}</div>

      {/* Moradia */}
      <div className="rtp-life-card">
        <div className="rtp-psych-head">
          <span className="rtp-psych-ico"><RtpIcon name={house.icon} size={22} /></span>
          <div>
            <b>{house.label}</b>
            <span>{house.blurb}</span>
          </div>
        </div>
        <div className="rtp-psych-stats">
          <div><span>{ct('Energia/sem')}</span><b>+{house.energyBonus}</b></div>
          <div><span>{ct('Recuperação')}</span><b>+{house.recoveryBonus}</b></div>
          <div><span>{ct('Nível')}</span><b>{ls.housing}/4</b></div>
        </div>
        {nextHouse ? (
          <button type="button" className="rtp-psych-cta rtp-lift" disabled={save.life.money < nextHouse.price} onClick={() => run(buyHousing(save))}>
            {ct('Mudar pra')} {nextHouse.label} · {money(nextHouse.price)}
            <small>+{nextHouse.energyBonus} {ct('energia')} · +{nextHouse.recoveryBonus} {ct('recuperação por semana')}</small>
          </button>
        ) : (
          <button type="button" className="rtp-psych-cta" disabled><RtpIcon name="check" size={13} /> {ct('Morando no topo')}</button>
        )}
      </div>

      {/* Casa da família */}
      <div className={`rtp-life-card${ls.familyHome ? ' done' : ''}`}>
        <div className="rtp-psych-head">
          <span className="rtp-psych-ico"><RtpIcon name="personal" size={22} /></span>
          <div>
            <b>{ct('Casa da família')}</b>
            <span>{ls.familyHome
              ? ct('A escritura tem o sobrenome de vocês. Ninguém paga mais aluguel.')
              : ct('Tirar a família do aluguel. O motivo pelo qual você começou.')}</span>
          </div>
        </div>
        {ls.familyHome ? (
          <button type="button" className="rtp-psych-cta" disabled><RtpIcon name="check" size={13} /> {ct('Sonho realizado')}</button>
        ) : (
          <button type="button" className="rtp-psych-cta rtp-lift" disabled={save.life.money < FAMILY_HOME_PRICE} onClick={() => run(buyFamilyHome(save))}>
            {ct('Comprar')} · {money(FAMILY_HOME_PRICE)}
            <small>{ct('família')} +30 · +{FAMILY_HOME_RECOVERY} {ct('moral/sem pra sempre')} · {ct('legado')}</small>
          </button>
        )}
      </div>

      {/* Investimentos */}
      <div className="rtp-life-card">
        <div className="rtp-psych-head">
          <span className="rtp-psych-ico"><RtpIcon name="chart" size={22} /></span>
          <div>
            <b>{ct('Investimentos')}</b>
            <span>{ls.invested > 0
              ? `${money(ls.invested)} ${ct('aplicados · rende (ou não) toda semana')}`
              : ct('Carreira de pro é curta — bote o dinheiro pra trabalhar por você.')}</span>
          </div>
        </div>
        {ls.invested > 0 && (
          <div className="rtp-psych-stats">
            <div><span>{ct('Aplicado')}</span><b>{money(ls.invested)}</b></div>
            <div><span>{ct('Semana que vem')}</span><b className={nextRate >= 0 ? 'up' : 'down'}>{nextRate >= 0 ? '+' : ''}{(nextRate * 100).toFixed(1)}%</b></div>
          </div>
        )}
        <div className="rtp-invest-row">
          {INVEST_STEPS.map((v) => (
            <button key={v} type="button" className="rtp-invest-btn rtp-lift" disabled={save.life.money < v} onClick={() => run(invest(save, v))}>
              +{money(v)}
            </button>
          ))}
          <button type="button" className="rtp-invest-btn rtp-invest-out" disabled={ls.invested <= 0} onClick={() => run(redeem(save))}>
            {ct('Resgatar tudo')}
          </button>
        </div>
      </div>
    </div>
  );
}
