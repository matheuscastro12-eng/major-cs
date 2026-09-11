// [U05] PRIMEIRA SESSÃO GUIADA — jornada persistente e retomável, PURA.
//
// O onboarding terminava no reveal ("Fechar / Ver coleção") e o jogador ficava
// solto no hub. A jornada dá o próximo passo explícito até a 2ª partida:
//   starter → strength → training → report → adjust → second → goal
// Cada etapa é marcada por um FATO (recebeu o time, viu a leitura, concluiu a
// partida, fechou o relatório, mexeu no squad, concluiu a 2ª, escolheu o
// objetivo) — nada de timer. O estado vive fora do save (localStorage do
// navegador): não é patrimônio, não sincroniza, e refresh retoma a etapa.
// Dispensável ("Pular") para veterano; quem já está `onboarded` nunca ganha
// starter de novo (guarda na store).
export type JourneyStep = 'starter' | 'strength' | 'training' | 'report' | 'adjust' | 'second' | 'goal';
export const JOURNEY_STEPS: JourneyStep[] = ['starter', 'strength', 'training', 'report', 'adjust', 'second', 'goal'];

export interface JourneyState {
  v: 1;
  done: JourneyStep[];      // etapas concluídas (fatos), em ordem
  dismissed: boolean;       // veterano pulou o tutorial
}
export const JOURNEY_VERSION = 1 as const;

export const STEP_INFO: Record<JourneyStep, { title: string; hint: string; cta: string }> = {
  starter:  { title: 'Receba seu time', hint: 'Cinco cartas reais de 2026 com o esquema que você escolheu.', cta: 'Receber time' },
  strength: { title: 'Conheça a força do elenco', hint: 'A leitura mostra onde o time é forte e onde vaza — e você escolhe a abordagem.', cta: 'Ver leitura' },
  training: { title: 'Treino curto contra a IA', hint: 'Amistoso, sem risco de rank: só pra sentir o time jogando.', cta: 'Jogar treino' },
  report:   { title: 'Leia o relatório', hint: 'O que aconteceu na partida, com evidência — e o que ajustar.', cta: 'Ver relatório' },
  adjust:   { title: 'Ajuste o squad (grátis)', hint: 'Troque um slot ou mude a formação. Química e função contam.', cta: 'Ajustar squad' },
  second:   { title: 'Segunda partida', hint: 'Veja o ajuste em campo. Ainda sem risco.', cta: 'Jogar de novo' },
  goal:     { title: 'Escolha um objetivo', hint: 'Um alvo na loja ou na coleção. O resto do jogo é chegar lá.', cta: 'Escolher objetivo' },
};

export function emptyJourney(): JourneyState { return { v: JOURNEY_VERSION, done: [], dismissed: false }; }

export function normalizeJourney(v: unknown): JourneyState {
  if (!v || typeof v !== 'object') return emptyJourney();
  const o = v as Partial<JourneyState>;
  const done = Array.isArray(o.done) ? o.done.filter((s): s is JourneyStep => JOURNEY_STEPS.includes(s as JourneyStep)) : [];
  // mantém a ordem canônica e sem duplicata
  const ordered = JOURNEY_STEPS.filter((s) => done.includes(s));
  return { v: JOURNEY_VERSION, done: ordered, dismissed: o.dismissed === true };
}

export function isDone(j: JourneyState, step: JourneyStep): boolean { return j.done.includes(step); }

/** Próxima etapa pendente (null = jornada completa ou dispensada). */
export function nextStep(j: JourneyState): JourneyStep | null {
  if (j.dismissed) return null;
  return JOURNEY_STEPS.find((s) => !j.done.includes(s)) ?? null;
}

export function journeyComplete(j: JourneyState): boolean { return JOURNEY_STEPS.every((s) => j.done.includes(s)); }

/** Marca uma etapa concluída (idempotente). Só avança em ORDEM: um fato de etapa
 *  posterior (ex.: 2ª partida) não conta antes da anterior, senão o checklist
 *  fica com buracos e o "próximo passo" perde sentido. */
export function completeStep(j: JourneyState, step: JourneyStep): JourneyState {
  if (j.done.includes(step)) return j;
  const idx = JOURNEY_STEPS.indexOf(step);
  const prevDone = JOURNEY_STEPS.slice(0, idx).every((s) => j.done.includes(s));
  if (!prevDone) return j;
  return { ...j, done: JOURNEY_STEPS.filter((s) => j.done.includes(s) || s === step) };
}

export function dismissJourney(j: JourneyState): JourneyState { return { ...j, dismissed: true }; }

/** Um save já onboarded que nunca viu a jornada (veterano) começa com 'starter' feito. */
export function seedFromProfile(j: JourneyState, onboarded: boolean, matchesPlayed: number): JourneyState {
  let s = j;
  if (onboarded) s = completeStep(s, 'starter');
  // veterano com histórico: a jornada não faz sentido — dispensa sozinha
  if (onboarded && matchesPlayed >= 3 && s.done.length <= 1) s = dismissJourney(s);
  return s;
}

/** Ação de UI para cada etapa (a tela decide a navegação; aqui só o rótulo). */
export function journeyProgress(j: JourneyState): { done: number; total: number } {
  return { done: j.done.length, total: JOURNEY_STEPS.length };
}
