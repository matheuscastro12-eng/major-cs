// [URG-3] AVISO DE RIVAL — detecção pura de "fulano te passou no ranking".
//
// Quem reporta uma vitória sobe no ladder; todo mundo que ficou pra trás foi
// ULTRAPASSADO. Só avisamos quem tem motivo pra ligar: rivais declarados
// (rtm_rivalries envolvendo quem subiu) e o vizinho imediato (quem agora está
// logo abaixo de quem subiu), dentro do top N. Sem banco, sem relógio: recebe o
// ladder já ordenado e devolve a lista; testável em server/rivalNotify.test.ts.
export interface LadderEntry { email: string; nick: string; mmr: number }
export interface Overtake {
  email: string; nick: string;
  /** posição (1-indexada) ANTES e DEPOIS da ultrapassagem */
  oldPos: number; newPos: number;
  reason: 'rival' | 'neighbor';
}
export const RIVAL_MAIL_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const OVERTAKE_TOP = 100;
export const RANKED_LINK = 'https://roadtomajor.com.br/ultimate?tab=ranqueada';

/**
 * Compara o MMR de quem reportou ANTES e DEPOIS com o ladder DEPOIS (top N,
 * ordenado por MMR desc) e devolve quem foi ultrapassado. Cada vítima estava
 * acima do reportante antes (mmr > before) e agora está abaixo dele no ladder.
 * Uma consulta só: a posição antiga da vítima é a atual menos um (o reportante
 * passou por cima de todas de uma vez).
 */
export function detectOvertakes(
  reporter: { email: string; before: number; after: number },
  ladderAfter: LadderEntry[],
  rivalEmails: Iterable<string>,
  top = OVERTAKE_TOP,
): Overtake[] {
  if (!(reporter.after > reporter.before)) return [];
  const me = reporter.email.toLowerCase();
  const ladder = ladderAfter.slice(0, top);
  const myIdx = ladder.findIndex((e) => e.email.toLowerCase() === me);
  if (myIdx < 0) return []; // fora do top N: ninguém do top foi ultrapassado
  const rivals = new Set([...rivalEmails].map((e) => e.toLowerCase()));
  const out: Overtake[] = [];
  for (let i = myIdx + 1; i < ladder.length; i++) {
    const v = ladder[i];
    const vm = v.email.toLowerCase();
    if (vm === me) continue;
    if (!(v.mmr > reporter.before)) break; // ordenado desc: daqui pra baixo ninguém estava acima de mim
    const reason: Overtake['reason'] | null = rivals.has(vm) ? 'rival' : i === myIdx + 1 ? 'neighbor' : null;
    if (!reason) continue;
    out.push({ email: vm, nick: v.nick, oldPos: i, newPos: i + 1, reason });
  }
  return out;
}

/** Rate limit puro: no máximo 1 e-mail por destinatário a cada 24h. */
export function canMailRival(lastAt: number | null | undefined, now: number): boolean {
  if (lastAt == null || !Number.isFinite(lastAt)) return true;
  return now - lastAt >= RIVAL_MAIL_INTERVAL_MS;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Monta o e-mail (assunto + texto simples + HTML mínimo). */
export function buildRivalMail(p: { byNick: string; oldPos: number; newPos: number; byMmr: number; link?: string }): { subject: string; text: string; html: string } {
  const link = p.link ?? RANKED_LINK;
  const subject = `${p.byNick} te passou no ranking do Road to Major`;
  const text = [
    `${p.byNick} acabou de te passar no ranking ranqueado do Ultimate.`,
    ``,
    `Você caiu de ${p.oldPos}º pra ${p.newPos}º. ${p.byNick} está com ${p.byMmr} RP.`,
    ``,
    `Recupera sua posição: ${link}`,
    ``,
    `Não quer mais esses avisos? Desligue em Conta.`,
  ].join('\n');
  const html = [
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">`,
    `<p><b>${esc(p.byNick)}</b> acabou de te passar no ranking ranqueado do Ultimate.</p>`,
    `<p>Você caiu de <b>${p.oldPos}º</b> pra <b>${p.newPos}º</b>. ${esc(p.byNick)} está com <b>${p.byMmr} RP</b>.</p>`,
    `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#c9a63c;color:#111;font-weight:800;border-radius:8px;text-decoration:none">Jogar ranqueada</a></p>`,
    `<p style="font-size:12px;color:#666">Não quer mais esses avisos? Desligue em Conta.</p>`,
    `</div>`,
  ].join('');
  return { subject, text, html };
}
