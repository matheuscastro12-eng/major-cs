// [O0-25] Serviço ÚNICO de coleta de compras do Ultimate (coins e Passe).
//
// Antes, 5 efeitos do UltimateSquadScreen chamavam claimPaidCoins em paralelo
// e o crédito dependia do componente continuar montado: o servidor marcava o
// pedido 'claimed', o jogador trocava de aba, o cleanup punha `on = false` e as
// coins pagas nunca entravam no save (FRON-03). Erro de rede depois do claim
// no servidor também perdia a compra (o catch devolvia 0).
//
// Agora:
//   - o servidor credita no ledger ANTES de marcar (O0-46) e devolve TODOS os
//     vouchers da conta; o save absorve só os que ainda não viu (srvSeen) —
//     resposta perdida = o próximo claim entrega de novo, sem crédito duplo;
//   - a absorção roda na store global (useUltimate), fora de qualquer efeito:
//     desmontar a tela não descarta nada. O `on` do componente controla só a UI;
//   - uma coleta por vez (_claimInFlight): chamadas concorrentes esperam a
//     mesma promessa em vez de disparar N requests, e recebem 0/false — só
//     quem iniciou a coleta mostra o toast (nada de "+30k" duas vezes).
import { claimPaidCoins, claimPaidPassOrders } from './account';
import { useUltimate } from './ultimate';

let _claimInFlight: Promise<number> | null = null;
let _passInFlight: Promise<boolean> | null = null;

// Coleta coins pagas. Devolve quantas coins ENTRARAM no save agora (0 se nada
// novo, offline ou deslogado). Nunca lança.
export function collectPaidCoins(): Promise<number> {
  if (_claimInFlight) return _claimInFlight.then(() => 0);
  _claimInFlight = (async () => {
    try {
      const r = await claimPaidCoins();
      if (!r) return 0;
      const coins = r.vouchers.filter((v) => v.kind === 'coins');
      return useUltimate.getState().absorbPaidVouchers(coins, r.orders.map((o) => o.orderId)).credited;
    } catch {
      return 0;
    } finally {
      _claimInFlight = null;
    }
  })();
  return _claimInFlight;
}

// Coleta o Passe Premium pago. true = o premium foi ligado AGORA.
export function collectPaidPass(): Promise<boolean> {
  if (_passInFlight) return _passInFlight.then(() => false);
  _passInFlight = (async () => {
    try {
      const r = await claimPaidPassOrders();
      if (!r) return false;
      const passes = r.vouchers.filter((v) => v.kind === 'pass');
      return useUltimate.getState().absorbPaidVouchers(passes, r.orders.map((o) => o.orderId)).passUnlocked;
    } catch {
      return false;
    } finally {
      _passInFlight = null;
    }
  })();
  return _passInFlight;
}
