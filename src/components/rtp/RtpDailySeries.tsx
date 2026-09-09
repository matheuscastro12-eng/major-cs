// SÉRIE DO DIA — a tela do desafio diário competitivo do RtP.
// Todo mundo joga a MESMA série (fixture determinístico do dia); o rating vai
// pro ranking diário. 1 jogada por dia por conta (o servidor garante; o
// localStorage evita re-abrir). A partida em si é a Sala de sempre.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { track } from '../../state/track';
import { RtpIcon } from './RtpIcon';
import { RtpRoundRoom } from './RtpRoundRoom';
import {
  dailyChallengeOf, finishDailySeries, dailyScoreOf, dailyShareText, dateKeyOf,
  ghostInviteText, type GhostChallenge,
} from '../../engine/rtp/dailySeries';
import { fetchDailyLadder, fetchDailyWeekLadder, reportDailySeries, loadDailyPlayed, saveDailyPlayed, type DailyLadder, type DailyWeekLadder, type DailyPlayed } from '../../state/dailySeriesApi';
import { loadGhost } from '../../state/ghost';
import { useAccount } from '../../state/account';
import { claimWeeklyTitles, fetchWeekPodium, type WeekPodium } from '../../state/dailyWeekPrizesApi';
import { applyWeeklyTitles, weeklyTitleClaimText, WEEK_PRIZE_MIN_FIELD } from '../../engine/rtp/weeklyTitles';
import type { MomentOutcome } from '../../engine/rtp/moments';
import type { MapId } from '../../types';
import type { RoadToProSave, WeeklyTitle } from '../../engine/rtp/types';

const ROLE_LABEL: Record<string, string> = {
  Rifler: 'Rifler', AWP: 'AWPer', Entry: 'Entry fragger', IGL: 'Capitão (IGL)', Lurker: 'Lurker', Support: 'Suporte',
};

type Phase = 'brief' | 'play' | 'result';

