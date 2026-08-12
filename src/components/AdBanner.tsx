// Banner de patrocínio fixo no rodapé (sempre visível). Patrocinador atual:
// COPA ACE — campeonato de CS2 (R$1.500 de premiação, inscrição R$150, 16 times,
// formato suíço na FACEIT, início 20.08). Responsivo: 970×90 no desktop, 320×50
// no mobile, com versões 2x pra retina.
//
// Duas travas de segurança, ambas fazem o banner DESAPARECER em vez de mostrar
// algo errado:
//   1. asset quebrado / ainda não no ar  → onError esconde
//   2. DEST vazio                        → não renderiza (banner sem link é só
//      poluição, e link errado manda o jogador pro lugar errado)
//
// Histórico: existia um banner da G4 Skins (site de caixas) removido em 70ac50d.
// Ele carregava um aviso "18+ · caixas com itens aleatórios" que NÃO se aplica
// aqui — a Copa ACE é campeonato, não jogo de azar. O rótulo "publicidade"
// continua, porque identificar conteúdo pago não é opcional.
import { useEffect, useState } from 'react';
import { getLang } from '../state/i18n';
import { track } from '../state/track';

// Link de inscrição da Copa ACE (fornecido pelo patrocinador). Se algum dia
// ficar vazio, o banner simplesmente não aparece (ver trava 2 acima).
const DEST = 'https://aceprodutora.com.br/inscreva-se';

const SPONSOR = 'copa-ace';

// O criativo tem DATA impressa ("início 20.08"). Depois que o campeonato começa,
// anunciar inscrição é pior que não anunciar nada — o banner se aposenta sozinho.
// Formato ISO; null desliga a aposentadoria automática.
const RETIRE_AFTER: string | null = '2026-08-20';

const ADLABEL = { pt: 'publicidade', en: 'ad', es: 'publicidad' } as const;
const ALT = {
  pt: 'Copa ACE — campeonato de CS2 · R$1.500 em premiação · inscreva seu time',
  en: 'Copa ACE — CS2 tournament · R$1,500 prize pool · sign your team up',
  es: 'Copa ACE — torneo de CS2 · R$1.500 en premios · inscribe tu equipo',
} as const;

function retired(): boolean {
  if (!RETIRE_AFTER) return false;
  // compara só a data (sem hora): o banner vale ATÉ o dia do início, inclusive
  return new Date().toISOString().slice(0, 10) > RETIRE_AFTER;
}

export function AdBanner() {
  const [broken, setBroken] = useState(false);
  const hidden = broken || !DEST || retired();

  // reserva espaço no rodapé só enquanto o banner está visível
  useEffect(() => {
    if (hidden) return;
    document.body.classList.add('has-ad-footer');
    return () => document.body.classList.remove('has-ad-footer');
  }, [hidden]);

  if (hidden) return null;

  const lang = getLang();
  const label = ADLABEL[lang] ?? ADLABEL.pt;
  const alt = ALT[lang] ?? ALT.pt;

  return (
    <aside className="ad-footer" aria-label={label}>
      <div className="ad-footer-meta">
        <span className="ad-footer-label">{label}</span>
      </div>
      <a
        className="ad-footer-link"
        href={DEST}
        target="_blank"
        rel="noreferrer sponsored nofollow"
        aria-label={alt}
        onClick={() => track('ad_click', { sponsor: SPONSOR, placement: 'footer' })}
      >
        <picture>
          {/* mobile: 320×50 (2x 640×100 — 2x exato, ao contrário do 650×100 do G4) */}
          <source media="(max-width: 640px)" srcSet="/ads/ace10/320x50.jpg 1x, /ads/ace10/640x100.jpg 2x" />
          {/* tablet/intermediário: 728×90 */}
          <source media="(max-width: 820px)" srcSet="/ads/ace10/728x90.jpg" />
          {/* desktop: 970×90 (2x 1940×180) */}
          <img
            src="/ads/ace10/970x90.jpg"
            srcSet="/ads/ace10/970x90.jpg 1x, /ads/ace10/1940x180.jpg 2x"
            alt="Copa ACE"
            width={970}
            height={90}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        </picture>
      </a>
    </aside>
  );
}
