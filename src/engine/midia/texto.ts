// [MÍDIA VIVA] Textos da mídia em pt/en/es. Templates com variação; a variante
// sai de um hash (determinístico pela seed do save). Variáveis entre chaves:
// {org} {tag} {o} {n} {x} {sc} {ev} {stage} {to} {from}.
import { hashStr } from '../../state/hash';
import type { KoStage, MidiaLang, PressKind, PressTone, PressTopic } from './model';

export type Tri = Record<MidiaLang, string[]>;
export type Vars = Record<string, string | number | undefined>;

export function fill(lang: MidiaLang, t: Tri, v: number, vars: Vars = {}): string {
  const arr = t[lang]?.length ? t[lang] : t.pt;
  const s = arr[Math.abs(v) % arr.length];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] == null ? '' : String(vars[k])));
}
export const vary = (seed: string): number => hashStr(seed);
export const one = (pt: string, en: string, es: string): Tri => ({ pt: [pt], en: [en], es: [es] });

// ── rótulos ────────────────────────────────────────────────────────────────
export const STAGE_NAME: Record<KoStage, Tri> = {
  qf: one('quartas de final', 'quarterfinals', 'cuartos de final'),
  sf: one('semifinais', 'semifinals', 'semifinales'),
  f: one('finais', 'finals', 'finales'),
};

export const TONE_LABEL: Record<PressTone, Tri> = {
  calm: one('Equilibrado', 'Measured', 'Equilibrado'),
  confident: one('Confiante', 'Confident', 'Confiado'),
  aggressive: one('Provocador', 'Fiery', 'Provocador'),
  deflect: one('Evasivo', 'Evasive', 'Evasivo'),
};

export const KIND_TITLE: Record<PressKind, Tri> = {
  pre: one('Coletiva pré-jogo', 'Pre-match press conference', 'Rueda de prensa previa'),
  post: one('Coletiva pós-jogo', 'Post-match press conference', 'Rueda de prensa posterior'),
  crisis: one('Coletiva de crise', 'Crisis press conference', 'Rueda de prensa de crisis'),
  glory: one('Coletiva da conquista', 'Trophy press conference', 'Rueda de prensa del título'),
};

