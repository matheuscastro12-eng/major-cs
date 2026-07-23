// Ficha técnica do pro (#52 do gap Brasval) — setup de jogo (DPI/sens/res/gear)
// derivado DETERMINISTICAMENTE do nick: mesmo jogador → mesma ficha, pra
// sempre, sem inflar o save. Valores sorteados de pools plausíveis da cena
// (eDPI concentrado em 600-1000, resoluções clássicas 4:3 dominantes).
// Puramente cosmético — nada disso alimenta a simulação.

import { hashStr } from '../state/hash';

export interface ProSetup {
  dpi: number;
  sens: number;      // in-game
  edpi: number;      // dpi × sens (o número que a cena compara)
  hz: number;        // polling do mouse
  resolution: string;
  monitor: string;
  mouse: string;
  keyboard: string;
  headset: string;
  crosshair: string; // descrição curta (estilo + cor)
}

const MOUSES = ['Superlight 2', 'Viper V3 Pro', 'DeathAdder V3', 'OP1 8k', 'Xlite V4', 'HTS Plus', 'MZ1 Wireless', 'Starlight-12'];
const MONITORS = ['XL2566K 360Hz', 'PG259QN 360Hz', 'AW2523HF 360Hz', 'XL2546X 240Hz', '27GR95QE 240Hz'];
const KEYBOARDS = ['Wooting 60HE', 'Apex Pro Mini', 'Huntsman V3 Pro TKL', 'MX 8.2 TKL', 'K70 Pro Mini'];
const HEADSETS = ['Arctis Nova Pro', 'Cloud II', 'BlackShark V2 Pro', 'PC38X', 'Virtuoso Max'];
const RESOLUTIONS = ['1280×960 (4:3 esticado)', '1280×960 (4:3 esticado)', '1024×768 (4:3 esticado)', '1440×1080 (4:3)', '1920×1080 (16:9)'];
const XHAIR_STYLE = ['estático mínimo', 'estático clássico', 'dinâmico curto', 'dot puro', 'estático com gap aberto'];
const XHAIR_COLOR = ['ciano', 'verde', 'amarelo', 'magenta', 'branco'];

/** Sorteio determinístico por nick (case-insensitive). */
export function rollProSetup(nick: string): ProSetup {
  const seed = hashStr(`setup:${nick.toLowerCase()}`);
  const at = <T,>(arr: T[], salt: number): T => arr[(seed >>> salt) % arr.length];
  // eDPI alvo 520-1160 (curva da cena: maioria entre 600-1000)
  const edpiTarget = 520 + ((seed >>> 3) % 17) * 40;
  const dpi = (seed & 1) === 0 ? 400 : 800;
  const sens = Math.round((edpiTarget / dpi) * 100) / 100;
  return {
    dpi,
    sens,
    edpi: Math.round(dpi * sens),
    hz: (seed >>> 5) % 3 === 0 ? 8000 : (seed >>> 5) % 3 === 1 ? 4000 : 1000,
    resolution: at(RESOLUTIONS, 7),
    monitor: at(MONITORS, 9),
    mouse: at(MOUSES, 11),
    keyboard: at(KEYBOARDS, 13),
    headset: at(HEADSETS, 15),
    crosshair: `${at(XHAIR_STYLE, 17)} · ${at(XHAIR_COLOR, 19)}`,
  };
}
