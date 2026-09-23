// Banner global "Não consegui salvar" [O0-26/FRON-04] + avisos da nuvem
// [O0-14/O0-27]. Lê a store saveHealth, que recebe:
//   - o lastPersistError da carreira (espelhado pelo gameStore), o persistError
//     do Ultimate e a campanha do Draft/Major (App.tsx);
//   - os bloqueios de sincronização: 'too-large' (413) e 'quota' (a nuvem tem um
//     save mais novo que não coube no aparelho).
// O RtP segue com o aviso próprio dentro do hub (saveError em RoadToPro.tsx).
//
// Visual provisório com cores explícitas (fora dos tokens --em-*, que só
// existem dentro das telas de modo); a fundação visual re-estiliza depois.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { getLang } from '../state/i18n';
import { retryFailedSaves, useSaveHealth, type CloudBlock, type LocalSaveMode } from '../state/saveHealth';
import { freeLocalSpace } from '../state/storageQuota';
import { downloadSaveBackup } from '../state/saveRecovery';
import { confirm } from './ConfirmDialog';

type Lang3 = { pt: string; en: string; es: string };
const pick = (t: Lang3): string => t[getLang() as keyof Lang3] ?? t.pt;

const MODE_LABEL: Record<LocalSaveMode, Lang3> = {
  career: { pt: 'a Carreira', en: 'your Career', es: 'la Carrera' },
  ultimate: { pt: 'o Ultimate', en: 'Ultimate', es: 'el Ultimate' },
  draft: { pt: 'a campanha do Major', en: 'the Major campaign', es: 'la campaña del Major' },
};

function slotLabel(slot: string): string {
  const m = /^career(?:-(\d))?$/.exec(slot);
  if (m) return `${pick({ pt: 'Carreira', en: 'Career', es: 'Carrera' })} (slot ${m[1] ?? '1'})`;
  if (slot === 'rtp') return 'Road to Pro';
  if (slot === 'ultimate') return 'Ultimate';
  if (slot === 'online') return pick({ pt: 'perfil online', en: 'online profile', es: 'perfil online' });
  return slot;
}

const STR = {
  failTitle: { pt: 'Não consegui salvar', en: "Couldn't save", es: 'No pude guardar' },
  failBody: {
    pt: 'O navegador recusou gravar {modes} (armazenamento cheio ou indisponível). O que você jogar agora pode se perder ao fechar a página.',
    en: 'The browser refused to store {modes} (storage full or unavailable). What you play now may be lost when you close the page.',
    es: 'El navegador rechazó guardar {modes} (almacenamiento lleno o no disponible). Lo que juegues ahora puede perderse al cerrar la página.',
  },
  free: { pt: 'Liberar espaço', en: 'Free up space', es: 'Liberar espacio' },
  backup: { pt: 'Baixar backup (JSON)', en: 'Download backup (JSON)', es: 'Descargar copia (JSON)' },
  retry: { pt: 'Tentar de novo', en: 'Try again', es: 'Reintentar' },
  freed: { pt: 'Liberei {n} item(ns) descartável(is) (backups antigos e cache).', en: 'Freed {n} disposable item(s) (old backups and cache).', es: 'Liberé {n} elemento(s) descartable(s) (copias viejas y caché).' },
  freedNone: { pt: 'Não havia nada descartável para apagar. Baixe o backup e libere espaço no navegador.', en: 'There was nothing disposable to delete. Download the backup and free up browser storage.', es: 'No había nada descartable para borrar. Descarga la copia y libera espacio en el navegador.' },
  tooBig: {
    pt: 'O save de {slot} passou do limite da nuvem e parou de sincronizar. Ele continua salvo neste aparelho.',
    en: 'The {slot} save went over the cloud limit and stopped syncing. It is still saved on this device.',
    es: 'La partida de {slot} superó el límite de la nube y dejó de sincronizar. Sigue guardada en este dispositivo.',
  },
  close: { pt: 'Fechar', en: 'Close', es: 'Cerrar' },
  quotaTitle: { pt: 'Libere espaço para baixar seu save da nuvem', en: 'Free up space to download your cloud save', es: 'Libera espacio para descargar tu partida de la nube' },
  quotaBody: {
    pt: 'A nuvem tem uma versão mais nova do seu save de {slot}, mas ela não coube neste aparelho. Até liberar espaço, este save não é enviado para a nuvem, para não apagar a versão nova. Liberar espaço apaga backups antigos e o cache da base de times (nenhum save) e recarrega a página.',
    en: 'The cloud has a newer version of your {slot} save, but it did not fit on this device. Until you free up space, this save is not uploaded, so the newer version is not overwritten. Freeing space deletes old backups and the team database cache (no saves) and reloads the page.',
    es: 'La nube tiene una versión más nueva de tu partida de {slot}, pero no cupo en este dispositivo. Hasta liberar espacio, esta partida no se sube a la nube, para no borrar la versión nueva. Liberar espacio borra copias viejas y la caché de equipos (ninguna partida) y recarga la página.',
  },
  quotaOk: { pt: 'Liberar espaço e tentar de novo', en: 'Free up space and retry', es: 'Liberar espacio y reintentar' },
  later: { pt: 'Agora não', en: 'Not now', es: 'Ahora no' },
} as const;

