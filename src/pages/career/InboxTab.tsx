// Aba Inbox — T1.4 + T2.4 renovado.
//
// T2.4 (renovação):
//   - Badge de UNREAD no chip "Todas" (gold, destacado)
//   - Botão "Marcar tudo como lido" (ações do header da DashCard)
//   - Auto-mark on view: ao abrir a aba, zera save.unread após 600ms
//     (delay curto pra dar tempo do badge "aparecer" antes de sumir)

import { useEffect } from 'react';
import { DashCard } from '../../components/ds';
import { CareerIcon, CareerIconLegacy } from '../../components/career/CareerIcon';
import { NEWS_CATS, type NewsCat, type NewsItem } from '../../components/CareerScreen';
import { ct } from '../../state/career-i18n';

interface Props {
  news: NewsItem[];
  newsCat: NewsCat | 'all';
  setNewsCat: (c: NewsCat | 'all') => void;
  // T2.4: contador de unread vindo do save.unread
  unread: number;
  // T2.4: callback que zera save.unread (chamado on-view + via botão)
  onMarkAllRead: () => void;
}

export function InboxTab({ news, newsCat, setNewsCat, unread, onMarkAllRead }: Props) {
  const all = news;
  const shown = newsCat === 'all' ? all : all.filter((n) => (n.cat ?? 'scene') === newsCat);

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

  return (
    <DashCard title={ct('Caixa de entrada')} actions={headerActions}>
      {all.length === 0 ? (
        <p className="muted small">
          {ct('Sem novidades por enquanto. As manchetes aparecem ao longo da carreira (resultados, diretoria, mercado, cenário e social).')}
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
            {shown.map((n) => (
              n.cat === 'social' ? (
                <div key={n.id} className="news-item social">
                  <span className="news-ic"><CareerIcon name="chat" size={18} /></span>
                  <div className="news-body">
                    <div className="news-title">
                      <span className="news-handle">{n.handle}</span> <span className="news-split">Split {n.split}</span>
                    </div>
                    <div className="news-text">{n.body}</div>
                  </div>
                </div>
              ) : (
                <div key={n.id} className={`news-item ${n.tone}`}>
                  <span className="news-ic"><CareerIconLegacy icon={n.icon} size={18} /></span>
                  <div className="news-body">
                    <div className="news-title">{n.title} <span className="news-split">Split {n.split}</span></div>
                    <div className="news-text muted small">{n.body}</div>
                  </div>
                </div>
              )
            ))}
            {shown.length === 0 && <p className="muted small">{ct('Nada nessa categoria ainda.')}</p>}
          </div>
        </>
      )}
    </DashCard>
  );
}
