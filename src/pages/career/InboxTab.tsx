// Aba Inbox — T1.4 + T2.4 + DRAFT5.
//
// DRAFT5 in-game: a caixa de entrada agora é a plataforma de notícias DRAFT5.
//   - Masthead com a marca (amarelo/preto, como o site real)
//   - Manchetes da carreira viram MATÉRIAS assinadas por redatores fictícios
//     (autor determinístico por id — mesma manchete, mesmo redator)
//   - Posts sociais continuam como posts (rede social ≠ redação)
//   - Rodapé "Direto da redação": feed REAL da Draft5 via /api/news
//     (proxy com cache de 15 min; se o feed falhar a seção some em silêncio)
//
// T2.4 (renovação):
//   - Badge de UNREAD no chip "Todas" (gold, destacado)
//   - Botão "Marcar tudo como lido" (ações do header da DashCard)
//   - Auto-mark on view: ao abrir a aba, zera save.unread após 600ms

import { useEffect, useState } from 'react';
import { DashCard } from '../../components/ds';
import { CareerIcon, CareerIconLegacy } from '../../components/career/CareerIcon';
import { NEWS_CATS, type NewsCat, type NewsItem } from '../../components/CareerScreen';
import {
  DRAFT5_META, draft5Author, draft5Category, draft5ArticleUrl,
  fetchDraft5Feed, type Draft5FeedItem,
} from '../../engine/career/draft5';
import { buildArticle } from '../../engine/career/newsroom';
import { ct } from '../../state/career-i18n';

interface Props {
  news: NewsItem[];
  newsCat: NewsCat | 'all';
  setNewsCat: (c: NewsCat | 'all') => void;
  // T2.4: contador de unread vindo do save.unread
  unread: number;
  // T2.4: callback que zera save.unread (chamado on-view + via botão)
  onMarkAllRead: () => void;
  // nome da org (ancora a análise da matéria aberta)
  orgName?: string;
}

// tempo de leitura fake mas estável (2-4 min) — vitrine, não métrica
const readMinutes = (id: string) => {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  return 2 + (h % 3);
};