// ── perguntas ──────────────────────────────────────────────────────────────
export const QUESTION: Record<PressTopic, Tri> = {
  form: {
    pt: ['Como você avalia o momento do time antes deste jogo?', 'O time oscilou nas últimas semanas. O que mudou nos treinos?', 'Qual é a cobrança interna depois desse resultado?'],
    en: ['How do you rate the team\'s current form?', 'The team has been up and down lately. What changed in practice?', 'What is the internal demand after this result?'],
    es: ['¿Cómo valoras el momento del equipo?', 'El equipo ha sido irregular. ¿Qué cambió en los entrenamientos?', '¿Cuál es la exigencia interna tras este resultado?'],
  },
  rival: {
    pt: ['{o} de novo. Já dá para chamar de clássico?', 'Os torcedores esperam esse jogo contra a {o} há semanas. Qual o recado?', 'O que esse confronto com a {o} significa para o vestiário?'],
    en: ['{o} again. Can we call it a derby now?', 'Fans have waited weeks for this one against {o}. Any message?', 'What does the {o} matchup mean to the locker room?'],
    es: ['{o} otra vez. ¿Ya es un clásico?', 'La afición espera este duelo contra {o} desde hace semanas. ¿Algún mensaje?', '¿Qué significa el cruce con {o} para el vestuario?'],
  },
  fregUs: {
    pt: ['Vocês venceram a {o} {x} vezes seguidas. Virou freguesia?', 'A {o} diz que desta vez é diferente. Você acredita?'],
    en: ['You beat {o} {x} times in a row. Do you own them?', '{o} say this time is different. Do you buy it?'],
    es: ['Le ganaron a {o} {x} veces seguidas. ¿Ya es paternidad?', '{o} dice que esta vez será distinto. ¿Lo crees?'],
  },
  fregThem: {
    pt: ['São {x} derrotas seguidas para a {o}. Existe um bloqueio mental?', 'A torcida já chama vocês de fregueses da {o}. Como responde?'],
    en: ['That is {x} straight losses to {o}. Is there a mental block?', 'Fans say {o} own you. How do you respond?'],
    es: ['Son {x} derrotas seguidas contra {o}. ¿Hay un bloqueo mental?', 'La afición dice que {o} es su verdugo. ¿Qué responde?'],
  },
  curse: {
    pt: ['O time caiu nas {stage} {x} vezes. Existe uma maldição?', 'Mais uma vez nas {stage}. Como quebrar esse ciclo?'],
    en: ['The team has fallen in the {stage} {x} times. Is there a curse?', 'The {stage} again. How do you break the cycle?'],
    es: ['El equipo cayó en {stage} {x} veces. ¿Hay una maldición?', 'Otra vez en {stage}. ¿Cómo romper el ciclo?'],
  },
  player: {
    pt: ['{n} vive a pior fase desde que chegou. Ele segue titular?', 'Os números de {n} caíram muito. Você ainda confia nele?'],
    en: ['{n} is in his worst run since joining. Does he keep his spot?', '{n}\'s numbers have dropped a lot. Do you still trust him?'],
    es: ['{n} vive su peor racha desde que llegó. ¿Sigue de titular?', 'Los números de {n} cayeron mucho. ¿Aún confías en él?'],
  },
  star: {
    pt: ['{n} está voando. Ele já é o melhor da posição?', 'Clubes grandes estão de olho em {n}. Como segurar um jogador nessa fase?'],
    en: ['{n} is on fire. Is he the best at his role already?', 'Big clubs are watching {n}. How do you keep a player in this form?'],
    es: ['{n} está imparable. ¿Ya es el mejor en su rol?', 'Clubes grandes miran a {n}. ¿Cómo retener a un jugador así?'],
  },
  rumor: {
    pt: ['Fontes dizem que a {o} quer {n}. Ele está à venda?', 'Há conversas entre a {o} e o estafe de {n}. Você confirma?'],
    en: ['Sources say {o} want {n}. Is he for sale?', 'There are talks between {o} and {n}\'s camp. Can you confirm?'],
    es: ['Fuentes dicen que {o} quiere a {n}. ¿Está en venta?', 'Hay charlas entre {o} y el entorno de {n}. ¿Lo confirmas?'],
  },
  board: {
    pt: ['A diretoria anda impaciente. Seu cargo está ameaçado?', 'Fala-se em ultimato da diretoria. Você sente a pressão?'],
    en: ['The board is getting impatient. Is your job at risk?', 'There is talk of a board ultimatum. Do you feel the pressure?'],
    es: ['La directiva está impaciente. ¿Peligra tu puesto?', 'Se habla de un ultimátum de la directiva. ¿Sientes la presión?'],
  },
  streak: {
    pt: ['São {x} derrotas seguidas. O que está acontecendo?', '{x} tropeços em sequência. O elenco ainda acredita no plano?'],
    en: ['That is {x} losses in a row. What is going on?', '{x} straight defeats. Does the roster still believe in the plan?'],
    es: ['Son {x} derrotas seguidas. ¿Qué está pasando?', '{x} tropiezos seguidos. ¿El plantel aún cree en el plan?'],
  },
  title: {
    pt: ['Campeões do {ev}! Qual o tamanho dessa conquista?', 'Título do {ev}. Para quem vai essa taça?'],
    en: ['{ev} champions! How big is this one?', '{ev} title. Who is this trophy for?'],
    es: ['¡Campeones del {ev}! ¿Qué tan grande es esto?', 'Título del {ev}. ¿Para quién es este trofeo?'],
  },
};

