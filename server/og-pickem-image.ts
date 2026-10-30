// PNG 1200x630 do preview do pick'em (api/og-pickem.ts). Visual Broadcast Desk
// (marinho, dourado, Oswald/Barlow Condensed), legível em miniatura de ~400 px:
// à esquerda o campeão grande; à direita a final e quem caiu nas semis.
//
// Motor: satori (árvore de elementos → SVG, texto vira caminho) + resvg em
// WASM (SVG → PNG). É o mesmo par que o @vercel/og embrulha, sem o sharp
// nativo que ele puxa como dependência opcional. Sem rede: fontes OFL em
// server/og-assets/ e logos SÓ de public/logos (nada de Liquipedia), lidos do
// disco na 1ª chamada (vercel.json → functions.includeFiles).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import satori from 'satori';
import type { MajorTeam } from '../src/engine/majorSingapore.js';
import type { PickemSummary } from './og-pickem.js';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// tokens do Broadcast Desk (src/styles/tokens.css); aqui não há CSS
const NAVY = '#070d19';
const NAVY_2 = '#0e1829';
const LINE = '#243757';
const GOLD = '#e8b64a';
const INK = '#eaf0f8';
const DIM = '#8fa2bf';

/**
 * Logo local por time do Major. Só onde src/data/media.ts já mapeia a versão
 * atual (2022+) do time; Liquid e NiP ficam de fora porque o arquivo local é o
 * escudo antigo. Sem logo → a sigla nas cores do time.
 */
export const MAJOR_LOGOS: Record<string, string> = {
  'team-vitality': 'vitality.png',
  'team-spirit': 'spirit.png',
  'team-falcons': 'falcons.png',
  'natus-vincere': 'navi.png',
  mouz: 'mouz.png',
  legacy: 'legacy.png',
  'the-mongolz': 'mongolz.png',
  furia: 'furia.png',
  'g2-esports': 'g2.png',
  '9z': '9z.png',
  'pain-gaming': 'pain.png',
  'faze-clan': 'faze.png',
  heroic: 'heroic.png',
  tyloo: 'tyloo.png',
};

// ------------------------------------------------------------ árvore (pura)

type Style = Record<string, string | number>;
export interface OgNode {
  type: 'div' | 'img';
  props: { style: Style; children?: OgChild | OgChild[]; src?: string; width?: number; height?: number };
}
type OgChild = OgNode | string;

const div = (style: Style, children?: OgChild | OgChild[]): OgNode => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

/**
 * Tamanho de fonte para o texto caber numa linha. Oswald em caixa alta tem em
 * média ~0,56 em de avanço por letra; `ratio` dá folga. Truncar com reticências
 * fica de rede de segurança.
 */
export function fitFont(text: string, maxWidth: number, max: number, min: number, ratio = 0.58): number {
  const len = Math.max(1, [...text].length);
  return Math.max(min, Math.min(max, Math.floor(maxWidth / (len * ratio))));
}

const HEX = /^#[0-9a-f]{6}$/i;
const teamColors = (t: MajorTeam): [string, string] => {
  const [bg, fg] = t.colors ?? [];
  return [bg && HEX.test(bg) ? bg : NAVY_2, fg && HEX.test(fg) ? fg : INK];
};

/** logo (fundo branco: os arquivos locais têm fundo claro) ou a sigla nas cores do time */
function badge(t: MajorTeam, size: number, logo: string | undefined): OgNode {
  if (logo) {
    const pad = Math.round(size * 0.12);
    return div({ width: size, height: size, flexShrink: 0, backgroundColor: '#ffffff', borderRadius: Math.round(size * 0.1), alignItems: 'center', justifyContent: 'center' }, {
      type: 'img',
      props: { src: logo, width: size - pad * 2, height: size - pad * 2, style: { width: size - pad * 2, height: size - pad * 2, objectFit: 'contain' } },
    });
  }
  const [bg, fg] = teamColors(t);
  const tag = t.tag.toUpperCase().slice(0, 4);
  return div({
    width: size, height: size, flexShrink: 0, backgroundColor: bg, border: `2px solid ${fg}`, borderRadius: Math.round(size * 0.1),
    alignItems: 'center', justifyContent: 'center', color: fg, fontFamily: 'Oswald', fontWeight: 700,
    fontSize: Math.round(size * (tag.length > 3 ? 0.3 : 0.38)),
  }, tag);
}

