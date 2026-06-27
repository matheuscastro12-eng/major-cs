// Aba Academy — T1.4. Saiu de IIFE inline no CareerScreen (hubTab === 'academy').
//
// Aba GRANDE: 2 DashCards (Time Academy + Liga Academy + Academia). Lógica de
// derive (orgCountry, league, teamOvr) calculada DENTRO da page — não precisa
// estar no escopo do CareerScreen.

import { DashCard } from '../../components/ds';
import { CareerIcon } from '../../components/career/CareerIcon';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from '../../components/ui';
import {
  ACADEMY_MAX,
  ACADEMY_SCOUT_COST,
  REGION_CC,
  makeProspect,
  buildUserAcademyTeam,
  type AcademyEntry,
} from '../../components/CareerScreen';
import { academyLeague } from '../../engine/career/academyLeague';
import { ct } from '../../state/career-i18n';
import { formatMoney, playerOvr } from '../../engine/ratings';
import { type MacroRegion } from '../../data/regions';
import type { Signing } from '../../components/CareerScreen';

interface ResolvedSigning {
  player: { id: string; nick: string; country: string };
}

interface AskConfirmFn {
  (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
  }): void;
}

// Save shape minimal — usa unknown-ish pra evitar diverence com CareerSave
// real (org/etc são non-null lá). update aceita partial broad.
interface AcademyTabSave {
  academy?: AcademyEntry[];
  academyTeam?: AcademyEntry[];
  academyFocus?: string | null;
  squad: Signing[];
  region?: MacroRegion;
  org?: { name?: string; tag?: string; colors?: [string, string]; logo?: string } | null;
  budget: number;
  split: number;
}

interface Props {
  save: AcademyTabSave;
  // update do CareerSave (assinatura broad pra aceitar Partial<CareerSave>)
  update: (patch: Record<string, unknown>) => void;
  promoting: string | null;
  setPromoting: (id: string | null) => void;
  promoteProspect: (prospectId: string, replaceOid?: string) => void;
  findSigning: (s: Signing) => ResolvedSigning | null;
  askConfirm: AskConfirmFn;
}