const bar: CSSProperties = {
  position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 9000, margin: '0 auto', maxWidth: 760,
  background: '#1d1414', color: '#f3e9e7', border: '1px solid #7a2f27', borderRadius: 10,
  padding: '12px 14px', boxShadow: '0 10px 30px rgba(0,0,0,.45)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14,
};
const infoBar: CSSProperties = { ...bar, background: '#15191f', border: '1px solid #3a4350', color: '#dfe5ec' };
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 };
const btn: CSSProperties = { background: 'transparent', color: 'inherit', border: '1px solid #4a525e', borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnMain: CSSProperties = { ...btn, background: '#e8c170', color: '#1a1408', border: '1px solid #e8c170' };

export function SaveHealthBanner() {
  const localErrors = useSaveHealth((s) => s.localErrors);
  const cloudBlocks = useSaveHealth((s) => s.cloudBlocks);
  const [note, setNote] = useState('');
  const [dismissed, setDismissed] = useState<Record<string, true>>({});
  const prompted = useRef(new Set<string>());

  // restore que não coube: modal (confirm do design system), uma vez por slot/sessão
  useEffect(() => {
    const quota = Object.values(cloudBlocks).find((b) => b.reason === 'quota' && !prompted.current.has(b.slot));
    if (!quota) return;
    prompted.current.add(quota.slot);
    void confirm({
      title: pick(STR.quotaTitle),
      message: pick(STR.quotaBody).replace('{slot}', slotLabel(quota.slot)),
      confirmLabel: pick(STR.quotaOk),
      cancelLabel: pick(STR.later),
    }).then((ok) => {
      if (!ok) return;
      freeLocalSpace();
      location.reload(); // o sync do boot tenta baixar de novo (trava 'quota' persistida)
    });
  }, [cloudBlocks]);

  const modes = Object.keys(localErrors) as LocalSaveMode[];
  const tooBig = Object.values(cloudBlocks).filter((b: CloudBlock) => b.reason === 'too-large' && !dismissed[b.slot]);

  if (modes.length > 0) {
    const names = modes.map((m) => pick(MODE_LABEL[m])).join(', ');
    return (
      <div style={bar} role="alert">
        <strong>⚠️ {pick(STR.failTitle)}</strong>
        <div style={{ marginTop: 4, lineHeight: 1.4 }}>{pick(STR.failBody).replace('{modes}', names)}</div>
        <div style={row}>
          <button
            type="button"
            style={btnMain}
            onClick={() => {
              const r = freeLocalSpace();
              setNote(r.removed.length > 0 ? pick(STR.freed).replace('{n}', String(r.removed.length)) : pick(STR.freedNone));
              retryFailedSaves();
            }}
          >
            {pick(STR.free)}
          </button>
          <button type="button" style={btn} onClick={() => { downloadSaveBackup('all'); }}>{pick(STR.backup)}</button>
          <button type="button" style={btn} onClick={() => { setNote(''); retryFailedSaves(); }}>{pick(STR.retry)}</button>
        </div>
        {note && <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>{note}</div>}
      </div>
    );
  }

  if (tooBig.length > 0) {
    const b = tooBig[0];
    return (
      <div style={infoBar} role="status">
        <div style={{ lineHeight: 1.4 }}>☁️ {pick(STR.tooBig).replace('{slot}', slotLabel(b.slot))}</div>
        <div style={row}>
          <button type="button" style={btn} onClick={() => { downloadSaveBackup('all'); }}>{pick(STR.backup)}</button>
          <button type="button" style={btn} onClick={() => setDismissed((d) => ({ ...d, [b.slot]: true }))}>{pick(STR.close)}</button>
        </div>
      </div>
    );
  }
  return null;
}
