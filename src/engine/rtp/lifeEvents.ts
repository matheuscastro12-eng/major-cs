// RTP5 — eventos de vida. O roleplay off-game: lesões, drama, ofertas de
// stream/patrocínio, renovação de contrato. Cada evento é uma decisão (2-3
// opções) com deltas nos seus medidores/contrato/patrocínio. Clona o padrão de
// engine/teamEvents.ts (escolha → outcome).
//
// Geração modulada por estado: moral baixa puxa eventos ruins; fama alta puxa
// convites; contrato perto do fim força a renovação; físico baixo abre risco de
// lesão. Tudo determinístico (RNG do save).

import { type Rng } from '../rng';
import { hashStr } from '../../state/hash';
import type {
  LifeEvent, LifeEventOption, LifeEventCategory, RoadToProSave, PersonalSponsor,
} from './types';
import type { RtpIconName } from './icons';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const CATEGORY_META: Record<LifeEventCategory, { label: string; icon: RtpIconName }> = {
  career: { label: 'Carreira', icon: 'career' },
  health: { label: 'Saúde', icon: 'health' },
  personal: { label: 'Pessoal', icon: 'personal' },
  media: { label: 'Mídia', icon: 'media' },
  team: { label: 'Time', icon: 'team' },
  money: { label: 'Dinheiro', icon: 'money' },
};

interface LifeTemplate {
  id: string;
  category: LifeEventCategory;
  weight: number;
  eligible: (s: RoadToProSave) => boolean;
  make: (s: RoadToProSave, rng: Rng) => { title: string; body: string; options: LifeEventOption[] };
}

const money = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;

