// Barra de navegação compartilhada entre as telas de admin. Cada link aponta pro
// caminho canônico; o roteador do App reage via popstate.
import { ct } from '../state/career-i18n';

const LINKS: [string, string][] = [
  ['/admin', 'Times'],
  ['/admin/acessos', 'Contas pagas'],
  ['/admin/financeiro', 'Financeiro'],
  ['/admin/liveops', 'Live-ops'],
  ['/admin/carreira', 'Carreira'],
  ['/admin/lab', 'Laboratório'],
];

export function AdminNav({ current }: { current: string }) {
  const go = (path: string) => {
    if (path === current) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return (
    <div className="admin-nav">
      <span className="admin-nav-brand">⚙ Admin</span>
      {LINKS.map(([path, label]) => (
        <button key={path} className={`admin-nav-btn${current === path ? ' on' : ''}`} onClick={() => go(path)}>{ct(label)}</button>
      ))}
    </div>
  );
}
