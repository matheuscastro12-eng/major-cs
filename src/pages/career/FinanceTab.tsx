// Aba Finance — T1.4. Saiu de IIFE inline no CareerScreen (hubTab === 'finance').
// Mostra caixa, sponsors, folha e infraestrutura/staff. [fase 3] A folha vem
// dos CONTRATOS (clube.contracts); a aba Contratos mora em ContractsTab.tsx.

import { DashCard } from '../../components/ds';
import { CareerIcon, type CareerIconName } from '../../components/career/CareerIcon';
import {
  effSponsorIncome,
  careerFans,
  formatFans,
  type Signing,
} from '../../components/CareerScreen';
import type { YouthDebut } from '../../engine/career/playerAge';
import { ct } from '../../state/career-i18n';
import { DIFFICULTY_ECON, DIFFICULTY_LABELS, type Difficulty } from '../../types';
import { formatMoney, playerWage } from '../../engine/ratings';
import { contractPayroll } from '../../engine/clube/contratos';
import type { ClubeState } from '../../engine/clube/model';
import {
  facilityUpgradeCost,
  facilityUpkeep,
  normalizeFacilities,
  FACILITY_MAX_LEVEL,
  type FacilityKey,
} from '../../engine/career/facilities';
import type { Player } from '../../types';
import { scoutById } from '../../engine/scouting';
import { staffPayroll } from '../../engine/gestao/staff';
import type { GestaoState } from '../../engine/gestao/model';

interface FinanceTabSave {
  org?: { name?: string } | null;
  squad: Signing[];
  clube?: ClubeState; // [fase 3] folha real (clube.contracts)
  budget: number;
  facilities?: Record<string, number>;
  split: number;
  difficulty?: Difficulty;
  hiredScoutId?: string | null;
  gestao?: GestaoState; // [fase 2 · STAFF] folha da comissão técnica
  youthAge?: Record<string, number>;
  youthDebut?: Record<string, YouthDebut>;
  // pass-through pros helpers effSponsorIncome/careerFans (que esperam CareerSave)
  // não exigem mais que isso visível aqui.
  [key: string]: unknown;
}

interface ResolvedSigning {
  player: Player;
}

interface Props {
  /** money = caixa, patrocínio e infraestrutura (contratos: ContractsTab) */
  section?: 'money';
  save: FinanceTabSave;
  findSigning: (s: Signing) => ResolvedSigning | null;
  update: (patch: Record<string, unknown>) => void;
}

export function FinanceTab({ section = 'money', save, findSigning, update }: Props) {
  const picks = save.squad
    .map((s) => ({ sig: s, f: findSigning(s) }))
    .filter((x) => x.f) as { sig: Signing; f: ResolvedSigning }[];
  // [fase 3] folha REAL: salário do contrato (sem contrato: o de mercado)
  const folha = contractPayroll(save, picks.map((x) => ({ id: x.sig.playerId, marketWage: playerWage(x.f.player) })));
  // dificuldade de gestão: hard/legend cobram encargos por cima da folha base
  // (a folha-base bate com a soma das linhas de contrato; os encargos são uma
  // linha à parte, e folha+encargos = a folha REAL paga na virada de split).
  const diff: Difficulty = save.difficulty === 'hard' || save.difficulty === 'legend' ? save.difficulty : 'normal';
  const encargos = Math.round(folha * (DIFFICULTY_ECON[diff].salaryMul - 1));
  // helpers do CareerScreen esperam CareerSave; passamos o save broad via cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sponsorInc = effSponsorIncome(save as any);
  const facilities = normalizeFacilities(save.facilities);
  const upkeep = facilityUpkeep(facilities);
  // salário do scout: DEBITADO de verdade na virada de split (CareerScreen), mas
  // ficava fora do "Saldo fixo" — o caixa "sumia" sem linha justificando.
  const scoutSalary = save.hiredScoutId ? (scoutById(save.hiredScoutId)?.salaryPerSplit ?? 0) : 0;
  // [fase 2 · STAFF] comissão técnica: debitada na virada de split
  const staffSalary = staffPayroll(save.gestao?.staff);
  const net = sponsorInc - folha - encargos - upkeep - scoutSalary - staffSalary;

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
    <DashCard
      title={`${ct('Finanças')} · ${save.org?.name ?? ''}`}
      actions={diff !== 'normal' ? (
        <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '2px 10px', borderRadius: 12, border: `1px solid ${diff === 'hard' ? '#e8c170' : 'var(--c-loss)'}`, color: diff === 'hard' ? '#e8c170' : 'var(--c-loss)' }}>
          🎚️ {ct(DIFFICULTY_LABELS[diff])}
        </span>
      ) : undefined}
    >
      {section === 'money' && (<>
      <div className="fin-cards">
        <div className="fin-card"><span className="fin-k">{ct('Caixa')}</span><b>{formatMoney(save.budget)}</b></div>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <div className="fin-card"><span className="fin-k">{ct('Fãs')}</span><b>{formatFans(careerFans(save as any))}</b></div>
        <div className="fin-card"><span className="fin-k">{ct('Patrocínio / split')}</span><b className="pos">+{formatMoney(sponsorInc)}</b></div>
        <div className="fin-card"><span className="fin-k">{ct('Folha / split')}</span><b className="neg">-{formatMoney(folha)}</b></div>
        {encargos > 0 && (
          <div className="fin-card"><span className="fin-k">{ct('Encargos (dificuldade)')}</span><b className="neg">-{formatMoney(encargos)}</b></div>
        )}
        <div className="fin-card"><span className="fin-k">{ct('Infraestrutura / split')}</span><b className="neg">-{formatMoney(upkeep)}</b></div>
        {scoutSalary > 0 && (
          <div className="fin-card"><span className="fin-k">{ct('Scout / split')}</span><b className="neg">-{formatMoney(scoutSalary)}</b></div>
        )}
        {staffSalary > 0 && (
          <div className="fin-card"><span className="fin-k">{ct('Comissão técnica / split')}</span><b className="neg">-{formatMoney(staffSalary)}</b></div>
        )}
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

      </>)}
    </DashCard>
  );
}
