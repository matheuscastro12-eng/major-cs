import { useMemo } from 'react';
import { ct } from '../../state/career-i18n';
import { Flag, TeamBadge } from '../ui';
import { DashCard } from '../career/DashCard';
import { SparkLine } from '../career/DashCharts';
import {
  IconPlay, IconFastForward, IconTrophy, IconSwords,
  IconTriangleUp, IconTriangleDown, StarRating,
} from '../career/DashIcons';
import { RtpIcon, type RtpIconName } from './RtpIcon';
import { PERSONALITY_LABEL } from '../../engine/career/personality';
import {
  circuitOpponent, circuitUserMatches, circuitForm, circuitRanking, TIER_NAME, EVENTS_PER_SEASON, objectiveStatus,
} from '../../engine/rtp/circuit';
import { conditionModifiers } from '../../engine/rtp/matchSim';
import { rankTier, worldLadder } from '../../engine/rtp/standing';
import { circuitEventName } from '../../engine/rtp/league';
import { MAJOR_CUT } from '../../engine/rtp/major';
import { playerOvr } from '../../engine/ratings';
import { MAP_IMAGES } from '../../data/media';
import { MAP_LABELS, type MapId } from '../../types';
import type { RoadToProSave, LifeMeterKey, LifeState } from '../../engine/rtp/types';

export interface RtpNotice { kind: 'season' | 'autosim'; text: string; }

const INJURY_LABEL: Record<string, string> = { wrist: 'pulso', back: 'coluna', burnout: 'burnout' };
const placeLabel = (p: number) =>
  p === 1 ? ct('Campeão') : p === 2 ? ct('Vice') : p === 3 ? ct('Semifinal') : p === 5 ? ct('3º do grupo') : ct('4º do grupo');
const SQUAD_LABEL: Record<string, string> = { star: ct('Estrela'), starter: ct('Titular'), rotation: ct('Rotação'), bench: ct('Reserva') };
const money = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;

const METERS: { key: LifeMeterKey; label: string; icon: RtpIconName }[] = [
  { key: 'energy', label: ct('Energia'), icon: 'energy' },
  { key: 'fitness', label: ct('Físico'), icon: 'fitness' },
  { key: 'morale', label: ct('Moral'), icon: 'morale' },
  { key: 'focus', label: ct('Foco'), icon: 'focus' },
  { key: 'fame', label: ct('Fama'), icon: 'fame' },
];
const meterColor = (v: number) => (v >= 66 ? 'var(--rtp-win)' : v >= 33 ? 'var(--rtp-warn)' : 'var(--rtp-loss)');

