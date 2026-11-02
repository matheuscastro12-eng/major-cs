// Caixa de entrada estilo FM (a "nova interface"): lista de mensagens à
// esquerda com filtros por categoria e painel de leitura à direita, com a
// matéria completa da DRAFT5 e as AÇÕES dentro da mensagem (ir ao mercado,
// ver resultados, abrir olheiros…). No celular vira lista → leitura.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Inbox, Newspaper, MessageCircle } from 'lucide-react';
import { Panel, Segmented } from '../../components/ds/index';
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
  unread: number;
  onMarkAllRead: () => void;
  orgName?: string;
  /** ações dentro da mensagem: leva pra uma seção da carreira */
  onAction?: (section: string) => void;
}

// tempo de leitura estável por matéria (2–4 min), derivado do id
const readMinutes = (id: string) => {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  return 2 + (h % 3);
};

const CAT_TONE: Record<string, string> = {
  board: 'var(--c-brand)', scout: 'var(--c-role-rifler)', transfer: 'var(--c-role-support)',
  result: 'var(--c-win)', scene: 'var(--c-ink-dim)', social: 'var(--c-role-entry)',
};
const CAT_ACTIONS: Record<string, { label: string; section: string }[]> = {
  transfer: [{ label: 'Abrir o mercado', section: 'tf' }, { label: 'Ver contratos', section: 'ct' }],
  board: [{ label: 'Ver finanças', section: 'fi' }, { label: 'Ver agenda', section: 'ag' }],
  scout: [{ label: 'Abrir olheiros', section: 'sc' }, { label: 'Relatório do analista', section: 'an' }],
  result: [{ label: 'Ver classificação', section: 'cl' }, { label: 'Central de dados', section: 'dh' }],
  scene: [{ label: 'Ranking VRS', section: 'vr' }],
  social: [{ label: 'Ver o elenco', section: 'sq' }],
};

