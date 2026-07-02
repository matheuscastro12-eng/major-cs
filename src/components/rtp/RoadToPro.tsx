import { useEffect, useState } from 'react';
import { RTPCreate } from './RTPCreate';
import { RTPHub } from './RTPHub';
import { RTPMatch } from './RTPMatch';
import { RTPMajor } from './RTPMajor';
import { RTPTransfer } from './RTPTransfer';
import { confirm as confirmDialog } from '../ConfirmDialog';
import { ct } from '../../state/career-i18n';
import { loadRtp, saveRtp, deleteRtp, syncRtpFromCloud } from '../../state/rtpSaves';
import { type ProMatchResult, type MatchConsequence } from '../../engine/rtp/matchSim';
import { RtpSimResult } from './RtpSimResult';
import { autoSimCircuitRound, type EventEnd } from '../../engine/rtp/circuit';
import { autoSimMajorRound, dismissMajor } from '../../engine/rtp/major';
import { TIER_NAME, type SeasonEndResult } from '../../engine/rtp/league';
import { applyLifeChoice } from '../../engine/rtp/lifeEvents';
import { acceptOffer, negotiateOffer, declineOffers } from '../../engine/rtp/transfers';
import { RtpLegacy } from './RtpLegacy';
import { makeRng } from '../../engine/rng';
import type { RoadToProSave } from '../../engine/rtp/types';

export interface RtpNotice { kind: 'season' | 'autosim'; text: string; }

// RTP v13 — prêmio individual (MVP/EVP) + pulo no ranking mundial, anexado às
// notícias de fim de campeonato/temporada.
function accoladeClause(award?: 'mvp' | 'evp' | null, worldRank?: number, worldRankDelta?: number): string {
  let out = '';
  if (award) out += ` 🏅 ${ct('Você foi')} ${award.toUpperCase()} ${ct('do campeonato!')}`;
  if (typeof worldRank === 'number') {
    const climb = worldRankDelta && worldRankDelta > 0 ? ` (${ct('subiu')} ${worldRankDelta})` : '';
    out += ` ${ct('Ranking mundial')}: #${worldRank}${climb}.`;
  }
  return out;
}

function seasonMessage(ev: SeasonEndResult): string {
  const acc = accoladeClause(ev.award, ev.worldRank, ev.worldRankDelta);
  if (ev.sacked && ev.newTeamName) {
    return `${ct('Temporada encerrada —')} ${ev.placement}º ${ct('lugar')}.${acc} ⚠️ ${ct('A diretoria te DISPENSOU. Você assinou com')} ${ev.newTeamName} ${ct('pra se reerguer.')}`;
  }
  if (ev.champion) return `${ct('CAMPEÃO ELITE! Você é o melhor do mundo.')}${acc}`;
  if (ev.promoted) return `${ct('Promovido para')} ${TIER_NAME[ev.newTier]}! (${ct('terminou em')} ${ev.placement}º)${acc}`;
  if (ev.relegated) return `${ct('Rebaixado para')} ${TIER_NAME[ev.newTier]} (${ct('terminou em')} ${ev.placement}º)${acc}`;
  return `${ct('Temporada encerrada —')} ${ev.placement}º ${ct('lugar')}.${acc}`;
}

function eventMessage(ev: EventEnd): string {
  const head = ev.won ? `🏆 ${ct('CAMPEÃO do')} ${ev.name}!` : `${ct('Fim do')} ${ev.name} — ${ev.place}º ${ct('lugar')}.`;
  const board = ev.objLabel != null
    ? ` ${ct('Meta da diretoria')} (${ev.objLabel}): ${ev.objMet ? ct('cumprida ✓') : ct('não cumprida ✕')}${typeof ev.conf === 'number' ? ` · ${ct('confiança')} ${ev.conf}` : ''}.`
    : '';
  const acc = accoladeClause(ev.award, ev.worldRank, ev.worldRankDelta);
  // Você foi CORTADO: a diretoria perdeu a paciência e um clube menor te recolheu.
  if (ev.sacked && ev.newTeamName) {
    return `${head}${board}${acc} ⚠️ ${ct('A diretoria te DISPENSOU. Você assinou com')} ${ev.newTeamName} ${ct('pra se reerguer.')}`;
  }
  return `${head}${board}${acc} ${ct('Próximo campeonato:')} ${ev.nextName}.`;
}

