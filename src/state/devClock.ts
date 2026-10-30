// RELÓGIO DE TESTE, só em `npm run dev`: ?agora=AAAA-MM-DD ou
// ?agora=AAAA-MM-DDTHH:MM (horário de Brasília; só a data = meio-dia) adianta o
// Date.now() do app inteiro para aquele instante, e o tempo segue correndo dali.
// Serve pra ver o Major "ao vivo" antes de 24/11 (contagem, Stage do dia,
// trava do pick'em, landing). O App mantém a query ao trocar de tela.
//
// Inerte em produção: o main.tsx importa este arquivo primeiro (antes de
// qualquer módulo ler o relógio) e a instalação só roda com import.meta.env.DEV.
// Cuidado ao testar: o Modo Major tira as fotos do palpite nas travas que "já
// passaram" (rtm-major-sg-pick-snapshots-v1); apague essa chave para recomeçar.

/** o instante pedido em ?agora=, ou null (formato inválido não mexe em nada) */
export function devAgoraMs(search: string): number | null {
  let v: string | null;
  try { v = new URLSearchParams(search).get('agora'); } catch { return null; }
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/.exec((v ?? '').trim());
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2] ?? '12:00'}:00-03:00`);
  return Number.isFinite(ms) ? ms : null;
}

function install(): void {
  let target: number | null;
  try { target = devAgoraMs(window.location.search); } catch { return; }
  if (target == null) return;
  const real = Date.now.bind(Date);
  const offset = target - real();
  Date.now = () => real() + offset;
  console.info(`[dev] relógio em ${new Date(target).toISOString()} (?agora=)`);
}

if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) install();
