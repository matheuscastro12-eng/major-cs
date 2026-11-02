// Lista das páginas públicas com HTML pré-renderizado (ordem do sitemap). Os
// textos vêm de ./content.ts (cópia da landing) e ./major.ts (Modo Major).
import { MAJOR_FAVORITES, MAJOR_SG_MILESTONES, landingDoors, landingHero, landingModes, type LandingDoorId, type LandingModeId } from '../data/majorLanding';
import { MAJOR_SG_PATH } from '../data/majorWindow';
import { DAILY_GAMES } from '../engine/daily/lines';
import { LANDING, withDefaultPrice, type SeoPage, type SeoSection } from './content';
import { majorSeoPage } from './major';

// páginas públicas que têm HTML próprio (as portas/modos da landing linkam pra elas)
const PAGE_OF: Partial<Record<LandingDoorId | LandingModeId, string>> = {
  major: MAJOR_SG_PATH, diario: '/diario', carreira: '/carreira', rtp: '/road-to-pro', ultimate: '/ultimate',
};

const pct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function landingPage(now: number): SeoPage {
  const hero = landingHero(now, true);
  const major = hero === 'major';
  const L = LANDING;
  const F = MAJOR_FAVORITES;
  const sections: SeoSection[] = [];
  if (major) {
    sections.push({
      id: 'major', kicker: 'PGL Major Singapore', title: L.desk.label,
      blocks: [
        { kind: 'p', text: `${L.desk.where} · ${MAJOR_SG_MILESTONES.map((m) => `${m.date} ${m.label}`).join(' · ')}` },
        { kind: 'list', ordered: true, items: F.teams.map((t) => ({ title: t.name, text: pct(t.pct) })) },
        { kind: 'p', text: `${F.runs.toLocaleString('pt-BR')} ${L.desk.runs} · ${F.status === 'projecao' ? L.desk.listProjection : L.desk.listOfficial}` },
        { kind: 'p', text: L.desk.foot },
      ],
    });
  }
  sections.push({
    id: 'comecar', kicker: L.quick.kicker, title: L.quick.title,
    blocks: [
      { kind: 'p', text: major ? L.quick.subMajor : L.quick.subGeral },
      { kind: 'list', items: landingDoors(hero).map((id) => ({ title: L.doors[id].title, href: PAGE_OF[id], text: L.doors[id].desc, meta: `${L.doors[id].time} · ${L.doors[id].meta}` })) },
    ],
  });
  sections.push({
    id: 'modos', kicker: L.modesHead.kicker, title: L.modesHead.title,
    blocks: [{ kind: 'list', items: landingModes(hero).map((id) => ({ title: L.modes[id].title, href: PAGE_OF[id], text: L.modes[id].desc, meta: L.modes[id].meta.join(' · ') })) }],
  });
  return {
    path: '/', file: 'index.html', nav: 'Início', schema: 'home', priority: 1, changefreq: 'weekly',
    title: 'Road to Major · manager e simulador de CS2 no navegador',
    description: major
      ? "Faça o pick'em do PGL Major Singapore, simule o Major e jogue com um time. Manager e simulador de Counter-Strike no navegador, grátis no PC e no celular."
      : 'Manager e simulador de Counter-Strike no navegador: comande uma org, viva a carreira de pro ou dispute a ranqueada online. Grátis no PC e no celular.',
    kicker: major ? L.heroMajor.kicker : L.heroGeral.badge,
    h1: (major ? L.heroMajor.h1 : L.heroGeral.h1).join(' '),
    lead: major ? [L.heroMajor.sub, L.heroMajor.assure] : [L.heroGeral.sub],
    ctas: major
      ? [{ href: MAJOR_SG_PATH, label: L.heroMajor.cta }, { href: '/jogar', label: L.heroMajor.play }]
      : [{ href: '/jogar', label: L.heroGeral.cta }],
    sections,
    faq: [...(major ? [L.faqMajor] : []), ...L.faq].map(([q, a]) => [withDefaultPrice(q), withDefaultPrice(a)] as [string, string]),
  };
}

const sub = (p: Omit<SeoPage, 'schema' | 'file'> & { file?: string }): SeoPage => ({ schema: 'page', file: `p${p.path}.html`, ...p });

