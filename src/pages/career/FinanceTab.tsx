// Aba Finance — T1.4. Saiu de IIFE inline no CareerScreen (hubTab === 'finance').
// Mostra caixa, sponsors, folha, contratos e infraestrutura/staff.

import { DashCard } from '../../components/ds';
import { CareerIcon, type CareerIconName } from '../../components/career/CareerIcon';
import { Flag } from '../../components/ui';
import {
  effSponsorIncome,
  careerFans,
  formatFans,
  CONTRACT_TERM,
  effectiveAge,
  playerPotentialOvr,
  potentialTier,
  type Signing,
} from '../../components/CareerScreen';
import { ct } from '../../state/career-i18n';
import { formatMoney, playerWage, playerOvr } from '../../engine/ratings';
import {
  facilityUpgradeCost,
  facilityUpkeep,
  normalizeFacilities,
  FACILITY_MAX_LEVEL,
  type FacilityKey,
} from '../../engine/career/facilities';
import type { Player } from '../../types';

interface FinanceTabSave {
  org?: { name?: string } | null;
  squad: Signing[];
  contracts?: Record<string, number>;
  budget: number;
  facilities?: Record<string, number>;
  split: number;
  youthAge?: Record<string, number>;
  // pass-through pros helpers effSponsorIncome/careerFans (que esperam CareerSave)
  // não exigem mais que isso visível aqui.
  [key: string]: unknown;
}

interface ResolvedSigning {
  player: Player;
}

interface Props {
  save: FinanceTabSave;
  findSigning: (s: Signing) => ResolvedSigning | null;
  update: (patch: Record<string, unknown>) => void;
}

export function FinanceTab({ save, findSigning, update }: Props) {
  const picks = save.squad
    .map((s) => ({ sig: s, f: findSigning(s) }))
    .filter((x) => x.f) as { sig: Signing; f: ResolvedSigning }[];
  const wages = picks.map((x) => ({
    ...x,
    wage: playerWage(x.f.player),
    until: save.contracts?.[x.sig.playerId],
  }));
  const folha = wages.reduce((a, w) => a + w.wage, 0);
  // helpers do CareerScreen esperam CareerSave; passamos o save broad via cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sponsorInc = effSponsorIncome(save as any);
  const facilities = normalizeFacilities(save.facilities);
  const upkeep = facilityUpkeep(facilities);
  const net = sponsorInc - folha - upkeep;

  const facilityCards: { key: FacilityKey; icon: CareerIconName; name: string; effect: string }[] = [
    { key: 'training', icon: 'dumbbell', name: ct('Centro de treino'), effect: ct('Acelera a evolução do elenco e da academia.') },
    { key: 'analyst', icon: 'chart-bar', name: ct('Departamento de análise'), effect: ct('Melhora a preparação e o veto nos mapas fortes.') },
    { key: 'psychologist', icon: 'brain', name: ct('Psicologia esportiva'), effect: ct('Reduz fadiga e estabiliza a moral do elenco.') },
  ];

  const upgradeFacility = (key: FacilityKey) => {
    const level = facilities[key];
    const cost = facilityUpgradeCost(key, level);
    if (!cost || save.budget < cost) return;
    update({ budget: save.budget - cost, facilities: { ...facilities, [key]: level + 1 } });
  };

  return (
    <DashCard title={`${ct('Finanças')} · ${save.org?.name ?? ''}`}>
      <div className="fin-cards">
        <div className="fin-card"><span className="fin-k">{ct('Caixa')}</span><b>{formatMoney(save.budget)}</b></div>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <div className="fin-card"><span className="fin-k">{ct('Fãs')}</span><b>{formatFans(careerFans(save as any))}</b></div>
        <div className="fin-card"><span className="fin-k">{ct('Patrocínio / split')}</span><b className="pos">+{formatMoney(sponsorInc)}</b></div>
        <div className="fin-card"><span className="fin-k">{ct('Folha / split')}</span><b className="neg">-{formatMoney(folha)}</b></div>
        <div className="fin-card"><span className="fin-k">{ct('Infraestrutura / split')}</span><b className="neg">-{formatMoney(upkeep)}</b></div>
        <div className="fin-card"><span className="fin-k">{ct('Saldo fixo / split')}</span><b className={net >= 0 ? 'pos' : 'neg'}>{net >= 0 ? '+' : ''}{formatMoney(net)}</b></div>
      </div>
      <p className="muted small">
        {ct('A premiação entra conforme sua colocação. O "saldo fixo" é patrocínio − folha (antes do prêmio); se ficar negativo, você queima caixa todo split.')}
      </p>

      <div className="muted small section-label">{ct('Infraestrutura & staff')}</div>
      <div className="career-facilities">
        {facilityCards.map((facility) => {
          const level = facilities[facility.key];
          const cost = facilityUpgradeCost(facility.key, level);
          return (
            <div key={facility.key} className="career-facility-card">
              <span><CareerIcon name={facility.icon} size={24} /></span>
              <div>
                <b>{facility.name}</b>
                <small>{facility.effect}</small>
                <i>{ct('Nível')} {level}/{FACILITY_MAX_LEVEL}</i>
              </div>
              <button
                className="btn small gold"
                disabled={!cost || save.budget < cost}
                onClick={() => upgradeFacility(facility.key)}
              >
                {level >= FACILITY_MAX_LEVEL ? ct('MÁXIMO') : `${ct('Melhorar')} · ${formatMoney(cost)}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="muted small section-label">{ct('Contratos do elenco')}</div>
      <div className="fin-table-wrap">
        <table className="stats fin-contracts">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>{ct('Jogador')}</th>
              <th>{ct('Idade')}</th>
              <th>OVR</th>
              <th>POT</th>
              <th>{ct('Salário/split')}</th>
              <th>{ct('Contrato')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {wages.map((w) => {
              const left = w.until != null ? w.until - save.split + 1 : 0;
              const expiring = left <= 1;
              const age = effectiveAge(w.f.player, save.split, save.youthAge);
              const pot = potentialTier(playerPotentialOvr(w.f.player, age));
              return (
                <tr key={w.sig.playerId} className={expiring ? 'fin-expiring' : ''}>
                  <td style={{ textAlign: 'left' }}><Flag cc={w.f.player.country} /> {w.f.player.nick}</td>
                  <td>{age}</td>
                  <td>{playerOvr(w.f.player)}</td>
                  <td><span className={`pot-badge pot-${pot}`}>{pot}</span></td>
                  <td className="neg">{formatMoney(w.wage)}</td>
                  <td>{left <= 0 ? 'vencido' : `${left} split${left > 1 ? 's' : ''}`}{expiring && left > 0 ? ' ⚠️' : ''}</td>
                  <td>
                    {expiring && (
                      <button
                        className="btn small"
                        disabled={save.budget < w.wage}
                        onClick={() =>
                          update({
                            budget: save.budget - w.wage,
                            contracts: { ...(save.contracts ?? {}), [w.sig.playerId]: save.split + CONTRACT_TERM - 1 },
                          })
                        }
                      >
                        🔁 Renovar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Contratos vencem no fim do prazo: <b>{ct('renove (custa 1 salário)')}</b>{' '}
        {ct('ou o jogador sai')} <b>{ct('de graça')}</b>{' '}
        {ct('no próximo split.')}
      </p>
    </DashCard>
  );
}
