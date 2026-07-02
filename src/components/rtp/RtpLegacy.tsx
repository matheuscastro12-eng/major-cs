import { ct } from '../../state/career-i18n';
import { Flag } from '../ui';
import { RtpIcon } from './RtpIcon';
import { legacyScore, legacyTier, traitById } from '../../engine/rtp/perks';
import { archetypeDef } from '../../engine/rtp/createSave';
import type { RoadToProSave } from '../../engine/rtp/types';

// Tela de LEGADO (RTP v10): encerra a carreira na aposentadoria. Resumo dos
// números, títulos, traits e o veredito do Hall da Fama.
export function RtpLegacy({ save, onReset, onExit }: {
  save: RoadToProSave;
  onReset: () => void;
  onExit: () => void;
}) {
  const { player, history } = save;
  const prog = player.progression;
  const legacy = legacyScore(save);
  const tier = legacyTier(legacy);
  const avgRating = history.matchesPlayed > 0 ? history.ratingSum / history.matchesPlayed : 0;
  const kd = history.deaths > 0 ? history.kills / history.deaths : history.kills;
  const seasons = save.world.season;
  const accolades = history.accolades ?? [];
  const peakRank = save.world.peakRank;

  const verdict = legacy >= 700
    ? 'Uma LENDA do Counter-Strike. Seu nome fica gravado na história do jogo.'
    : legacy >= 450
      ? 'Uma ESTRELA de verdade — daquelas que enchiam arena e definiam eras.'
      : legacy >= 250
        ? 'Um PROFISSIONAL respeitado, de carreira sólida e momentos memoráveis.'
        : legacy >= 130
          ? 'Uma PROMESSA que viveu o sonho e deixou boas lembranças.'
          : 'Um competidor que lutou até o fim. Nem todo mundo chega ao topo — mas você jogou.';

  const STATS: { label: string; value: string; icon: Parameters<typeof RtpIcon>[0]['name'] }[] = [
    { label: ct('Temporadas'), value: `${seasons}`, icon: 'calendar' },
    { label: ct('Partidas'), value: `${history.matchesPlayed}`, icon: 'chart' },
    { label: ct('Rating médio'), value: avgRating.toFixed(2), icon: 'spark' },
    { label: 'K/D', value: kd.toFixed(2), icon: 'crosshair' },
    { label: 'MVPs', value: `${history.mvps}`, icon: 'fame' },
    { label: ct('Nível'), value: `${prog.level}`, icon: 'arrowUp' },
    { label: ct('Pico OVR'), value: `${history.peakOvr}`, icon: 'balance' },
    { label: ct('Títulos'), value: `${history.trophies.length}`, icon: 'trophy' },
    { label: ct('Melhor ranking'), value: typeof peakRank === 'number' ? `#${peakRank}` : '—', icon: 'fame' },
  ];
  const arch = archetypeDef(player.archetype);

  return (
    <div className="rtp rtp-screen rtp-legacy" data-fx="on">
      <div className="rtp-legacy-inner">
        <div className="rtp-legacy-badge"><RtpIcon name="trophy" size={30} /></div>
        <div className="rtp-legacy-kicker">{ct('FIM DE CARREIRA')}</div>
        <h1 className="rtp-legacy-name"><Flag cc={player.country} /> {player.nick}</h1>
        <div className="rtp-legacy-sub">{player.name} · {player.role} · {ct('aposentou aos')} {player.age} · <RtpIcon name={arch.icon} size={12} /> {arch.label}</div>

        <div className="rtp-legacy-tier">
          <span className="rtp-legacy-tier-lbl">{ct('Legado')}</span>
          <b>{tier}</b>
          <span className="rtp-legacy-score">{legacy} {ct('pts')}</span>
        </div>
        <p className="rtp-legacy-verdict">{verdict}</p>

        <div className="rtp-legacy-stats">
          {STATS.map((s) => (
            <div key={s.label} className="rtp-legacy-stat">
              <RtpIcon name={s.icon} size={14} />
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {history.trophies.length > 0 && (
          <div className="rtp-legacy-section">
            <div className="rtp-legacy-section-h">{ct('Galeria de títulos')}</div>
            <div className="rtp-trophies">
              {history.trophies.map((t, i) => <span key={i} className="rtp-trophy"><RtpIcon name="trophy" size={13} /> {t}</span>)}
            </div>
          </div>
        )}

        {(history.timeline ?? []).some((t) => t.place <= 2 || t.award || t.major) && (
          <div className="rtp-legacy-section">
            <div className="rtp-legacy-section-h">{ct('Trajetória — momentos marcantes')}</div>
            <div className="rtp-tl rtp-tl-legacy">
              {(history.timeline ?? []).filter((t) => t.place <= 2 || t.award || t.major).slice(-10).map((t, i) => (
                <div key={i} className={`rtp-tl-row${t.place === 1 ? ' champ' : ''}${t.major ? ' major' : ''}`}>
                  <span className="rtp-tl-when">T{t.season}</span>
                  <div className="rtp-tl-info"><b>{t.eventName}</b><span>{t.teamTag}</span></div>
                  <span className={`rtp-tl-place p-${t.place}`}>{t.place === 1 ? ct('Campeão') : t.place === 2 ? ct('Vice') : `${t.place}º`}{t.award ? ` · ${t.award.toUpperCase()}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {accolades.length > 0 && (
          <div className="rtp-legacy-section">
            <div className="rtp-legacy-section-h">{ct('Prêmios individuais')}</div>
            <div className="rtp-trophies">
              {accolades.map((a) => (
                <span key={a.id} className={`rtp-trophy award a-${a.kind}`}><RtpIcon name="fame" size={13} /> {a.kind.toUpperCase()} · {a.eventName}</span>
              ))}
            </div>
          </div>
        )}

        {prog.traits.length > 0 && (
          <div className="rtp-legacy-section">
            <div className="rtp-legacy-section-h">{ct('Sua marca')}</div>
            <div className="rtp-traits">
              {prog.traits.map((id) => { const t = traitById(id); return t ? <span key={id} className="rtp-trait"><RtpIcon name={t.icon} size={13} /> {t.label}</span> : null; })}
            </div>
          </div>
        )}

        <div className="rtp-legacy-actions">
          <button type="button" className="rtp-cta" onClick={onReset}>{ct('Começar nova carreira')} →</button>
          <button type="button" className="rtp-btn-ghost" onClick={onExit}>{ct('Voltar ao menu')}</button>
        </div>
      </div>
    </div>
  );
}
