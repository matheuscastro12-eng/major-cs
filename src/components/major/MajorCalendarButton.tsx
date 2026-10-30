// Botão "Adicionar ao calendário" do PGL Major Singapore (.ics com o 1º dia
// do Stage 1 e os playoffs). Usado no Modo Major e na landing. O JSON do
// Major (fonte única das datas) e o gerador só carregam no clique: a landing
// fica no chunk inicial e não pode puxar os 32 times.
import { useState } from 'react';
import { CalendarPlus, Check } from 'lucide-react';
import { useLang } from '../../state/i18n';
import { shareUrl } from '../../state/shareLink';

export type CalendarSurface = 'major' | 'landing';

async function downloadIcs(lang: 'pt' | 'en' | 'es', surface: CalendarSurface): Promise<void> {
  const [{ default: data }, { buildMajorIcs }] = await Promise.all([
    import('../../data/major-singapore-2026.json'),
    import('../../engine/majorCalendar'),
  ]);
  const url = shareUrl('/major-singapore', `major-ics-${surface}`);
  const ics = buildMajorIcs(data.event, { lang, url, nowMs: Date.now() });
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = 'pgl-major-singapore-2026.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** `className` decide a cara (botão do ds ou link da faixa da landing); o rótulo vem de quem usa. */
export function MajorCalendarButton({ label, doneLabel, surface, className }: {
  label: string;
  doneLabel: string;
  surface: CalendarSurface;
  className?: string;
}) {
  const { lang } = useLang();
  const [done, setDone] = useState(false);
  const onClick = () => {
    void downloadIcs(lang, surface).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    }, () => { /* sem download (navegador bloqueou): o botão continua disponível */ });
  };
  return (
    <button type="button" className={className} onClick={onClick}>
      {done ? <Check size={16} aria-hidden /> : <CalendarPlus size={16} aria-hidden />}
      <span>{done ? doneLabel : label}</span>
    </button>
  );
}
