// Página pública do Modo Major (/major-singapore) para quem procura "pick'em
// Major Singapura", "PGL Major Singapore 2026" ou "quem vai ganhar o Major".
// Tudo vem do jogo: datas, cidade e os 32 times do JSON
// (src/data/major-singapore-2026.json), formato e textos do Modo Major
// (components/major/majorStrings.ts) e os favoritos calculados no build pelo
// MESMO cálculo do painel "Favoritos" (titleOdds(D, 1000), seed 1). É simulação
// do jogo, e a página diz isso; não somos organizadores do torneio.
import data from '../data/major-singapore-2026.json';
import { MAJOR_SG_PATH } from '../data/majorWindow';
import { majorT } from '../components/major/majorStrings';
import { EXTREME_PICKS, stageEntrants, titleOdds, type MajorData, type MajorTeam } from '../engine/majorSingapore';
import { LANDING, type SeoItem, type SeoPage } from './content';

/** o mesmo número de simulações do painel do Modo Major (MajorSingaporeScreen) */
export const MAJOR_SIM_RUNS = 1000;
/** quantos favoritos a página lista (o painel do jogo mostra 8) */
export const MAJOR_FAV_COUNT = 8;

const D = data as unknown as MajorData;
const t = majorT('pt');

const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
// "2026-11-24" → "24 de novembro" (a data do JSON é de calendário: sem fuso)
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
// "2026-11-24" → "24/11"
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export interface MajorFavoriteOdds { team: MajorTeam; p: number }

/** favoritos ao título na ordem do painel do jogo (maior chance primeiro) */
export function majorFavorites(d: MajorData = D, odds: Map<string, number> = titleOdds(d, MAJOR_SIM_RUNS)): MajorFavoriteOdds[] {
  return [...d.teams]
    .sort((a, b) => (odds.get(b.id) ?? 0) - (odds.get(a.id) ?? 0))
    .slice(0, MAJOR_FAV_COUNT)
    .map((team) => ({ team, p: odds.get(team.id) ?? 0 }));
}

export function majorSeoPage(d: MajorData = D, favs: MajorFavoriteOdds[] = majorFavorites(d)): SeoPage {
  const ev = d.event;
  const official = ev.status === 'oficial';
  // nota curta e própria: o texto do jogo (t('projection')) cita o ranking VRS,
  // mas o JSON ordena a projeção pelo ranking do bo3.gg (event.note)
  const listNote = official ? t('official') : `Lista provisória até a lista oficial, que sai em ${shortDate(ev.listDate)}: até lá, os 32 times são uma projeção do jogo.`;
  const runs = MAJOR_SIM_RUNS.toLocaleString('pt-BR');
  const [f1, f2, f3] = favs;
  const team = (x: MajorTeam): SeoItem => ({ text: x.name });
  const year = ev.start.slice(0, 4);

  return {
    path: MAJOR_SG_PATH,
    file: `p${MAJOR_SG_PATH}.html`,
    nav: t('title'),
    schema: 'page',
    about: ev.name,
    priority: 0.9,
    changefreq: 'daily',
    lastmod: ev.updatedAt,
    title: `${ev.name}: pick'em e quem vai ganhar · Road to Major`,
    description: `Pick'em do ${ev.name} (${shortDate(ev.start)} a ${shortDate(ev.end)}, em ${ev.city}): os 32 times, o formato e os favoritos ao título em ${runs} simulações do jogo. Grátis, sem conta.`,
    kicker: t('title'),
    h1: `${ev.name}: faça seu pick'em`,
    lead: [`${t('dates')} · ${t('playoffsDates')}`, LANDING.heroMajor.sub, LANDING.heroMajor.assure],
    sections: [
      {
        id: 'formato', title: t('formatTitle'),
        blocks: [
          { kind: 'list', ordered: true, items: [t('formatS1'), t('formatS2'), t('formatS3'), t('formatPO')].map((text) => ({ text })) },
          { kind: 'p', text: t('formatNote') },
        ],
      },
      {
        id: 'favoritos', kicker: t('favorites'), title: 'Quem vai ganhar o Major? Os favoritos na simulação',
        blocks: [
          { kind: 'p', text: `Chance de título de cada time em ${runs} simulações do ${ev.name} feitas pelo Road to Major, com a ${official ? 'lista oficial' : 'lista provisória'} de times. É simulação do jogo, não previsão oficial.` },
          { kind: 'list', ordered: true, items: favs.map(({ team: x, p }) => ({ title: x.name, text: pct(p) })) },
        ],
      },
      {
        id: 'times', title: t('teamsTitle'),
        blocks: [
          { kind: 'p', text: listNote },
          { kind: 'h3', text: 'Stage 3 · seeds 1–8' }, { kind: 'list', ordered: true, start: 1, items: stageEntrants(d, 3).map(team) },
          { kind: 'h3', text: 'Stage 2 · seeds 9–16' }, { kind: 'list', ordered: true, start: 9, items: stageEntrants(d, 2).map(team) },
          { kind: 'h3', text: 'Stage 1 · seeds 17–32' }, { kind: 'list', ordered: true, start: 17, items: stageEntrants(d, 1).map(team) },
        ],
      },
      {
        id: 'modo-major', title: 'O que dá pra fazer no Modo Major',
        blocks: [{
          kind: 'list', items: [
            { title: t('tabPickem'), text: 'Escolha quem avança em cada stage, quem fecha 3-0 ou cai 0-3 e monte a chave dos playoffs até o campeão.' },
            { title: t('playTitle'), text: t('playIntro') },
            { title: t('leagueTitle'), text: t('leagueIntro') },
            { title: t('tabSim'), text: t('simEmpty') },
            { title: t('share'), text: "Compartilhe o seu pick'em com link, imagem ou direto no X." },
          ],
        }],
      },
    ],
    faq: [
      LANDING.faqMajor,
      [`Quando é o ${ev.name}?`, `De ${longDate(ev.start)} a ${longDate(ev.end)} de ${year}, em ${ev.city}. ${t('playoffsDates')}, com quartas e semis em MD3 e final em MD5.`],
      ["Como funciona o pick'em?", `Em cada um dos 3 stages você escolhe os 8 que avançam e, se quiser, até ${EXTREME_PICKS} que fecham 3-0 e até ${EXTREME_PICKS} que caem 0-3. Depois monta a chave dos playoffs até o campeão. Pontos: ${t('scoreRule')}`],
      ['Quem é o favorito pra ganhar o Major?', `Na simulação do jogo, ${f1.team.name} (${pct(f1.p)}), ${f2.team.name} (${pct(f2.p)}) e ${f3.team.name} (${pct(f3.p)}) têm as maiores chances de título em ${runs} Majors simulados com a ${official ? 'lista oficial' : 'lista provisória'} de times. É simulação do Road to Major, não previsão oficial.`],
      ['Dá pra jogar o Major com os amigos?', `Sim. ${t('leagueIntro')}`],
    ],
    footnote: 'O Road to Major não organiza o torneio nem tem ligação com a PGL ou a Valve: o Modo Major é um jogo de palpites e simulação.',
  };
}
