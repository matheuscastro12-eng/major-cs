// Times/jogadores REAIS de CS2 (2026) importados do bo3.gg, usados SÓ no modo
// carreira. Fica em módulo separado pra que esse JSON entre apenas no chunk da
// carreira (lazy), e não no bundle inicial do site.
import type { TeamSeason } from '../types';
import bo3Json from './bo3-2026.json';

export const CS2_REAL_2026: TeamSeason[] = bo3Json as unknown as TeamSeason[];
