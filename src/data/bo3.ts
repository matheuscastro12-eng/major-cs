// Times/jogadores REAIS de CS2 (2026) importados do bo3.gg, usados SÓ no modo
// carreira. Fica em módulo separado pra que esse JSON entre apenas no chunk da
// carreira (lazy), e não no bundle inicial do site.
//
// [realismo FM] Cada jogador sai daqui com `attrs` (a fonte da verdade): os da
// base real de atributos quando a frente de dados entregar o arquivo; até lá,
// derivados com a idade real (bo3-ages) — e os 5 números legados passam a sair
// dos atributos (idênticos aos do JSON enquanto a base real não existir).
import type { Player, TeamSeason } from '../types';
import bo3Json from './bo3-2026.json';
import bo3Ages from './bo3-ages.json';
import { PLAYER_ATTRS_DB, materializeTeams } from './playerAttrs';

const REAL_AGES = bo3Ages as Record<string, { age?: number }>;
const ageOf = (p: Player): number | undefined => {
  const a = p.age ?? REAL_AGES[p.nick]?.age;
  return typeof a === 'number' && a >= 15 && a <= 45 ? a : undefined;
};

export const CS2_REAL_2026: TeamSeason[] = materializeTeams(bo3Json as unknown as TeamSeason[], PLAYER_ATTRS_DB, ageOf);