export function InboxTab({ news, newsCat, setNewsCat, unread, onMarkAllRead, orgName }: Props) {
  const all = news;
  const shown = newsCat === 'all' ? all : all.filter((n) => (n.cat ?? 'scene') === newsCat);
  // matéria aberta pra leitura (null = feed)
  const [openId, setOpenId] = useState<string | null>(null);
  const openNews = openId ? all.find((n) => n.id === openId) ?? null : null;

  // feed real da Draft5 (cache de 15 min no cliente + 15 min no proxy)
  const [feed, setFeed] = useState<{ items: Draft5FeedItem[]; link: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchDraft5Feed(5).then((f) => { if (alive) setFeed(f); });
    return () => { alive = false; };
  }, []);

  // T2.4: marca tudo como lido ao abrir a aba (com delay pra UX não piscar).
  // Se a aba reabre depois (re-render), o efeito não dispara de novo enquanto
  // unread já estiver 0 (guard interno).
  useEffect(() => {
    if (unread <= 0) return;
    const t = setTimeout(() => onMarkAllRead(), 600);
    return () => clearTimeout(t);
  }, [unread, onMarkAllRead]);

  const headerActions = unread > 0 ? (
    <button
      type="button"
      className="btn small ghost"
      onClick={onMarkAllRead}
      title={ct('Marcar todas as manchetes como lidas')}
    >
      <CareerIcon name="check" size={12} /> {ct('Marcar tudo como lido')}
    </button>
  ) : undefined;

  // ---------- página de leitura da matéria (nos moldes da Draft5) ----------
  if (openNews) {
    const author = draft5Author(openNews.id, openNews.cat);
    const paras = buildArticle({
      id: openNews.id, title: openNews.title, body: openNews.body,
      cat: openNews.cat, tone: openNews.tone, split: openNews.split,
      org: orgName ?? ct('sua organização'),
    });
    return (
      <DashCard title="DRAFT5">
        <div className="d5-masthead">
          <span className="d5-logo">DRAFT5</span>
          <span className="d5-tagline">{DRAFT5_META.tagline}</span>
        </div>
        <article className="d5-page">
          <button type="button" className="btn small ghost d5-page-back" onClick={() => setOpenId(null)}>
            ← {ct('Voltar pro feed')}
          </button>
          <div className="d5-kicker">
            <span className="d5-cat">{draft5Category(openNews.cat)}</span>
            <span className="news-split">Split {openNews.split}</span>
          </div>
          <h1 className="d5-page-title">{openNews.title}</h1>
          <p className="d5-page-standfirst">{openNews.body}</p>
          <div className="d5-page-byline">
            <span className="d5-page-avatar">{author.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
            <span>
              {ct('Por')} <strong>{author.name}</strong> · {author.role}
              <span className="d5-page-meta">DRAFT5 · Split {openNews.split} · {readMinutes(openNews.id)} {ct('min de leitura')}</span>
            </span>
          </div>
          <div className="d5-page-body">
            {paras.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <div className="d5-page-footer">
            <span className="d5-logo small">DRAFT5</span>
            <span className="muted small">{ct('Cobertura do modo carreira · Road to Major')}</span>
          </div>
        </article>
      </DashCard>
    );
  }

  return (
    <DashCard title="DRAFT5" actions={headerActions}>
      <div className="d5-masthead">
        <span className="d5-logo">DRAFT5</span>
        <span className="d5-tagline">{DRAFT5_META.tagline}</span>
      </div>
      {all.length === 0 ? (
        <p className="muted small">
          {ct('A redação ainda não publicou nada sobre a sua carreira. As matérias saem ao longo dos splits (resultados, diretoria, mercado, cenário e social).')}
        </p>
      ) : (
        <>
          <div className="news-cats">
            {NEWS_CATS.map((c) => {
              const n = c.key === 'all' ? all.length : all.filter((x) => (x.cat ?? 'scene') === c.key).length;
              if (c.key !== 'all' && n === 0) return null;
              // T2.4: chip "Todas" mostra unread em badge dourado
              const showUnreadBadge = c.key === 'all' && unread > 0;
              return (
                <button
                  key={c.key}
                  className={`nc-chip${newsCat === c.key ? ' on' : ''}`}
                  onClick={() => setNewsCat(c.key)}
                >
                  {ct(c.label)}
                  <span className="nc-n">{n}</span>
                  {showUnreadBadge && (
                    <span
                      style={{
                        marginLeft: 6,
                        padding: '1px 6px',
                        borderRadius: 10,
                        background: 'var(--em-gold)',
                        color: '#1a1205',
                        fontSize: '0.66rem',
                        fontWeight: 800,
                        letterSpacing: '0.3px',
                      }}
                      title={`${unread} ${ct('não lida(s)')}`}
                    >
                      {unread > 99 ? '99+' : unread} novas
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="news-list">
            {shown.map((n) => {
              if (n.cat === 'social') {
                return (
                  <div key={n.id} className="news-item social">
                    <span className="news-ic"><CareerIcon name="chat" size={18} /></span>
                    <div className="news-body">
                      <div className="news-title">
                        <span className="news-handle">{n.handle}</span> <span className="news-split">Split {n.split}</span>
                      </div>
                      <div className="news-text">{n.body}</div>
                    </div>
                  </div>
                );
              }
              const author = draft5Author(n.id, n.cat);
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`news-item d5-article d5-clickable ${n.tone}`}
                  onClick={() => setOpenId(n.id)}
                  title={ct('Ler a matéria completa')}
                >
                  <span className="news-ic"><CareerIconLegacy icon={n.icon} size={18} /></span>
                  <div className="news-body">
                    <div className="d5-kicker">
                      <span className="d5-cat">{draft5Category(n.cat)}</span>
                      <span className="news-split">Split {n.split}</span>
                    </div>
                    <div className="news-title">{n.title}</div>
                    <div className="news-text muted small">{n.body}</div>
                    <div className="d5-byline">
                      {ct('Por')} <strong>{author.name}</strong> · {author.role} · DRAFT5 · <span className="d5-readmore">{ct('ler matéria')} →</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {shown.length === 0 && <p className="muted small">{ct('Nada nessa categoria ainda.')}</p>}
          </div>
        </>
      )}
      {feed && feed.items.length > 0 && (
        <div className="d5-real">
          <div className="d5-real-head">
            <span className="d5-logo small">DRAFT5</span>
            <span className="d5-real-title">{ct('Direto da redação — cenário real')}</span>
          </div>
          <div className="d5-real-list">
            {feed.items.map((it) => (
              <a
                key={it.slug}
                className="d5-real-item"
                href={draft5ArticleUrl(it.slug, feed.link)}
                target="_blank"
                rel="noreferrer noopener"
              >
                {it.image && <img className="d5-real-img" src={it.image} alt="" loading="lazy" />}
                <span className="d5-real-body">
                  <span className="d5-real-item-title">{it.title}</span>
                  <span className="d5-real-excerpt muted small">{it.excerpt}</span>
                  <span className="d5-byline">{it.author && <>{ct('Por')} <strong>{it.author}</strong> · </>}draft5.gg</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </DashCard>
  );
}