export function InboxTab({ news, newsCat, setNewsCat, unread, onMarkAllRead, orgName, onAction }: Props) {
  const all = news;
  const shown = newsCat === 'all' ? all : all.filter((n) => (n.cat ?? 'scene') === newsCat);
  // as N primeiras são as novas desta visita (a contagem zera logo ao abrir)
  const [unreadAtOpen] = useState(unread);
  const unreadIds = useMemo(() => new Set(all.slice(0, unreadAtOpen).map((n) => n.id)), [all, unreadAtOpen]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileReading, setMobileReading] = useState(false);
  const selected = shown.find((n) => n.id === openId) ?? shown[0] ?? null;

  // feed REAL da DRAFT5 (cenário de verdade) — best-effort
  const [feed, setFeed] = useState<{ items: Draft5FeedItem[]; link: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchDraft5Feed(5).then((f) => { if (alive) setFeed(f); });
    return () => { alive = false; };
  }, []);
  // abrir a caixa marca as manchetes como lidas (mesmo comportamento de antes)
  useEffect(() => {
    if (unread <= 0) return;
    const t = setTimeout(() => onMarkAllRead(), 600);
    return () => clearTimeout(t);
  }, [unread, onMarkAllRead]);

  const cats = NEWS_CATS.map((c) => ({ ...c, n: c.key === 'all' ? all.length : all.filter((x) => (x.cat ?? 'scene') === c.key).length }))
    .filter((c) => c.key === 'all' || c.n > 0);
  const idx = selected ? shown.findIndex((n) => n.id === selected.id) : -1;
  const open = (id: string) => { setOpenId(id); setMobileReading(true); };

  return (
    <div className="inbox" data-reading={mobileReading ? '' : undefined}>
      <Panel
        icon={<Inbox size={16} />}
        title={ct('Mensagens')}
        flush
        className="inbox-list"
        actions={unreadAtOpen > 0 ? <span className="gs-badge">{unreadAtOpen}</span> : undefined}
      >
        {all.length === 0 ? (
          <p className="inbox-empty">{ct('A redação ainda não publicou nada sobre a sua carreira. As matérias saem ao longo dos splits (resultados, diretoria, mercado, cenário e social).')}</p>
        ) : (
          <>
            <div className="inbox-filters">
              <Segmented<NewsCat | 'all'>
                label={ct('Filtrar por categoria')}
                value={newsCat}
                onChange={(v) => { setNewsCat(v); setOpenId(null); }}
                items={cats.map((c) => ({ value: c.key, label: ct(c.label), count: c.key === 'all' ? undefined : c.n }))}
              />
            </div>
            <div className="inbox-items" role="listbox" aria-label={ct('Mensagens')}>
              {shown.map((n) => {
                const on = selected?.id === n.id;
                const isNew = unreadIds.has(n.id);
                return (
                  <button
                    key={n.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className="inbox-item"
                    onClick={() => open(n.id)}
                  >
                    <span className="inbox-item__dot" data-new={isNew ? '' : undefined} aria-label={isNew ? ct('nova') : undefined} />
                    <span className="inbox-item__txt">
                      <span className="inbox-item__top">
                        <b style={{ color: CAT_TONE[n.cat ?? 'scene'] }}>{n.cat === 'social' ? (n.handle ?? 'Social') : draft5Category(n.cat)}</b>
                        <small>Split {n.split}</small>
                      </span>
                      <span className="inbox-item__title" data-new={isNew ? '' : undefined}>{n.cat === 'social' ? n.body : n.title}</span>
                      {n.cat !== 'social' && <span className="inbox-item__sub">{n.body}</span>}
                    </span>
                  </button>
                );
              })}
              {shown.length === 0 && <p className="inbox-empty">{ct('Nada nessa categoria ainda.')}</p>}
            </div>
          </>
        )}
      </Panel>

      <section className="inbox-read ds-panel" aria-live="polite">
        {selected ? (() => {
          const social = selected.cat === 'social';
          const author = draft5Author(selected.id, selected.cat);
          const paras = social ? [] : buildArticle({
            id: selected.id, title: selected.title, body: selected.body,
            cat: selected.cat, tone: selected.tone, split: selected.split,
            org: orgName ?? ct('sua organização'),
          });
          const actions = CAT_ACTIONS[selected.cat ?? 'scene'] ?? [];
          return (
            <article className="inbox-article">
              <button type="button" className="inbox-back" onClick={() => setMobileReading(false)}>
                <ArrowLeft size={16} aria-hidden /> {ct('Mensagens')}
              </button>
              <div className="inbox-kicker" style={{ color: CAT_TONE[selected.cat ?? 'scene'] }}>
                {social ? <MessageCircle size={14} aria-hidden /> : <Newspaper size={14} aria-hidden />}
                {social ? 'Social' : draft5Category(selected.cat)} · Split {selected.split}
              </div>
              <h2 className="inbox-title">{social ? (selected.handle ?? 'Social') : selected.title}</h2>
              {!social && (
                <p className="inbox-byline">
                  {ct('Por')} <b>{author.name}</b> · {author.role} · DRAFT5 · {readMinutes(selected.id)} {ct('min de leitura')}
                </p>
              )}
              <div className="inbox-body">
                <p className="inbox-lead">{selected.body}</p>
                {paras.map((p, i) => <p key={i}>{p}</p>)}
              </div>
              <footer className="inbox-actions">
                {actions.map((a, i) => (
                  <button key={a.section} type="button" className={i === 0 ? 'inbox-btn inbox-btn--primary' : 'inbox-btn'} onClick={() => onAction?.(a.section)}>
                    {ct(a.label)}
                  </button>
                ))}
                {idx >= 0 && idx < shown.length - 1 && (
                  <button type="button" className="inbox-btn inbox-btn--ghost" onClick={() => setOpenId(shown[idx + 1].id)}>
                    {ct('Próxima mensagem')} <ArrowRight size={15} aria-hidden />
                  </button>
                )}
              </footer>
            </article>
          );
        })() : (
          <p className="inbox-empty">{ct('Selecione uma mensagem.')}</p>
        )}

        {feed && feed.items.length > 0 && (
          <div className="inbox-real">
            <div className="ds-kicker">{DRAFT5_META.tagline} · {ct('cenário real')}</div>
            {feed.items.slice(0, 3).map((it) => (
              <a key={it.slug} className="inbox-real__item" href={draft5ArticleUrl(it.slug, feed.link)} target="_blank" rel="noreferrer noopener">
                <span>{it.title}</span>
                <ExternalLink size={13} aria-hidden />
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
