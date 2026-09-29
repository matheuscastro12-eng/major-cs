// [fase 4] Save da Carreira v29 → v30: grava o bloco `mundo` (calendário,
// resultados do mundo, VRS, jovens gerados, gerações e base usada) com os
// padrões de cada frente. Idempotente.
import type { MundoState } from './model';
import { defaultCalendar, defaultResults, defaultVrs } from './circuito';
import { defaultNewgens, defaultIntake } from './juventude';
import { defaultDatabaseId } from './editor';

type Save = Record<string, unknown> & { mundo?: MundoState };

export function migrateMundo(save: Save): Save {
  if (save.mundo && (save.mundo as MundoState).v === 1) return save;
  const mundo: MundoState = {
    v: 1,
    calendar: defaultCalendar(save),
    results: defaultResults(save),
    vrs: defaultVrs(save),
    newgens: defaultNewgens(save),
    intake: defaultIntake(save),
    databaseId: defaultDatabaseId(save),
  };
  return { ...save, mundo };
}
