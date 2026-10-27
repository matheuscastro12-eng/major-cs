// Liga o JSON único da lista ao engine (módulo separado pra ficar no chunk lazy).
import cfgJson from '../../data/major-singapore-2026.json';
import { CS2_REAL_2026 } from '../../data/bo3';
import type { MajorConfig } from './index';

export const MAJOR_SG_CONFIG = cfgJson as unknown as MajorConfig;
export const MAJOR_SG_DATASET = CS2_REAL_2026;
