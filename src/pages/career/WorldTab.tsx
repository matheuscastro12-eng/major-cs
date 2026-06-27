// Aba World — T1.4. Saiu de IIFE inline no CareerScreen (hubTab === 'world').
// Mostra a cena mundial: campeão + vice + top de cada região.

import { DashCard } from '../../components/ds';
import { CareerIcon } from '../../components/career/CareerIcon';
import { OrgFlag } from '../../components/flags';
import { TeamBadge } from '../../components/ui';
import { worldScene, type RegionScene } from '../../components/CareerScreen';
import { ct } from '../../state/career-i18n';
import { logoForTeam } from '../../data/media';
import { MACRO_REGION_LABELS, type MacroRegion } from '../../data/regions';
import type { TeamSeason } from '../../types';

interface Props {
  oppEra: TeamSeason[];
  save: { split: number; region?: MacroRegion };
  openTeamProfile: (teamId: string) => void;
}

export function WorldTab({ oppEra, save, openTeamProfile }: Props) {
  const scene: RegionScene[] = worldScene(oppEra, save.split);

  return (
    <DashCard title={ct('Cena mundial')}>
      <div className="muted small section-label" style={{ marginTop: 0 }}>
        Cena mundial · Split {save.split} — campeonatos regionais acontecendo em paralelo
      </div>
      <div className="world-grid">
        {scene.map((s) => (
          <div key={s.reg} className={`world-card${s.reg === save.region ? ' mine' : ''}`}>
            <div className="world-head">
              <OrgFlag players={s.champ.players} />
              <span className="world-region">{MACRO_REGION_LABELS[s.reg]}</span>
              {s.reg === save.region && <span className="world-you">{ct('você joga aqui')}</span>}
            </div>
            <div className="world-league muted small">{s.league}</div>
            <button
              type="button"
              className="world-champ em-btn-reset clickable"
              onClick={() => openTeamProfile(s.champ.id)}
            >
              <span className="wc-tag"><CareerIcon name="trophy" size={12} /> {ct('Campeão')}</span>
              <TeamBadge tag={s.champ.tag} colors={s.champ.colors} size={22} logoUrl={s.champ.logoUrl ?? logoForTeam(s.champ)} />
              <span className="wc-name">{s.champ.team}</span>
            </button>
            {s.runnerUp && (
              <button
                type="button"
                className="world-runner em-btn-reset clickable muted small"
                onClick={() => openTeamProfile(s.runnerUp!.id)}
              >
                vice: {s.runnerUp.team}
              </button>
            )}
            <div className="world-top">
              {s.top.map((t, i) => (
                <button key={t.id} className="world-row" onClick={() => openTeamProfile(t.id)}>
                  <span className="wr-rank">{i + 1}</span>
                  <TeamBadge tag={t.tag} colors={t.colors} size={16} logoUrl={t.logoUrl ?? logoForTeam(t)} />
                  <span className="wr-name">{t.team}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        {ct('O cenário evolui a cada split — os campeões e a ordem mudam. Clique num time pra ver elenco e mapas. Você sobe de região mudando o core do elenco (nas Finanças/Mercado).')}
      </p>
    </DashCard>
  );
}
