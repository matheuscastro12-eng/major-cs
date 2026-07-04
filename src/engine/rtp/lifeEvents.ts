// RTP5 — eventos de vida. O roleplay off-game: lesões, drama, ofertas de
// stream/patrocínio, renovação de contrato. Cada evento é uma decisão (2-3
// opções) com deltas nos seus medidores/contrato/patrocínio. Clona o padrão de
// engine/teamEvents.ts (escolha → outcome).
//
// Geração modulada por estado: moral baixa puxa eventos ruins; fama alta puxa
// convites; contrato perto do fim força a renovação; físico baixo abre risco de
// lesão. Tudo determinístico (RNG do save).
//
// FASE DE CARREIRA: o `eligible` de cada template também gateia por momento de
// vida (idade, tier do time, fama, nível) — novato vive o primeiro salário e a
// gaming house; a ascensão traz assédio de org e hype; o veterano lida com
// mentoria, lesão crônica e o pós-título. Um save de 10 temporadas não vê tudo
// de uma vez: o conteúdo acompanha a jornada.

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

  // ═══ FASE: NOVATO ════════════════════════════════════════════════════════════
  // Início de carreira — base/access, nível baixo, ainda morando com a família.
  {
    id: 'first-salary', category: 'money', weight: 20,
    eligible: (s) => s.player.progression.level <= 6 && (s.team.tier === 'academy' || s.team.tier === 'access') && s.life.money < 5000,
    make: (s) => ({
      title: 'Primeiro salário',
      body: `Caiu o pagamento da ${s.team.teamName}. Pode não ser muito, mas é o PRIMEIRO dinheiro que o CS te dá. Você fica olhando pro extrato sem acreditar.`,
      options: [
        { id: 'family', label: 'Ajudar em casa', outcome: 'Chegou com a sacola do mercado cheia. Sua mãe chorou — e você entendeu por que joga.', deltas: { rel: { family: +12 }, morale: +8, money: -400 } },
        { id: 'save', label: 'Guardar cada centavo', outcome: 'Poupou tudo. Carreira de pro é curta e você já pensa como veterano.', deltas: { focus: +4, morale: +2 } },
        { id: 'celebrate', label: 'Comemorar com os amigos', outcome: 'Rodada de pizza e lan house por sua conta. A resenha foi histórica — o bolso sentiu.', deltas: { money: -600, morale: +10, energy: -4 } },
      ],
    }),
  },
  {
    id: 'gaming-house', category: 'career', weight: 18,
    eligible: (s) => s.player.age <= 20 && (s.team.tier === 'academy' || s.team.tier === 'access'),
    make: (s) => ({
      title: 'Convite pra gaming house',
      body: `A ${s.team.teamName} montou uma gaming house e quer o elenco morando junto. Sair de casa pela primeira vez, treino a dois passos do quarto — e zero privacidade.`,
      options: [
        { id: 'move', label: 'Fazer as malas', outcome: 'Mudou pra gaming house. O entrosamento explodiu, mas dormir com quatro teclados estralando é outra história.', deltas: { rel: { team: +12, family: -6 }, focus: +4, energy: -6 } },
        { id: 'stay', label: 'Ficar na casa da família', outcome: 'Preferiu o quarto de sempre e a comida de casa. O time entendeu… mas notou a cadeira vazia na resenha.', deltas: { rel: { family: +6, team: -5 }, energy: +5 } },
        { id: 'hybrid', label: 'Dormir lá só em semana de jogo', outcome: 'Negociou um meio-termo: gaming house em semana de campeonato. Ninguém ficou 100% feliz, mas funciona.', deltas: { rel: { team: +4 }, energy: -2 } },
      ],
    }),
  },
  {
    id: 'school-pressure', category: 'personal', weight: 16,
    eligible: (s) => s.player.age <= 18,
    make: () => ({
      title: 'E os estudos?',
      body: 'Reunião de família: as notas caíram e seu pai colocou o boletim do lado do mousepad. "CS não paga boleto pra sempre." A conversa é séria.',
      options: [
        { id: 'both', label: 'Conciliar escola e treino', outcome: 'Montou uma rotina apertada: aula de manhã, servidor à noite. Cansa, mas a família respira aliviada.', deltas: { rel: { family: +10 }, energy: -8, focus: +2 } },
        { id: 'allin', label: 'All-in no CS', outcome: '"Me dá dois anos." Bateu o pé e apostou tudo na carreira. Em casa, o silêncio no jantar diz muito.', deltas: { rel: { family: -10 }, focus: +8, morale: -3 } },
        { id: 'promise', label: 'Prometer voltar depois', outcome: 'Prometeu trancar agora e retomar quando a carreira estabilizar. A família topou — e vai cobrar.', deltas: { rel: { family: +3 }, focus: +4 } },
      ],
    }),
  },
  {
    id: 'veteran-advice', category: 'team', weight: 14,
    eligible: (s) => s.player.age <= 19 && s.team.teammates.length > 0,
    make: (s, rng) => {
      const m = pickMate(s, rng, 'star')!;
      return {
        title: `Puxão de orelha do ${m.nick}`,
        body: `Depois do treino, ${m.nick} te chamou de canto: "Vi teu demo. Tu tem mão, mas joga igual matchmaking." Ele se ofereceu pra revisar seus VODs.`,
        options: [
          { id: 'listen', label: 'Ouvir e anotar tudo', outcome: `Sentou com ${m.nick} e devorou os VODs. Doeu no ego, mas você saiu jogador melhor — e ganhou um aliado.`, deltas: { rel: { team: +10 }, focus: +6, morale: +2, energy: -4 } },
          { id: 'proud', label: '"Minha mão me trouxe até aqui"', outcome: 'Agradeceu por educação e ignorou. O veterano deu de ombros: "Depois não diz que ninguém avisou."', deltas: { rel: { team: -5 }, morale: +2 } },
        ],
      };
    },
  },

  // ═══ FASE: ASCENSÃO ══════════════════════════════════════════════════════════
  // O nome começa a circular — orgs sondam, a mídia aposta, a stream cresce.
  {
    id: 'org-poach', category: 'career', weight: 15,
    eligible: (s) => (s.team.tier === 'access' || s.team.tier === 'challenger') && s.life.fame >= 25 && !s.world.loanReturn,
    make: (s) => ({
      title: 'Uma org grande te sondou',
      body: `Chegou mensagem no privado: o manager de uma org de cima "adoraria tomar um café" com você. Nada oficial — mas todo mundo sabe o que isso significa. E a ${s.team.teamName} não pode saber.`,
      options: [
        { id: 'meet', label: 'Aceitar o café', outcome: 'Foi na conversa. Nada assinado, mas agora você sabe seu preço de mercado — e a ambição acendeu.', deltas: { morale: +6, fame: +3, focus: -3 } },
        { id: 'loyal', label: 'Recusar por lealdade', outcome: `Respondeu que tem contrato e compromisso com a ${s.team.teamName}. A notícia vazou no vestiário — e pegou bem.`, deltas: { rel: { team: +8 }, morale: +3 } },
        { id: 'leverage', label: 'Usar pra pressionar a diretoria', outcome: 'Deixou a sondagem "escapar" na renovação. O salário subiu, mas a diretoria não esquece uma chantagem.', deltas: { wageMult: 1.15, rel: { team: -6 }, boardConf: -4 } },
      ],
    }),
  },
  {
    id: 'hype-next-star', category: 'media', weight: 12,
    eligible: (s) => s.life.fame >= 30 && s.player.age <= 23 && (s.team.tier === 'challenger' || s.team.tier === 'elite'),
    make: (s) => ({
      title: '"A próxima estrela do Brasil"',
      body: `Saiu matéria grande com sua cara na capa: "${s.player.nick}, o futuro do CS brasileiro". Os números do artigo são reais — mas a expectativa que ele cria também.`,
      options: [
        { id: 'embrace', label: 'Abraçar o holofote', outcome: 'Repostou, agradeceu, surfou. A fama subiu — e junto dela, o peso de cada partida ruim.', deltas: { fame: +8, rel: { fans: +6 }, focus: -5 } },
        { id: 'deflect', label: '"Estrela é o time"', outcome: 'Redirecionou o holofote pro elenco. A imprensa achou sem graça; o vestiário, não.', deltas: { fame: +2, rel: { team: +6 }, morale: +3 } },
        { id: 'mute', label: 'Silenciar as redes na semana de jogo', outcome: 'Desinstalou tudo até a próxima partida. Ninguém joga bem lendo o próprio nome o dia inteiro.', deltas: { focus: +8, rel: { fans: -3 } } },
      ],
    }),
  },
  {
    id: 'stream-contract', category: 'media', weight: 12,
    eligible: (s) => s.life.fame >= 20 && s.sponsors.length < 3,
    make: (s) => {
      const perWeek = 300 + Math.round(s.life.fame * 8);
      return {
        title: 'Contrato de streaming',
        body: `Uma plataforma ofereceu contrato de exclusividade: ${money(perWeek)}/semana pra streamar suas horas de treino. Dinheiro bom — mas stream é trabalho, e o dia continua tendo 24 horas.`,
        options: [
          { id: 'sign', label: 'Assinar a exclusividade', outcome: `Contrato fechado: +${money(perWeek)}/semana e chat lotado. Agora todo deathmatch é ao vivo.`, deltas: { addSponsor: { brand: 'Plataforma de stream', perWeek, weeks: 26, fameBonus: 5 }, fame: +5, energy: -5 } },
          { id: 'casual', label: 'Streamar só quando der', outcome: 'Recusou a exclusividade mas segue ligando a câmera de vez em quando. Liberdade acima de tudo.', deltas: { fame: +2, rel: { fans: +3 } } },
          { id: 'decline', label: 'Recusar — treino é sagrado', outcome: 'Agradeceu e recusou. Suas horas de servidor continuam sendo só suas.', deltas: { focus: +4 } },
        ],
      };
    },
  },
  {
    id: 'fan-encounter', category: 'media', weight: 10,
    eligible: (s) => s.life.fame >= 15,
    make: () => ({
      title: 'Reconhecido na rua',
      body: 'No shopping, um moleque de uns 14 anos te para tremendo: "Tu é meu jogador favorito, comecei a jogar por tua causa." A mãe dele pede uma foto.',
      options: [
        { id: 'time', label: 'Dar atenção de verdade', outcome: 'Tirou foto, trocou ideia sobre crosshair, autografou o mousepad do menino. Ele saiu flutuando — e você também.', deltas: { rel: { fans: +8 }, morale: +8, energy: -2 } },
        { id: 'quick', label: 'Foto rápida e seguir', outcome: 'Sorriu pra foto e seguiu o dia. Educado, mas a pressa apareceu na cara do garoto.', deltas: { rel: { fans: +2 } } },
      ],
    }),
  },

  // ═══ FASE: VETERANO / PÓS-TÍTULO ═════════════════════════════════════════════
  // A idade chega, o corpo cobra, e o jogo passa a ser também sobre legado.
  {
    id: 'mentor-rookie', category: 'team', weight: 15,
    eligible: (s) => s.player.age >= 24 && s.player.progression.level >= 18 && s.team.teammates.length > 0,
    make: (s) => ({
      title: 'O novato da base',
      body: `A ${s.team.teamName} subiu um moleque de 16 anos da base. Talento absurdo, cabeça de matchmaking. O coach sugeriu que VOCÊ o pegasse debaixo da asa — igual fizeram com você um dia.`,
      options: [
        { id: 'mentor', label: 'Virar o mentor dele', outcome: 'Sessões de VOD, papo de posicionamento, bronca na hora certa. O moleque destravou — e te chama de "professor" no comms.', deltas: { rel: { team: +10, coach: +5 }, morale: +6, energy: -6 } },
        { id: 'distance', label: 'Cada um no seu corre', outcome: '"Aprendi apanhando, ele aprende também." Focou no seu jogo. O coach anotou a resposta.', deltas: { focus: +4, rel: { coach: -3 } } },
        { id: 'rival', label: 'Ver como ameaça à vaga', outcome: 'Passou a treinar dobrado pra deixar claro quem é titular. Sua forma agradece; o clima no vestiário, não.', deltas: { focus: +6, energy: -8, rel: { team: -5 } } },
      ],
    }),
  },
  {
    id: 'analyst-invite', category: 'career', weight: 10,
    eligible: (s) => s.player.age >= 26 && s.life.fame >= 35,
    make: () => ({
      title: 'Convite pra bancada',
      body: 'Uma produtora de eventos te chamou pra ser analista convidado num campeonato na sua semana livre. Cachê bom, exposição boa — e um gostinho do que vem depois da aposentadoria.',
      options: [
        { id: 'accept', label: 'Aceitar o convite', outcome: 'Mandou bem demais na bancada: leitura afiada, resenha na medida. O chat já pede sua contratação — e o cachê caiu na conta.', deltas: { money: +2500, fame: +6, rel: { fans: +5 }, energy: -8 } },
        { id: 'decline', label: '"Ainda sou jogador"', outcome: 'Recusou educadamente. Bancada é pra depois — enquanto a mão responde, seu lugar é no servidor.', deltas: { focus: +5, morale: +2 } },
      ],
    }),
  },
  {
    id: 'impostor-syndrome', category: 'health', weight: 14,
    eligible: (s) => s.life.fame >= 55 && s.player.progression.level >= 25 && s.life.morale < 60,
    make: () => ({
      title: 'Síndrome do impostor',
      body: 'Você chegou onde sonhava — e uma voz na sua cabeça insiste que foi sorte. Cada erro parece prova de que "descobriram a farsa". Ontem você ficou meia hora olhando pro loading screen.',
      options: [
        { id: 'therapy', label: 'Procurar o psicólogo esportivo', outcome: 'Colocou nome no monstro. "Isso tem tratamento e metade da elite sente o mesmo", disse o psicólogo. A cabeça começou a clarear.', deltas: { morale: +12, focus: +6, money: -900 } },
        { id: 'open-up', label: 'Desabafar com o time', outcome: 'Abriu o jogo na concentração. Descobriu que não é o único — e o vestiário nunca esteve tão unido.', deltas: { rel: { team: +10 }, morale: +6 } },
        { id: 'hide', label: 'Engolir e fingir que passa', outcome: 'Colocou a máscara de sempre. Por fora tudo bem; por dentro, a voz continua ligada.', deltas: { morale: -8, focus: -5 } },
      ],
    }),
  },
  {
    id: 'chronic-wrist', category: 'health', weight: 16,
    eligible: (s) => s.player.age >= 25 && !s.life.flags.injured,
    make: (s) => ({
      title: 'O pulso cobra a conta',
      body: `São ${s.player.age - 15}+ anos de mouse. O formigamento virou rotina, o alongamento virou ritual — e o médico foi direto: "Isso é crônico. Dá pra conviver, mas não dá pra ignorar."`,
      options: [
        { id: 'program', label: 'Programa de fisio contínuo (R$ 1.500)', outcome: 'Contratou acompanhamento fixo: fisio duas vezes por semana, carga de treino monitorada. Caro, mas é o preço de continuar.', deltas: { money: -1500, fitness: +14, energy: +4 } },
        { id: 'injection', label: 'Infiltração pra aguentar a temporada', outcome: 'A injeção segura a dor por ora e você segue jogando — mas todo veterano sabe que isso é empurrar a conta com juros.', deltas: { fitness: -10, money: -700 } },
        { id: 'reduce', label: 'Cortar as horas de deathmatch', outcome: 'Reduziu o volume de treino mecânico e priorizou o descanso. O pulso melhorou; a mão sente falta do ritmo.', deltas: { fitness: +8, focus: -4, energy: +6 } },
      ],
    }),
  },
  {
    id: 'investment-advisor', category: 'money', weight: 10,
    eligible: (s) => s.life.money >= 20000,
    make: (s) => {
      const fee = 1200;
      return {
        title: 'Hora de investir?',
        body: `Seu saldo passou de ${money(s.life.money)} e um consultor financeiro (indicação de outro pro) sugeriu parar de deixar tudo parado: "Carreira de jogador é curta. O dinheiro tem que trabalhar por você."`,
        options: [
          { id: 'invest', label: `Contratar o consultor (${money(fee)})`, outcome: 'Diversificou com juízo: renda fixa, um pouco de risco. Dormir sabendo que o futuro tem plano vale muito.', deltas: { money: -fee, morale: +6, focus: +3 } },
          { id: 'course', label: 'Fazer um curso e aprender sozinho (R$ 800)', outcome: 'Preferiu entender antes de assinar. Planilha aberta, vídeo-aula no segundo monitor — respeito.', deltas: { money: -800, focus: +2, morale: +3 } },
          { id: 'later', label: '"Depois eu vejo isso"', outcome: 'Empurrou pra depois. O dinheiro segue parado — e a carreira segue curta.', deltas: {} },
        ],
      };
    },
  },
  {
    id: 'charity-stream', category: 'media', weight: 8,
    eligible: (s) => s.life.fame >= 35 && s.life.money >= 5000,
    make: () => ({
      title: 'Live beneficente',
      body: 'Uma ONG da sua cidade te procurou pra encabeçar uma live beneficente — arrecadação pra reformar a quadra e a sala de informática do bairro onde você cresceu.',
      options: [
        { id: 'host', label: 'Topar e doar junto (R$ 2.000)', outcome: 'A live bateu meta em duas horas. Ver o bairro mobilizado pelo seu nome vale mais que qualquer troféu.', deltas: { money: -2000, fame: +7, morale: +10, rel: { fans: +8, family: +4 }, energy: -6 } },
        { id: 'support', label: 'Divulgar sem aparecer', outcome: 'Compartilhou a campanha e mandou um vídeo de apoio. Ajudou — de longe.', deltas: { fame: +2, rel: { fans: +2 } } },
      ],
    }),
  },

  // ═══ CENA COMPETITIVA — dramas autênticos do circuito ════════════════════════
  // O lado do CS que não aparece no scoreboard: figurinha de Major, aposta suja,
  // visto negado, medo de palco, produto com a tua cara e rato no elenco.
  {
    // A FIGURINHA: classificou pro Major, a Valve imprime seu autógrafo no jogo e
    // os royalties de pacote de figurinha caem na conta. Dinheiro de Major muda vida.
    id: 'major-stickers', category: 'money', weight: 11,
    eligible: (s) => (s.team.tier === 'elite' || s.team.tier === 'challenger') && s.life.fame >= 40,
    make: (s) => ({
      title: 'Sua figurinha no Major',
      body: `A ${s.team.teamName} se classificou pro Major e a organização do evento colocou a SUA figurinha de autógrafo dentro do jogo. A cada pacote vendido, um pedaço pinga na sua conta — e a fanbase está comprando muito.`,
      options: [
        { id: 'save', label: 'Guardar a bolada', outcome: 'Deixou a renda das figurinhas rendendo na conta. Dinheiro de Major não cai todo mês — e você joga pensando a longo prazo.', deltas: { money: +9000, focus: +3, morale: +5 } },
        { id: 'family', label: 'Realizar um sonho da família', outcome: 'Usou a grana pra tirar a família do aluguel. Ver isso acontecer por causa de uma figurinha do seu autógrafo não tem preço.', deltas: { money: +4000, rel: { family: +14 }, morale: +10 } },
        { id: 'flex', label: 'Se dar de presente', outcome: 'Torrou uma parte no que sempre quis. A resenha zoou, mas você merecia — e o hype curtiu o flex.', deltas: { money: +2500, fame: +5, morale: +6, rel: { fans: +3 } } },
      ],
    }),
  },
  {
    // A PROPOSTA SUJA: aliciamento pra entregar mapa em site de aposta. Ban vitalício
    // se topar — o teste de caráter clássico do cenário (iBUYPOWER e afins).
    id: 'matchfix-approach', category: 'career', weight: 8,
    eligible: (s) => (s.team.tier === 'academy' || s.team.tier === 'access' || s.team.tier === 'challenger') && s.life.money < 8000,
    make: () => ({
      title: 'Uma proposta suja',
      body: 'Um número desconhecido te chamou no privado com uma "oportunidade": entregar um mapa específico de propósito e faturar alto num site de apostas. "Ninguém desconfia", ele jura. É crime, é ban vitalício — e é muito dinheiro pra quem ainda ganha pouco.',
      options: [
        { id: 'report', label: 'Denunciar na hora', outcome: 'Printou tudo e mandou pra org e pra liga. Fez o certo — a integridade que te define vale mais que qualquer bolada suja.', deltas: { rel: { team: +8, fans: +4 }, morale: +6, boardConf: +8 } },
        { id: 'block', label: 'Bloquear e seguir', outcome: 'Bloqueou o contato e não comentou com ninguém. Longe da sujeira, mas guardou o print — nesse meio nunca se sabe.', deltas: { focus: +3, morale: +2 } },
        { id: 'tempted', label: 'Só ouvir a proposta…', outcome: 'Deixou a conversa fluir sem topar nada. Perigoso: quem senta nessa mesa já sai sujo, e a cabeça fica remoendo o que não devia.', deltas: { morale: -6, focus: -5, rel: { team: -4 } } },
      ],
    }),
  },
  {
    // VISTO NEGADO: a burocracia de viajar pra LAN internacional — pesadelo real do
    // brasileiro e do leste europeu. Pode custar a vaga na line do evento.
    id: 'visa-denied', category: 'career', weight: 9,
    eligible: (s) => s.team.tier === 'challenger' || s.team.tier === 'elite',
    make: () => ({
      title: 'Visto negado',
      body: 'Faltando dias pro campeonato lá fora, o consulado negou seu visto. Carimbo errado, papelada, sei-lá-o-quê — o resultado é o mesmo: ou o time acha um jeito, ou vai jogar com stand-in no seu lugar.',
      options: [
        { id: 'fight', label: 'Virar a noite com o despachante', outcome: 'Passou a madrugada com o despachante da org atrás de um recurso de emergência. Estresse puro, mas o carimbo saiu na última hora e você embarcou.', deltas: { energy: -8, focus: -4, money: -600, morale: +4 } },
        { id: 'remote', label: 'Deixar o stand-in e apoiar de casa', outcome: 'Engoliu seco e assistiu o time jogar com stand-in pela tela. Ver a sua vaga ocupada por outro dói mais que qualquer derrota.', deltas: { morale: -10, rel: { team: -3 } } },
        { id: 'calm', label: 'Manter a calma e focar no próximo ciclo', outcome: 'Assumiu que não dava dessa vez e evitou o desespero. Maturidade que a diretoria reparou — nem tudo dá pra controlar.', deltas: { focus: +4, boardConf: +3, morale: -3 } },
      ],
    }),
  },
  {
    // ESTREIA NA LAN: primeira vez no palco, holofote e arquibancada. O frio na
    // barriga que todo pro conhece — e a diferença entre online e presencial.
    id: 'lan-debut', category: 'career', weight: 13,
    eligible: (s) => s.player.age <= 21 && (s.team.tier === 'access' || s.team.tier === 'challenger'),
    make: () => ({
      title: 'Primeira LAN de verdade',
      body: 'Chegou o dia: primeira vez pisando num palco de LAN, holofote na cara, arquibancada gritando e o telão mostrando cada respirada sua. O fone abafa a torcida, mas o coração acelerado não tem como desligar.',
      options: [
        { id: 'embrace', label: 'Respirar fundo e abraçar o palco', outcome: 'Trocou o frio na barriga por adrenalina. Quando plantou a bomb no primeiro round e a arquibancada explodiu, o nervoso virou foco — palco é a sua casa agora.', deltas: { focus: +8, morale: +8, fame: +3, energy: -4 } },
        { id: 'routine', label: 'Fingir que é só mais um scrim', outcome: 'Colocou o fone, ignorou a plateia e jogou no automático. Funcionou — profissionalismo puro, sem drama nem holofote na cabeça.', deltas: { focus: +5, morale: +2 } },
        { id: 'choke', label: 'Deixar o nervoso tomar conta', outcome: 'As mãos tremeram, o prefire falhou, o peso do crowd travou tudo. Aprendeu na marra que LAN é outro jogo — e prometeu que da próxima vai ser diferente.', deltas: { focus: -6, morale: -6, energy: -4 } },
      ],
    }),
  },
  {
    // PRODUTO SIGNATURE: mousepad/config com a tua cara. O nome vira mercadoria —
    // marco de quem chegou (s1mple, ZywOo e cia. têm linha própria).
    id: 'signature-gear', category: 'media', weight: 10,
    eligible: (s) => s.life.fame >= 40 && s.sponsors.length < 3,
    make: () => ({
      title: 'Produto com a sua assinatura',
      body: 'Uma marca de periféricos quer lançar uma linha com a sua cara: mousepad signature, sensibilidade e crosshair oficiais impressos na caixa. Royalties por unidade vendida — o seu nome virando produto de prateleira.',
      options: [
        { id: 'sign', label: 'Fechar a linha signature', outcome: 'Assinou o contrato: cada mousepad vendido pinga na conta e a molecada joga com a SUA config. Nome que virou marca registrada.', deltas: { addSponsor: { brand: 'Linha Signature', perWeek: 350, weeks: 24, fameBonus: 6 }, fame: +6, morale: +5 } },
        { id: 'perfectionist', label: 'Só topar se o produto prestar', outcome: 'Exigiu testar cada protótipo antes de emprestar o nome. Atrasou o lançamento, mas você não bota assinatura em qualquer coisa.', deltas: { focus: +3, fame: +2 } },
        { id: 'decline', label: 'Recusar — seu nome não está à venda', outcome: 'Agradeceu e passou. Prefere ser lembrado pelas jogadas, não pela caixa no e-commerce.', deltas: { focus: +3, morale: +2 } },
      ],
    }),
  },
  {
    // O RATO: um colega negocia escondido com outra org e estratégia vaza junto.
    // A paranoia de vestiário que racha line — decisão de liderança.
    id: 'roster-leak', category: 'team', weight: 12,
    eligible: (s) => s.team.teammates.length >= 3,
    make: (s, rng) => {
      const m = pickMate(s, rng)!;
      return {
        title: 'Rato no elenco',
        body: `Um print circulando nos bastidores mostra que ${m.nick} (${m.role}) anda conversando com outra org escondido — e detalhes de estratégia estão vazando junto. O grupo passou a desconfiar de todo mundo e o clima azedou.`,
        options: [
          { id: 'direct', label: `Cobrar ${m.nick} na cara`, outcome: `Puxou ${m.nick} num canto e cobrou a real: ou se explica, ou o vestiário racha. Liderança é também bancar a conversa difícil na hora certa.`, deltas: { rel: { team: +5, coach: +3 }, morale: +2, energy: -4 } },
          { id: 'coach', label: 'Levar o print pra diretoria', outcome: 'Entregou o caso pra cúpula resolver por dentro. Profissional, mas alguns colegas te olharam torto por "abrir o jogo".', deltas: { boardConf: +5, rel: { team: -3, coach: +4 } } },
          { id: 'silent', label: 'Fechar a boca e blindar as calls', outcome: 'Não acusou ninguém, só passou a segurar informação sensível nas calls. O time joga mais travado, mas de você não vaza nada.', deltas: { focus: -3, rel: { team: -2 } } },
        ],
      };
    },
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
