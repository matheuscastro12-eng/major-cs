// Placar oficial do Pick'em (api/pickem?action=board). Sem tabelas / API fora /
// nenhum palpite ainda → estado "em breve", nunca quebra a tela.
import { useEffect, useState } from 'react';
import { Medal } from 'lucide-react';
import { fetchPickemBoard, type PickemBoardRow } from '../../state/pickemApi';
import { useLang } from '../../state/i18n';
import { Panel, Skeleton } from '../ds';

const TXT = {
  pt: { title: "Placar do Pick'em", soon: "Em breve: o placar oficial abre quando os palpites do Stage 1 começarem (depois da lista oficial de 02/11).", empty: 'Ninguém pontuou ainda.', pts: 'pts', players: 'participantes', exact: 'cravadas' },
  en: { title: "Pick'em leaderboard", soon: 'Coming soon: the official leaderboard opens when Stage 1 picks start (after the official list on Nov 2).', empty: 'Nobody has scored yet.', pts: 'pts', players: 'players', exact: 'exact' },
  es: { title: "Ranking del Pick'em", soon: 'Muy pronto: el ranking oficial abre cuando empiecen los pronósticos del Stage 1 (después de la lista oficial del 02/11).', empty: 'Nadie sumó puntos todavía.', pts: 'pts', players: 'participantes', exact: 'exactas' },
};

export function PickemBoard({ top = 10 }: { top?: number }) {
  const { lang } = useLang();
  const t = TXT[lang as keyof typeof TXT] ?? TXT.pt;
  const [data, setData] = useState<{ total: number; soon: boolean; board: PickemBoardRow[] } | null | undefined>(undefined);
  useEffect(() => { let on = true; void fetchPickemBoard().then((d) => { if (on) setData(d); }); return () => { on = false; }; }, []);
  const rows = data?.board.slice(0, top) ?? [];
  return (
    <Panel title={t.title} actions={data && data.total > 0 ? <span className="msg-muted">{data.total} {t.players}</span> : undefined}>
      {data === undefined ? <Skeleton height={120} /> : !data || data.soon || data.total === 0 ? (
        <p className="msg-muted">{t.soon}</p>
      ) : rows.every((r) => r.points === 0) ? <p className="msg-muted">{t.empty}</p> : (
        <ol className="msg-board">
          {rows.map((r) => (
            <li key={`${r.rank}-${r.nick}`} className={`msg-board__row${r.rank <= 3 ? ' is-prize' : ''}`}>
              <span className="msg-board__rank">{r.rank <= 3 ? <Medal size={16} aria-label={`#${r.rank}`} /> : r.rank}</span>
              <span className="msg-board__nick">{r.nick}</span>
              <span className="msg-board__exact">{r.exact} {t.exact}</span>
              <strong className="msg-board__pts">{r.points} {t.pts}</strong>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