export function RtpOverview({ save, notice, onDismissNotice, onPlayMatch, onAutoSim, onGoTab }: {
  save: RoadToProSave;
  notice: RtpNotice | null;
  onDismissNotice: () => void;
  onPlayMatch: () => void;
  onAutoSim: () => void;
  onGoTab?: (id: 'training' | 'market') => void;
}) {
  const { player, life, team, world, history } = save;
  const circuit = world.league;
  const next = useMemo(() => circuitOpponent(save), [save]);
  const opp = next?.team ?? null;
  const condPct = useMemo(() => Math.round((conditionModifiers(life, save.setup).mod - 1) * 100), [life, save.setup]);

  const recent = useMemo(() => (circuit ? circuitUserMatches(circuit).reverse().slice(0, 6) : []), [circuit]);
  const form = useMemo(() => (circuit ? circuitForm(circuit).slice(-8) : []), [circuit]);
  const ranking = useMemo(() => (circuit ? circuitRanking(circuit).slice(0, 8) : []), [circuit]);
  const avgRating = history.matchesPlayed > 0 ? history.ratingSum / history.matchesPlayed : 0;

  const oppTop = opp ? [...opp.players].sort((a, b) => playerOvr(b) - playerOvr(a)).slice(0, 2) : [];
  const oppMaps = opp ? (Object.entries(opp.mapPrefs ?? {}) as [MapId, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
  const oppRank = opp && circuit ? circuitRanking(circuit).findIndex((t) => t.id === opp.id) + 1 : 0;
  const bgMap = (oppMaps[0]?.[0] ?? 'mirage') as MapId;

  const roster: { id: string; nick: string; role: string; country: string; ovr: number; hero: boolean }[] = [
    { id: 'hero', nick: player.nick, role: player.role, country: player.country, ovr: player.ovr, hero: true },
    ...team.teammates.map((p) => ({ id: p.id, nick: p.nick, role: p.role, country: p.country, ovr: p.ovr, hero: false })),
  ];

  const media = save.media;
  const rival = media?.rival ?? null;
  const headlines = media?.headlines ?? [];
  const followers = media?.followers ?? 0;
  const fmtFollowers = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);
  const sponsorIncome = save.sponsors.reduce((a, s) => a + s.perWeek, 0);

  const boardConf = Math.round(world.boardConfidence ?? 55);
  const boardTier = boardConf >= 66 ? 'good' : boardConf >= 40 ? 'mid' : 'bad';
  const boardColor = boardTier === 'good' ? 'var(--rtp-win)' : boardTier === 'mid' ? 'var(--rtp-warn)' : 'var(--rtp-loss)';
  const boardStatus = boardTier === 'good' ? ct('Confiam no seu trabalho') : boardTier === 'mid' ? ct('Você está sob avaliação') : ct('Você está na berlinda');

  const worldRank = world.worldRank;
  const peakRank = world.peakRank;
  const rkTier = typeof worldRank === 'number' ? rankTier(worldRank) : 'unranked';
  const rkLabel = rkTier === 'top20' ? ct('TOP 20 MUNDIAL') : rkTier === 'top30' ? ct('TOP 30 MUNDIAL') : rkTier === 'ranked' ? ct('No ranking mundial') : ct('Fora do top 200');
  const ladder = useMemo(() => worldLadder(save, 2), [save]);
  const objStatus = useMemo(() => objectiveStatus(save), [save]);
  const streak = life.flags.streak ?? 0;

  // Gráfico REAL de caixa: saldo das últimas semanas normalizado (era decorativo).
  const cashHist = world.cashHist && world.cashHist.length >= 2 ? world.cashHist : [life.money, life.money];
  const cashMin = Math.min(...cashHist), cashMax = Math.max(...cashHist);
  const cashSpan = Math.max(1, cashMax - cashMin);
  const balanceLine = [{ label: ct('Caixa'), values: cashHist.map((v) => 0.12 + 0.8 * ((v - cashMin) / cashSpan)), color: 'var(--em-green)' }];

  return (
    <>
      {notice && (
        <div className={`rtp-notice ${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="rtp-notice-x" onClick={onDismissNotice} aria-label={ct('Fechar')}><RtpIcon name="close" size={14} /></button>
        </div>
      )}
      {life.flags.injured && (
        <div className="rtp-injury">
          <RtpIcon name="injury" size={15} /> {ct('Lesionado')}: {INJURY_LABEL[life.flags.injured.kind] ?? life.flags.injured.kind} · {life.flags.injured.weeksLeft} {ct('semana(s) restante(s)')}
        </div>
      )}

      <div className="em-layout">
        {/* ===== ESQUERDA ===== */}
        <div className="em-col em-col-left">
          <section className="em-card em-nextup">
            <div className="em-nextup-bg" style={{ backgroundImage: `url(${MAP_IMAGES[bgMap]})` }} />
            <div className="em-nextup-scrim" />
            <div className="em-nextup-body">
              <div className="em-card-label">{ct('Próxima série')}</div>
              <div className="em-nextup-event">{circuit?.name ?? ct('Circuito')} | {next?.stage ?? '—'}</div>
              {opp ? (
                <div className="em-nextup-teams">
                  <div className="em-nextup-team">
                    <TeamBadge tag={team.tag} colors={team.colors} size={52} logoUrl={team.logo} />
                    <span>{team.tag}</span>
                  </div>
                  <span className="em-vs">vs</span>
                  <div className="em-nextup-team">
                    <TeamBadge tag={opp.tag} colors={opp.colors} size={52} logoUrl={opp.logoUrl} />
                    <span>{opp.tag}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="em-nextup-done"><IconTrophy size={16} /> {ct('Sem série pendente')}</div>
                  {/* PRÓXIMO PASSO claro (derivado do estado real): sem série na
                      semana → treinar (se sobram ações) ou ver ofertas pendentes. */}
                  {onGoTab && (world.actionsLeft > 0 || (world.pendingOffers ?? []).length > 0) && (
                    <div className="em-nextup-actions">
                      {world.actionsLeft > 0 ? (
                        <button type="button" className="em-btn em-btn-primary" onClick={() => onGoTab('training')}>
                          <RtpIcon name="gym" size={13} /> {ct('Treinar')} · {world.actionsLeft} {world.actionsLeft > 1 ? ct('ações') : ct('ação')}
                        </button>
                      ) : (
                        <button type="button" className="em-btn em-btn-primary" onClick={() => onGoTab('market')}>
                          <RtpIcon name="trade" size={13} /> {ct('Ver ofertas no mercado')}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              <div className="em-nextup-meta">
                <span>{team.teamName}</span>
                <span>MD{next?.bestOf ?? 3} · {ct('Temporada')} {world.season}</span>
              </div>
              {opp && (
                <>
                  <div className={`em-rivalry ${condPct >= 0 ? '' : 'neg'}`}>
                    <IconSwords size={13} /> {ct('Sua condição')} {condPct >= 0 ? '+' : ''}{condPct}%
                  </div>
                  <div className="em-nextup-actions">
                    <button type="button" className="em-btn em-btn-primary" onClick={onPlayMatch}><IconPlay size={13} /> {ct('Jogar')}</button>
                    <button type="button" className="em-btn em-btn-ghost" onClick={onAutoSim}><IconFastForward size={13} /> {ct('Simular')}</button>
                  </div>
                </>
              )}
            </div>
          </section>

          <DashCard title={`${player.nick} · ${SQUAD_LABEL[team.squadRole]}`}>
            <div className="rtp-ov-you">
              <div className="rtp-ov-ovr">
                <svg viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="31" className="rtp-ovrring-track" />
                  <circle cx="36" cy="36" r="31" className="rtp-ovrring-arc" style={{ strokeDasharray: 2 * Math.PI * 31, strokeDashoffset: 2 * Math.PI * 31 * (1 - player.ovr / 99) }} />
                </svg>
                <b>{player.ovr}</b>
              </div>
              <div className="rtp-ov-you-id">
                <div className="rtp-ov-you-name"><Flag cc={player.country} /> <b>{player.role}</b> · {player.age} {ct('anos')}</div>
                <div className="rtp-ov-you-sub">{PERSONALITY_LABEL[player.personality]} · {ct('forma')} {player.form.toFixed(2)}</div>
                <div className="rtp-ov-you-tags">
                  <span className={`rtp-tag ${player.form >= 1.05 ? 'hot' : player.form <= 0.95 ? 'cold' : ''}`}>
                    {player.form >= 1.05 ? <><RtpIcon name="fire" size={11} /> EM ALTA</> : player.form <= 0.95 ? <><RtpIcon name="snow" size={11} /> FRIO</> : 'ESTÁVEL'}
                  </span>
                  {Math.abs(streak) >= 2 && (
                    <span className={`rtp-tag ${streak > 0 ? 'hot' : 'cold'}`}>
                      {streak > 0 ? `${streak} ${ct('vitórias seguidas')}` : `${-streak} ${ct('derrotas seguidas')}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="rtp-ov-meters">
              {METERS.map((m) => {
                const v = Math.round(life[m.key as keyof LifeState] as number);
                return (
                  <div key={m.key} className="rtp-ov-meter">
                    <span className="rtp-ov-meter-top"><RtpIcon name={m.icon} size={11} /> {m.label}<b style={{ color: meterColor(v) }}>{v}</b></span>
                    <div className="rtp-ov-meter-track"><i style={{ width: `${v}%`, background: meterColor(v) }} /></div>
                  </div>
                );
              })}
            </div>
          </DashCard>
        </div>

        {/* ===== CENTRO ===== */}
        <div className="em-col em-col-center">
          {opp && (
            <DashCard title={ct('Relatório do adversário')} className="em-opp-card">
              <div className="em-opp-head">
                <TeamBadge tag={opp.tag} colors={opp.colors} size={40} logoUrl={opp.logoUrl} />
                <div className="em-opp-id">
                  <b>{opp.name}</b>
                  <div className="em-opp-meta">
                    <span>#{oppRank || '—'} {ct('no circuito')}</span>
                    <StarRating value={Math.min(5, opp.strength / 18)} />
                    <span>{ct('Força')} {Math.round(opp.strength)}</span>
                  </div>
                </div>
              </div>
              <div className="em-opp-grid">
                <div className="em-opp-col">
                  <div className="em-section-label">{ct('Destaques')}</div>
                  {oppTop.map((p) => (
                    <div key={p.id} className="em-opp-player">
                      <span className="em-opp-player-info">
                        <b><Flag cc={p.country} /> {p.nick}</b>
                        <span>{p.role} · OVR {playerOvr(p)} · aim {p.aim}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="em-opp-col">
                  <div className="em-section-label">{ct('Melhores mapas')}</div>
                  {oppMaps.length ? oppMaps.map(([map, pref]) => (
                    <div key={map} className="em-map-row">
                      <img src={MAP_IMAGES[map]} alt="" className="em-map-thumb" loading="lazy" decoding="async" />
                      <span>{MAP_LABELS[map]}</span>
                      <div className="em-map-bar"><i style={{ width: `${Math.min(100, Math.max(10, (pref + 3) * 14))}%` }} /></div>
                    </div>
                  )) : <p className="em-empty">{ct('Sem dados.')}</p>}
                </div>
              </div>
            </DashCard>
          )}

          <div className="em-row-2">
            <DashCard title={ct('Finanças')} className="em-fin-card">
              <div className="em-fin-body">
                <div className="em-fin-balance"><span>{ct('Seu dinheiro')}</span><b className="em-fin-big">{money(life.money)}</b></div>
                <div className="em-fin-chart-wrap"><SparkLine series={balanceLine} height={64} hideLegend compact /></div>
                <div className="em-fin-split">
                  <div className="em-fin-stat"><span>{ct('Salário')}</span><b>{money(team.contract.wage)}</b></div>
                  <div className="em-fin-stat"><span>{ct('Patrocínio')}</span><b className={sponsorIncome ? 'pos' : ''}>{money(sponsorIncome)}</b></div>
                  <div className="em-fin-stat">
                    <span>{ct('Contrato')}</span>
                    <b className={team.contract.weeksLeft <= 0 ? 'rtp-ct-expired' : team.contract.weeksLeft <= 6 ? 'rtp-ct-warning' : undefined}>
                      {team.contract.weeksLeft <= 0 ? ct('EXPIRADO — sem salário') : `${team.contract.weeksLeft} ${ct('sem')}`}
                    </b>
                  </div>
                  <div className="em-fin-stat"><span>{ct('Multa')}</span><b>{money(team.contract.buyout)}</b></div>
                </div>
              </div>
            </DashCard>

            <DashCard title={ct('Carreira')} className="em-scout-card">
              <div className="em-scout-ring">
                <svg viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="var(--em-border)" strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke="var(--rtp-signal)" strokeWidth="6"
                    strokeDasharray={`${Math.min(1, avgRating / 1.6) * 213} 213`} strokeLinecap="round" transform="rotate(-90 40 40)" />
                </svg>
                <div className="em-scout-val">{avgRating.toFixed(2)}</div>
              </div>
              <div className="em-scout-label">{ct('Rating médio')}</div>
              <div className="em-scout-stats">
                <div><span>{ct('Partidas')}</span><b>{history.matchesPlayed}</b></div>
                <div><span>MVPs</span><b>{history.mvps}</b></div>
              </div>
            </DashCard>
          </div>

          <DashCard title={ct('Imprensa & mídia')} actions={<span className="rtp-followers-chip"><RtpIcon name="fame" size={12} /> {fmtFollowers(followers)} {ct('seguidores')}</span>}>
            <div className="rtp-headlines">
              {headlines.length === 0 ? (
                <p className="em-empty">{ct('Sem manchetes ainda. Jogue e a imprensa vai falar de você.')}</p>
              ) : headlines.slice(0, 5).map((h) => (
                <div key={h.id} className={`rtp-headline t-${h.tone}`}>
                  <span className="rtp-headline-dot" />
                  <span className="rtp-headline-text">{h.text}</span>
                  <span className="rtp-headline-when">T{h.season}·S{h.week}</span>
                </div>
              ))}
            </div>
          </DashCard>

          <DashCard title={ct('Seu time')} flush>
            <div className="em-roster-scroll" role="region" aria-label={ct('Seu time')} tabIndex={0}>
              <table className="em-roster-table">
                <thead><tr><th>{ct('Jogador')}</th><th>{ct('Função')}</th><th>OVR</th></tr></thead>
                <tbody>
                  {roster.map((p) => (
                    <tr key={p.id} className={p.hero ? 'rtp-ov-hero' : undefined}>
                      <td><span className="rtp-ov-rname"><b>{p.nick}</b>{p.hero && <span className="rtp-ov-youtag">{ct('você')}</span>}</span></td>
                      <td><Flag cc={p.country} /> {p.role}</td>
                      <td><b style={{ color: p.ovr >= 80 ? 'var(--rtp-signal)' : undefined }}>{p.ovr}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashCard>
        </div>

        {/* ===== DIREITA ===== */}
        <div className="em-col em-col-right">
          {typeof worldRank === 'number' && (
            <DashCard title={ct('Ranking mundial')} className={`rtp-wr-card wr-${rkTier}`}>
              <div className="rtp-wr-body">
                <div className="rtp-wr-num"><span className="rtp-wr-hash">#</span><b>{worldRank}</b></div>
                <div className="rtp-wr-meta">
                  <span className={`rtp-wr-badge b-${rkTier}`}>{rkLabel}</span>
                  {typeof peakRank === 'number' && <span className="rtp-wr-peak">{ct('Pico')} #{peakRank}</span>}
                </div>
              </div>
              <div className="rtp-ladder">
                {ladder.top.length > 0 && (
                  <>
                    {ladder.top.map((r) => (
                      <div key={`t${r.rank}`} className="rtp-ladder-row podium">
                        <span className="rtp-ladder-rank">#{r.rank}</span>
                        <Flag cc={r.country} /> <b>{r.nick}</b>
                        <span className="rtp-ladder-team">{r.teamTag}</span>
                      </div>
                    ))}
                    <div className="rtp-ladder-gap">···</div>
                  </>
                )}
                {ladder.window.map((r) => (
                  <div key={`w${r.rank}`} className={`rtp-ladder-row${r.isHero ? ' hero' : ''}`}>
                    <span className="rtp-ladder-rank">#{r.rank}</span>
                    <Flag cc={r.country} /> <b>{r.nick}</b>
                    <span className="rtp-ladder-team">{r.teamTag}</span>
                  </div>
                ))}
              </div>
            </DashCard>
          )}

          <DashCard title={ct('Roadmap da temporada')} className="em-cal-card">
            <div className="em-cal-sub">{TIER_NAME[circuit?.tier ?? 'academy']} · {ct('Temporada')} {world.season}</div>
            <div className="rtp-road">
              {Array.from({ length: EVENTS_PER_SEASON }, (_, i) => i + 1).map((e) => {
                const cur = e === (world.seasonEvent ?? 1);
                const rec = (save.history.timeline ?? []).find((t) => t.season === world.season && t.event === e && !t.major);
                const name = cur ? (circuit?.name ?? circuitEventName(team.tier, world.region, world.season, e)) : circuitEventName(team.tier, world.region, world.season, e);
                return (
                  <div key={e} className={`rtp-road-step${cur ? ' cur' : ''}${rec ? ' done' : ''}`}>
                    <span className="rtp-road-dot">{rec ? (rec.place === 1 ? <RtpIcon name="trophy" size={11} /> : '✓') : e}</span>
                    <div className="rtp-road-info">
                      <b>{rec ? rec.eventName : name}</b>
                      <span>{rec ? `${placeLabel(rec.place)}${rec.award ? ` · ${rec.award.toUpperCase()}` : ''}` : cur ? ct('Em disputa') : ct('A seguir')}</span>
                    </div>
                  </div>
                );
              })}
              <div className={`rtp-road-step major${world.major ? ' cur' : ''}`}>
                <span className="rtp-road-dot"><RtpIcon name="fame" size={11} /></span>
                <div className="rtp-road-info">
                  <b>{world.major ? world.major.name : 'Major'}</b>
                  <span>{world.major ? ct('CLASSIFICADO!') : (MAJOR_CUT[team.tier] ?? 0) > 0 ? `${ct('vaga: top')} ${MAJOR_CUT[team.tier]} ${ct('da última etapa')}` : ct('sem Major na academia')}</span>
                </div>
              </div>
            </div>
            <div className="em-cal-weeks">
              {[ct('Grupos'), ct('Vencedores'), ct('Decisão'), ct('Playoff')].map((lbl, i) => {
                const on = circuit ? (circuit.phase === 'playoffs' ? i === 3 : i === Math.min(2, (circuit.gsl.current ?? 0))) : false;
                return <div key={lbl} className={`em-cal-week${on ? ' on' : ''}`}><div className="em-cal-week-h">{lbl}</div></div>;
              })}
            </div>
          </DashCard>

          {world.objective && (
            <DashCard title={ct('Diretoria')} className="rtp-board-card">
              <div className="rtp-board-obj">
                <span className="rtp-board-obj-lbl">{ct('Meta do campeonato')}</span>
                <b className="rtp-board-obj-txt">{world.objective.label}</b>
                {objStatus && (
                  <span className={`rtp-board-live o-${objStatus.state}`}>
                    {objStatus.state === 'secured' ? '✓ ' : objStatus.state === 'edge' ? '! ' : ''}{objStatus.note}
                  </span>
                )}
              </div>
              <div className="rtp-board-conf">
                <div className="rtp-board-conf-top">
                  <span>{ct('Confiança da diretoria')}</span>
                  <b style={{ color: boardColor }}>{boardConf}</b>
                </div>
                <div className="rtp-board-conf-track"><i style={{ width: `${boardConf}%`, background: boardColor }} /></div>
                <span className={`rtp-board-status s-${boardTier}`}>{boardStatus}</span>
              </div>
            </DashCard>
          )}

          {rival && (
            <DashCard title={ct('Seu rival')} className="rtp-rival-card">
              <div className="rtp-rival-head">
                <TeamBadge tag={rival.tag} colors={rival.colors} size={38} logoUrl={rival.logoUrl} />
                <div className="rtp-rival-id">
                  <b>{rival.orgName}</b>
                  <span className="rtp-rival-star"><RtpIcon name="fame" size={11} /> {rival.playerNick} · {rival.playerRole} · OVR {rival.playerOvr}</span>
                </div>
                <span className="rtp-rival-h2h">{rival.h2h.w}<i>–</i>{rival.h2h.l}</span>
              </div>
              <div className="rtp-rival-heat">
                <span className="rtp-rival-heat-lbl">{ct('Rivalidade')}</span>
                <div className="rtp-rival-heat-track"><i style={{ width: `${rival.intensity}%` }} /></div>
              </div>
              <p className="rtp-rival-taunt">“{rival.taunt}”</p>
            </DashCard>
          )}

          <DashCard title={ct('Últimas partidas')} flush className="em-matches-card">
            <div className="em-matches-list">
              {recent.length === 0 ? <p className="em-empty">{ct('Sem partidas ainda.')}</p> : recent.map((m) => (
                <div key={m.key} className="em-match-row">
                  <span className={`em-match-ind${m.won ? ' win' : ' loss'}`}>{m.won ? <IconTriangleUp size={9} /> : <IconTriangleDown size={9} />}</span>
                  <div className="em-match-info">
                    <span className="em-match-opp">{m.opponent}</span>
                    {m.maps.length > 0 && <span className="em-match-maps">{m.maps.join(' · ')}</span>}
                  </div>
                  <span className={`em-match-score${m.won ? ' win' : ' loss'}`}>{m.score}</span>
                </div>
              ))}
            </div>
          </DashCard>

          <DashCard title={ct('Ranking do circuito')} flush>
            <div className="em-rank-list">
              {ranking.map((t, i) => (
                <div key={t.id}>
                  <div className={`em-rank-row${t.isUser ? ' me' : ''}`}>
                    <span className="em-rank-pos">{i + 1}</span>
                    <TeamBadge tag={t.tag} colors={t.colors} size={20} logoUrl={t.logoUrl} />
                    <span className="em-rank-name">{t.name}</span>
                    <span className="em-rank-pts">{t.wins}-{t.losses}</span>
                  </div>
                  {i === 3 && <div className="rtp-rank-cutline">{ct('linha do playoff')}</div>}
                </div>
              ))}
            </div>
          </DashCard>

          <DashCard title={ct('Forma recente')}>
            <div className="em-form-row">
              {(form.length ? form : (['-', '-', '-', '-'] as const)).map((f, i) => (
                <span key={i} className={`em-form-chip${f === 'W' ? ' win' : f === 'L' ? ' loss' : ''}`}>
                  {f === 'W' ? <IconTriangleUp size={8} /> : f === 'L' ? <IconTriangleDown size={8} /> : '—'}
                </span>
              ))}
            </div>
            <div className="em-form-stats">
              <span>{ct('Pico OVR')} <b>{history.peakOvr}</b></span>
              <span>{ct('Títulos')} <b>{history.trophies.length}</b></span>
            </div>
          </DashCard>
        </div>
      </div>
    </>
  );
}
