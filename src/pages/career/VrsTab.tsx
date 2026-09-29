// Aba VRS — T1.4. Saiu de inline no CareerScreen (hubTab === 'vrs').
// [fase 4 · circuito] VRS REAL e unificado: a composição dos pontos (premiação
// real, rede de adversários batidos, LAN) por time, a subida/queda desde a última
// publicação e os resultados que mais pesaram (com o decaimento pela idade).

import { Fragment, useState } from 'react';
import { DashCard } from '../../components/ds';
import { Bar } from '../../components/ds';
import type { VrsEntry } from '../../engine/mundo/model';
import type { VrsTable } from '../../engine/mundo/vrs';
import { VRS_WEIGHTS, VRS_WINDOW } from '../../engine/mundo/vrs';
import '../../styles/circuito.css';
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
  /** [fase 4 · circuito] ranking publicado (fatores, anterior) e a composição por resultado */
  published?: Record<string, VrsEntry>;
  table?: VrsTable | null;
  onOpenEvent?: (eventId: string) => void;
}

const placeTxt = (pl: number, n: number) => (pl === 1 ? '1º' : pl === 2 ? '2º' : pl <= 4 ? '3–4º' : pl <= 8 ? '5–8º' : n >= 32 ? (pl <= 16 ? '9–16º' : pl <= 24 ? '17–24º' : '25–32º') : pl <= 12 ? '9–12º' : '13–16º');
function Mini({ f }: { f?: { prize: number; network: number; lan: number } }) {
  if (!f) return null;
  return (
    <span className="ci-mini" aria-label={`premiação ${Math.round(f.prize * 100)}%, rede ${Math.round(f.network * 100)}%, LAN ${Math.round(f.lan * 100)}%`}>
      <i><u style={{ width: `${f.prize * 100}%` }} /></i><i><u style={{ width: `${f.network * 100}%` }} /></i><i><u style={{ width: `${f.lan * 100}%` }} /></i>
    </span>
  );
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
  published,
  table,
  onOpenEvent,
}: Props) {
  const [focus, setFocus] = useState<string>('user');
  const fe = table?.entries[focus];
  const fRow = vrsAll.find((t) => t.id === focus);
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
      {table && (
        <div className="world-card" style={{ marginBottom: 12 }}>
          <div className="world-head">
            <span className="world-region">{ct('Composição dos pontos')} · {fRow?.name ?? focus}</span>
            <span className="muted small">{fe ? `#${fe.rank} · ${fe.points} ${ct('pts')}` : ct('sem ranking (nenhum resultado na janela)')}</span>
          </div>
          {fe ? (
            <>
              <div className="ci-factors">
                <div className="ci-factor"><span>{ct('Premiação')} ({Math.round(VRS_WEIGHTS.prize * 100)}%)</span><Bar value={fe.factors!.prize * 100} tone="gold" /><b>{Math.round(fe.factors!.prize * 100)}</b></div>
                <div className="ci-factor"><span>{ct('Rede de adversários')} ({Math.round(VRS_WEIGHTS.network * 100)}%)</span><Bar value={fe.factors!.network * 100} tone="var(--c-ct)" /><b>{Math.round(fe.factors!.network * 100)}</b></div>
                <div className="ci-factor"><span>LAN ({Math.round(VRS_WEIGHTS.lan * 100)}%)</span><Bar value={fe.factors!.lan * 100} tone="var(--c-win)" /><b>{Math.round(fe.factors!.lan * 100)}</b></div>
              </div>
              <table className="stats ci-vrs-rows">
                <tbody>
                  {fe.rows.slice(0, 6).map((r) => (
                    <tr key={r.eventId} className={onOpenEvent ? 'clickable-row' : undefined} onClick={() => onOpenEvent?.(r.eventId)}>
                      <td style={{ textAlign: 'left' }}>{r.name} <span className="muted small">{r.split > 0 ? `S${r.split}` : ct('pré-carreira')}{r.lan ? ' · LAN' : ''}</span></td>
                      <td style={{ textAlign: 'right' }} className="muted small">{placeTxt(r.place, r.field)}</td>
                      <td style={{ textAlign: 'right' }} className="muted small">{ct('peso')} {Math.round(r.weight * 100)}%</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>+{r.contribution}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            {ct('Um ranking só pra todo mundo (você incluído): dinheiro REAL ganho, os times que você deixou pra trás (vale mais bater quem tem pontos) e LAN. Resultado pesa inteiro por 1 etapa e cai até zerar em')} {VRS_WINDOW} {ct('etapas. Clique nas barras de um time pra ver a composição dele.')}
          </p>
          <div className="ci-legend" style={{ marginTop: 6 }}>
            <span><i style={{ background: 'var(--c-brand)' }} />{ct('Premiação')}</span>
            <span><i style={{ background: 'var(--c-ct)' }} />{ct('Rede')}</span>
            <span><i style={{ background: 'var(--c-win)' }} />LAN</span>
          </div>
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
        <div className="vrs-table-wrap">
        <table className="stats vrs-geral">
          <tbody>
            {vrsAll.map((t, i) => (
              <Fragment key={t.id}>
              {/* #42: a LINHA DE CORTE do Major, desenhada no ranking */}
              {majorCut > 0 && i === majorCut && (
                <tr className="vrs-cutline" aria-hidden>
                  <td colSpan={5}>✂️ {ct('LINHA DE CORTE DO MAJOR — top')} {majorCut} {ct('com convite direto; os próximos de cada região vão ao RMR')}</td>
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
                <td style={{ textAlign: 'right' }} onClick={(e) => { if (table) { e.stopPropagation(); setFocus(t.id); } }} title={ct('Composição dos pontos')}>
                  <Mini f={published?.[t.id]?.factors} />
                </td>
                <td style={{ textAlign: 'right', width: 44 }} className="muted small">
                  {(() => { const e = published?.[t.id]; if (!e || e.prev == null) return null; const d = e.points - e.prev; return d ? <span className={d > 0 ? 'ci-up' : 'ci-down'}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span> : '='; })()}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{t.vrs}</td>
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
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
