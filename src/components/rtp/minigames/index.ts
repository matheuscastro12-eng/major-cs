// Registry único componente-por-minigame. MiniGameModal (treino) e
// RtpRoundRoom (momentos-chave da Sala) importam DAQUI — antes cada um
// mantinha sua própria cópia e um jogo novo exigia mexer nos dois.
import type { ComponentType } from 'react';
import type { MiniGameId, MiniGameProps } from '../../../engine/rtp/minigames';
import { CrosshairFlick } from './CrosshairFlick';
import { ReactionGate } from './ReactionGate';
import { SprayTracer } from './SprayTracer';
import { CalloutMemory } from './CalloutMemory';
import { TempoLock } from './TempoLock';
import { PrefireRun } from './PrefireRun';
import { NadeArc } from './NadeArc';
import { AngleHold } from './AngleHold';

export const GAME_COMPONENTS: Record<MiniGameId, ComponentType<MiniGameProps>> = {
  flick: CrosshairFlick,
  reaction: ReactionGate,
  spray: SprayTracer,
  memory: CalloutMemory,
  tempo: TempoLock,
  prefire: PrefireRun,
  nade: NadeArc,
  holdangle: AngleHold,
};
