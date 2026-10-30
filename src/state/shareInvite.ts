// CONVITE PARA COMPARTILHAR nos 3 momentos de pico (pick'em fechado, fim de
// uma série, fim da campanha do Major): duas ações, "Desafie um amigo" e
// "Postar o card". Aqui fica só o que é puro: o kind estável de cada clique
// (share_card {kind, channel}), o link com atribuição de cada ação e a escolha
// do texto pronto. O lado DOM (share sheet, clipboard, X) é o state/shareX.ts e
// a tela é o components/ShareInvite.tsx.
// TS PURO: sem React, sem window. Testado em scripts/test-share-invite.mts.
import { cleanNick } from '../engine/pickemChallenge';
import { shareUrl, SITE } from './shareLink';

export type InviteMoment = 'pickem' | 'serie' | 'campanha';
export type InviteAction = 'desafio' | 'card';
export const INVITE_MOMENTS: readonly InviteMoment[] = ['pickem', 'serie', 'campanha'];
export const INVITE_ACTIONS: readonly InviteAction[] = ['desafio', 'card'];

/** kind do share_card: `pickem-desafio`, `serie-card`… Estável: é a chave da medição. */
export function inviteKind(moment: InviteMoment, action: InviteAction): string {
  return `${moment}-${action}`;
}

const MAJOR_PATH = '/major-singapore';
/** quem recebe o desafio da campanha cai direto na aba Jogar (majorTabs.ts lê ?aba=jogar) */
export const CAMPAIGN_PATH = `${MAJOR_PATH}?aba=jogar`;

/**
 * Link de cada ação, com ?ref=<kind> + utm (shareLink.ts).
 * - pick'em: o palpite viaja em ?p=<código> (o OG dinâmico do #147 mostra o
 *   palpite no preview). Só o desafio leva &de=<nick>, e só se o jogador deixar.
 *   Sem código não há link: devolve ''.
 * - série: a página inicial (não há link que monte a mesma série).
 * - campanha: o Modo Major na aba Jogar.
 */
export function inviteUrl(
  moment: InviteMoment,
  action: InviteAction,
  opts: { code?: string; nick?: string } = {},
  base: string = SITE,
): string {
  const kind = inviteKind(moment, action);
  if (moment === 'serie') return shareUrl('/', kind, {}, base);
  if (moment === 'campanha') return shareUrl(CAMPAIGN_PATH, kind, {}, base);
  const code = (opts.code ?? '').trim();
  if (!code) return '';
  const nick = action === 'desafio' ? cleanNick(opts.nick) : '';
  return shareUrl(`${MAJOR_PATH}?p=${encodeURIComponent(code)}`, kind, nick ? { de: nick } : {}, base);
}

/** troca {chave} pelo valor; chave sem valor fica como está (nunca some texto) */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** texto do share sheet / clipboard: o texto pronto e o link na linha de baixo */
export function inviteMessage(text: string, url: string): string {
  const t = text.trim();
  if (!url) return t;
  return t.includes(url) ? t : `${t}\n${url}`;
}

/** placar do ponto de vista do jogador: "2-1" */
export function scoreFor(mapScore: readonly [number, number], userIdx: 0 | 1): string {
  const opp = userIdx === 0 ? 1 : 0;
  return `${mapScore[userIdx]}-${mapScore[opp]}`;
}

/** texto do desafio da série: um molde para vitória e outro para derrota */
export function seriesDareText(
  s: { won: boolean; me: string; opp: string; mapScore: readonly [number, number]; userIdx: 0 | 1 },
  tpl: { win: string; loss: string },
): string {
  return fillTemplate(s.won ? tpl.win : tpl.loss, { me: s.me, opp: s.opp, score: scoreFor(s.mapScore, s.userIdx) });
}

/** texto da campanha: campeão tem molde próprio; senão, a campanha com o recorde em séries */
export function campaignText(
  c: { champion: boolean; team: string; record: readonly [number, number] },
  tpl: { champ: string; run: string },
): string {
  return fillTemplate(c.champion ? tpl.champ : tpl.run, { team: c.team, record: `${c.record[0]}–${c.record[1]}` });
}

/** dataURL → bytes + tipo (base64 ou texto). Síncrono: o share sheet sai no mesmo toque. */
export function dataUrlBytes(dataUrl: string): { bytes: Uint8Array<ArrayBuffer>; type: string } | null {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) return null;
  const head = dataUrl.slice(5, comma).split(';');
  const type = head[0] || 'text/plain';
  const body = dataUrl.slice(comma + 1);
  try {
    const raw = head.includes('base64') ? atob(body) : decodeURIComponent(body);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    return { bytes, type };
  } catch { return null; }
}
