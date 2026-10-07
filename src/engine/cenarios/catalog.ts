// Catálogo do Modo Cenário — situações reais e dramáticas da cena (set/2026).
// O time é casado pelo NOME no elenco vigente; cenário cujo time sumiu do
// dataset (base customizada) simplesmente não aparece.
import type { CenarioDef } from './types.js';

export const CENARIOS: CenarioDef[] = [
  {
    id: 'mibr_rebuild', teamName: 'MIBR', deadline: 6, difficulty: 2,
    start: { board: 50 },
    title: { pt: 'Reconstruir a MIBR', en: 'Rebuild MIBR', es: 'Reconstruir a MIBR' },
    tagline: { pt: 'A sigla mais pesada do Brasil, longe da elite.', en: "Brazil's heaviest badge, far from the elite.", es: 'La sigla más pesada de Brasil, lejos de la élite.' },
    context: {
      pt: 'Setembro de 2026: a MIBR fecha mais um ano fora do Tier 1 e a torcida cobra nas redes. A diretoria te dá duas temporadas para devolver a camisa ao lugar dela.',
      en: 'September 2026: MIBR closes another year outside Tier 1 and the fans are loud online. The board gives you two seasons to put the jersey back where it belongs.',
      es: 'Septiembre de 2026: MIBR cierra otro año fuera del Tier 1 y la afición presiona en redes. La directiva te da dos temporadas para devolver la camiseta a su lugar.',
    },
    objectives: [
      { id: 't1', kind: 'reachTier', param: 1, pts: 300, text: { pt: 'Chegar ao Tier 1', en: 'Reach Tier 1', es: 'Llegar al Tier 1' } },
      { id: 'maj', kind: 'qualifyMajor', pts: 250, text: { pt: 'Classificar pro Major', en: 'Qualify for the Major', es: 'Clasificar al Major' } },
      { id: 'tit', kind: 'winTitles', param: 1, pts: 200, text: { pt: 'Vencer um campeonato', en: 'Win a tournament', es: 'Ganar un campeonato' } },
    ],
  },
  {
    id: 'tier3_ao_major', teamName: 'Fluxo', deadline: 6, difficulty: 3,
    start: {},
    title: { pt: 'Do Tier 3 ao Major', en: 'From Tier 3 to the Major', es: 'Del Tier 3 al Major' },
    tagline: { pt: 'Um time de acesso sul-americano e um sonho.', en: 'A South American access team and a dream.', es: 'Un equipo sudamericano de acceso y un sueño.' },
    context: {
      pt: 'A Fluxo joga o acesso sul-americano com garotos famintos e pouca estrutura. Duas temporadas para fazer o que quase ninguém faz: sair do Tier 3 e pisar num Major.',
      en: 'Fluxo plays the South American access scene with hungry kids and little structure. Two seasons to do what almost nobody does: leave Tier 3 and step onto a Major stage.',
      es: 'Fluxo juega el acceso sudamericano con chicos hambrientos y poca estructura. Dos temporadas para hacer lo que casi nadie hace: salir del Tier 3 y pisar un Major.',
    },
    objectives: [
      { id: 'tit', kind: 'winTitles', param: 1, pts: 150, text: { pt: 'Vencer um campeonato', en: 'Win a tournament', es: 'Ganar un campeonato' } },
      { id: 't2', kind: 'reachTier', param: 2, pts: 200, text: { pt: 'Subir ao Tier 2', en: 'Climb to Tier 2', es: 'Subir al Tier 2' } },
      { id: 'maj', kind: 'qualifyMajor', pts: 400, text: { pt: 'Classificar pro Major', en: 'Qualify for the Major', es: 'Clasificar al Major' } },
    ],
  },
  {
    id: 'org_sem_caixa', teamName: 'paiN', deadline: 6, difficulty: 2,
    start: { budget: 80_000, board: 40 },
    title: { pt: 'Salvar uma org sem caixa', en: 'Save a broke org', es: 'Salvar una org sin caja' },
    tagline: { pt: 'Salários atrasados, patrocínio saindo, elenco bom.', en: 'Late wages, sponsors leaving, a good roster.', es: 'Salarios atrasados, patrocinios yéndose, buena plantilla.' },
    context: {
      pt: 'A paiN tem time para brigar, mas o caixa secou: R$ 80 mil e a diretoria em alerta. Equilibre as contas sem deixar o time cair.',
      en: 'paiN has a roster that can fight, but the bank is dry: R$ 80k and an alarmed board. Balance the books without letting the team drop.',
      es: 'paiN tiene plantilla para pelear, pero la caja se secó: R$ 80 mil y la directiva en alerta. Equilibra las cuentas sin dejar caer al equipo.',
    },
    objectives: [
      { id: 'cash', kind: 'cashAtLeast', param: 1_500_000, pts: 300, text: { pt: 'Fechar um split com R$ 1,5 mi em caixa', en: 'Close a split with R$ 1.5M in the bank', es: 'Cerrar un split con R$ 1,5 M en caja' } },
      { id: 'hold', kind: 'neverDrop', pts: 250, text: { pt: 'Nunca cair de tier', en: 'Never drop a tier', es: 'Nunca bajar de tier' } },
      { id: 'top', kind: 'top4s', param: 2, pts: 150, text: { pt: 'Dois top 4 em campeonatos', en: 'Two top-4 finishes', es: 'Dos top 4 en campeonatos' } },
    ],
  },
  {
    id: 'dinastia_vitality', teamName: 'Vitality', deadline: 9, difficulty: 3,
    start: { board: 70 },
    title: { pt: 'Dinastia: Vitality no topo', en: 'Dynasty: Vitality on top', es: 'Dinastía: Vitality en la cima' },
    tagline: { pt: 'O melhor time do mundo, envelhecendo.', en: 'The best team in the world, getting older.', es: 'El mejor equipo del mundo, envejeciendo.' },
    context: {
      pt: 'A Vitality é a número 1 do mundo, mas o núcleo está envelhecendo e todo mundo quer derrubar o rei. Três temporadas para manter a dinastia de pé e renovar o elenco no caminho.',
      en: "Vitality is world number one, but the core is aging and everyone wants to dethrone the king. Three seasons to keep the dynasty standing and refresh the roster along the way.",
      es: 'Vitality es la número 1 del mundo, pero el núcleo envejece y todos quieren derribar al rey. Tres temporadas para mantener la dinastía y renovar la plantilla en el camino.',
    },
    objectives: [
      { id: 'stay', kind: 'stayTier1', pts: 300, text: { pt: 'Terminar todos os splits no Tier 1', en: 'Finish every split in Tier 1', es: 'Terminar todos los splits en el Tier 1' } },
      { id: 'tit', kind: 'winTitles', param: 4, pts: 300, text: { pt: 'Vencer 4 campeonatos', en: 'Win 4 tournaments', es: 'Ganar 4 campeonatos' } },
      { id: 'wm', kind: 'winMajor', pts: 400, text: { pt: 'Vencer um Major', en: 'Win a Major', es: 'Ganar un Major' } },
    ],
  },
  {
    id: 'furia_major', teamName: 'FURIA', deadline: 3, difficulty: 3,
    start: { board: 55 },
    title: { pt: 'FURIA: o Major que falta', en: 'FURIA: the missing Major', es: 'FURIA: el Major que falta' },
    tagline: { pt: 'Uma temporada. Um troféu que o Brasil espera.', en: 'One season. One trophy Brazil is waiting for.', es: 'Una temporada. Un trofeo que Brasil espera.' },
    context: {
      pt: 'A FURIA chegou ao top 3 do mundo, mas o Major ainda não veio. A pressão é de um país inteiro: você tem uma temporada.',
      en: 'FURIA reached the world top 3, but the Major still has not come. A whole country is pushing: you have one season.',
      es: 'FURIA llegó al top 3 del mundo, pero el Major todavía no llegó. Presiona un país entero: tienes una temporada.',
    },
    objectives: [
      { id: 'top', kind: 'top4s', param: 2, pts: 150, text: { pt: 'Dois top 4 em campeonatos', en: 'Two top-4 finishes', es: 'Dos top 4 en campeonatos' } },
      { id: 'maj', kind: 'qualifyMajor', pts: 150, text: { pt: 'Classificar pro Major', en: 'Qualify for the Major', es: 'Clasificar al Major' } },
      { id: 'wm', kind: 'winMajor', pts: 500, text: { pt: 'Vencer o Major', en: 'Win the Major', es: 'Ganar el Major' } },
    ],
  },
  {
    id: 'falcons_superteam', teamName: 'Falcons', deadline: 3, difficulty: 2,
    start: { budget: 400_000, board: 45 },
    title: { pt: 'Falcons: superteam sem desculpa', en: 'Falcons: no-excuse superteam', es: 'Falcons: superteam sin excusas' },
    tagline: { pt: 'Folha milionária, paciência zero.', en: 'Million-dollar payroll, zero patience.', es: 'Planilla millonaria, paciencia cero.' },
    context: {
      pt: 'A Falcons montou um elenco de estrelas e o dono quer troféus agora. Diretoria impaciente, pouco caixa sobrando: ganhe já ou o projeto acaba.',
      en: 'Falcons built a star roster and the owner wants trophies now. Impatient board, little cash left: win now or the project ends.',
      es: 'Falcons armó una plantilla de estrellas y el dueño quiere trofeos ya. Directiva impaciente, poca caja: gana ya o el proyecto se acaba.',
    },
    objectives: [
      { id: 'tit', kind: 'winTitles', param: 2, pts: 300, text: { pt: 'Vencer 2 campeonatos', en: 'Win 2 tournaments', es: 'Ganar 2 campeonatos' } },
      { id: 'stay', kind: 'stayTier1', pts: 150, text: { pt: 'Terminar a temporada no Tier 1', en: 'Finish the season in Tier 1', es: 'Terminar la temporada en el Tier 1' } },
      { id: 'wm', kind: 'winMajor', pts: 400, text: { pt: 'Vencer o Major', en: 'Win the Major', es: 'Ganar el Major' } },
    ],
  },
];

export const cenarioById = (id: string): CenarioDef | undefined => CENARIOS.find((c) => c.id === id);
