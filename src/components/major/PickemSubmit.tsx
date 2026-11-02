// Envio OFICIAL do Pick'em (api/pickem, #114). O palpite continua sendo feito
// nas telas do #113 e salvo no navegador; aqui ele é convertido (engine/
// pickemConvert) e enviado Stage a Stage. Precisa de conta (grátis vale). A
// trava (locks_at) é do relógio do SERVIDOR; aqui só mostra o estado.
// Sem tabela/stage aberto → "em breve" e nada muda (segue só no navegador).
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Lock, LogIn, Send } from 'lucide-react';
import type { MajorPicks } from '../../engine/majorSingapore';
import type { PickemStageId } from '../../engine/majorPickem';
import { toApiPick } from '../../engine/pickemConvert';
import { useAccount } from '../../state/account';
import { useLang } from '../../state/i18n';
import {
  PICKEM_SAVED_EVENT, fetchMyPicks, fetchPickemState, savePickemPick,
  type PickemMine, type PickemState,
} from '../../state/pickemApi';
import { Button, Panel, Skeleton, Tag } from '../ds';

const LABEL: Record<PickemStageId, string> = { s1: 'Stage 1', s2: 'Stage 2', s3: 'Stage 3', playoffs: 'Playoffs' };
type Status = { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'locked' } | { kind: 'error'; msg: string };

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function PickemSubmit({ picks, onLogin }: { picks: MajorPicks; onLogin?: () => void }) {
  const { lang } = useLang();
  const { account } = useAccount();
  const [state, setState] = useState<PickemState | null | undefined>(undefined);
  const [mine, setMine] = useState<PickemMine>({});
  const [status, setStatus] = useState<Partial<Record<PickemStageId, Status>>>({});

  const load = useCallback(async () => {
    const st = await fetchPickemState();
    setState(st);
    if (st?.stages.length && account) setMine((await fetchMyPicks()) ?? {});
  }, [account]);
  useEffect(() => { void load(); }, [load]);

  const send = async (stage: PickemStageId) => {
    const conv = toApiPick(picks, stage);
    if (!conv.ok) { setStatus((s) => ({ ...s, [stage]: { kind: 'error', msg: conv.error } })); return; }
    setStatus((s) => ({ ...s, [stage]: { kind: 'saving' } }));
    const r = await savePickemPick(stage, conv.pick);
    if (r.ok) {
      setStatus((s) => ({ ...s, [stage]: { kind: 'saved', at: r.savedAt } }));
      setMine((m) => ({ ...m, [stage]: { pick: conv.pick, savedAt: r.savedAt } }));
      window.dispatchEvent(new Event(PICKEM_SAVED_EVENT));
    } else setStatus((s) => ({ ...s, [stage]: r.locked ? { kind: 'locked' } : { kind: 'error', msg: r.error } }));
  };

  const title = lang === 'en' ? "Send to the official Pick'em" : lang === 'es' ? "Enviar al Pick'em oficial" : "Enviar pro Pick'em oficial";
  if (state === undefined) return <Panel title={title}><Skeleton height={80} /></Panel>;
  if (!state || state.stages.length === 0) {
    return (
      <Panel title={title}>
        <p className="msg-muted" data-testid="pickem-soon">Em breve: o envio oficial abre quando o Stage 1 for liberado (depois da lista oficial de 02/11). Até lá, seu palpite continua salvo neste navegador.</p>
      </Panel>
    );
  }
  if (!account) {
    return (
      <Panel title={title}>
        <p className="msg-pksend__hint"><LogIn size={16} aria-hidden /> Entre na sua conta (grátis vale) pra enviar seus palpites e concorrer ao prêmio.</p>
        {onLogin && <Button variant="primary" icon={<LogIn size={16} aria-hidden />} onClick={onLogin}>Entrar ou criar conta</Button>}
      </Panel>
    );
  }
  const now = new Date(state.serverNow).getTime();
  return (
    <Panel title={title} actions={<span className="msg-muted">{account.nick}</span>}>
      <ul className="msg-pksend">
        {state.stages.map((s) => {
          const locked = !s.locksAt || new Date(s.locksAt).getTime() <= now || status[s.stage]?.kind === 'locked';
          const st = status[s.stage];
          const saved = st?.kind === 'saved' ? st.at : mine[s.stage]?.savedAt;
          return (
            <li key={s.stage} className="msg-pksend__row">
              <strong>{LABEL[s.stage]}</strong>
              <span className="msg-muted">{s.locksAt ? `${locked ? 'travou' : 'trava'} em ${fmt(s.locksAt)}` : 'sem horário'}</span>
              <span className="msg-pksend__status">
                {locked && <Tag><Lock size={12} aria-hidden /> Travado</Tag>}
                {saved && <Tag tone="achievement"><Check size={12} aria-hidden /> Salvo {fmt(saved)}</Tag>}
                {st?.kind === 'error' && <Tag tone="loss"><AlertTriangle size={12} aria-hidden /> {st.msg}</Tag>}
              </span>
              {!locked && (
                <Button size="sm" variant={saved ? 'ghost' : 'primary'} icon={<Send size={14} aria-hidden />} disabled={st?.kind === 'saving'} onClick={() => void send(s.stage)}>
                  {st?.kind === 'saving' ? 'Enviando…' : saved ? 'Reenviar' : 'Enviar'}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="msg-muted">O que vale é o último envio antes da trava. Times de cada Stage seguem a lista oficial: refaça o palpite do Stage seguinte quando ele abrir.</p>
    </Panel>
  );
}
