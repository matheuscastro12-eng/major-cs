import { useEffect, useRef } from 'react';
import { LANGS, useLang, type Lang } from '../state/i18n';
import { LangFlag } from './career/LangFlag';

const LANG_NAMES: Record<Lang, string> = {
  pt: 'Português (Brasil)',
  en: 'English',
  es: 'Español',
};

// seletor de idioma (bandeiras SVG)
export function LangSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`lang-switch${compact ? ' lang-switch-compact' : ''}`} role="group" aria-label="Idioma">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`lang-btn${lang === l.code ? ' on' : ''}`}
          onClick={() => setLang(l.code)}
          title={LANG_NAMES[l.code]}
          aria-label={LANG_NAMES[l.code]}
          aria-pressed={lang === l.code}
        >
          <LangFlag lang={l.code} size={compact ? 20 : 18} />
        </button>
      ))}
    </div>
  );
}

const TWITTER_HANDLE = 'castroomath';
const ANNOUNCEMENT_TWEET = 'https://x.com/castroomath/status/2064796416380149941';

// link para o perfil no X/Twitter
export function TwitterLink({ className }: { className?: string }) {
  const { t } = useLang();
  return (
    <a
      className={`x-link${className ? ` ${className}` : ''}`}
      href={`https://x.com/${TWITTER_HANDLE}`}
      target="_blank"
      rel="noreferrer"
    >
      𝕏 {t('social.follow')} <b>@{TWITTER_HANDLE}</b>
    </a>
  );
}

// embed oficial do tweet de anúncio (carrega o widget do X uma vez)
declare global {
  interface Window {
    twttr?: { widgets?: { load?: (el?: HTMLElement | null) => void } };
  }
}

export function AnnouncementTweet() {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderTweet = () => window.twttr?.widgets?.load?.(ref.current);
    const id = 'twitter-wjs';
    if (document.getElementById(id)) {
      renderTweet();
      return;
    }
    const s = document.createElement('script');
    s.id = id;
    s.src = 'https://platform.twitter.com/widgets.js';
    s.async = true;
    s.charset = 'utf-8';
    s.onload = renderTweet;
    document.body.appendChild(s);
  }, []);

  return (
    <div className="announce-tweet">
      <div className="muted small announce-label">{t('social.announcement')}</div>
      <div ref={ref}>
        <blockquote className="twitter-tweet" data-theme="dark" data-dnt="true" data-align="center">
          <a href={ANNOUNCEMENT_TWEET}>@{TWITTER_HANDLE}</a>
        </blockquote>
      </div>
      <noscript>
        <a href={ANNOUNCEMENT_TWEET} target="_blank" rel="noreferrer">
          Ver o anúncio no X
        </a>
      </noscript>
    </div>
  );
}