// Escolhe um colega de elenco pra protagonizar o drama de vestiário.
function pickMate(s: RoadToProSave, rng: Rng, prefer?: 'star' | 'igl') {
  const mates = s.team.teammates;
  if (!mates.length) return null;
  if (prefer === 'star') return [...mates].sort((a, b) => b.ovr - a.ovr)[0];
  if (prefer === 'igl') return mates.find((m) => m.role === 'IGL') ?? mates[0];
  return mates[Math.floor(rng() * mates.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates

const TEMPLATES: LifeTemplate[] = [
  // ── Carreira ───────────────────────────────────────────────────────────────
  {
    id: 'contract-renewal', category: 'career', weight: 40,
    // Emprestado NÃO renova o vínculo temporário (o contrato que importa é o do
    // clube-mãe; applyLifeChoice redireciona pra ele por segurança).
    eligible: (s) => !s.world.loanReturn && s.team.contract.weeksLeft <= 10,
    make: (s) => {
      const bump = 1.25 + (s.life.fame / 200); // fama valoriza
      return {
        title: 'Renovação de contrato',
        body: `${s.team.teamName} quer renovar com você. Seu contrato está acabando e a diretoria colocou uma proposta na mesa.`,
        options: [
          { id: 'sign', label: 'Assinar (estabilidade)', outcome: 'Você renovou e segue na casa. Tranquilidade pra focar no jogo.', deltas: { contractWeeks: 52, morale: +4, rel: { team: +4 } } },
          { id: 'negotiate', label: 'Pedir aumento', outcome: 'Topou negociar firme — saiu com salário melhor, mas a diretoria ficou de olho.', deltas: { contractWeeks: 40, wageMult: bump, rel: { team: -3 } } },
          { id: 'wait', label: 'Esperar o mercado', outcome: 'Você decidiu esperar — pode aparecer coisa melhor, mas a pressão aumenta.', deltas: { focus: -3 } },
        ],
      };
    },
  },
  {
    id: 'bootcamp', category: 'career', weight: 14,
    eligible: () => true,
    make: () => ({
      title: 'Bootcamp no exterior',
      body: 'A org marcou um bootcamp intensivo lá fora. Treino pesado, fuso horário, longe de casa.',
      options: [
        { id: 'go', label: 'Ir com tudo', outcome: 'Bootcamp puxado: o time soltou a mão, mas o jet lag bateu.', deltas: { focus: -6, energy: -10, rel: { team: +8 }, morale: +3 } },
        { id: 'remote', label: 'Treinar remoto', outcome: 'Ficou em casa treinando à distância. Confortável, mas perdeu o entrosamento.', deltas: { rel: { team: -4 }, energy: +5 } },
      ],
    }),
  },

  // ── Saúde ──────────────────────────────────────────────────────────────────
  {
    id: 'wrist-pain', category: 'health', weight: 22,
    eligible: (s) => !s.life.flags.injured && s.life.fitness < 70,
    make: () => ({
      title: 'Dor no pulso',
      body: 'Você acorda com o pulso latejando. Tem partida chegando e o médico recomendou cautela.',
      options: [
        { id: 'push', label: 'Jogar com dor', outcome: 'Apertou os dentes e jogou. Pode dar ruim — o pulso não perdoa.', deltas: { fitness: -8, injury: { kind: 'wrist', weeks: 2 } } },
        { id: 'rest', label: 'Descansar e tratar', outcome: 'Pegou leve e tratou. O pulso agradeceu.', deltas: { fitness: +12, energy: +6 } },
        { id: 'physio', label: 'Fisioterapia (R$ 800)', outcome: 'Investiu na fisio: recuperação rápida e profissional.', deltas: { fitness: +16, money: -800 } },
      ],
    }),
  },
  {
    id: 'burnout', category: 'health', weight: 16,
    eligible: (s) => s.life.morale < 50 || s.life.focus < 45,
    make: () => ({
      title: 'Sinais de burnout',
      body: 'A rotina de treinos te esgotou. Você sente a cabeça pesada e a vontade caindo.',
      options: [
        { id: 'break', label: 'Tirar uns dias', outcome: 'Desligou um pouco. A cabeça voltou a funcionar.', deltas: { morale: +10, focus: +10, energy: +8 } },
        { id: 'therapy', label: 'Procurar um psicólogo', outcome: 'Buscou ajuda profissional. Aprendeu a lidar melhor com a pressão.', deltas: { morale: +14, money: -600, focus: +6 } },
        { id: 'grind', label: 'Empurrar com a barriga', outcome: 'Ignorou os sinais e seguiu no grind. Não vai durar muito assim.', deltas: { morale: -6, focus: -4 } },
      ],
    }),
  },

  // ── Pessoal ────────────────────────────────────────────────────────────────
  {
    id: 'new-relationship', category: 'personal', weight: 14,
    eligible: (s) => s.life.rel.partner <= 0,
    make: () => ({
      title: 'Alguém especial',
      body: 'Você conheceu alguém que mexeu com você. Rolou um clima — e um convite pra sair.',
      options: [
        { id: 'date', label: 'Dar uma chance', outcome: 'Topou. Começou algo bom — o coração mais leve ajuda no servidor.', deltas: { morale: +8, rel: { partner: 40 }, money: -200 } },
        { id: 'focus', label: 'Foco na carreira', outcome: 'Escolheu o jogo por enquanto. Disciplina total.', deltas: { focus: +6 } },
      ],
    }),
  },
  {
    id: 'partner-fight', category: 'personal', weight: 12,
    eligible: (s) => s.life.rel.partner > 0,
    make: () => ({
      title: 'Briga em casa',
      body: 'A rotina de pro player cobrou seu preço: rolou uma briga feia com seu par.',
      options: [
        { id: 'talk', label: 'Sentar e conversar', outcome: 'Vocês conversaram e se acertaram. Relação mais forte.', deltas: { rel: { partner: +8 }, morale: +4, energy: -4 } },
        { id: 'ignore', label: 'Mergulhar no jogo', outcome: 'Você se enterrou no treino e deixou a poeira baixar sozinha. Ficou um clima.', deltas: { rel: { partner: -12 }, morale: -6 } },
      ],
    }),
  },
  {
    id: 'family-visit', category: 'personal', weight: 12,
    eligible: () => true,
    make: () => ({
      title: 'A família chamou',
      body: 'Almoço de domingo em família. Faz tempo que você não aparece — e tem treino marcado.',
      options: [
        { id: 'go', label: 'Ir matar a saudade', outcome: 'Recarregou as energias com a família. Vale mais que um scrim.', deltas: { rel: { family: +10 }, morale: +6, energy: +4 } },
        { id: 'skip', label: 'Ficar treinando', outcome: 'Mandou um "fica pra próxima". A família entende… até certo ponto.', deltas: { rel: { family: -6 }, focus: +3 } },
      ],
    }),
  },

  // ── Mídia / fama ───────────────────────────────────────────────────────────
  {
    id: 'sponsor-offer', category: 'media', weight: 18,
    eligible: (s) => s.life.fame >= 14 && s.sponsors.length < 3,
    make: (s) => {
      const perWeek = 200 + Math.round(s.life.fame * 10);
      return {
        title: 'Proposta de patrocínio',
        body: `Uma marca de periféricos curtiu sua trajetória e ofereceu um contrato de imagem: ${money(perWeek)}/semana.`,
        options: [
          { id: 'accept', label: 'Fechar negócio', outcome: `Patrocínio fechado! +${money(perWeek)} por semana enquanto durar.`, deltas: { addSponsor: { brand: 'Periférico Co.', perWeek, weeks: 20, fameBonus: 4 }, fame: +4 } },
          { id: 'decline', label: 'Recusar (sem distração)', outcome: 'Preferiu manter o foco sem obrigações de marca.', deltas: { focus: +2 } },
        ],
      };
    },
  },
  {
    id: 'interview', category: 'media', weight: 14,
    eligible: () => true,
    make: () => ({
      title: 'Entrevista pós-jogo',
      body: 'O repórter aponta o microfone. A torcida toda vai ouvir o que você falar.',
      options: [
        { id: 'humble', label: 'Ser humilde', outcome: 'Creditou o time e os fãs. Imagem impecável.', deltas: { fame: +2, rel: { fans: +6, team: +3 } } },
        { id: 'cocky', label: 'Provocar os rivais', outcome: 'Soltou o verbo! Virou meme e manchete — pra cima e pra baixo.', deltas: { fame: +6, rel: { fans: +2 } } },
      ],
    }),
  },
  {
    id: 'viral-clip', category: 'media', weight: 10,
    eligible: () => true,
    make: () => ({
      title: 'Clipe viral',
      body: 'Uma jogada sua viralizou — milhões de views e um monte de gente nova te seguindo.',
      options: [
        { id: 'ride', label: 'Surfar na onda', outcome: 'Aproveitou o hype: stream lotada e bolso mais cheio.', deltas: { fame: +8, money: +1500, rel: { fans: +8 }, energy: -6 } },
        { id: 'lowkey', label: 'Manter os pés no chão', outcome: 'Curtiu de boa e seguiu a rotina. Hype não sobe à cabeça.', deltas: { fame: +4, focus: +3 } },
      ],
    }),
  },

  {
    id: 'rival-callout', category: 'media', weight: 20,
    eligible: (s) => !!s.media?.rival && s.media.rival.intensity >= 45,
    make: (s) => {
      const r = s.media!.rival!;
      return {
        title: `${r.playerNick} te provocou`,
        body: `Em entrevista, ${r.playerNick} (${r.orgName}) mandou um recado: "${r.taunt}" A imprensa quer a sua resposta.`,
        options: [
          { id: 'fire', label: 'Devolver na lata', outcome: 'Você respondeu à altura — a rivalidade pegou fogo e a torcida amou o climão.', deltas: { fame: +6, morale: +4, rel: { fans: +4 } } },
          { id: 'cool', label: 'Deixar o jogo falar', outcome: 'Preferiu responder na quadra. Frieza que impõe respeito.', deltas: { focus: +4, morale: +3 } },
        ],
      };
    },
  },

  // ── Time ───────────────────────────────────────────────────────────────────
  {
    id: 'benched', category: 'team', weight: 34,
    eligible: (s) => s.team.squadRole === 'bench',
    make: (s) => ({
      title: 'Você foi pro banco',
      body: `${s.team.teamName} te tirou do time titular — a fase ruim cobrou o preço e a vaga está em risco. O que você faz?`,
      options: [
        { id: 'grind', label: 'Ralar dobrado pra voltar', outcome: 'Fechou a cara e foi pro grind. Reconquistar a vaga é questão de resultado — e de tempo.', deltas: { focus: +8, morale: -2, energy: -8 } },
        { id: 'demand', label: 'Exigir uma transferência', outcome: 'Bateu o pé com a diretoria: ou joga, ou sai. A tensão subiu, mas você impôs respeito.', deltas: { morale: +4, fame: +2, rel: { team: -8 } } },
        { id: 'accept', label: 'Aceitar e esperar a chance', outcome: 'Engoliu seco e ficou de prontidão. Paciência… por enquanto.', deltas: { morale: -4, focus: +2 } },
      ],
    }),
  },
  {
    id: 'teammate-clash', category: 'team', weight: 15,
    eligible: (s) => s.team.teammates.length > 0,
    make: (s, rng) => {
      const m = pickMate(s, rng)!;
      return {
        title: `Treta com ${m.nick}`,
        body: `Rolou um desentendimento com ${m.nick} (${m.role}) na call — cada um puxando pra um lado. O clima no vestiário ficou pesado.`,
        options: [
          { id: 'talk', label: 'Resolver na conversa', outcome: `Você e ${m.nick} sentaram e alinharam. O ar limpou e a confiança voltou.`, deltas: { rel: { team: +6 }, morale: +2, energy: -4 } },
          { id: 'ignore', label: 'Deixar quieto', outcome: 'Preferiu não mexer. A treta ficou fervendo por baixo.', deltas: { rel: { team: -4 }, morale: -3, focus: -3 } },
          { id: 'coach', label: 'Levar pro coach', outcome: 'Chamou o coach pra mediar. Resolveu, mas alguns acharam dedurar.', deltas: { rel: { coach: +4, team: -2 } } },
        ],
      };
    },
  },
  {
    id: 'star-wants-out', category: 'team', weight: 10,
    eligible: (s) => s.team.teammates.length >= 3,
    make: (s, rng) => {
      const m = pickMate(s, rng, 'star')!;
      return {
        title: `${m.nick} quer sair`,
        body: `${m.nick} (${m.role}, OVR ${m.ovr}), o astro do elenco, recebeu proposta e cogita deixar o time. Sem ele, vocês enfraquecem.`,
        options: [
          { id: 'convince', label: 'Convencer a ficar', outcome: `Você puxou ${m.nick} num papo franco e o segurou mais uma temporada. Liderança que o time sentiu.`, deltas: { rel: { team: +7 }, morale: +3, energy: -4 } },
          { id: 'letgo', label: 'Desejar boa sorte', outcome: 'Respeitou a decisão dele. O grupo perde qualidade, mas mantém a boa relação.', deltas: { morale: -3, rel: { team: +1 } } },
        ],
      };
    },
  },
  {
    // A BERLINDA: a diretoria perdeu a paciência. Só aparece quando a confiança
    // está no chão — é o aviso antes da demissão. As escolhas mexem direto na
    // confiança da diretoria (boardConf), fechando o ciclo com computeObjective.
    id: 'hot-seat', category: 'career', weight: 60,
    eligible: (s) => (s.world.boardConfidence ?? 55) < 38,
    make: (s) => ({
      title: 'Reunião com a diretoria',
      body: `A cúpula da ${s.team.teamName} te chamou pra uma conversa dura: os resultados não vêm e a sua vaga está por um fio. Eles querem uma resposta.`,
      options: [
        { id: 'promise', label: 'Cravar que vai virar o jogo', outcome: 'Você bateu no peito e assumiu a missão. A diretoria comprou — por ora. Agora é entregar.', deltas: { boardConf: +10, focus: +6, morale: -2, rel: { team: +2 } } },
        { id: 'blame', label: 'Cobrar mais estrutura do time', outcome: 'Apontou as falhas ao redor. Uns acharam justo, outros acharam desculpa — e a paciência encurtou.', deltas: { boardConf: -6, morale: +3, rel: { team: -4, coach: -3 } } },
        { id: 'humble', label: 'Ouvir calado e pedir tempo', outcome: 'Engoliu a bronca e pediu confiança. Não animou ninguém, mas comprou alguns dias.', deltas: { boardConf: +3, morale: -4, focus: +3 } },
      ],
    }),
  },
  {
    id: 'coach-talk', category: 'career', weight: 16,
    eligible: () => true,
    make: (s) => {
      const good = s.player.form >= 1.0;
      return {
        title: 'Conversa com o coach',
        body: good
          ? 'O coach te chamou de canto — elogiou sua fase e falou em te dar mais responsabilidade no sistema.'
          : 'O coach chamou pra uma conversa séria sobre sua fase. Ele quer ver reação.',
        options: [
          { id: 'embrace', label: 'Abraçar a responsabilidade', outcome: 'Você comprou a ideia. O coach passou a confiar mais em você.', deltas: { rel: { coach: +6 }, focus: +4, morale: +3 } },
          { id: 'time', label: 'Pedir um tempo pra engrenar', outcome: 'Foi sincero sobre o momento. O coach entendeu, mas ficou de olho.', deltas: { rel: { coach: -2 }, morale: +2, focus: +2 } },
        ],
      };
    },
  },
  {
    id: 'toxic-teammate', category: 'team', weight: 14,
    eligible: () => true,
    make: () => ({
      title: 'Colega tóxico no comms',
      body: 'Um colega anda explosivo na call, xingando geral depois de cada round perdido.',
      options: [
        { id: 'confront', label: 'Chamar pra conversar', outcome: 'Você puxou a real com ele. Pegou mal na hora, mas limpou o ar.', deltas: { rel: { team: +6 }, morale: +2 } },
        { id: 'ignore', label: 'Deixar passar', outcome: 'Engoliu seco e seguiu jogando. O clima continua pesado.', deltas: { rel: { team: -4 }, morale: -5, focus: -3 } },
      ],
    }),
  },

  // ── Dinheiro ───────────────────────────────────────────────────────────────
  {
    id: 'setup-upgrade', category: 'money', weight: 12,
    eligible: (s) => s.life.money >= 3000,
    make: () => ({
      title: 'Upgrade de setup',
      body: 'Saiu um monitor novo, 480Hz. Caro, mas o pessoal jura que faz diferença.',
      options: [
        { id: 'buy', label: 'Comprar (R$ 2.500)', outcome: 'Setup novo instalado. A fluidez deu aquele gás na confiança.', deltas: { money: -2500, focus: +4, morale: +4 } },
        { id: 'skip', label: 'O que tenho basta', outcome: 'Guardou a grana. Mão não é o monitor.', deltas: {} },
      ],
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Geração

export function generateLifeEvent(save: RoadToProSave, rng: Rng): LifeEvent | null {
  // um evento por vez
  if (save.inbox.some((e) => !e.resolved)) return null;

  const eligible = TEMPLATES.filter((t) => t.eligible(save));
  if (eligible.length === 0) return null;

  // chance base modulada pelo estado (vida pesada → mais eventos)
  let chance = 0.34;
  if (save.life.morale < 45) chance += 0.12;
  if (save.life.fitness < 50) chance += 0.10;
  const forced = eligible.some((t) => t.id === 'contract-renewal' && save.team.contract.weeksLeft <= 4);
  if (!forced && rng() > chance) return null;

  // pick ponderado (renovação forçada domina quando o contrato está no limite)
  const pool = forced ? eligible.filter((t) => t.id === 'contract-renewal') : eligible;
  const total = pool.reduce((a, t) => a + t.weight, 0);
  let r = rng() * total;
  let chosen = pool[0];
  for (const t of pool) { r -= t.weight; if (r <= 0) { chosen = t; break; } }

  const built = chosen.make(save, rng);
  const id = `evt-${chosen.id}-${save.world.season}-${save.world.week}-${hashStr(`${chosen.id}:${save.rng.tick}`) % 9973}`;
  return {
    id, templateId: chosen.id, category: chosen.category,
    title: built.title, body: built.body, options: built.options,
    week: save.world.week,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicação da escolha

export function applyLifeChoice(save: RoadToProSave, eventId: string, optionId: string): RoadToProSave {
  const ev = save.inbox.find((e) => e.id === eventId);
  if (!ev) return save;
  const opt = ev.options.find((o) => o.id === optionId);
  if (!opt) return save;
  const d = opt.deltas;
  const life = save.life;

  const rel = { ...life.rel };
  if (d.rel) for (const [k, v] of Object.entries(d.rel)) {
    rel[k as keyof typeof rel] = clamp((rel[k as keyof typeof rel] ?? 0) + (v ?? 0), 0, 100);
  }

  const flags = { ...life.flags };
  if (d.injury) flags.injured = { kind: d.injury.kind, weeksLeft: d.injury.weeks };

  const nextLife = {
    ...life,
    energy: clamp(life.energy + (d.energy ?? 0), 0, 100),
    fitness: clamp(life.fitness + (d.fitness ?? 0), 0, 100),
    morale: clamp(life.morale + (d.morale ?? 0), 0, 100),
    focus: clamp(life.focus + (d.focus ?? 0), 0, 100),
    fame: clamp(life.fame + (d.fame ?? 0), 0, 100),
    money: Math.max(0, life.money + (d.money ?? 0)),
    rel,
    flags,
  };

  // contrato — EMPRESTADO renegocia com o clube-MÃE (loanReturn.contract): o
  // vínculo temporário do empréstimo não é renovável; sem isso, a renovação
  // assinada durante o empréstimo era descartada na volta.
  const onLoan = !!save.world.loanReturn && (d.contractWeeks || d.wageMult);
  const contract = { ...(onLoan ? save.world.loanReturn!.contract : save.team.contract) };
  if (d.contractWeeks) contract.weeksLeft = contract.weeksLeft + d.contractWeeks;
  if (d.wageMult) contract.wage = Math.round(contract.wage * d.wageMult);

  // confiança da diretoria (reunião de berlinda)
  let world = d.boardConf
    ? { ...save.world, boardConfidence: clamp((save.world.boardConfidence ?? 55) + d.boardConf, 0, 100) }
    : save.world;
  if (onLoan) world = { ...world, loanReturn: { ...save.world.loanReturn!, contract } };

  // patrocínio pessoal
  let sponsors = save.sponsors;
  if (d.addSponsor) {
    const sp: PersonalSponsor = {
      id: `sp-${ev.templateId}-${save.world.season}-${save.world.week}`,
      brand: d.addSponsor.brand, perWeek: d.addSponsor.perWeek,
      weeksLeft: d.addSponsor.weeks, fameBonus: d.addSponsor.fameBonus,
    };
    sponsors = [...save.sponsors, sp];
  }

  return {
    ...save,
    life: nextLife,
    team: onLoan ? save.team : { ...save.team, contract },
    world,
    sponsors,
    inbox: save.inbox.map((e) => (e.id === eventId ? { ...e, resolved: true } : e)).filter((e) => !e.resolved),
    rng: { seed: save.rng.seed, tick: save.rng.tick + 1 },
  };
}