export function AcademyTab({
  save,
  update,
  promoting,
  setPromoting,
  promoteProspect,
  findSigning,
  askConfirm,
}: Props) {
  const aca = save.academy ?? [];
  const full = aca.length >= ACADEMY_MAX;
  const squadFull = save.squad.length >= 5;
  // país predominante no elenco (fallback: 1º país da região)
  const orgCountry = (() => {
    const counts = new Map<string, number>();
    for (const s of save.squad) {
      const c = findSigning(s)?.player.country;
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best = '';
    let bestN = 0;
    for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n; }
    return best || (REGION_CC[save.region ?? 'europe'] ?? REGION_CC.europe)[0];
  })();
  const acaTeam = save.academyTeam ?? [];
  const teamOvr = acaTeam.length
    ? Math.round(acaTeam.reduce((a, p) => a + playerOvr(p), 0) / acaTeam.length)
    : 0;
  const league = acaTeam.length
    ? academyLeague(
        {
          name: `${save.org?.name ?? 'Org'} Academy`,
          tag: `${save.org?.tag ?? 'ORG'}A`,
          colors: save.org?.colors ?? ['#101820', '#3a3a3a'],
          strength: teamOvr,
        },
        `${save.org?.tag ?? 'org'}:${save.split}`,
      )
    : null;

  return (
    <div className="em-tab">
      {/* ===== TIME ACADEMY (joga a Liga Academy) ===== */}
      <DashCard
        title={ct('Time Academy')}
        actions={acaTeam.length ? <span className="em-ovr-badge">{teamOvr} OVR</span> : undefined}
      >
        {acaTeam.length === 0 ? (
          <div className="aca-create">
            <p className="muted small" style={{ maxWidth: 620, margin: '0 0 12px' }}>
              {ct('Sua org ainda não tem um time academy. Monte um agora — entram')}{' '}
              <b>{ct('5 jovens')}</b>{' '}
              {ct('(um por função: Rifler, Entry, Support, AWP e IGL), todos da nacionalidade do seu time. Eles disputam a')}{' '}
              <b>{ct('Liga Academy')}</b>{' '}
              {ct('contra as principais academies do mundo a cada split.')}
            </p>
            <button
              className="btn gold"
              onClick={() =>
                update({
                  academyTeam: buildUserAcademyTeam(orgCountry, save.org?.tag ?? 'ORG', save.split),
                })
              }
            >
              <CareerIcon name="search" size={14} /> {ct('Criar time academy')} <Flag cc={orgCountry} />
            </button>
          </div>
        ) : (
          <div className="aca-team-grid">
            {acaTeam.map((p) => {
              const ovr = playerOvr(p);
              const potPct = Math.max(6, Math.min(100, ((p.potential - 60) / 33) * 100));
              return (
                <div key={p.id} className="aca-team-card">
                  <div className="aca-top">
                    <PlayerAvatar nick={p.nick} size={42} />
                    <OvrBadge ovr={ovr} />
                  </div>
                  <div className="aca-nick"><Flag cc={p.country} /> {p.nick}</div>
                  <div className="aca-meta">
                    <span className={`role-pill ${p.role}`}>{p.role}</span>
                    <span className="muted small">{p.age} {ct('anos')}</span>
                  </div>
                  <div className="aca-potbar" title={`${ct('Potencial')} ${p.potential}`}>
                    <div style={{ width: `${potPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashCard>

      {/* ===== LIGA ACADEMY (tabela com as principais academies do mundo) ===== */}
      {league && (
        <DashCard
          title={`${ct('Liga Academy')} · Split ${save.split}`}
          actions={<span className="muted small">{ct('Você está em')} {league.userPlace}º</span>}
        >
          <div className="aca-league-wrap">
            <table className="aca-league">
              <thead>
                <tr>
                  <th>#</th><th>{ct('Academia')}</th><th>V</th><th>D</th><th>+/-</th><th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {league.table.map((r, i) => (
                  <tr key={r.id} className={r.isUser ? 'mine' : ''}>
                    <td>{i + 1}</td>
                    <td>
                      <span className="aca-league-team">
                        <TeamBadge tag={r.tag} colors={r.colors} size={18} /> {r.name}
                      </span>
                    </td>
                    <td>{r.w}</td>
                    <td>{r.l}</td>
                    <td className={r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}>
                      {r.diff > 0 ? '+' : ''}{r.diff}
                    </td>
                    <td><b>{r.pts}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="aca-league-matches">
              <div className="em-section-label">{ct('Seus jogos no split')}</div>
              {league.userMatches.map((m) => (
                <div key={m.oppId} className={`aca-match${m.won ? ' won' : ' lost'}`}>
                  <span className="aca-match-opp">
                    <TeamBadge tag={m.oppTag} colors={m.oppColors} size={16} /> {m.oppName}
                  </span>
                  <span className="aca-match-score">{m.userScore}–{m.oppScore}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            {ct('Academies reais (NAVI Junior, MOUZ NXT, Eternal Fire Academy e mais) — rosters extraídos do bo3.gg/Liquipedia. A tabela é definida pela força do seu time academy a cada split.')}
          </p>
        </DashCard>
      )}

      <DashCard title={ct('Academia')}>
        <div className="aca-head">
          <div>
            <div className="muted small section-label" style={{ marginTop: 0 }}>
              Academia · {aca.length}/{ACADEMY_MAX} prospectos
            </div>
            <p className="muted small" style={{ maxWidth: 600 }}>
              {ct('Revele jovens talentos, deixe um em')} <b>{ct('foco')}</b>{' '}
              {ct('(cresce mais rápido a cada split rumo ao seu')} <b>{ct('potencial')}</b>) e{' '}
              <b>{ct('promova ao elenco')}</b> {ct('quando quiser. É a próxima geração da sua org.')}
            </p>
          </div>
          <button
            className="btn gold"
            disabled={full || save.budget < ACADEMY_SCOUT_COST}
            title={
              full
                ? ct('Academia cheia')
                : save.budget < ACADEMY_SCOUT_COST
                ? ct('Caixa insuficiente')
                : ''
            }
            onClick={() => {
              const region = save.region ?? 'europe';
              const seed = `aca:${save.org?.tag ?? 'org'}:${save.split}:${aca.length}:${save.budget}`;
              const p = makeProspect(seed, region, save.split);
              update({ academy: [...aca, p], budget: save.budget - ACADEMY_SCOUT_COST });
            }}
          >
            <CareerIcon name="search" size={14} /> {ct('Revelar prospecto')} ({formatMoney(ACADEMY_SCOUT_COST)})
          </button>
        </div>
        {aca.length === 0 ? (
          <p className="muted small" style={{ padding: '14px 0' }}>
            {ct('Sua academia está vazia. Revele um prospecto pra começar a formar a próxima geração — eles começam crus (OVR baixo) mas evoluem treinando.')}
          </p>
        ) : (
          <div className="aca-grid">
            {aca.map((p) => {
              const ovr = playerOvr(p);
              const focused = save.academyFocus === p.id;
              const potPct = Math.max(6, Math.min(100, ((p.potential - 60) / 33) * 100));
              return (
                <div key={p.id} className={`aca-card${focused ? ' focused' : ''}`}>
                  <div className="aca-top">
                    <PlayerAvatar nick={p.nick} size={46} />
                    <OvrBadge ovr={ovr} />
                  </div>
                  <div className="aca-nick"><Flag cc={p.country} /> {p.nick}</div>
                  <div className="muted small aca-name">{p.name}</div>
                  <div className="aca-meta">
                    <span className={`role-pill ${p.role}`}>{p.role}</span>
                    <span className="muted small">{p.age} anos</span>
                  </div>
                  <div className="aca-pot">
                    <span className="muted small">
                      {ct('OVR atual')} <b style={{ color: 'var(--em-text)' }}>{ovr}</b> · {ct('Potencial')}
                    </span>
                    <div className="aca-potbar"><div style={{ width: `${potPct}%` }} /></div>
                    <span className="aca-potval">{p.potential}</span>
                  </div>
                  <div className="aca-actions">
                    <button
                      className="btn small gold aca-promote"
                      onClick={() =>
                        squadFull
                          ? setPromoting(promoting === p.id ? null : p.id)
                          : promoteProspect(p.id)
                      }
                    >
                      {ct('Promover ao elenco')}
                    </button>
                    <div className="aca-actions-row">
                      <button
                        className={`btn small aca-train${focused ? ' gold' : ' ghost'}`}
                        onClick={() => update({ academyFocus: focused ? null : p.id })}
                      >
                        {focused ? ct('Em foco') : ct('Treinar')}
                      </button>
                      <button
                        className="btn small ghost aca-drop"
                        title={ct('Dispensar o prospecto da academia')}
                        onClick={() =>
                          askConfirm({
                            title: ct('Dispensar prospecto'),
                            message: `${ct('Dispensar')} ${p.nick} ${ct('da academia? Não dá pra desfazer.')}`,
                            confirmLabel: ct('Dispensar'),
                            danger: true,
                            onConfirm: () => {
                              update({
                                academy: aca.filter((x) => x.id !== p.id),
                                academyFocus: save.academyFocus === p.id ? null : save.academyFocus,
                              });
                              if (promoting === p.id) setPromoting(null);
                            },
                          })
                        }
                      >
                        <CareerIcon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                  {promoting === p.id && squadFull && (
                    <div className="aca-replace">
                      <div className="muted small">{ct('Elenco cheio — sai do time:')}</div>
                      <div className="aca-replace-list">
                        {save.squad.map((sg) => {
                          const f = findSigning(sg);
                          return (
                            <button
                              key={sg.playerId}
                              className="btn small ghost"
                              onClick={() => promoteProspect(p.id, sg.playerId)}
                            >
                              {f?.player.nick ?? sg.playerId}
                            </button>
                          );
                        })}
                        <button className="btn small" onClick={() => setPromoting(null)}>cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DashCard>
    </div>
  );
}
