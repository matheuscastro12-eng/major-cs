import { useEffect } from 'react';
import { useLang } from '../state/i18n';
import { ACHIEVEMENTS, unlockedIds, type AchDef, type Lang } from '../state/achievements';

const TITLE: Record<Lang, string> = { pt: 'Conquistas', en: 'Achievements', es: 'Logros' };
const CLOSE: Record<Lang, string> = { pt: 'Fechar', en: 'Close', es: 'Cerrar' };
const UNLOCKED: Record<Lang, string> = { pt: 'desbloqueada!', en: 'unlocked!', es: '¡desbloqueado!' };

function lg(lang: string): Lang {
  return (['pt', 'en', 'es'].includes(lang) ? lang : 'pt') as Lang;
}

// painel com todas as conquistas (desbloqueadas e bloqueadas)
export function AchievementsModal({ onClose }: { onClose: () => void }) {
  const { lang } = useLang();
  const L = lg(lang);
  const have = unlockedIds();
  const got = ACHIEVEMENTS.filter((a) => have.has(a.id)).length;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card ach-modal" onClick={(e) => e.stopPropagation()}>
        <div className="td-head">
          <div className="td-name">🏅 {TITLE[L]}</div>
          <span className="muted small">{got}/{ACHIEVEMENTS.length}</span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const on = have.has(a.id);
            return (
              <div key={a.id} className={`ach-item${on ? ' on' : ''}`}>
                <span className="ach-icon">{on ? a.icon : '🔒'}</span>
                <div>
                  <div className="ach-title">{a.t[L].title}</div>
                  <div className="ach-desc muted small">{a.t[L].desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// toast que aparece quando uma conquista é desbloqueada
export function AchievementToast({ items, onDone }: { items: AchDef[]; onDone: () => void }) {
  const { lang } = useLang();
  const L = lg(lang);
  useEffect(() => {
    const t = setTimeout(onDone, 4200 + items.length * 600);
    return () => clearTimeout(t);
  }, [items, onDone]);
  if (items.length === 0) return null;
  return (
    <div className="ach-toasts">
      {items.map((a) => (
        <div key={a.id} className="ach-toast">
          <span className="ach-icon">{a.icon}</span>
          <div>
            <div className="ach-toast-top">🏅 {a.t[L].title} <span className="muted small">{UNLOCKED[L]}</span></div>
            <div className="muted small">{a.t[L].desc}</div>
          </div>
        </div>
      ))}
      <button className="btn ghost small" onClick={onDone}>{CLOSE[L]}</button>
    </div>
  );
}