// Entrada única do modo Road to Pro. Decide entre criação e hub conforme exista
// (ou não) um save. App.tsx só precisa montar este componente numa screen.
export function RoadToPro({ onExit }: { onExit: () => void }) {
  const [save, setSave] = useState<RoadToProSave | null>(() => loadRtp());
  const [booted, setBooted] = useState(false);
  const [playing, setPlaying] = useState(false);   // hub vs partida (liga)
  const [playingMajor, setPlayingMajor] = useState(false);   // partida do Major
  const [notice, setNotice] = useState<RtpNotice | null>(null);
  // Resultado do SIMULAR (modal com placar + stats — não só uma notificação).
  const [simResult, setSimResult] = useState<{ result: ProMatchResult; consequence: MatchConsequence } | null>(null);

  // Boot: tenta restaurar da nuvem se o local estiver vazio (outro aparelho).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!loadRtp()) {
        const r = await syncRtpFromCloud().catch(() => 'none' as const);
        if (alive && r === 'restored') setSave(loadRtp());
      }
      if (alive) setBooted(true);
    })();
    return () => { alive = false; };
  }, []);

  const handleCreated = (next: RoadToProSave) => {
    saveRtp(next);
    setSave(loadRtp()); // recarrega já estampado (createdAt/_v)
  };

  // Atualização in-game (treino, ações, virada de semana): persiste e re-renderiza.
  const handleUpdate = (next: RoadToProSave) => {
    saveRtp(next);
    setSave(next);
  };

  const handleReset = async () => {
    const ok = await confirmDialog({
      title: ct('Recomeçar carreira'),
      message: ct('Isso apaga seu jogador atual do Road to Pro. Não dá pra desfazer. Continuar?'),
      confirmLabel: ct('Apagar e recomeçar'),
      cancelLabel: ct('Manter'),
    });
    if (!ok) return;
    deleteRtp();
    setSave(null);
  };

  const handleRetire = async () => {
    if (!save) return;
    const ok = await confirmDialog({
      title: ct('Anunciar aposentadoria'),
      message: ct('Encerra sua carreira agora e mostra o seu legado. Você continua com este save (só a carreira acaba). Confirmar?'),
      confirmLabel: ct('Me aposentar'),
      cancelLabel: ct('Continuar jogando'),
    });
    if (!ok) return;
    handleUpdate({ ...save, retired: true });
  };

  // Evita um flash da tela de criação enquanto o cloud-sync do boot resolve.
  if (!save && !booted) return null;

  if (!save) {
    return <RTPCreate onExit={onExit} onCreated={handleCreated} />;
  }
  // Carreira encerrada (aposentadoria): tela de legado. Tem prioridade sobre tudo.
  if (save.retired) {
    return <RtpLegacy save={save} onExit={onExit} onReset={() => { deleteRtp(); setSave(null); }} />;
  }
  if (playing) {
    return (
      <RTPMatch
        save={save}
        onExit={() => setPlaying(false)}
        onDone={(next, seasonEnd, eventEnd) => {
          handleUpdate(next);
          setPlaying(false);
          setNotice(
            seasonEnd ? { kind: 'season', text: seasonMessage(seasonEnd) }
              : eventEnd ? { kind: 'season', text: eventMessage(eventEnd) }
                : null,
          );
        }}
      />
    );
  }

  // Major em andamento? Tem prioridade sobre transferências e hub (as ofertas
  // ficam diferidas até o Major resolver).
  const major = save.world.major;
  if (major) {
    if (playingMajor && !major.resolved) {
      return (
        <RTPMatch
          save={save}
          mode="major"
          onExit={() => setPlayingMajor(false)}
          onDone={(next) => { handleUpdate(next); setPlayingMajor(false); }}
        />
      );
    }
    return (
      <RTPMajor
        save={save}
        onPlay={() => setPlayingMajor(true)}
        onSimulate={() => { const c = autoSimMajorRound(save); if (c) handleUpdate(c.save); }}
        onDismiss={() => { if (major.resolved) handleUpdate(dismissMajor(save)); else onExit(); }}
      />
    );
  }

  // Janela de transferências aberta? Tem prioridade sobre o hub.
  const hasOffers = (save.world.pendingOffers ?? []).length > 0;
  if (hasOffers) {
    return (
      <RTPTransfer
        save={save}
        onAccept={(offerId) => { handleUpdate(acceptOffer(save, offerId)); setNotice({ kind: 'season', text: ct('Bem-vindo ao novo time!') }); }}
        onNegotiate={(offerId) => {
          const rng = makeRng((save.rng.seed ^ save.rng.tick ^ 0x71f) >>> 0);
          const { offers, result } = negotiateOffer(save, offerId, rng);
          handleUpdate({ ...save, world: { ...save.world, pendingOffers: offers }, rng: { seed: save.rng.seed, tick: save.rng.tick + 1 } });
          return result;
        }}
        onDecline={() => handleUpdate(declineOffers(save))}
      />
    );
  }

  // Skip: auto-sim da série do circuito + conclui (avança o bracket). O resultado
  // abre em MODAL (placar/mapas/sua linha/consequências) — imersão até no skip.
  const handleAutoSim = () => {
    const res = autoSimCircuitRound(save);
    if (!res) return;
    handleUpdate(res.conclusion.save);
    setSimResult({ result: res.result, consequence: res.consequence });
    setNotice(
      res.conclusion.seasonEnd
        ? { kind: 'season', text: seasonMessage(res.conclusion.seasonEnd) }
        : res.conclusion.eventEnd
          ? { kind: 'season', text: eventMessage(res.conclusion.eventEnd) }
          : null,
    );
  };

  return (
    <>
      <RTPHub
        save={save}
        onExit={onExit}
        onReset={handleReset}
        onRetire={handleRetire}
        onUpdate={handleUpdate}
        onPlayMatch={() => { setNotice(null); setPlaying(true); }}
        onAutoSim={handleAutoSim}
        onResolveEvent={(eventId, optionId) => handleUpdate(applyLifeChoice(save, eventId, optionId))}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
      />
      {simResult && (
        <RtpSimResult result={simResult.result} consequence={simResult.consequence} onClose={() => setSimResult(null)} />
      )}
    </>
  );
}