// ── respostas (a fala do técnico, por tema × tom) ─────────────────────────
type AnswerBook = Record<PressTopic, Record<PressTone, Tri>>;
export const ANSWER: AnswerBook = {
  form: {
    calm: one('Estamos no processo. Um jogo de cada vez.', 'We trust the process. One game at a time.', 'Confiamos en el proceso. Partido a partido.'),
    confident: one('Esse time está pronto para qualquer um.', 'This team is ready for anyone.', 'Este equipo está listo para cualquiera.'),
    aggressive: one('Quem duvida de nós vai ter que engolir.', 'Whoever doubts us will have to eat their words.', 'Quien dude de nosotros tendrá que tragárselo.'),
    deflect: one('Prefiro falar depois do jogo.', 'I\'d rather talk after the game.', 'Prefiero hablar después del partido.'),
  },
  rival: {
    calm: one('Respeito total pela {o}. Vale três pontos como qualquer jogo.', 'Full respect for {o}. It counts like any other game.', 'Respeto total a {o}. Vale lo mismo que cualquier partido.'),
    confident: one('Clássico se ganha na raça, e nós estamos com fome.', 'Derbies are won with heart, and we are hungry.', 'Los clásicos se ganan con garra, y tenemos hambre.'),
    aggressive: one('A {o} fala demais. Vamos responder no servidor.', '{o} talk too much. We answer on the server.', '{o} habla demasiado. Respondemos en el servidor.'),
    deflect: one('Não gosto de rótulos. Próxima pergunta.', 'I don\'t like labels. Next question.', 'No me gustan las etiquetas. Siguiente pregunta.'),
  },
  fregUs: {
    calm: one('Histórico não ganha mapa. Vamos respeitar.', 'History doesn\'t win maps. We respect them.', 'La historia no gana mapas. Los respetamos.'),
    confident: one('Conhecemos bem a {o}. Sabemos o que fazer.', 'We know {o} well. We know what to do.', 'Conocemos bien a {o}. Sabemos qué hacer.'),
    aggressive: one('Freguês é freguês. Que venham.', 'Some teams just can\'t beat us. Bring it.', 'Hay equipos que no nos ganan. Que vengan.'),
    deflect: one('Isso é coisa da torcida, não minha.', 'That\'s for the fans to say, not me.', 'Eso lo dice la afición, no yo.'),
  },
  fregThem: {
    calm: one('Estudamos onde erramos. É um jogo novo.', 'We studied our mistakes. It\'s a new game.', 'Estudiamos nuestros errores. Es otro partido.'),
    confident: one('Toda sequência acaba. Hoje acaba a deles.', 'Every streak ends. Theirs ends today.', 'Toda racha termina. Hoy termina la suya.'),
    aggressive: one('Eles tiveram sorte. Acabou a sorte.', 'They got lucky. Luck runs out.', 'Tuvieron suerte. La suerte se acaba.'),
    deflect: one('Não vivo do passado.', 'I don\'t live in the past.', 'No vivo del pasado.'),
  },
  curse: {
    calm: one('Maldição não existe. Existem detalhes, e estamos ajustando.', 'There\'s no curse. Only details, and we\'re fixing them.', 'No hay maldición. Hay detalles, y los estamos ajustando.'),
    confident: one('Esse elenco nasceu para quebrar esse ciclo.', 'This roster was built to break that cycle.', 'Este plantel nació para romper ese ciclo.'),
    aggressive: one('Quem fala em maldição nunca jogou um mata-mata.', 'People who talk about curses never played a playoff.', 'Quien habla de maldición nunca jugó una eliminatoria.'),
    deflect: one('Não vou alimentar essa história.', 'I won\'t feed that story.', 'No voy a alimentar esa historia.'),
  },
  player: {
    calm: one('{n} tem todo o meu apoio. Fase passa.', '{n} has my full backing. Form is temporary.', '{n} tiene todo mi apoyo. Las rachas pasan.'),
    confident: one('{n} vai ser decisivo. Escrevam isso.', '{n} will be decisive. Write that down.', '{n} será decisivo. Apúntenlo.'),
    aggressive: one('{n} sabe que precisa render mais. Ninguém é intocável.', '{n} knows he must do more. Nobody is untouchable.', '{n} sabe que debe rendir más. Nadie es intocable.'),
    deflect: one('Não falo de jogador individualmente.', 'I don\'t discuss individual players.', 'No hablo de jugadores en particular.'),
  },
  star: {
    calm: one('{n} trabalha muito. O mérito é dele e do grupo.', '{n} works hard. Credit to him and the group.', '{n} trabaja mucho. Mérito suyo y del grupo.'),
    confident: one('{n} é o melhor do mundo na função hoje.', '{n} is the best in the world at his role right now.', '{n} es hoy el mejor del mundo en su rol.'),
    aggressive: one('Quem quiser {n} vai ter que pagar uma fortuna.', 'Anyone who wants {n} will have to pay a fortune.', 'Quien quiera a {n} tendrá que pagar una fortuna.'),
    deflect: one('O foco é no time, não em nomes.', 'The focus is the team, not names.', 'El foco es el equipo, no los nombres.'),
  },
  rumor: {
    calm: one('{n} está feliz aqui e tem contrato.', '{n} is happy here and under contract.', '{n} está feliz aquí y tiene contrato.'),
    confident: one('{n} não está à venda. Ponto.', '{n} is not for sale. Period.', '{n} no está en venta. Punto.'),
    aggressive: one('Ninguém é maior que o clube. Se a proposta for boa, conversamos.', 'Nobody is bigger than the club. A good offer gets a hearing.', 'Nadie es más grande que el club. Una buena oferta se escucha.'),
    deflect: one('Não comento especulação.', 'I don\'t comment on speculation.', 'No comento especulaciones.'),
  },
  board: {
    calm: one('Converso com a diretoria toda semana. Estamos alinhados.', 'I talk to the board every week. We\'re aligned.', 'Hablo con la directiva cada semana. Estamos alineados.'),
    confident: one('Os resultados vão aparecer. Confio no trabalho.', 'Results will come. I trust the work.', 'Los resultados llegarán. Confío en el trabajo.'),
    aggressive: one('Com o orçamento que temos, estamos acima do esperado.', 'With our budget, we\'re overachieving.', 'Con nuestro presupuesto, estamos por encima de lo esperado.'),
    deflect: one('Isso é assunto interno.', 'That\'s an internal matter.', 'Es un asunto interno.'),
  },
  streak: {
    calm: one('Fase ruim acontece. Vamos sair juntos.', 'Bad runs happen. We\'ll get out together.', 'Las malas rachas pasan. Saldremos juntos.'),
    confident: one('A virada começa no próximo jogo.', 'The turnaround starts next game.', 'La remontada empieza el próximo partido.'),
    aggressive: one('Alguns jogadores precisam se olhar no espelho.', 'Some players need to look in the mirror.', 'Algunos jugadores deben mirarse al espejo.'),
    deflect: one('Não tenho mais nada a declarar.', 'I have nothing more to say.', 'No tengo nada más que decir.'),
  },
  title: {
    calm: one('Mérito dos jogadores e de todo o estafe.', 'All credit to the players and the staff.', 'Mérito de los jugadores y de todo el staff.'),
    confident: one('É só o começo. Queremos o Major.', 'This is only the beginning. We want the Major.', 'Es solo el comienzo. Queremos el Major.'),
    aggressive: one('Muita gente duvidou. Taí a resposta.', 'A lot of people doubted us. There\'s your answer.', 'Mucha gente dudó. Ahí está la respuesta.'),
    deflect: one('Hoje é dia de comemorar, não de entrevista.', 'Today is for celebrating, not interviews.', 'Hoy es para celebrar, no para entrevistas.'),
  },
};

