// Banner de patrocínio fixo no rodapé (sempre visível). Patrocinador atual: G4 Skins
// (código RTMBRASIL embutido no link de destino). Responsivo: 970×90 no desktop,
// 320×50 no mobile, com versões 2x pra telas retina. Se o arquivo da imagem não
// estiver no ar ainda (ou falhar), o banner se esconde sozinho — nada quebra.
import { useEffect, useState } from 'react';
import { getLang } from '../state/i18n';

const DEST = 'https://g4skins.com/ref/RTMBRASIL';

const ADLABEL = { pt: 'publicidade', en: 'ad', es: 'publicidad' } as const;

export function AdBanner() {
  const [broken, setBroken] = useState(false);

  // reserva espaço no rodapé só enquanto o banner está visível
  useEffect(() => {
    if (broken) return;
    document.body.classList.add('has-ad-footer');
    return () => document.body.classList.remove('has-ad-footer');
  }, [broken]);

  if (broken) return null; // asset ainda não subiu / falhou: não mostra nada

  const lang = getLang();
  const label = ADLABEL[lang] ?? ADLABEL.pt;

  return (
    <aside className="ad-footer" aria-label={label}>
      <span className="ad-footer-label">{label}</span>
      <a
        className="ad-footer-link"
        href={DEST}
        target="_blank"
        rel="noreferrer sponsored nofollow"
        aria-label="G4 Skins"
      >
        <picture>
          {/* mobile: 320×50 (2x 650×100) */}
          <source media="(max-width: 640px)" srcSet="/ads/320x50.jpg 1x, /ads/650x100.jpg 2x" />
          {/* tablet/intermediário: 728×90 */}
          <source media="(max-width: 820px)" srcSet="/ads/728x90.jpg" />
          {/* desktop: 970×90 (2x 1940×180) */}
          <img
            src="/ads/970x90.jpg"
            srcSet="/ads/970x90.jpg 1x, /ads/1940x180.jpg 2x"
            alt="G4 Skins"
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
