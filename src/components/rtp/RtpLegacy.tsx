import { useMemo, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { Flag } from '../ui';
import { RtpIcon } from './RtpIcon';
import { legacyScore, legacyTier, traitById } from '../../engine/rtp/perks';
import { archetypeDef } from '../../engine/rtp/createSave';
import { LEGEND_MARKS, legendBoard } from '../../engine/rtp/legends';
import {
  recordCareerInHall, saveLegacyProfile, setPendingHeir, setPendingLegacyCoach, type HallCareer,
} from '../../state/rtpHall';
import { getManager } from '../../state/manager';
import { useUltimate } from '../../state/ultimate';
import {
  coachFromLegacy, heirFromLegacy, iconFromLegacy, legacyCardKey, legacyFromSave,
} from '../../engine/bridge/legacyBridge';
import type { RoadToProSave } from '../../engine/rtp/types';

// Tela de LEGADO (RTP v10): encerra a carreira na aposentadoria. Resumo dos
// números, títulos, traits e o veredito do Hall da Fama. RTP v15: arquiva a
// carreira no HALL entre carreiras (localStorage separado — sobrevive ao delete
// do save) e mostra as anteriores.
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
  const records = history.records;
  const brokenMarks = LEGEND_MARKS.filter((m) => records?.broken.includes(m.id));
  const pantheon = legendBoard(save);

  // Arquiva no hall entre carreiras no primeiro render (lazy init — roda uma vez;
  // idempotente por id, então re-montar a tela não duplica a entrada).
  // [W2] LEGADO: o perfil completo (stats reais, traits, rival) fica gravado
  // junto do hall — é dele que saem o treinador, o card e o discípulo.
  const profile = useMemo(() => legacyFromSave(save), [save]);
  const [hall] = useState<HallCareer[]>(() => { saveLegacyProfile(profile); return recordCareerInHall(save); });
  const hallId = `hof-${save.createdAt || save.rng.seed}`;

  // Card do Ultimate: concedido UMA vez por carreira (marca em objectivesClaimed).
  const card = useMemo(() => iconFromLegacy(profile), [profile]);
  const cardKey = legacyCardKey(profile.id);
  const claimLegacyCard = useUltimate((st) => st.claimLegacyCard);
  const cardClaimed = useUltimate((st) => st.state.profile.objectivesClaimed.includes(`legacy:${cardKey}`));
  const [cardMsg, setCardMsg] = useState<string | null>(null);
  const claimCard = () => {
    const r = claimLegacyCard(cardKey);
    setCardMsg(r.ok ? ct('Card na sua coleção do Ultimate. Vai lá escalar.') : r.already ? ct('Esse card já é seu.') : ct('Não deu pra gerar o card agora.'));
  };

  // Treinador na Carreira: deixa o ex-pro pendente e abre o ManagerSetup
  // (rota /criar-manager — o App sincroniza a tela pelo popstate).
  const becomeCoach = () => {
    setPendingLegacyCoach(coachFromLegacy(profile, getManager()?.org ?? ''));
    window.history.pushState({}, '', '/criar-manager');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Próxima geração: um discípulo herda país, +1 em 2 atributos da função do
  // mentor e a rivalidade (texto). O save atual é apagado (onReset) e a criação
  // abre já com o herdeiro pendente.
  const nextGeneration = () => {
    const gen = (save.lineage?.generation ?? 1) + 1;
    setPendingHeir(heirFromLegacy(profile, gen));
    onReset();
  };

  const verdict = legacy >= 700
    ? ct('Uma LENDA do Counter-Strike. Seu nome fica gravado na história do jogo.')
    : legacy >= 450
      ? ct('Uma ESTRELA de verdade — daquelas que enchiam arena e definiam eras.')
      : legacy >= 250
        ? ct('Um PROFISSIONAL respeitado, de carreira sólida e momentos memoráveis.')
        : legacy >= 130
          ? ct('Uma PROMESSA que viveu o sonho e deixou boas lembranças.')
          : ct('Um competidor que lutou até o fim. Nem todo mundo chega ao topo — mas você jogou.');

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

        {/* Recordes de dinastia (RTP v15) — marcos de lenda quebrados nesta carreira */}
        {brokenMarks.length > 0 && (
          <div className="rtp-legacy-section">
            <div className="rtp-legacy-section-h">{ct('Recordes históricos quebrados')}</div>
            <div className="rtp-trophies">
              {brokenMarks.map((m) => (
                <span key={m.id} className="rtp-trophy award"><RtpIcon name="spark" size={13} /> {m.label} ({ct('antes de')} {m.holder})</span>
              ))}
            </div>
          </div>
        )}

        {/* Placar de lendas: onde esta carreira parou no panteão */}
        <div className="rtp-legacy-section">
          <div className="rtp-legacy-section-h">{ct('No panteão das lendas')}: #{pantheon.heroPos} {ct('de')} {pantheon.rows.length}</div>
        </div>

        {/* Hall da fama entre carreiras — sobrevive ao delete do save */}
        {hall.length > 1 && (
          <div className="rtp-legacy-section">
            <div className="rtp-legacy-section-h">{ct('Hall da Fama — suas carreiras')}</div>
            <div className="rtp-tl rtp-tl-legacy">
              {hall.slice(0, 8).map((c, i) => (
                <div key={c.id} className={`rtp-tl-row${c.id === hallId ? ' champ' : ''}`}>
                  <span className="rtp-tl-when">#{i + 1}</span>
                  <div className="rtp-tl-info">
                    <b><Flag cc={c.country} /> {c.nick}{c.id === hallId ? ` · ${ct('esta carreira')}` : ''}</b>
                    <span>{c.role} · {c.seasons} {ct('temporadas')} · {c.titles} {ct('título(s)')} · {c.majors} Major(s){typeof c.peakRank === 'number' ? ` · ${ct('pico')} #${c.peakRank}` : ''}</span>
                  </div>
                  <span className="rtp-tl-place">{c.tierLabel} · {c.legacy} {ct('pts')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* [W2] LEGADO — a ponte: o aposentado segue vivo nos outros modos */}
        <div className="rtp-legacy-section">
          <div className="rtp-legacy-section-h">{ct('Seu legado continua')}</div>
          <div className="rtp-tl rtp-tl-legacy">
            <div className="rtp-tl-row">
              <span className="rtp-tl-when">🎓</span>
              <div className="rtp-tl-info">
                <b>{ct('Virar treinador com')} {player.nick}</b>
                <span>{ct('Abre a Carreira com o ex-pro no banco: nick, país e idade de aposentadoria já preenchidos.')}{profile.majors > 0 || profile.titles > 0 ? ` ${ct('Ex-pro')} · ${profile.majors} Major(s) · ${profile.titles} ${ct('título(s)')}.` : ''}</span>
              </div>
              <button type="button" className="rtp-btn-ghost" onClick={becomeCoach}>{ct('Ir pro banco')} →</button>
            </div>
            <div className="rtp-tl-row">
              <span className="rtp-tl-when">🃏</span>
              <div className="rtp-tl-info">
                <b>{ct('Card LEGADO no Ultimate')} · {card.ovr} OVR · {card.role}</b>
                <span>{ct('Gerado dos seus números reais (pico')} {profile.peakOvr}). {ct('Uma vez por carreira, sem moeda. Aparece no Squad Builder com a moldura LEGADO.')}{cardMsg ? ` ${cardMsg}` : ''}</span>
              </div>
              <button type="button" className="rtp-btn-ghost" onClick={claimCard} disabled={cardClaimed}>{cardClaimed ? ct('Já é seu') : ct('Pegar card')}</button>
            </div>
            <div className="rtp-tl-row">
              <span className="rtp-tl-when">⏭️</span>
              <div className="rtp-tl-info">
                <b>{ct('Próxima geração: um discípulo de')} {player.nick}</b>
                <span>{ct('Nova carreira com herança: +1 em 2 atributos de')} {profile.role}{profile.rival ? `, ${ct('e a rixa com')} ${profile.rival.playerNick} ${ct('vem junto')}` : ''}. {ct('Apaga este save.')}</span>
              </div>
              <button type="button" className="rtp-btn-ghost" onClick={nextGeneration}>{ct('Passar o bastão')} →</button>
            </div>
          </div>
        </div>

        <div className="rtp-legacy-actions">
          <button type="button" className="rtp-cta" onClick={onReset}>{ct('Começar nova carreira')} →</button>
          <button type="button" className="rtp-btn-ghost" onClick={onExit}>{ct('Voltar ao menu')}</button>
        </div>
      </div>
    </div>
  );
}