// ── feed social ────────────────────────────────────────────────────────────
export const F = {
  win: {
    pt: ['{tag} vence a {o} por {sc} no {ev}. Vitória com autoridade.', 'FINAL: {tag} {sc} {o} ({ev}). O vestiário sai aliviado.', '{tag} passa pela {o} ({sc}) e segue viva no {ev}.'],
    en: ['{tag} beat {o} {sc} at {ev}. A statement win.', 'FINAL: {tag} {sc} {o} ({ev}). A relieved locker room.', '{tag} get past {o} ({sc}) and stay alive at {ev}.'],
    es: ['{tag} vence a {o} por {sc} en {ev}. Victoria con autoridad.', 'FINAL: {tag} {sc} {o} ({ev}). Vestuario aliviado.', '{tag} supera a {o} ({sc}) y sigue viva en {ev}.'],
  } as Tri,
  loss: {
    pt: ['{tag} cai para a {o} por {sc} no {ev}. Cobrança vai aumentar.', 'FINAL: {o} {sc} {tag} ({ev}). Noite difícil para o técnico.', 'Derrota da {tag} para a {o} ({sc}). O que deu errado?'],
    en: ['{tag} fall to {o} {sc} at {ev}. Pressure is mounting.', 'FINAL: {o} {sc} {tag} ({ev}). A rough night for the coach.', '{tag} lose to {o} ({sc}). What went wrong?'],
    es: ['{tag} cae ante {o} por {sc} en {ev}. Crece la presión.', 'FINAL: {o} {sc} {tag} ({ev}). Noche dura para el técnico.', 'Derrota de {tag} ante {o} ({sc}). ¿Qué falló?'],
  } as Tri,
  upsetWin: {
    pt: ['ZEBRA! {tag} derruba a favorita {o} por {sc}.', 'Ninguém apostava. {tag} {sc} {o}. Que série.'],
    en: ['UPSET! {tag} take down favorites {o} {sc}.', 'Nobody saw it coming. {tag} {sc} {o}. What a series.'],
    es: ['¡SORPRESA! {tag} tumba a la favorita {o} por {sc}.', 'Nadie lo esperaba. {tag} {sc} {o}. Qué serie.'],
  } as Tri,
  upsetLoss: {
    pt: ['ZEBRA: {o} surpreende a {tag} por {sc}.', 'Tropeço feio: {tag} perde para a {o} ({sc}).'],
    en: ['UPSET: {o} stun {tag} {sc}.', 'Ugly stumble: {tag} lose to {o} ({sc}).'],
    es: ['SORPRESA: {o} sorprende a {tag} por {sc}.', 'Tropiezo feo: {tag} pierde ante {o} ({sc}).'],
  } as Tri,
  fanWin: {
    pt: ['QUE TIME! 🔥', 'Eu nunca duvidei 😤', 'Esse elenco é diferente', '{mvp} monstro demais', 'Bora pro título!!', 'Joga muito, {tag}!'],
    en: ['WHAT A TEAM! 🔥', 'Never doubted them 😤', 'This roster is different', '{mvp} is a monster', 'Title next!!', 'Huge, {tag}!'],
    es: ['¡QUÉ EQUIPO! 🔥', 'Nunca dudé 😤', 'Este plantel es otra cosa', '{mvp} es un monstruo', '¡¡A por el título!!', '¡Enorme, {tag}!'],
  } as Tri,
  fanLoss: {
    pt: ['Inaceitável.', 'Cadê o plano de jogo?', 'Calma, galera, fase passa', 'Precisamos de reforço urgente', 'Mais uma dessas e eu desisto 😩', 'Confio no processo… acho'],
    en: ['Unacceptable.', 'Where was the game plan?', 'Relax guys, it\'s a phase', 'We need signings ASAP', 'One more of these and I\'m out 😩', 'Trust the process… I guess'],
    es: ['Inaceptable.', '¿Dónde estaba el plan?', 'Calma, es una racha', 'Necesitamos fichajes ya', 'Una más así y me rindo 😩', 'Confío en el proceso… creo'],
  } as Tri,
  rivalFanWin: {
    pt: ['Hoje não deu, mas no próximo clássico a gente acerta as contas.', 'Sorte de principiante da {tag}.'],
    en: ['Not today, but we\'ll settle it next derby.', 'Beginner\'s luck from {tag}.'],
    es: ['Hoy no, pero en el próximo clásico saldamos cuentas.', 'Suerte de principiante de {tag}.'],
  } as Tri,
  rivalFanLoss: {
    pt: ['Freguesia confirmada 😂', '{tag}, manda lembrança! 👋', 'O clássico é nosso, como sempre.'],
    en: ['They just can\'t beat us 😂', 'Say hi to {tag} for us! 👋', 'The derby is ours, as usual.'],
    es: ['Paternidad confirmada 😂', '¡Saludos a {tag}! 👋', 'El clásico es nuestro, como siempre.'],
  } as Tri,
  mvpPost: {
    pt: ['GG. Orgulho desse time 💪', 'Dia bom. Amanhã é treino de novo.', 'Obrigado pelo apoio de vocês! 🙏'],
    en: ['GG. Proud of this team 💪', 'Good day. Back to practice tomorrow.', 'Thanks for the support! 🙏'],
    es: ['GG. Orgullo de este equipo 💪', 'Buen día. Mañana a entrenar otra vez.', '¡Gracias por el apoyo! 🙏'],
  } as Tri,
  oppGg: {
    pt: ['gg wp {tag}. Vamos aprender e voltar mais fortes.', 'Não foi nosso dia. Parabéns à {tag}.'],
    en: ['gg wp {tag}. We\'ll learn and come back stronger.', 'Not our day. Congrats to {tag}.'],
    es: ['gg wp {tag}. Aprenderemos y volveremos más fuertes.', 'No fue nuestro día. Felicidades a {tag}.'],
  } as Tri,
  pressQuote: {
    pt: ['Técnico da {tag} na coletiva: "{q}"', '"{q}", disse o técnico da {tag} após a pergunta sobre {topic}.'],
    en: ['{tag} coach at the presser: "{q}"', '"{q}", said the {tag} coach when asked about {topic}.'],
    es: ['Técnico de {tag} en rueda de prensa: "{q}"', '"{q}", dijo el técnico de {tag} al preguntarle por {topic}.'],
  } as Tri,
  playerHappy: {
    pt: ['Valeu pela confiança, professor. Vou retribuir no servidor. 🙌', 'Isso me motiva demais. Bora!'],
    en: ['Thanks for the trust, coach. I\'ll pay it back on the server. 🙌', 'That means a lot. Let\'s go!'],
    es: ['Gracias por la confianza, profe. Lo devolveré en el servidor. 🙌', 'Eso me motiva mucho. ¡Vamos!'],
  } as Tri,
  playerUpset: {
    pt: ['Algumas coisas a gente resolve dentro de casa.', '…'],
    en: ['Some things should stay in the locker room.', '…'],
    es: ['Algunas cosas se arreglan en casa.', '…'],
  } as Tri,
  champ: {
    pt: ['{w} é campeã do {ev}! Vitória sobre a {r} na final.', 'TAÇA: {w} levanta o {ev}. {r} fica com o vice.'],
    en: ['{w} win {ev}! They beat {r} in the final.', 'TROPHY: {w} lift {ev}. {r} finish runner-up.'],
    es: ['¡{w} campeón de {ev}! Venció a {r} en la final.', 'TÍTULO: {w} levanta {ev}. {r} es subcampeón.'],
  } as Tri,
  champPlayer: {
    pt: ['CAMPEÕES!!! 🏆', 'Que semana. Obrigado, time. 🏆'],
    en: ['CHAMPIONS!!! 🏆', 'What a week. Thank you, team. 🏆'],
    es: ['¡¡¡CAMPEONES!!! 🏆', 'Qué semana. Gracias, equipo. 🏆'],
  } as Tri,
  transfer: {
    pt: ['OFICIAL: {n} é o novo jogador da {to} (vindo da {from}).', 'Confirmado: {n} deixa a {from} e assina com a {to}.'],
    en: ['OFFICIAL: {n} joins {to} (from {from}).', 'Confirmed: {n} leaves {from} and signs with {to}.'],
    es: ['OFICIAL: {n} ficha por {to} (llega desde {from}).', 'Confirmado: {n} deja {from} y firma con {to}.'],
  } as Tri,
  rumor: {
    pt: ['🚨 RUMOR: {to} prepara proposta por {n} ({from}). Conversas iniciais.', 'Ouvi que {n} ({from}) está na lista da {to}. Fiquem de olho.', 'Fontes: {to} sondou o estafe de {n}. {from} ainda não respondeu.'],
    en: ['🚨 RUMOR: {to} preparing a bid for {n} ({from}). Early talks.', 'Hearing {n} ({from}) is on {to}\'s shortlist. Watch this space.', 'Sources: {to} reached out to {n}\'s camp. {from} has not replied yet.'],
    es: ['🚨 RUMOR: {to} prepara una oferta por {n} ({from}). Charlas iniciales.', 'Me cuentan que {n} ({from}) está en la lista de {to}. Atentos.', 'Fuentes: {to} sondeó al entorno de {n}. {from} aún no respondió.'],
  } as Tri,
  rumorOk: {
    pt: ['✅ Confirmado, como adiantamos: {n} na {to}.', 'Avisei. {n} é da {to}. ✅'],
    en: ['✅ Confirmed, as we reported: {n} to {to}.', 'Told you. {n} is a {to} player. ✅'],
    es: ['✅ Confirmado, como adelantamos: {n} a {to}.', 'Lo dije. {n} es de {to}. ✅'],
  } as Tri,
  rumorNo: {
    pt: ['Atualização: a negociação de {n} com a {to} esfriou. Segue na {from}.', 'Errei essa: {n} fica na {from}.'],
    en: ['Update: {n} to {to} has gone cold. He stays at {from}.', 'Got that one wrong: {n} stays at {from}.'],
    es: ['Actualización: lo de {n} con {to} se enfrió. Sigue en {from}.', 'Me equivoqué: {n} se queda en {from}.'],
  } as Tri,
  repHigh: {
    pt: ['O técnico da {tag} é sempre direto com a imprensa. Dá gosto cobrir esse time.'],
    en: ['The {tag} coach is always straight with the press. A pleasure to cover.'],
    es: ['El técnico de {tag} siempre es directo con la prensa. Da gusto cubrirlos.'],
  } as Tri,
  repLow: {
    pt: ['Clima azedo entre o técnico da {tag} e a imprensa. Coletivas cada vez mais tensas.'],
    en: ['Sour mood between the {tag} coach and the press. Pressers keep getting tenser.'],
    es: ['Ambiente tenso entre el técnico de {tag} y la prensa. Ruedas de prensa cada vez más tensas.'],
  } as Tri,
};

