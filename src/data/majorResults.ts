// RESULTADOS OFICIAIS do PGL Major Singapore 2026, para o placar do pick'em
// (aba Pick'em do Modo Major, src/components/major/MajorScoreboard.tsx).
//
// Não há backend: o arquivo src/data/major-singapore-2026-results.json vai no
// bundle e o navegador pontua o palpite salvo no localStorage
// (engine/pickemScore.ts). Ele é separado do JSON dos times para a troca pela
// lista oficial (02/11) não conflitar com os PRs de resultado.
//
// ── COMO ATUALIZAR (um PR de dados ao fim de cada Stage e dos playoffs) ──
//   1. Preencha o bloco do Stage que terminou, com o link da fonte.
//   2. Rode:  npx tsx scripts/major-results-check.mts
//      (opcional: --palpite <código do ?p= de um link> para ver um placar)
//   3. Só mergeie com "tudo ok". O teste scripts/test-pickem-score.mts também
//      falha se o arquivo do repo tiver qualquer aviso.
//
// ── FORMATO ──
//   {
//     "stage1": {
//       "qualified": ["id", … 8],  // os 8 que fecharam 3 vitórias (qualquer ordem)
//       "x30": ["id", "id"],       // os 2 que fecharam 3-0 (estão em qualified)
//       "x03": ["id", "id"],       // os 2 que caíram 0-3 (fora de qualified)
//       "source": "https://…",     // página com o resultado (HLTV ou PGL)
//       "updatedAt": "AAAA-MM-DD"  // dia em que o resultado entrou no arquivo
//     },
//     "stage2": { …igual ao stage1 },
//     "stage3": { …igual ao stage1 },
//     "playoffs": {
//       "qf": ["id", … 4],         // vencedores das quartas (qualquer ordem)
//       "sf": ["id", "id"],        // vencedores das semis (estão em qf)
//       "champion": "id",          // campeão (está em sf); null até a final
//       "source": "https://…",
//       "updatedAt": "AAAA-MM-DD"
//     }
//   }
//   - "id" é o campo id de src/data/major-singapore-2026.json (ex.: "team-vitality").
//   - Stage que ainda não terminou: listas vazias e source/updatedAt null.
//   - Os playoffs podem entrar por rodada: só qf (4); depois sf (2); depois champion.
//   - "$comment" é livre (o JSON não aceita comentário).
//
// ── O QUE É CHECADO NO CARREGAMENTO (validateMajorResults) ──
//   id desconhecido, time que não joga aquele Stage, Stage incompleto (≠ 8
//   classificados, 2 de 3-0, 2 de 0-3), 3-0 fora dos classificados, 0-3 entre
//   os classificados, id repetido ou source ausente → aquele Stage (ou os
//   playoffs) é IGNORADO e sai um aviso no console. Chave desconhecida ou
//   updatedAt fora do formato só geram aviso.
import raw from './major-singapore-2026-results.json';
import data from './major-singapore-2026.json';
import { validateMajorResults, type MajorOutcomes, type PickLocks } from '../engine/pickemScore';
import type { MajorData } from '../engine/majorSingapore';

const D = data as unknown as MajorData;
const checked = validateMajorResults(D, raw);
for (const w of checked.warnings) console.warn(`[placar do pick'em] ${w}`);

/** resultados válidos (o que tiver erro já foi descartado) */
export const MAJOR_RESULTS: MajorOutcomes = checked.outcomes;

// Fim do Stage 1 para a mensagem "o placar começa quando o Stage 1 terminar".
// O major-singapore-2026.json tem só start/end/playoffsStart/listDate (sem o
// fim de cada Stage); se um dia ganhar "stage1End", ele vale. Até lá: 27/11,
// Stage 1 de 24 a 27/11 pelo HLTV (hltv.org/events/9303).
const ev = D.event as MajorData['event'] & { stage1End?: unknown };
export const STAGE1_END: string = typeof ev.stage1End === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ev.stage1End) ? ev.stage1End : '2026-11-27';
/** meia-noite do dia seguinte ao fim do Stage 1, em Brasília (UTC-3) */
export const STAGE1_ENDS_MS = Date.parse(`${STAGE1_END}T00:00:00-03:00`) + 24 * 3600 * 1000;

// TRAVAS DO PALPITE (meia-noite de Singapura, UTC+8, no 1º dia de cada parte),
// antes do 1º jogo mesmo que a PGL comece o dia cedo. Stage 1 e playoffs saem do
// JSON (event.start / event.playoffsStart; a PGL confirmou "entre 24 de novembro e
// 13 de dezembro de 2026"). Stage 2 (28/11) e Stage 3 (02/12) seguem o HLTV
// (hltv.org/events/9303: Stage 2 de 28/11 a 01/12; "Stage 3 & Playoffs" a partir
// de 02/12). Na trava o palpite NÃO fica só leitura: o placar usa a foto daquela
// hora (engine/pickemScore.ts → takeSnapshots/scoredPicks), e o jogador segue
// livre pra ajustar os Stages seguintes e enviar ao Pick'em oficial.
const sgMidnight = (day: string) => Date.parse(`${day}T00:00:00+08:00`);
export const PICKEM_LOCKS: PickLocks = {
  s1: sgMidnight(D.event.start),
  s2: sgMidnight('2026-11-28'),
  s3: sgMidnight('2026-12-02'),
  playoffs: sgMidnight(D.event.playoffsStart),
};
/** trava do Stage 1 (23/11 às 13h de Brasília com start 2026-11-24) */
export const PICKEM_LOCK_MS = PICKEM_LOCKS.s1;
