import { useEffect, useRef } from 'react';
import { LANGS, useLang } from '../state/i18n';

// seletor de idioma (PT / EN / ES)
export function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-switch" role="group" aria-label="Idioma">
      {LANGS.map((l) => (
        <button
          key={l.code}
          className={`lang-btn${lang === l.code ? ' on' : ''}`}
          onClick={() => setLang(l.code)}
          title={l.code.toUpperCase()}
        >
          <span className="lf">{l.flag}</span> {l.label}
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
