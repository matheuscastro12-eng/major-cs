// Modo Cenário — tipos. Um Cenário é uma Carreira que começa numa situação real
// e dramática da cena (set/2026), com estado inicial próprio, objetivos com
// prazo (em splits), nota final (S/A/B/C) e medalha. O Desafio da Semana é um
// Cenário escolhido pela semana ISO, com a seed do mundo fixa (igual pra todos).
// Tudo aqui é puro e determinístico: o servidor reusa as MESMAS funções pra
// recalcular a pontuação a partir do log (nunca confia no número do cliente).

export type CenLang = 'pt' | 'en' | 'es';
/** Texto nos três idiomas (o engine não depende do i18n da UI). */
export interface L { pt: string; en: string; es: string }
export const tr = (t: L, lang: CenLang): string => t[lang] ?? t.pt;

export type ObjectiveKind =
  | 'reachTier'     // terminar um split no tier <= param (1 = elite)
  | 'stayTier1'     // terminar TODOS os splits do prazo no Tier 1
  | 'neverDrop'     // nunca terminar um split abaixo do tier inicial
  | 'qualifyMajor'  // classificar pro Major
  | 'winMajor'      // vencer o Major
  | 'winTitles'     // vencer `param` campeonatos (etapas do circuito)
  | 'top4s'         // `param` campanhas de top 4 em etapas
  | 'cashAtLeast';  // fechar um split com caixa >= param

export interface ObjectiveDef {
  id: string;
  kind: ObjectiveKind;
  param?: number;
  pts: number;      // pontos ao cumprir
  text: L;
}

export interface CenarioDef {
  id: string;
  teamName: string;       // casado pelo nome no elenco vigente (CS2_REAL_2026)
  title: L;
  context: L;
  tagline: L;             // frase curta do card
  deadline: number;       // prazo em splits (3 splits = 1 temporada)
  start: { budget?: number; board?: number };
  objectives: ObjectiveDef[];
  difficulty: 1 | 2 | 3;  // estrelas de dificuldade (só exibição)
}

export type ModifierId = 'sub21' | 'zeroBudget' | 'national';
export interface ModifierDef { id: ModifierId; mult: number; title: L; desc: L }

/** Uma linha do log: um fechamento de etapa ('e'), de split ('s') ou do Major ('m'). */
export interface CenLogEntry {
  s: number;              // split
  p: 'e' | 's' | 'm';
  c?: 1;                  // campeão da etapa
  pos?: number;           // colocação final na etapa
  q?: 1;                  // classificou pro Major
  w?: 1;                  // venceu o Major
  t: number;              // tier ao fim do registro
  b: number;              // caixa (R$) arredondado em milhares
  /** modificadores QUEBRADOS neste registro (elenco fora da regra) */
  x?: ModifierId[];
}

/** Estado do Cenário em curso (vai dentro de save.scenario.run). */
export interface CenarioRun {
  v: 1;
  defId: string;
  startSplit: number;
  startTier: number;
  mods: ModifierId[];
  weekly?: string;        // id da semana (ex.: 'wk-2026-41') quando é o Desafio da Semana
  seed?: string;          // seed fixa do mundo usada
  log: CenLogEntry[];
  submitted?: number;     // última pontuação enviada ao ranking
}

export type Grade = 'S' | 'A' | 'B' | 'C';
export type Medal = 'diamante' | 'ouro' | 'prata' | 'bronze';

export interface ObjectiveStatus { def: ObjectiveDef; doneAt: number | null; failed: boolean }
export interface CenarioResult {
  objectives: ObjectiveStatus[];
  objPts: number;
  objMax: number;
  speed: number;
  perf: number;
  base: number;
  mult: number;
  modsKept: ModifierId[];
  score: number;
  grade: Grade;
  medal: Medal;
  endSplit: number;       // último split do prazo
  finished: boolean;      // prazo encerrado OU todos os objetivos cumpridos
  allDone: boolean;
}
