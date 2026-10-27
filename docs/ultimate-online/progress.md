# progress — Ultimate online de verdade + evolução do Modo Major

- **Tarefa:** (1) elenco autoritativo no servidor e religar a ranqueada; (2) PvP com decisões simultâneas por beat resolvidas no servidor; (3) Modo Major: jogar partidas, pick'em, Major com amigos, polimento.
- **Restrições:** não mexer em preço/pagamentos/Stripe/Woovi. Engine puro (sem Math.random/Date.now). PR sem merge até o Matheus aprovar.
- **Estágio:** 0 concluído (diagnóstico + decisões). Próximo: Fase 1.

## Diagnóstico (27/10/2026)
- Duelo PvP: os dois clientes simulam com o mesmo `run_seed`; servidor não guarda round nem placar (`api/lobby.ts`).
- Ranqueada desligada (`RANKED_QUEUE_ENABLED`): squad vem do cliente com `ovr` e `chem` declarados (`api/lobby.ts` ação `pick`, clamp 0.8–1.2).
- Fila (`mm_queue`) identifica por **nick**, não por conta.
- Inventário no servidor (`rtm_ult_cards`) só existe para conta paga (espelho `ultimateShadow.ts`), e o `reconcileFlip` é "LOCAL VENCE": o cliente consegue empurrar cartas para o servidor. Posse no servidor ainda não é prova.

## Plano
### Fase 1 — elenco autoritativo
1. Ranqueada/evento exigem token de conta; fila e sala por e-mail.
2. `pick` recebe `cardIds` + formação; servidor confere posse em `rtm_ult_cards`, calcula OVR (catálogo + boost do meta) e química (`computeChemistry`) e grava o snapshot. Cliente não declara mais ovr/chem.
3. Fechar o "local vence": ganho de cartas/coins só por tx que o servidor valoriza (packs, mercado, recompensas com op_id do servidor).
4. Religar `RANKED_QUEUE_ENABLED` atrás de flag.
### Fase 2 — partida no servidor
- Tabela `ult_match` (code, seed, beat, placar, decisões por lado, prazo). Ações `matchState` e `decide`; servidor resolve o beat com o engine da Sala quando os dois decidem ou o prazo vence (escolha neutra). Abandono = W.O. após carência. Resultado vem do servidor (sem report pareado).
### Fase 3 — Modo Major
- Jogar séries do Major na Sala; pick'em com pontuação; liga privada com amigos; polimento.

## Decisões (Matheus, 27/10/2026)
- Inventário no servidor para TODAS as contas (grátis também); ranqueada aberta a todos com conta.
- Fim do "local vence": migração única que aceita o local uma última vez (guard anti-wipe + teto de sanidade); depois só o servidor cria carta.
- PvP: decisões simultâneas por beat, resolvidas no servidor (polling, sem WebSocket).
- Modo Major: jogar partidas, pick'em, Major com amigos, polimento — depois do Ultimate.

## Próximo passo
- Branch `feat/ultimate-online` a partir de origin/master; Fase 1 passo 2 (espelho para conta grátis) e passo 1 (token na fila).
