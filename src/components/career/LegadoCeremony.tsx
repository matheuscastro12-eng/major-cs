// [super atualização 2 · LEGADO] Cerimônia de fim de temporada da cena.
// Contagem regressiva do Top 20 do ano (estilo HLTV: do #20 ao #1, um nome por
// vez), depois os prêmios (revelação, melhor técnico, MVPs dos eventos e time
// ideal). Com `prefers-reduced-motion`, tudo aparece de uma vez.
import { useEffect, useState, type CSSProperties } from 'react';
import { Award, Crown, Medal, Sparkles, Star, Trophy } from 'lucide-react';
import { Modal, Button, Tag, RoleChip } from '../ds/index';
import { Flag } from '../ui';
import { ct } from '../../state/career-i18n';
import { entryOf } from '../../engine/legado/premios';
import type { SceneYearAwards } from '../../engine/legado/model';
import '../../styles/legado.css';

type Step = 'intro' | 'count' | 'awards';
const STEP_MS = 520;

const reducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export function LegadoCeremony({ year, onClose, onShare }: { year: SceneYearAwards; onClose: () => void; onShare?: () => void }) {
  const total = year.top20.length;
  const [step, setStep] = useState<Step>(() => (reducedMotion() ? 'awards' : 'intro'));
  // quantos já foram revelados (do #20 pro #1)
  const [shown, setShown] = useState(() => (reducedMotion() ? total : 0));

  useEffect(() => {
    if (step !== 'count') return;
    if (shown >= total) {
      const t = window.setTimeout(() => setStep('awards'), 1600);
      return () => window.clearTimeout(t);
    }
    // o pódio (#3, #2, #1) demora mais: suspense de palco
    const left = total - shown;
    const t = window.setTimeout(() => setShown((n) => n + 1), left <= 3 ? STEP_MS * 2.4 : STEP_MS);
    return () => window.clearTimeout(t);
  }, [step, shown, total]);

  const revealed = year.top20.slice(total - shown).map((e, i) => ({ e, rank: total - shown + i + 1 }));
  const top = year.top20[0];
  const rev = entryOf(year, year.revelation);
  const mineTop1 = top?.teamId === 'user';

  return (
    <Modal open onClose={onClose} size="lg" title={`${ct('Cerimônia')} · ${ct('Temporada')} ${year.year}`}
      footer={(
        <div className="lgc-foot">
          {step === 'count' && <Button variant="ghost" onClick={() => { setShown(total); setStep('awards'); }}>{ct('Pular')}</Button>}
          {step === 'awards' && mineTop1 && onShare && <Button variant="achievement" onClick={onShare}>{ct('Compartilhar o card')}</Button>}
          <Button variant={step === 'awards' ? 'primary' : 'secondary'} onClick={onClose}>{step === 'awards' ? ct('Fechar') : ct('Depois')}</Button>
        </div>
      )}
    >
      <div className={`lgc lgc--${step}`}>
        {step === 'intro' && (
          <div className="lgc-intro">
            <span className="lgc-intro__trophy" aria-hidden><Trophy size={64} strokeWidth={1.4} /></span>
            <p className="lgc-intro__kicker">{ct('Prêmios da cena')} · splits {year.startSplit}–{year.endSplit}</p>
            <h2 className="lgc-intro__title">{ct('Os 20 melhores jogadores do ano')}</h2>
            <p className="lgc-intro__sub">{ct('Escolhidos pelos resultados e pelas estatísticas da temporada simulada. Depois: revelação, melhor técnico, MVPs e o time ideal.')}</p>
            <Button variant="achievement" size="lg" onClick={() => setStep('count')}><Sparkles size={18} aria-hidden /> {ct('Começar a cerimônia')}</Button>
          </div>
        )}

        {step === 'count' && (
          <div className="lgc-count" aria-live="polite">
            {revealed.length > 0 && (() => {
              const cur = revealed[0];
              return (
                <div key={cur.rank} className={`lgc-spot${cur.rank <= 3 ? ' lgc-spot--podium' : ''}${cur.e.teamId === 'user' ? ' is-mine' : ''}`}>
                  <span className="lgc-spot__rank">#{cur.rank}</span>
                  <span className="lgc-spot__nick"><Flag cc={cur.e.country} /> {cur.e.nick}</span>
                  <span className="lgc-spot__meta">{cur.e.team} · {cur.e.role}{cur.e.maps ? ` · rating ${cur.e.rating.toFixed(2)}` : ''}</span>
                </div>
              );
            })()}
            <ol className="lgc-list">
              {revealed.slice(1).map(({ e, rank }) => (
                <li key={e.id} className={e.teamId === 'user' ? 'is-mine' : undefined}><b>#{rank}</b> {e.nick} <span>{e.team}</span></li>
              ))}
            </ol>
          </div>
        )}

        {step === 'awards' && (
          <div className="lgc-awards">
            {top && (
              <section className={`lgc-poty${mineTop1 ? ' is-mine' : ''}`} style={{ '--d': 0 } as CSSProperties}>
                <span className="lgc-poty__badge" aria-hidden><Crown size={28} /></span>
                <p className="lgc-label">{ct('Jogador do ano')}</p>
                <p className="lgc-poty__nick"><Flag cc={top.country} /> {top.nick}</p>
                <p className="lgc-poty__meta">{top.team} · {top.role}{top.maps ? ` · rating ${top.rating.toFixed(2)} ${ct('em')} ${top.maps} ${ct('mapas')}` : ''}{top.titles ? ` · ${top.titles} ${top.titles === 1 ? ct('título') : ct('títulos')}` : ''}</p>
              </section>
            )}
            <div className="lgc-row">
              <section className="lgc-card" style={{ '--d': 1 } as CSSProperties}>
                <p className="lgc-label"><Star size={14} aria-hidden /> {ct('Revelação do ano')}</p>
                {rev ? <><b>{rev.nick}</b><span>{rev.team} · {rev.age} {ct('anos')}</span></> : <span>—</span>}
              </section>
              <section className="lgc-card" style={{ '--d': 2 } as CSSProperties}>
                <p className="lgc-label"><Award size={14} aria-hidden /> {ct('Melhor técnico')}</p>
                {year.coach ? <><b>{year.coach.nick}</b><span>{year.coach.team} · {year.coach.titles} {year.coach.titles === 1 ? ct('título') : ct('títulos')}</span></> : <span>—</span>}
              </section>
            </div>
            <section className="lgc-card lgc-card--wide" style={{ '--d': 3 } as CSSProperties}>
              <p className="lgc-label"><Sparkles size={14} aria-hidden /> {ct('Time ideal')}</p>
              <ul className="lgc-ideal">
                {year.ideal.map((id) => {
                  const e = entryOf(year, id);
                  return e ? <li key={id} className={e.teamId === 'user' ? 'is-mine' : undefined}><RoleChip role={e.role} /><b>{e.nick}</b><span>{e.team}</span></li> : null;
                })}
              </ul>
            </section>
            {year.mvps.length > 0 && (
              <section className="lgc-card lgc-card--wide" style={{ '--d': 4 } as CSSProperties}>
                <p className="lgc-label"><Medal size={14} aria-hidden /> {ct('MVPs dos eventos')}</p>
                <ul className="lgc-mvps">
                  {year.mvps.slice(0, 6).map((m) => (
                    <li key={m.eventId} className={m.teamId === 'user' ? 'is-mine' : undefined}>
                      {m.major ? <Tag tone="achievement">Major</Tag> : <Tag>Tier {m.tier}</Tag>}
                      <span className="lgc-mvps__ev">{m.event}</span>
                      <b>{m.nick}</b>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