// largura útil: 1200 − 2×64 de margem = 1072 = campeão 540 + 36 + painel 496
const CHAMP_WIDTH = 540;
const PANEL_GAP = 36;
// painel 496 − 2×28 de padding − 2×2 de borda − 6 de filete − 14 − badge 40 − 16
const ROW_NAME_WIDTH = 360;

function row(t: MajorTeam, logo: string | undefined, highlight: boolean): OgNode {
  const name = t.name.toUpperCase();
  return div({ alignItems: 'center', height: 56, paddingLeft: 14, borderLeft: `6px solid ${highlight ? GOLD : LINE}`, backgroundColor: highlight ? '#16233a' : NAVY }, [
    badge(t, 40, logo),
    div({
      marginLeft: 16, width: ROW_NAME_WIDTH, color: highlight ? INK : DIM, fontFamily: 'Oswald', fontWeight: 500,
      fontSize: fitFont(name, ROW_NAME_WIDTH, 38, 24), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }, name),
  ]);
}

/**
 * Nome do campeão: uma linha grande; se não couber a ≥ 76 px e tiver mais de
 * uma palavra, quebra em duas linhas equilibradas.
 */
export function championLines(name: string): { lines: string[]; size: number } {
  const one = fitFont(name, CHAMP_WIDTH, 124, 0);
  const words = name.split(/\s+/).filter(Boolean);
  if (one >= 76 || words.length < 2) return { lines: [name], size: Math.max(one, 56) };
  let best: string[] = [name];
  let bestLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const longest = Math.max([...a].length, [...b].length);
    if (longest < bestLen) { bestLen = longest; best = [a, b]; }
  }
  // duas linhas: teto menor (e badge menor no card) pra caber em 630 de altura
  const size = Math.min(...best.map((l) => fitFont(l, CHAMP_WIDTH, 84, 56)));
  return { lines: best, size };
}

