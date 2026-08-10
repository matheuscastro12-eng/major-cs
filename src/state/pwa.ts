// PWA — instalação na home do celular.
//
// Por que isto existe: o Diário é um loop DIÁRIO, mas o único caminho de volta
// hoje é o jogador lembrar da URL e digitar. Ícone na home resolve isso sem
// depender de e-mail, push ou qualquer serviço externo — e é especialmente
// relevante no público mobile brasileiro.
//
// Sem dependência: registra o SW, guarda o evento `beforeinstallprompt` (que o
// Chrome dispara UMA vez e só se o app ainda não está instalado) e expõe um
// hook pra UI oferecer o botão na hora certa.

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

// O tipo não está no lib.dom padrão (API só do Chromium).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'rtm-pwa-dispensado';

function notify(): void { listeners.forEach((l) => l()); }

// Registra o SW e começa a escutar o convite de instalação. Chamar uma vez no
// boot. Tolerante: navegador sem suporte simplesmente não faz nada.
export function installPwa(): void {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    // depois do load pra não competir com o primeiro render pela banda
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* sem SW: o app funciona igual */ });
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();               // segura o banner nativo: queremos escolher a hora
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* sem storage */ }
    notify();
  });
}

// true quando dá pra oferecer instalação: o browser convidou, o app ainda não
// está rodando instalado e o jogador não dispensou antes.
export function canInstall(): boolean {
  if (!deferred) return false;
  if (isInstalled()) return false;
  try { if (localStorage.getItem(DISMISS_KEY) === '1') return false; } catch { /* sem storage */ }
  return true;
}

export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  // standalone = aberto pelo ícone da home. `navigator.standalone` é o iOS.
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (window.navigator as { standalone?: boolean }).standalone === true;
}

// Dispara o prompt nativo. Devolve se o jogador aceitou. O evento só pode ser
// usado UMA vez — depois de consumido, some.
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  notify();
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

// "Agora não" — para de oferecer nesta instalação do navegador.
export function dismissInstall(): void {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* sem storage */ }
  deferred = null;
  notify();
}

// Assinatura pra UI re-renderizar quando o convite aparece/some.
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
