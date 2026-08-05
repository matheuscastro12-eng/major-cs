// SÉRIE DO DIA — a tela do desafio diário competitivo do RtP.
// Todo mundo joga a MESMA série (fixture determinístico do dia); o rating vai
// pro ranking diário. 1 jogada por dia por conta (o servidor garante; o
// localStorage evita re-abrir). A partida em si é a Sala de sempre.

import { useEffect, useMemo, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { track } from '../../state/track';
import { RtpIcon } from './RtpIcon';
import { RtpRoundRoom } from './RtpRoundRoom';
import {
  dailyChallengeOf, finishDailySeries, dailyScoreOf, dailyShareText, dateKeyOf,
} from '../../engine/rtp/dailySeries';
import { fetchDailyLadder, reportDailySeries, loadDailyPlayed, saveDailyPlayed, type DailyLadder, type DailyPlayed } from '../../state/dailySeriesApi';
import type { MomentOutcome } from '../../engine/rtp/moments';
import type { MapId } from '../../types';

const ROLE_LABEL: Record<string, string> = {
  Rifler: 'Rifler', AWP: 'AWPer', Entry: 'Entry fragger', IGL: 'Capitão (IGL)', Lurker: 'Lurker', Support: 'Suporte',
};

type Phase = 'brief' | 'play' | 'result';

export function RtpDailySeries({ onExit }: { onExit: () => void }) {
  const dateKey = dateKeyOf(new Date());
  const ch = useMemo(() => dailyChallengeOf(dateKey), [dateKey]);
  const [played, setPlayed] = useState<DailyPlayed | null>(() => loadDailyPlayed(ch.day));
  const [phase, setPhase] = useState<Phase>(played ? 'result' : 'brief');
  const [ladder, setLadder] = useState<DailyLadder | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchDailyLadder(ch.day).then((l) => { if (alive) setLadder(l); });
    return () => { alive = false; };
  }, [ch.day, played]);

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

  // ── partida (a Sala de sempre, com o fixture do dia) ──
  if (phase === 'play') {
    return (
      <div className="rtp-daily">
        <div className="rtp-daily-topbar">
          <span className="rtp-daily-chip">SÉRIE DO DIA #{ch.day}</span>
          <span className="rtp-daily-topnote">{ct('Hoje você é')} <b>{ch.heroNick}</b> · {ROLE_LABEL[ch.role]}</span>
        </div>
        <RtpRoundRoom save={ch.save} prep={ch.prep} onComplete={(o, m) => { void onComplete(o, m); }} />
      </div>
    );
  }

  return (
    <div className="rtp-daily">
      <div className="rtp-daily-head">
        <button type="button" className="rtp-btn-ghost" onClick={onExit}><RtpIcon name="chevL" size={14} /> {ct('Voltar')}</button>
        <div className="rtp-daily-title">
          <b>SÉRIE DO DIA <span>#{ch.day}</span></b>
          <span>{ct('A MESMA série pra todo mundo — só a sua jogada muda o rating.')}</span>
        </div>
      </div>

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
          <button type="button" className="rtp-cta" onClick={share}>{copied ? ct('Copiado! Cola no grupo 😉') : ct('Compartilhar resultado')}</button>
          <span className="rtp-daily-tomorrow">{ct('Próxima série à meia-noite.')}</span>
        </div>
      )}

      {/* ranking do dia */}
      <div className="rtp-daily-ladder">
        <div className="rtp-daily-ladder-head">
          <b>{ct('RANKING DO DIA')}</b>
          <span>{ladder ? `${ladder.total} ${ct('jogaram hoje')}` : '…'}</span>
        </div>
        {ladder && ladder.ladder.length > 0 ? (
          <table>
            <tbody>
              {ladder.ladder.slice(0, 10).map((r) => (
                <tr key={r.rank}>
                  <td className="rk">#{r.rank}</td>
                  <td className="nk">{r.nick}</td>
                  <td className="sc">{r.won ? `${r.mapScore[0]}–${r.mapScore[1]}` : `${r.mapScore[0]}–${r.mapScore[1]}`}</td>
                  <td className="rt">{r.rating.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rtp-daily-empty">{ct('Ninguém jogou ainda — seja o primeiro do dia.')}</p>
        )}
      </div>
    </div>
  );
}
