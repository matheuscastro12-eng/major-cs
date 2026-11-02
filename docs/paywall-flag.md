# Flag do paywall (PR feat/paywall-pix-recovery)

**Padrão: DESLIGADA.** O deploy deste PR não muda nada para nenhum jogador.

Com a flag ligada, para quem não tem a vitalícia:
- Road to Pro (demo): trava logo depois da 2ª partida concluída, com o upsell no fim dela (`paywall_view` src `rtp-demo-match2`).
- Major Singapura (campanha jogada): Stage 1 grátis; do Stage 2 em diante, card de trava (`major-sg-gate`).
- Pick'em: vitrine e palpite do Stage 1 grátis; Stage 2, 3, playoffs e envio travados (`major-pickem-gate`).

## Como ligar/desligar sem deploy
1. Rodar UMA vez a migration `scripts/migrations/2026-11-02-paywall-settings.sql` (cria `rtm_settings` com a flag `off`).
2. Ligar: `UPDATE rtm_settings SET value='on', updated_at=now() WHERE key='paywall_gate';`
3. Desligar: `UPDATE rtm_settings SET value='off', updated_at=now() WHERE key='paywall_gate';`

Leva até ~5 min para todos verem (cache do GET `/api/liveops`). Sem a tabela, vale o env `PAYWALL_GATE=on|off` (na Vercel exige redeploy) e, sem ele, OFF.

QA no navegador, sem mexer no servidor: `?pwgate=1` liga e `?pwgate=0` desliga nesta aba.

## Medição
- `paywall_view {src, paywallGate:'on'}` nas 3 travas novas (trigger `gate`).
- `game_start`/`game_end {…, paywallGate}` voltaram (estavam bloqueados no cliente desde o corte de custo 3bf5f3f).
- `pix_confirmed {where, secondsOpen}`: o polling viu o Pix pago com o QR na tela.
- Compare dias/sids com `paywallGate` on × off (antes/depois de ligar).

## Lembrete de checkout abandonado
Preparado, **não envia**: `server/abandoned-checkout.ts` (template + candidatos, só SELECT), ação admin `abandonedCheckouts` em `/api/admin-accounts` e `scripts/abandoned-checkout-candidates.mts`. `REMINDER_SEND_ENABLED = false`; envio só num PR próprio com ok do Matheus.
