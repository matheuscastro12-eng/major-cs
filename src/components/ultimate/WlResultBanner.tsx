// [O0-22] Banner do resultado do Major da Semana no Hub: o fecho automático
// (Vercel Cron, domingo 00:05) paga o top 10 no ledger e, no login seguinte, o
// jogador vê "Você ficou em Nº" e coleta os coins no save. A coleta é
// idempotente no servidor (settleAck): em outro aparelho o banner some sem
// creditar de novo.
import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { UtPanel } from './UtPanel';
import { wlSettleAck, type WlLastSettle } from '../../state/weekendLeague';
import { ct } from '../../state/career-i18n';

const fmt = (n: number) => n.toLocaleString('pt-BR');

export function WlResultBanner({ last, onCredit }: { last: WlLastSettle | null; onCredit: (coins: number) => void }) {
  const [state, setState] = useState<{ windowId: string; phase: 'busy' | 'done' | 'error' } | null>(null);
  if (!last) return null;
  const mine = state?.windowId === last.windowId ? state.phase : null;
  if (mine === 'done') return null;

  const collect = async () => {
    setState({ windowId: last.windowId, phase: 'busy' });
    try {
      const r = await wlSettleAck(last.windowId);
      if (!r.replayed && r.prize > 0) onCredit(r.prize);
      setState({ windowId: last.windowId, phase: 'done' });
    } catch {
      setState({ windowId: last.windowId, phase: 'error' });
    }
  };

  return (
    <UtPanel label={ct('Major da Semana · resultado')} icon={<Trophy size={14} />} accent="amber" className="ut-wl-result">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
            {ct('Você ficou em')} {last.rank}º · +{fmt(last.prize)} coins
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ut-muted)' }}>
            {mine === 'error' ? ct('Não deu pra coletar agora. Tente de novo em instantes.') : ct('Prêmio de colocação do último fim de semana.')}
          </div>
        </div>
        <button className="ut-jogar" style={{ padding: '10px 18px' }} disabled={mine === 'busy'} onClick={() => void collect()}>
          {ct('COLETAR')}
        </button>
      </div>
    </UtPanel>
  );
}