// ── narrativas (manchetes) ─────────────────────────────────────────────────
export const NARR = {
  fregUs: {
    pt: ['Freguesia: {tag} venceu as últimas {x} contra a {o}', '{o} não sabe vencer a {tag}: {x} seguidas'],
    en: ['{tag} own {o}: {x} straight wins', '{o} can\'t beat {tag}: {x} in a row'],
    es: ['Paternidad: {tag} ganó los últimos {x} contra {o}', '{o} no sabe ganarle a {tag}: {x} seguidos'],
  } as Tri,
  fregThem: {
    pt: ['Pedra no sapato: {x} derrotas seguidas para a {o}', '{tag} é freguesa da {o}'],
    en: ['Bogey team: {x} straight losses to {o}', '{o} own {tag}'],
    es: ['Bestia negra: {x} derrotas seguidas ante {o}', '{tag} es cliente de {o}'],
  } as Tri,
  rival: {
    pt: ['Clássico: {tag} × {o} ({w}V {l}D)', 'A rivalidade do momento: {tag} × {o}'],
    en: ['Derby: {tag} vs {o} ({w}W {l}L)', 'The rivalry of the moment: {tag} vs {o}'],
    es: ['Clásico: {tag} vs {o} ({w}V {l}D)', 'La rivalidad del momento: {tag} vs {o}'],
  } as Tri,
  curse: {
    pt: ['A maldição das {stage}: {x} quedas seguidas', 'Travou de novo nas {stage}'],
    en: ['The {stage} curse: {x} straight exits', 'Stuck in the {stage} again'],
    es: ['La maldición de {stage}: {x} caídas seguidas', 'Atascado otra vez en {stage}'],
  } as Tri,
  streakW: {
    pt: ['Embalada: {x} vitórias seguidas', 'Ninguém para a {tag}: {x} séries sem perder'],
    en: ['On a roll: {x} straight wins', 'Nobody stops {tag}: {x} series unbeaten'],
    es: ['En racha: {x} victorias seguidas', 'Nadie frena a {tag}: {x} series sin perder'],
  } as Tri,
  streakL: {
    pt: ['Crise: {x} derrotas seguidas', 'Fase turbulenta: {x} tropeços em sequência'],
    en: ['Crisis: {x} straight losses', 'Turbulent run: {x} defeats in a row'],
    es: ['Crisis: {x} derrotas seguidas', 'Racha turbulenta: {x} tropiezos seguidos'],
  } as Tri,
  breaker: {
    pt: ['Tabu quebrado! {tag} vence a {o} depois de {x} derrotas'],
    en: ['Hoodoo broken! {tag} beat {o} after {x} losses'],
    es: ['¡Se rompió el maleficio! {tag} vence a {o} tras {x} derrotas'],
  } as Tri,
};

