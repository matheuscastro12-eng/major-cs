// Aba World — cena mundial. [fase 4 · circuito] Agora é o MUNDO DE VERDADE: os
// eventos que você não joga rodam em segundo plano (modelo calibrado) e viram
// resultado — os campeões da última etapa (e do Major), e por região o campeão
// mais recente e a ordem do ranking VRS.

import { Globe, Trophy } from 'lucide-react';
import { DashCard, Tag } from '../../components/ds';
import { CareerIcon } from '../../components/career/CareerIcon';
import { OrgFlag } from '../../components/flags';
import { TeamBadge } from '../../components/ui';
import { worldScene, type RegionScene } from '../../components/CareerScreen';
import { ct } from '../../state/career-i18n';
import { logoForTeam } from '../../data/media';
import { MACRO_REGION_LABELS, type MacroRegion } from '../../data/regions';
import type { TeamSeason } from '../../types';
import type { MundoState, WorldEventResult } from '../../engine/mundo/model';
import { LanTag, TierTag, type TeamLite } from './CircuitoViews';
import '../../styles/circuito.css';

interface Props {
  oppEra: TeamSeason[];
  save: { split: number; region?: MacroRegion; mundo?: MundoState };
  openTeamProfile: (teamId: string) => void;
  team: (id: string) => TeamLite;
  onOpenEvent: (id: string) => void;
}

export function WorldTab({ oppEra, save, openTeamProfile, team, onOpenEvent }: Props) {
  const scene: RegionScene[] = worldScene(oppEra, save.split, save.mundo);
  const results = save.mundo?.results ?? [];
  const lastT = Math.max(-1e9, ...results.filter((r) => r.kind === 'gsl').map((r) => r.t ?? -1e9));
  const latest = results.filter((r) => r.kind === 'gsl' && r.t === lastT).sort((a, b) => (a.tier ?? 3) - (b.tier ?? 3));
  const major = [...results].filter((r) => r.kind === 'major').sort((a, b) => (b.t ?? 0) - (a.t ?? 0))[0];
  const champRow = (r: WorldEventResult) => {
    const c = r.placements.find((p) => p.place === 1)?.teamId;
    const ru = r.placements.find((p) => p.place === 2)?.teamId;
    const t = c ? team(c) : null;
    return (
      <button key={r.eventId} type="button" className="world-row" onClick={() => onOpenEvent(r.eventId)} style={{ gap: 8 }}>
        <TierTag tier={r.tier ?? 3} />
        <span className="wr-name" style={{ flex: 1, minWidth: 0 }}>{r.name}</span>
        <LanTag lan={!!r.lan} />
        {t && <><Trophy size={12} aria-hidden /><TeamBadge tag={t.tag} colors={t.colors} size={16} logoUrl={t.logoUrl} /><b>{t.tag}</b></>}
        {ru && <span className="muted small">× {team(ru).tag}</span>}
      </button>
    );
  };

  return (
    <DashCard title={ct('Cena mundial')}>
      {(latest.length > 0 || major) && (
        <div className="world-card" style={{ marginBottom: 12 }}>
          <div className="world-head"><Globe size={14} aria-hidden /> <span className="world-region">{ct('Campeões da última etapa')}</span>
            <Tag>{ct('segundo plano')}</Tag></div>
          {major && champRow(major)}
          {latest.map(champRow)}
        </div>
      )}
      <div className="muted small section-label" style={{ marginTop: 0 }}>
        {ct('Por região')} · Split {save.split} — {ct('campeão mais recente e a ordem do ranking VRS')}
      </div>
      <div className="world-grid">
        {scene.map((s) => (
          <div key={s.reg} className={`world-card${s.reg === save.region ? ' mine' : ''}`}>
            <div className="world-head">
              <OrgFlag players={s.champ.players} />
              <span className="world-region">{ct(MACRO_REGION_LABELS[s.reg])}</span>
              {s.reg === save.region && <span className="world-you">{ct('você joga aqui')}</span>}
            </div>
            <div className="world-league muted small">{s.league}</div>
            <button type="button" className="world-champ em-btn-reset clickable" onClick={() => openTeamProfile(s.champ.id)}>
              <span className="wc-tag"><CareerIcon name="trophy" size={12} /> {ct('Campeão')}</span>
              <TeamBadge tag={s.champ.tag} colors={s.champ.colors} size={22} logoUrl={s.champ.logoUrl ?? logoForTeam(s.champ)} />
              <span className="wc-name">{s.champ.team}</span>
            </button>
            {s.runnerUp && (
              <button type="button" className="world-runner em-btn-reset clickable muted small" onClick={() => openTeamProfile(s.runnerUp!.id)}>
                {ct('vice')}: {s.runnerUp.team}
              </button>
            )}
            <div className="world-top">
              {s.top.map((t, i) => (
                <button key={t.id} className="world-row" onClick={() => openTeamProfile(t.id)}>
                  <span className="wr-rank">{i + 1}</span>
                  <TeamBadge tag={t.tag} colors={t.colors} size={16} logoUrl={t.logoUrl ?? logoForTeam(t)} />
                  <span className="wr-name">{t.team}</span>
                  <span className="muted small">{save.mundo?.vrs?.[t.id]?.points ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        {ct('Enquanto você joga o seu evento, os outros da etapa acontecem de verdade (modelo de força calibrado contra o motor): quem ganha o quê entra no VRS e no histórico de cada evento. Clique num evento pra ver a chave final.')}
      </p>
    </DashCard>
  );
}