const label = (text: string, color: string, size: number, extra: Style = {}): OgNode =>
  div({ color, fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: size, letterSpacing: 3, ...extra }, text);

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** árvore do card; `logoOf` devolve data URL da logo local (ou undefined) */
export function pickemCardTree(s: PickemSummary, logoOf: (t: MajorTeam) => string | undefined): OgNode {
  const champ = championLines(s.champion.name.toUpperCase());
  const [, accent] = teamColors(s.champion);
  return div({ width: OG_WIDTH, height: OG_HEIGHT, position: 'relative', flexDirection: 'column', backgroundColor: NAVY, color: INK }, [
    // moldura + filete dourado (o mesmo do card de canvas do cliente)
    div({ position: 'absolute', top: 14, left: 14, width: OG_WIDTH - 28, height: OG_HEIGHT - 28, border: `2px solid ${LINE}` }),
    div({ position: 'absolute', top: 14, left: 14, width: OG_WIDTH - 28, height: 6, backgroundColor: GOLD }),

    div({ flexDirection: 'column', width: OG_WIDTH, height: OG_HEIGHT, padding: '50px 64px 42px' }, [
      // cabeçalho
      div({ justifyContent: 'space-between', alignItems: 'center' }, [
        div({ alignItems: 'center' }, [
          label("PICK'EM", GOLD, 30),
          label(s.event.name.toUpperCase(), INK, 30, { marginLeft: 18 }),
        ]),
        label(`${s.event.city.toUpperCase()} · ${ddmm(s.event.start)} – ${ddmm(s.event.end)}`, DIM, 26),
      ]),

      div({ flexGrow: 1, marginTop: 30 }, [
        // campeão
        div({ flexDirection: 'column', width: CHAMP_WIDTH }, [
          label('MEU CAMPEÃO', GOLD, 34),
          div({ marginTop: 18 }, [badge(s.champion, champ.lines.length > 1 ? 112 : 140, logoOf(s.champion))]),
          div({ flexDirection: 'column', marginTop: 14 }, champ.lines.map((l) => div({
            width: CHAMP_WIDTH, fontFamily: 'Oswald', fontWeight: 700, lineHeight: 1.05, fontSize: champ.size,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }, l))),
          div({ marginTop: 10, width: 112, height: 8, backgroundColor: accent }),
        ]),
        // final e semis
        div({ flexDirection: 'column', flexGrow: 1, marginLeft: PANEL_GAP, padding: '22px 28px', backgroundColor: NAVY_2, border: `2px solid ${LINE}` }, [
          label('FINAL', DIM, 26),
          div({ flexDirection: 'column', marginTop: 10 }, [
            row(s.champion, logoOf(s.champion), true),
            div({ marginTop: 8 }, [row(s.runnerUp, logoOf(s.runnerUp), false)]),
          ]),
          label('SEMIFINAIS', DIM, 26, { marginTop: 18 }),
          div({ flexDirection: 'column', marginTop: 10 }, [
            row(s.semis[0], logoOf(s.semis[0]), false),
            div({ marginTop: 8 }, [row(s.semis[1], logoOf(s.semis[1]), false)]),
          ]),
        ]),
      ]),

      // rodapé
      div({ justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18 }, [
        div({ color: GOLD, fontFamily: 'Oswald', fontWeight: 500, fontSize: 34 }, 'roadtomajor.com.br'),
        label("FAÇA O SEU PICK'EM", DIM, 26),
      ]),
    ]),
  ]);
}

// ------------------------------------------------------------ assets (disco)

type FontSpec = { name: string; data: Buffer; weight: 500 | 600 | 700; style: 'normal' };
let fonts: FontSpec[] | null = null;
const logoCache = new Map<string, string | undefined>();
let wasmReady: Promise<void> | null = null;

const asset = (rel: string) => readFileSync(new URL(rel, import.meta.url));

function loadFonts(): FontSpec[] {
  if (!fonts) {
    fonts = [
      { name: 'Oswald', data: asset('./og-assets/Oswald-700.ttf'), weight: 700, style: 'normal' },
      { name: 'Oswald', data: asset('./og-assets/Oswald-500.ttf'), weight: 500, style: 'normal' },
      { name: 'Barlow Condensed', data: asset('./og-assets/BarlowCondensed-600.ttf'), weight: 600, style: 'normal' },
    ];
  }
  return fonts;
}

/** data URL da logo local do time (nome de arquivo só da tabela fixa, nunca da query) */
export function localLogo(t: MajorTeam): string | undefined {
  if (logoCache.has(t.id)) return logoCache.get(t.id);
  const file = MAJOR_LOGOS[t.id];
  let url: string | undefined;
  if (file) {
    try {
      const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
      url = `data:${mime};base64,${asset(`../public/logos/${file}`).toString('base64')}`;
    } catch {
      url = undefined; // arquivo sumiu: cai na sigla, a imagem sai mesmo assim
    }
  }
  logoCache.set(t.id, url);
  return url;
}

function ensureResvg(): Promise<void> {
  if (!wasmReady) {
    const wasm = readFileSync(createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm'));
    wasmReady = initWasm(wasm).catch((e: unknown) => {
      wasmReady = null;
      throw e;
    });
  }
  return wasmReady;
}

/** PNG do palpite (1200x630) */
export async function renderPickemPng(s: PickemSummary): Promise<Uint8Array> {
  const tree = pickemCardTree(s, localLogo);
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width: OG_WIDTH, height: OG_HEIGHT, fonts: loadFonts() });
  await ensureResvg();
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } });
  const img = resvg.render();
  const png = img.asPng();
  img.free();
  resvg.free();
  return png;
}
