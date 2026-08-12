// Aba VRS — T1.4. Saiu de inline no CareerScreen (hubTab === 'vrs').

import { Fragment } from 'react';
import { DashCard } from '../../components/ds';
import { OrgFlag } from '../../components/flags';
import { TeamBadge } from '../../components/ui';
import { ct } from '../../state/career-i18n';
import { MACRO_REGION_LABELS } from '../../data/regions';

// Shape mínimo do que cada linha VRS precisa (subset de TTeam +
// metadados do ranking). Vem do vrsAllMemo/vrsByRegionMemo do CareerScreen.
export interface VrsTeamRow {
  id: string;
  tag: string;
  name: string;
  colors: [string, string];
  logoUrl?: string;
  // players é usado pelo OrgFlag pra inferir bandeira agregada — mantém o
  // shape estrutural minimal (qualquer array com `country`).
  players: { country: string }[];
  region: keyof typeof MACRO_REGION_LABELS;
  vrs: number;
  isUser: boolean;
}

export interface VrsRegionGroup {
  key: string;
  label: string;
  teams: VrsTeamRow[];
}

interface Props {
  vrsMode: 'geral' | 'regiao';
  setVrsMode: (m: 'geral' | 'regiao') => void;
  myVrsRank: number;
  vrsAll: VrsTeamRow[];
  vrsByRegion: VrsRegionGroup[];
  openTeamProfile: (teamId: string) => void;
  /** #42 corrida ao Major: tamanho do corte (top N vão) + splits até o Major (0 = é agora) */
  majorCut?: number;
  splitsToMajor?: number;
}

export function VrsTab({
  vrsMode,
  setVrsMode,
  myVrsRank,
  vrsAll,
  vrsByRegion,
  openTeamProfile,
  majorCut = 0,
  splitsToMajor = 0,
}: Props) {
  // #42 — a CORRIDA: sua distância em pontos até a vaga (ou a gordura de quem
  // já está dentro). O "rival do corte" é quem está do outro lado da linha.
  const race = (() => {
    if (!majorCut || myVrsRank <= 0 || vrsAll.length <= majorCut) return null;
    const me = vrsAll.find((t) => t.isUser);
    if (!me) return null;
    const inside = myVrsRank <= majorCut;
    const bubble = inside ? vrsAll[majorCut] : vrsAll[majorCut - 1]; // 1º de fora / último de dentro
    if (!bubble) return null;
    const delta = Math.abs(me.vrs - bubble.vrs);
    return { inside, bubble, delta };
  })();

  return (
    <DashCard title={ct('Ranking VRS')}>
      {/* #42 — CORRIDA AO MAJOR: a linha de corte vira drama permanente */}
      {race && (
        <div className={`vrs-race${race.inside ? ' in' : ' out'}`}>
          <b>
            {race.inside
              ? <>🎫 {ct('NA ZONA DE MAJOR')} — #{myVrsRank} {ct('de')} {majorCut}</>
              : <>🏁 {ct('CORRIDA AO MAJOR')} — #{myVrsRank}, {ct('corte no top')} {majorCut}</>}
          </b>
          <span>
            {race.inside
              ? <>{ct('Sua gordura sobre')} <i>{race.bubble.name}</i> ({ct('1º de fora')}): <b>{race.delta}</b> {ct('pts de VRS')}.</>
              : <>{ct('Faltam')} <b>{race.delta}</b> {ct('pts de VRS pra alcançar')} <i>{race.bubble.name}</i> ({ct('último de dentro')}).</>}
            {' '}{splitsToMajor > 0
              ? <>{ct('O corte fecha em')} <b>{splitsToMajor}</b> {splitsToMajor === 1 ? ct('split') : ct('splits')}.</>
              : <>{ct('O Major é NESTE split — o corte é agora.')}</>}
          </span>
        </div>
      )}
      <div className="t20-head">
        <div className="muted small section-label" style={{ marginTop: 0 }}>
          {vrsMode === 'geral' ? ct('Ranking mundial de VRS · geral') : ct('Ranking mundial de VRS · por região')}
          {myVrsRank > 0 && (
            <span className="muted small"> {ct('· você é')} <b style={{ color: 'var(--em-gold)' }}>#{myVrsRank}</b> {ct('no mundo')}</span>
          )}
        </div>
        <div className="t20-toggle">
          <button
            className={`btn small${vrsMode === 'geral' ? ' gold' : ' ghost'}`}
            onClick={() => setVrsMode('geral')}
          >
            {ct('Geral')}
          </button>
          <button
            className={`btn small${vrsMode === 'regiao' ? ' gold' : ' ghost'}`}
            onClick={() => setVrsMode('regiao')}
          >
            {ct('Por região')}
          </button>
        </div>
      </div>
      {vrsMode === 'geral' ? (
        <table className="stats vrs-geral">
          <tbody>
            {vrsAll.map((t, i) => (
              <Fragment key={t.id}>
              {/* #42: a LINHA DE CORTE do Major, desenhada no ranking */}
              {majorCut > 0 && i === majorCut && (
                <tr className="vrs-cutline" aria-hidden>
                  <td colSpan={3}>✂️ {ct('LINHA DE CORTE DO MAJOR — top')} {majorCut} {ct('garantem vaga')}</td>
                </tr>
              )}
              <tr
                className={`${t.isUser ? 'human-row' : ''} clickable-row`}
                onClick={() => openTeamProfile(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') openTeamProfile(t.id); }}
              >
                <td style={{ width: 30, textAlign: 'left', fontWeight: 800, color: i < 3 ? 'var(--gold)' : undefined }}>
                  {i + 1}
                </td>
                <td style={{ textAlign: 'left' }}>
                  <span className="pcell">
                    <TeamBadge tag={t.tag} colors={t.colors} size={20} logoUrl={t.logoUrl} />
                    <OrgFlag players={t.players} />
                    <span style={{ fontWeight: t.isUser ? 700 : 500, color: t.isUser ? 'var(--em-gold)' : undefined }}>
                      {t.name}
                    </span>
                    <span className="muted small vrs-reg">{MACRO_REGION_LABELS[t.region]}</span>
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{t.vrs}</td>
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="vrs-regions">
          {vrsByRegion.map((g) => (
            <div key={g.key} className="vrs-region">
              <div className="vrs-region-head">
                {g.label} <span className="muted small">({g.teams.length})</span>
              </div>
              <table className="stats">
                <tbody>
                  {g.teams.map((t, i) => (
                    <tr
                      key={t.id}
                      className={`${t.isUser ? 'human-row' : ''} clickable-row`}
                      onClick={() => openTeamProfile(t.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') openTeamProfile(t.id); }}
                    >
                      <td style={{ width: 24, textAlign: 'left' }}>{i + 1}</td>
                      <td style={{ textAlign: 'left' }}>
                        <span className="pcell">
                          <TeamBadge tag={t.tag} colors={t.colors} size={20} logoUrl={t.logoUrl} />
                          <OrgFlag players={t.players} />
                          <span style={{ fontWeight: t.isUser ? 700 : 500, color: t.isUser ? 'var(--em-gold)' : undefined }}>
                            {t.name}
                          </span>
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{t.vrs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </DashCard>
  );
}
