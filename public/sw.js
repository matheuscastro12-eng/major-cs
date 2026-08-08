// Service worker do Road to Major — PROPOSITALMENTE SEM CACHE.
//
// Ele existe por um motivo só: Chrome/Android exigem um SW registrado com
// handler de `fetch` pra oferecer "instalar app" (o manifest sozinho não basta).
// Instalado na home, o Diário deixa de depender do jogador lembrar da URL — que
// hoje é o único caminho de volta do loop diário.
//
// POR QUE NÃO CACHEIA: o app serve chunks com hash no nome e já tem uma rede de
// segurança pra deploy no ar (lazyWithReload em App.tsx recarrega a página uma
// vez quando um chunk some). Um SW com cache brigaria com isso: serviria index
// velho apontando pra chunks que não existem mais, e o reload não resolveria
// porque o SW devolveria o mesmo index de novo — o clássico "atualizei e o site
// ficou preso na versão antiga". Offline não vale esse risco num jogo online.
//
// Se um dia quisermos offline de verdade, o caminho é precache com versionamento
// atrelado ao build (Workbox), NUNCA um cache-first ingênuo em cima disto.

self.addEventListener('install', () => {
  // assume o controle já na primeira visita, sem esperar abas antigas fecharem
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // limpa qualquer cache deixado por uma versão anterior deste SW (defensivo:
    // hoje não criamos nenhum, mas garante que um experimento futuro revertido
    // não deixe lixo servindo conteúdo velho pra sempre)
    const nomes = await caches.keys();
    await Promise.all(nomes.map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Handler de fetch obrigatório pra instalabilidade. Passa direto: NÃO chamamos
// respondWith, então o browser faz a requisição normal, com o comportamento de
// cache HTTP de sempre (os headers immutable do vercel.json seguem valendo).
self.addEventListener('fetch', () => { /* passthrough — ver bloco acima */ });

// Clique na notificação (quando o push entrar): foca uma aba aberta em vez de
// abrir outra, senão o jogador acumula abas do jogo.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const alvo = event.notification.data?.url || '/diario';
  event.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const aba of abas) {
      if (aba.url.includes(alvo) && 'focus' in aba) return aba.focus();
    }
    if (abas.length && 'navigate' in abas[0]) {
      await abas[0].navigate(alvo);
      return abas[0].focus();
    }
    return self.clients.openWindow(alvo);
  })());
});