export const TOPIC_NAME: Record<PressTopic, Tri> = {
  form: one('a fase do time', 'the team\'s form', 'el momento del equipo'),
  rival: one('o clássico', 'the derby', 'el clásico'),
  fregUs: one('a freguesia', 'the head-to-head', 'el historial'),
  fregThem: one('o tabu', 'the hoodoo', 'el maleficio'),
  curse: one('a maldição', 'the curse', 'la maldición'),
  player: one('a má fase de um jogador', 'a player\'s slump', 'la mala racha de un jugador'),
  star: one('o craque do time', 'the team\'s star', 'la estrella del equipo'),
  rumor: one('um rumor de transferência', 'a transfer rumor', 'un rumor de fichaje'),
  board: one('a diretoria', 'the board', 'la directiva'),
  streak: one('a crise', 'the crisis', 'la crisis'),
  title: one('o título', 'the title', 'el título'),
};

/** Rótulos da UI da tela de mídia. */
export const UI = {
  title: one('Mídia', 'Media', 'Medios'),
  press: one('Sala de imprensa', 'Press room', 'Sala de prensa'),
  feed: one('Feed da cena', 'Scene feed', 'Feed de la escena'),
  narratives: one('Narrativas', 'Storylines', 'Narrativas'),
  trending: one('Em alta', 'Trending', 'Tendencias'),
  rumors: one('Rumores', 'Rumors', 'Rumores'),
  rep: one('Relação com a imprensa', 'Press relations', 'Relación con la prensa'),
  noPress: one('Nenhuma coletiva marcada. Elas aparecem antes e depois de jogos grandes e em momentos de crise ou glória.', 'No press conference scheduled. They show up around big games and in moments of crisis or glory.', 'No hay rueda de prensa. Aparecen antes y después de partidos grandes y en momentos de crisis o gloria.'),
  answer: one('Responder', 'Answer', 'Responder'),
  skip: one('Mandar o assessor', 'Send the press officer', 'Enviar al jefe de prensa'),
  skipHint: one('Faltar à coletiva irrita um pouco a imprensa e a diretoria.', 'Skipping irritates the press and the board a little.', 'Faltar molesta un poco a la prensa y a la directiva.'),
  effects: one('Repercussão', 'Fallout', 'Repercusión'),
  squad: one('Moral do elenco', 'Squad morale', 'Moral del plantel'),
  board: one('Diretoria', 'Board', 'Directiva'),
  repShort: one('Imprensa', 'Press', 'Prensa'),
  history: one('Coletivas recentes', 'Recent pressers', 'Ruedas recientes'),
  h2h: one('Confronto direto', 'Head-to-head', 'Cara a cara'),
  noNarr: one('Ainda sem histórias. Jogue algumas séries: rivalidades, fregueses e sequências aparecem aqui.', 'No storylines yet. Play a few series: rivalries, bogey teams and streaks show up here.', 'Aún sin historias. Juega algunas series: rivalidades y rachas aparecen aquí.'),
  noFeed: one('A cena ainda não falou de você. Jogue a primeira série.', 'The scene hasn\'t talked about you yet. Play your first series.', 'La escena aún no habla de ti. Juega tu primera serie.'),
  all: one('Tudo', 'All', 'Todo'),
  yours: one('Seu clube', 'Your club', 'Tu club'),
  world: one('Mundo', 'World', 'Mundo'),
  market: one('Mercado', 'Market', 'Mercado'),
  replies: one('respostas', 'replies', 'respuestas'),
  showThread: one('Ver respostas', 'Show replies', 'Ver respuestas'),
  hideThread: one('Ocultar respostas', 'Hide replies', 'Ocultar respuestas'),
  posts: one('posts', 'posts', 'posts'),
  pending: one('Coletiva aguardando você', 'Press conference waiting', 'Rueda de prensa pendiente'),
  confirmed: one('Confirmado', 'Confirmed', 'Confirmado'),
  denied: one('Não aconteceu', 'Didn\'t happen', 'No ocurrió'),
  open: one('Em aberto', 'Open', 'Abierto'),
  credibility: one('credibilidade', 'credibility', 'credibilidad'),
  quoteHint: one('Escolha o tom de cada resposta. O vestiário, a diretoria e a imprensa reagem.', 'Pick the tone of each answer. The locker room, the board and the press react.', 'Elige el tono de cada respuesta. El vestuario, la directiva y la prensa reaccionan.'),
  vs: one('contra', 'vs', 'contra'),
  wins: one('vitórias', 'wins', 'victorias'),
  losses: one('derrotas', 'losses', 'derrotas'),
  streak: one('sequência', 'streak', 'racha'),
  cited: one('citado', 'mentioned', 'mencionado'),
  done: one('Coletiva encerrada', 'Press conference over', 'Rueda de prensa terminada'),
};

export const tr = (lang: MidiaLang, t: Tri, vars?: Vars): string => fill(lang, t, 0, vars);