/** Todas as páginas públicas, na ordem do sitemap. `now` decide o hero da landing (como a landing faz). */
export function buildSeoPages(now: number): SeoPage[] {
  const M = LANDING.modes;
  const D = LANDING.doors;
  // a resposta do FAQ da landing, sem o "Sim." da pergunta
  const ultimateFaq = LANDING.faq.find(([q]) => q === 'O Ultimate é o modo online?')![1].replace(/^Sim\. /, '');
  return [
    landingPage(now),
    majorSeoPage(),
    sub({
      path: '/ultimate', nav: 'Ultimate', priority: 0.9, changefreq: 'weekly',
      title: 'Ultimate · monte seu elenco de CS2 e suba na ranqueada · Road to Major',
      description: `${M.ultimate.desc} Grátis no navegador.`,
      kicker: M.ultimate.meta.join(' · '), h1: 'Ultimate: seu elenco de CS2 na ranqueada',
      lead: [M.ultimate.desc, ultimateFaq],
      ctas: [{ href: '/jogar', label: LANDING.heroGeral.cta }],
    }),
    sub({
      path: '/carreira', nav: 'Carreira', priority: 0.9, changefreq: 'weekly',
      title: 'Modo Carreira · gerencie uma org de CS · Road to Major',
      description: `${M.carreira.desc} Grátis no navegador.`,
      kicker: D.carreira.meta, h1: 'Modo Carreira: gerencie uma org de CS',
      lead: [M.carreira.desc],
      ctas: [{ href: '/jogar', label: LANDING.heroGeral.cta }],
    }),
    sub({
      path: '/road-to-pro', nav: 'Road to Pro', priority: 0.8, changefreq: 'weekly',
      title: 'Road to Pro · a carreira de um jogador de CS · Road to Major',
      description: `${M.rtp.desc} Demo grátis no navegador.`,
      kicker: M.rtp.meta.join(' · '), h1: 'Road to Pro: você é o jogador',
      lead: [M.rtp.desc],
      ctas: [{ href: '/jogar', label: LANDING.heroGeral.cta }],
    }),
    sub({
      path: '/diario', nav: 'Diário', priority: 0.7, changefreq: 'daily',
      title: 'Diário · quatro desafios de CS por dia · Road to Major',
      description: `${D.diario.desc} ${DAILY_GAMES.map((g) => g.title).join(', ')}. Grátis, no navegador.`,
      kicker: `${D.diario.time} · ${D.diario.meta}`, h1: 'Diário: quatro desafios de CS por dia',
      lead: [D.diario.desc],
      sections: [{ id: 'desafios', title: 'Os desafios', blocks: [{ kind: 'list', items: DAILY_GAMES.map((g) => ({ title: g.title, text: g.blurb })) }] }],
    }),
    sub({
      path: '/ranking', nav: 'Ranking', priority: 0.5, changefreq: 'daily',
      title: 'Ranking competitivo · Road to Major',
      description: 'O ladder da temporada da ranqueada online do Road to Major: managers, divisões e campeões de cada temporada.',
      kicker: 'Ranking competitivo · Online', h1: 'Ranking competitivo',
      lead: ['O ladder da temporada da ranqueada online: managers, divisões e campeões de cada temporada.'],
    }),
    sub({
      path: '/hall', nav: 'Hall da Fama', priority: 0.5, changefreq: 'weekly',
      title: 'Hall da Fama · Road to Major',
      description: 'Campeões, recordes e campanhas do Road to Major.',
      h1: 'Hall da Fama', lead: ['Campeões, recordes e campanhas do Road to Major.'],
    }),
    sub({ path: '/privacidade', nav: 'Privacidade', priority: 0.2, changefreq: 'yearly', title: 'Política de privacidade · Road to Major', description: 'Como o Road to Major trata seus dados.', h1: 'Política de privacidade', lead: ['Como o Road to Major coleta, usa e protege seus dados.'] }),
    sub({ path: '/termos', nav: 'Termos', priority: 0.2, changefreq: 'yearly', title: 'Termos de uso · Road to Major', description: 'Termos de uso do Road to Major.', h1: 'Termos de uso', lead: ['As regras de uso do Road to Major.'] }),
    sub({ path: '/reembolso', nav: 'Reembolso', priority: 0.2, changefreq: 'yearly', title: 'Política de reembolso · Road to Major', description: 'Política de reembolso do Road to Major.', h1: 'Política de reembolso', lead: ['Como funcionam reembolsos no Road to Major.'] }),
  ];
}