// [W1] `save`/`onUpdate` (opcionais): o pódio SEMANAL vira selo no perfil —
// o claim (servidor, idempotente) devolve os selos novos e o cliente aplica
// no save. Sem save (tela avulsa) só mostra o pódio público.
export function RtpDailySeries({ onExit, save, onUpdate }: { onExit: () => void; save?: RoadToProSave; onUpdate?: (next: RoadToProSave) => void }) {
  const dateKey = dateKeyOf(new Date());
  const ch = useMemo(() => dailyChallengeOf(dateKey), [dateKey]);
  const [played, setPlayed] = useState<DailyPlayed | null>(() => loadDailyPlayed(ch.day));
  const [phase, setPhase] = useState<Phase>(played ? 'result' : 'brief');
  const [ladder, setLadder] = useState<DailyLadder | null>(null);
  const [weekLadder, setWeekLadder] = useState<DailyWeekLadder | null>(null);
  const [ladderMode, setLadderMode] = useState<'dia' | 'semana'>('dia');
  const [copied, setCopied] = useState(false);
  const [invited, setInvited] = useState(false);
  const { account } = useAccount();
  // fantasma pendente do DIA (link de desafio aberto antes) — some após expirar
  const [ghost] = useState<GhostChallenge | null>(() => loadGhost(ch.day));

  useEffect(() => {
    let alive = true;
    void fetchDailyLadder(ch.day).then((l) => { if (alive) setLadder(l); });
    void fetchDailyWeekLadder().then((l) => { if (alive) setWeekLadder(l); });
    return () => { alive = false; };
  }, [ch.day, played]);

  // [W1] pódio da última semana fechada (prova social) + claim dos SELOS
  // (1x por montagem; o servidor só devolve o que ainda não foi coletado).
  // O selo é aplicado no save NA HORA (padrão coinsClaim) — um claim gravado
  // e não aplicado seria um título perdido. O callback do claim usa o
  // save/onUpdate ATUAIS via ref (escrita só em efeito — nunca no render).
  const [podium, setPodium] = useState<WeekPodium | null>(null);
  const [newTitles, setNewTitles] = useState<WeeklyTitle[]>([]);
  const latest = useRef<{ save?: RoadToProSave; onUpdate?: (next: RoadToProSave) => void }>({});
  useEffect(() => { latest.current = { save, onUpdate }; }, [save, onUpdate]);
  const canClaim = !!account?.paid && !!save && !!onUpdate;
  const claimed = useRef(false);
  useEffect(() => {
    let alive = true;
    void fetchWeekPodium().then((p) => { if (alive) setPodium(p); });
    if (!claimed.current && canClaim) {
      claimed.current = true;
      void claimWeeklyTitles().then((titles) => {
        if (!alive || !titles.length) return;
        const { save: cur, onUpdate: upd } = latest.current;
        if (cur && upd) upd(applyWeeklyTitles(cur, titles));
        setNewTitles(titles);
      });
    }
    return () => { alive = false; };
  }, [canClaim]);

  const onComplete = async (outcomes: MomentOutcome[], liveMaps?: { map: MapId; score: [number, number]; won: boolean }[]) => {
    const result = finishDailySeries(ch, outcomes, liveMaps);
    const score = dailyScoreOf(result);
    track('daily_series_done', { day: ch.day, rating: score.rating, won: score.won });
    const rep = await reportDailySeries(ch.day, score.rating, score.won, score.mapScore);
    const rec: DailyPlayed = { day: ch.day, rating: score.rating, won: score.won, mapScore: score.mapScore, rank: rep?.rank ?? null, streak: 1 };
    saveDailyPlayed(rec);
    setPlayed(loadDailyPlayed(ch.day) ?? rec);
    setPhase('result');
  };

  const share = async () => {
    if (!played) return;
    const text = dailyShareText(ch.day, { rating: played.rating, won: played.won, mapScore: played.mapScore }, played.rank, played.streak);
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* cancelado */ }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sem clipboard */ }
  };

  // desafio de fantasma: convite com o SEU rating + link — quem abrir joga a
  // mesma série e o jogo compara.
  const invite = async () => {
    if (!played) return;
    const text = ghostInviteText({ day: ch.day, nick: account?.nick || 'um amigo', rating: played.rating });
    track('ghost_invite', { day: ch.day, rating: played.rating });
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* cancelado */ }
    try { await navigator.clipboard.writeText(text); setInvited(true); setTimeout(() => setInvited(false), 1800); } catch { /* sem clipboard */ }
  };

  // resultado do duelo contra o fantasma (rating manda — mesma régua do ranking)
  const ghostBeaten = ghost && played ? played.rating > ghost.rating : null;

  // ── partida (a Sala de sempre, com o fixture do dia) ──
  if (phase === 'play') {
    return (
      // root .rtp OBRIGATÓRIO: a Série do Dia renderiza FORA do RtpShell (early
      // return no RoadToPro) — sem esta classe, todas as vars --rtp-*/--em-*
      // resolvem vazias e a Sala vira texto cru com círculos pretos.
      <div className="rtp rtp-screen rtp-daily" data-fx="on">
        <div className="rtp-daily-topbar">
          <span className="rtp-daily-chip">SÉRIE DO DIA #{ch.day}</span>
          <span className="rtp-daily-topnote">{ct('Hoje você é')} <b>{ch.heroNick}</b> · {ROLE_LABEL[ch.role]}</span>
        </div>
        <RtpRoundRoom save={ch.save} prep={ch.prep} onComplete={(o, m) => { void onComplete(o, m); }} />
      </div>
    );
  }

  return (
    <div className="rtp rtp-screen rtp-daily" data-fx="on">
      <div className="rtp-daily-head">
        <button type="button" className="rtp-btn-ghost" onClick={onExit}><RtpIcon name="chevL" size={14} /> {ct('Voltar')}</button>
        <div className="rtp-daily-title">
          <b>SÉRIE DO DIA <span>#{ch.day}</span></b>
          <span>{ct('A MESMA série pra todo mundo — só a sua jogada muda o rating.')}</span>
        </div>
      </div>

      {/* desafio de fantasma pendente — o motivo de estar aqui */}
      {ghost && !played && (
        <div className="rtp-daily-ghost">
          🥊 <b>{ghost.nick}</b> {ct('te desafiou')}: {ct('rating')} <b>{ghost.rating.toFixed(2)}</b> {ct('nesta série. Jogue a MESMA série e supere.')}
        </div>
      )}

      {/* [W1] selo do pódio semanal recém-coletado — já guardado no perfil */}
      {newTitles.length > 0 && (
        <div className="rtp-daily-ghost won">
          {newTitles.map((t) => (
            <div key={t.week}>{t.place === 1 ? '🏆' : t.place === 2 ? '🥈' : '🥉'} <b>{weeklyTitleClaimText(t)}</b> {ct('Selo guardado no seu perfil.')}</div>
          ))}
        </div>
      )}

      {/* briefing do desafio */}
      <div className="rtp-daily-brief">
        <div className="rtp-daily-brief-row">
          <div className="rtp-daily-brief-cell">
            <span>{ct('VOCÊ JOGA DE')}</span>
            <b>{ROLE_LABEL[ch.role]}</b>
            <em>"{ch.heroNick}" · {ct('mesmo jogador pra todo mundo')}</em>
          </div>
          <div className="rtp-daily-brief-vs">VS</div>
          <div className="rtp-daily-brief-cell">
            <span>{ct('ADVERSÁRIO DO DIA')}</span>
            <b>{ch.prep.opp.name}</b>
            <em>{ch.prep.opp.strength} OVR · MD{ch.prep.bestOf}</em>
          </div>
        </div>
        {phase === 'brief' && !played && (
          <button type="button" className="rtp-cta rtp-daily-go" onClick={() => { track('daily_series_start', { day: ch.day }); setPhase('play'); }}>
            {ct('JOGAR A SÉRIE DO DIA')} →
          </button>
        )}
        {phase === 'brief' && !played && (
          <p className="rtp-daily-once">{ct('Uma chance por dia. O primeiro resultado vale — sem replay pra farmar rating.')}</p>
        )}
      </div>

      {/* resultado do jogador */}
      {played && (
        <div className={`rtp-daily-result ${played.won ? 'w' : 'l'}`}>
          <div className="rtp-daily-rating">
            <b>{played.rating.toFixed(2)}</b>
            <span>{ct('SEU RATING HOJE')}</span>
          </div>
          <div className="rtp-daily-result-meta">
            <b>{played.won ? `${ct('VITÓRIA')} ${played.mapScore[0]}–${played.mapScore[1]}` : `${ct('DERROTA')} ${played.mapScore[0]}–${played.mapScore[1]}`}</b>
            {played.rank != null && played.rank > 0 && <span>{ct('Posição no dia')}: <b>#{played.rank}</b></span>}
            {played.streak >= 2 && <span>🔥 {played.streak} {ct('dias seguidos')}</span>}
          </div>
          {/* veredito do duelo contra o fantasma */}
          {ghost && ghostBeaten != null && (
            <div className={`rtp-daily-ghost ${ghostBeaten ? 'won' : 'lost'}`}>
              {ghostBeaten
                ? <>🥊 {ct('DESAFIO VENCIDO')}: {played.rating.toFixed(2)} × {ghost.rating.toFixed(2)} {ct('de')} <b>{ghost.nick}</b></>
                : <>🥊 <b>{ghost.nick}</b> {ct('segura o desafio')}: {ghost.rating.toFixed(2)} × {played.rating.toFixed(2)} {ct('seu')}</>}
            </div>
          )}
          <div className="rtp-daily-share-row">
            <button type="button" className="rtp-cta" onClick={share}>{copied ? ct('Copiado! Cola no grupo 😉') : ct('Compartilhar resultado')}</button>
            <button type="button" className="rtp-cta rtp-cta-ghostduel" onClick={invite}>{invited ? ct('Link copiado! Manda pro alvo 🥊') : ct('Desafiar um amigo')}</button>
          </div>
          <span className="rtp-daily-tomorrow">{ct('Próxima série à meia-noite.')}</span>
        </div>
      )}

      {/* ranking: DIA (a série de hoje) × SEMANA (acumulado — jogue todo dia) */}
      <div className="rtp-daily-ladder">
        <div className="rtp-daily-ladder-head">
          <div className="rtp-daily-ladder-tabs">
            <button type="button" className={ladderMode === 'dia' ? 'on' : ''} onClick={() => setLadderMode('dia')}>{ct('DIA')}</button>
            <button type="button" className={ladderMode === 'semana' ? 'on' : ''} onClick={() => setLadderMode('semana')}>{ct('SEMANA')}</button>
          </div>
          <span>
            {ladderMode === 'dia'
              ? (ladder ? `${ladder.total} ${ct('jogaram hoje')}` : '…')
              : (weekLadder ? `${ct('semana')} ${weekLadder.week} · ${weekLadder.total} ${ct('na disputa')}` : '…')}
          </span>
        </div>
        {ladderMode === 'dia' ? (
          ladder && ladder.ladder.length > 0 ? (
            <table>
              <tbody>
                {ladder.ladder.slice(0, 10).map((r) => (
                  <tr key={r.rank}>
                    <td className="rk">#{r.rank}</td>
                    <td className="nk">{r.nick}</td>
                    <td className="sc">{`${r.mapScore[0]}–${r.mapScore[1]}`}</td>
                    <td className="rt">{r.rating.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="rtp-daily-empty">{ct('Ninguém jogou ainda — seja o primeiro do dia.')}</p>
          )
        ) : weekLadder && weekLadder.ladder.length > 0 ? (
          <>
            <table>
              <tbody>
                {weekLadder.ladder.slice(0, 10).map((r) => (
                  <tr key={r.rank}>
                    <td className="rk">#{r.rank}</td>
                    <td className="nk">{r.nick}</td>
                    <td className="sc">{r.days}/7 {ct('dias')}</td>
                    <td className="rt">{r.pts.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="rtp-daily-empty" style={{ padding: '8px 0 0' }}>
              {ct('Pontos = SOMA dos ratings da semana — quem falta um dia fica pra trás. A semana vira na segunda.')}
            </p>
          </>
        ) : (
          <p className="rtp-daily-empty">{ct('Semana zerada — o primeiro rating de hoje abre a disputa.')}</p>
        )}
        {/* [W1] o que está em jogo na semana + quem levou a última */}
        {ladderMode === 'semana' && (
          <div className="rtp-daily-empty" style={{ padding: '6px 0 0' }}>
            🏆 {ct('O 1º da semana ganha o selo CAMPEÃO DA SEMANA no perfil; 2º e 3º levam o pódio.')} ({ct('mín.')} {WEEK_PRIZE_MIN_FIELD} {ct('na disputa')})
            {podium && podium.week > 0 && podium.podium.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {ct('Semana')} {podium.week}: {podium.podium.map((r) => `${r.place === 1 ? '🏆' : r.place === 2 ? '🥈' : '🥉'} ${r.nick} (${r.pts.toFixed(2)})`).join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
