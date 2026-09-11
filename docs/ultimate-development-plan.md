# Ultimate — plano de desenvolvimento e continuidade

Data: 11/09/2026. Base inspecionada: `74de16f`, branch `master`.
Estado: planejamento concluído; nenhuma funcionalidade deste plano implementada.
Público: proprietário do produto e agente de desenvolvimento (Codex, Claude ou outro).

## 1. Objetivo e decisões de produto

Melhorar a diversão, a compreensão das partidas e o valor da coleção para aumentar primeira compra, recompra e retorno após a compra. Receita é a finalidade comercial; cliques isolados não demonstram sucesso.

O proprietário pediu brainstorming, aprovou a direção e solicitou este plano completo e transferível. A direção aceita inclui: correções de confiança, primeira sessão guiada, gameplay tático, jogador dos sonhos, estreia de reforços, oferta inicial com escolha, passe renovado, identidade do clube, coleções temáticas, rivalidades e eventos com elencos variados.

O trabalho atual é somente documentação. Os preços de novos produtos, os números de balanceamento e as artes ainda não foram definidos. Durante a implementação, produzir configurações e previews concretos; não inventar que essas decisões já foram aprovadas. Publicação e alteração de preços em produção não fazem parte da entrega deste documento.

Princípios:

- Uma compra deve explicar preço, conteúdo, condições e entrega antes do pagamento.
- Não prometer vitória, cartas específicas em sorteios sem garantia, escassez artificial ou preservação absoluta de saves.
- Manter progressão gratuita viável; não reduzir recompensas apenas para provocar compras.
- Melhorar decisões e leitura do jogo sem tornar cartas existentes inúteis.
- Reutilizar sistemas existentes. Não recriar draft, mercado, missões, temporadas, títulos ou estilos com nomes diferentes.
- Desacoplar lançamento de funcionalidades: cada lote deve ser revisável, testável e reversível.

## 2. Evidências e limites da inspeção

Inspeção feita no código, sem navegação visual, acesso a métricas de produção ou teste de compra. Comentários antigos com taxas de conversão não são uma baseline atual. Confirmar novamente estes achados na branch de implementação.

| Achado | Evidência/local | Consequência |
|---|---|---|
| Texto diz 30k por TOTS e 120k por quatro TOTS; custo é 38k | `UltimateSquadScreen.tsx`, nota da coinshop; `packs.ts`, `PACK_DEFS` | Oferta inconsistente; gerar comparações a partir da definição vigente |
| Vitrine promete um dos sete TOTW da semana; catálogo acumula semanas até o fim do mês | `totw.ts`, `totwSpecsThroughMonth`; `server/ultimate-pack.ts`, `openPack` | Separar catálogo de propriedade e pool elegível para abertura |
| Convidado tenta comprar coins e recebe instrução para voltar à tela inicial | `UltimateSquadScreen.tsx`, `buyCoins`/`buyCoinsCard` | Preservar intenção e retornar ao produto após autenticação |
| Packs sem saldo ficam desabilitados | Render da loja no mesmo componente | Oferecer caminhos claros para obter saldo, sem iniciar cobrança automaticamente |
| Passe custa R$30; coins de R$30 entregam 120k imediatamente | `seasonPass.ts`, coinshop, `api/account.ts` | Hipótese de valor percebido fraco; não prova de baixa conversão |
| Onboarding termina em revelação/coleção | `claimStarter`, render de onboarding e reveal | Falta condução explícita até partida, ajuste e segunda partida |
| Telemetria filtra eventos de jogo no cliente | `src/state/track.ts` | Criar funil pequeno, com limite de custo, cobrindo Ultimate |
| Simulação antecede replay e registro ocorre no início | `playMatch`/`startPvpMatch` em `UltimateSquadScreen.tsx` | Timeout interativo exige execução incremental e revisão de persistência |
| PvP usa snapshot compacto e simulação dos dois clientes | `UltimatePvpSquad`, `UltimateDuel.tsx`, `startPvpMatch` | Táticas novas exigem contrato versionado e validação |
| Engine e química já têm efeitos | `chemistry.ts`, `traits.ts`, `match.ts` | Auditar composição antes de adicionar bônus |

`docs/ultimate-team-roadmap.md` é histórico e descreve persistência como adiada. Não usá-lo como fonte do estado atual. `CONTEXT.md` contém convenções e termos do Road to Pro; o Ultimate é outro fluxo. Não confundir a Sala do RtP com o replay do Ultimate.

## 3. Mapa técnico para começar

| Área | Arquivos existentes a ler |
|---|---|
| Tela e ações do modo | `src/components/ultimate/UltimateSquadScreen.tsx`, `UltimateGate.tsx`, `UtPanel.tsx`, `src/styles/ultimate.css` |
| Entrada e pagamento da conta | `src/App.tsx`, `src/components/Home.tsx`, `src/components/UpsellCard.tsx` |
| Estado e compatibilidade | `src/state/ultimate.ts`, `src/engine/ultimate/state.ts`, `src/state/ultimateShadow.ts`, `src/state/saveMigrations.ts` |
| Simulação compartilhada | `src/engine/match.ts`, `src/engine/rng.ts`, `src/components/online/MatchReplay.tsx` |
| Times e efeitos | `src/engine/ultimate/chemistry.ts`, `traits.ts`, `cards.ts`; localizar `buildOnlineTeam` e `squadDuelBonus` |
| PvP e resultado | `src/components/ultimate/UltimateDuel.tsx`, `src/state/online.ts`, `api/lobby.ts`, `api/_reportPairing.ts`, `api/ranking.ts`, `server/ranked-report.test.ts` |
| Catálogo e packs | `src/engine/ultimate/packs.ts`, `totw.ts`, `promos.ts`, `catalog.ts`, `server/ultimate-pack.ts`, `server/ultimate-catalog-lazy.ts`, `server/ultimate-catalog.snapshot.ts` |
| Carteira e mercado | `api/ultimate-economy.ts`, `server/ultimate-economy.ts`, `server/ultimate-market.ts`, `src/state/ultimateMarket.ts` |
| Pagamentos | `src/state/account.ts`, `api/account.ts`, `api/stripe-webhook.ts`, `api/woovi-webhook.ts`, `server/payments.ts` |
| Progressão | `src/engine/ultimate/seasonPass.ts`, `daily.ts`, `missions.ts`, `weeklyMissions.ts`, `objectives.ts`, `seasonRewards.ts`, `sbc.ts`, `titles.ts` |
| Operação e aquisição | `src/state/track.ts`, `api/track.ts`, `api/metrics.ts`, `src/components/RevenueCRM.tsx`, `LiveopsCRM.tsx`, `src/state/liveops.ts`, `src/components/ultimate/shareCard.ts` |

Os caminhos nesta documentação são relativos à raiz para funcionar em outra máquina. Conferir instruções `AGENTS.md`/`CLAUDE.md` existentes no ambiente antes de editar.

## 4. Sequência e dependências

Ordem recomendada: U00 → U01 → U02 → U03 → U04 → U05 → U06 → U07 → U08 → U10 → U09 → U11 → U12. Os IDs identificam os lotes; U10 precede U09 para fornecer os cosméticos usados pelo passe.

U05 pode ser lançado antes do timeout U06. U07 depende do avaliador de elenco de U03. U08 depende de U01/U02/U07. U09 depende de U02 e do contrato de compras auditado em U08. U10 antecede a parte cosmética de U09 se o passe incluir esses itens. U11/U12 dependem do contrato de partidas estabilizado. Não é necessário esperar todos os lotes para entregar valor.

| Marco | Conteúdo | Condição de saída |
|---|---|---|
| A — base confiável | U00–U02 | Promessas corretas, entrega de compra preservada e baseline mensurável |
| B — jogar e entender | U03–U05 | Tática pré-jogo funcional, pós-jogo fundamentado e primeira sessão completa |
| C — decisões durante o jogo | U06 | Timeout real, retomada e consistência entre participantes |
| D — coleção e receita | U07–U10 | Objetivo persistente, ofertas claras e produtos entregues corretamente |
| E — retorno social | U11–U12 | Rivalidades e eventos utilizáveis, com medição e operação sustentável |

Complexidade relativa: P = localizada; M = vários componentes; G = engine/estado/protocolo. Não são estimativas de prazo.

## 5. Backlog executável

### U00 — baseline e contratos atuais [M]

- Ler mapa técnico, registrar branch/commit e estado do checkout; preservar alterações existentes.
- Executar baseline de build/testes; distinguir falhas anteriores das introduzidas. Inspecionar visualmente desktop e mobile, onboarding, partida, loja e retorno do checkout em ambiente de teste.
- Documentar fluxo da carteira local, espelhamento, autoridade do servidor, cloud save e resgate de pagamento. Identificar quais campos o cliente pode alterar e quais o servidor valida.
- Auditar diferenças entre casual, gauntlet, draft, duelo privado, ranqueada e Major da Semana. Registrar exatamente quando resultado e recompensa são persistidos.
- Entrega: seção de descobertas no registro de continuidade, com riscos reproduzidos e comandos/resultados. Não executar migração de produção nem compra real.

Aceite: outra pessoa consegue seguir entrada → partida → recompensa → compra; pontos de autoridade e diferenças entre modos estão explícitos.

### U01 — confiança da loja e pools de packs [M]

- Remover exemplos monetários fixos; derivar quantidades/custos de definições compartilhadas e arredondar quantidades para baixo.
- Criar resolvedor puro de pool elegível por produto/data, compartilhado pelo servidor e caminhos locais. Catálogo completo continua resolvendo cartas já adquiridas.
- Para TOTW, garantir que o slot prometido usa os sete vigentes. Verificar Promo e demais garantias no mesmo trabalho, inclusive overrides de live-ops.
- Mostrar garantia, pool elegível e probabilidades efetivas coerentes com garantias/fallbacks. Não apresentar peso de raridade como probabilidade total do pack.
- Definir comportamento de pool vazio: indisponibilidade explícita, sem débito, em vez de substituir silenciosamente a promessa.

Aceite: 30k não aparece como suficiente para TOTS de 38k; nenhuma carta fora do pool ocupa garantia semanal; rotação não apaga cartas antigas; retry não debita duas vezes. Testes em fronteira de semana/mês e fuso escolhido explicitamente para cliente/servidor.

### U02 — funil e baseline de negócio [M]

- Definir eventos enxutos: `ultimate_enter`, `starter_claimed`, `match_started`, `match_completed`, `squad_adjusted`, `second_match_started`, `target_selected`, `offer_viewed`, `purchase_intent`, `checkout_open`, `checkout_error`, `purchase_fulfilled`.
- Reutilizar eventos existentes quando compatíveis; distinguir `product_kind` (conta/coins/passe/oferta/cosmético), `source`, versão da experiência, modo e identificador de partida/pedido quando necessário.
- Compra entregue deve vir de confirmação autoritativa e deduplicar pelo pedido. Eventos de UI não comprovam receita. Nunca enviar e-mail, token ou dados de pagamento na telemetria.
- Escolher retenção e agregação antes de ligar: eventos de marcos, sem chamada por round; dedupe, limite de volume e observação do custo do backend.
- Documentar denominadores e janela: conclusão da primeira partida por novos entrantes; segunda partida por concluintes; D1/D7 por coorte; primeira compra por novos jogadores; recompra em 30 dias por compradores; receita por ativo; erros de entrega. Distinguir visitantes anônimos de contas e explicitar limitações de identificação.
- Incluir no painel existente ou consulta reproduzível; não criar painel novo se o CRM puder acomodar.

Aceite: percurso de teste aparece uma vez por marco; pedido confirmado conta uma vez; rejeição/abandono não contam como compra. Capturar baseline antes de comparar versões, sem inventar meta percentual ou causalidade com amostra insuficiente.

### U03 — avaliador de elenco e tática pré-jogo [G]

- Mapear contribuição de atributos, química (atualmente 0,90–1,10), evolução e estilos/traits. No casual há multiplicador extra de evolução; no PvP viajam OVR e `chem`. Verificar equivalência real, sem presumir bug somente pela diferença de código.
- Criar adaptador único do Ultimate para preparação de times; manter regras específicas fora do comportamento padrão do engine compartilhado.
- Derivar perfil de elenco dos atributos/funções existentes: abertura, suporte/troca, controle e fechamento, apenas onde houver dados que sustentem o cálculo. Não inventar estatísticas de jogadores.
- Exibir até dois pontos fortes e uma fragilidade, incluindo causa. Revisar role-fit flexível sem invalidar silenciosamente elencos existentes.
- Adicionar três abordagens iniciais (agressividade, controle, adaptação) com custo e benefício contextuais. Definir tabela e teto após simular baseline; não fixar percentuais comerciais como se fossem balanceamento validado.
- IA deve ter perfis variados e composição válida, não apenas os cinco OVR mais próximos. Dificuldade explícita; sem ajustar secretamente chance por histórico de compras.
- PvP: snapshot versionado com escolhas, identidade de cartas/slots necessária, versão do engine e catálogo. Validar no servidor limites, propriedade/eligibilidade conforme contrato atual e compatibilidade dos dois lados. Não esconder bônus novos dentro de `chem` indefinidamente.
- Travar escolhas antes da simulação; documentar o que o oponente pode ver. Cliente incompatível não inicia partida com resultado divergente.

Aceite: mesmos inputs/seed/versão geram mesmo resultado; inverter perspectiva preserva vencedor canônico; nenhuma tática é melhor em todos os cenários da bateria; química/função/traits não contam o mesmo benefício duas vezes; nenhum produto pago entra como multiplicador oculto.

### U04 — pós-jogo com evidências [M]

- Criar relatório a partir dos eventos/estatísticas reais e dos modificadores aplicados. Separar observação (aconteceu) de efeito modelado (bônus aplicado); não afirmar causalidade contrafactual sem cálculo.
- Até três insights, com ações de ajuste/tática/coleção. Reutilizar componentes de análise existentes quando fizer sentido.
- Auditar `liveDrama`/`liveFrags`: narração ou killfeed de apresentação não pode virar prova de um evento que o engine não registrou.
- Mostrar comparação de desempenho do reforço sem prometer que ele teria revertido a derrota.

Aceite: cada frase referencia evidência ou efeito registrado; relatório é idêntico ao reabrir partida; há fallback honesto quando o dado não existe; nenhum placar contradiz replay ou recompensa.

### U05 — primeira sessão guiada [M]

- Jornada persistente e retomável: receber time → conhecer força → treino curto → relatório → ajuste gratuito → segunda partida → escolher objetivo.
- Reaproveitar starter atual e evitar nova concessão ao migrar usuário já onboarded. Tutorial opcional e dispensável para veteranos.
- CTA pós-reveal contextual: comparar/escalar/estrear, além de coleção. Na primeira experiência, destacar próxima ação e reduzir competição visual do hub sem remover acesso às demais abas.
- Não depender de adversário online para concluir tutorial. IA identificada como IA e treino sem efeito indevido no ladder.

Aceite: completar em mobile sem procurar instruções externas; refresh retoma etapa; voltar/pular não bloqueia modo; starter e recompensas não duplicam; conseguir ajustar e jogar com recursos gratuitos.

### U06 — timeout interativo real [G, dependência arquitetural]

Estado atual: resultado inteiro é calculado antes do replay. Um botão durante essa animação não muda a partida já registrada. Não entregar esse placebo.

- Introduzir execução incremental do Ultimate com estado de partida persistível: seed/estado de RNG, cursor de round, placar, economia e demais variáveis necessárias, elencos travados, decisões, versão e status.
- Proposta inicial: no máximo um timeout por lado/mapa, em intervalo entre rounds; escolha muda contexto dos próximos rounds dentro de um teto. Validar duração e números em simulação.
- Casual primeiro, mantendo possibilidade de replay do log completo. Não recalcular rounds resolvidos. Idempotência do término e recompensa por `matchId`.
- PvP exige checkpoint autoritativo e decisões ordenadas no servidor, prazo comum e escolha padrão neutra por ausência. Resolver decisões simultâneas de forma simétrica, sem vantagem por ordem de chamada.
- Definir desconexão, reconexão, encerramento por abandono e expiração da sala antes de lançar. Recarregar não permite re-rolar seed, escolher de novo após ver resultado ou evitar derrota.
- Manter partidas antigas no executor correspondente até encerrar. Novo protocolo deve ser habilitado somente para pares compatíveis.
- Orçar tráfego: sincronizar decisões/checkpoints necessários; não acrescentar polling por frame. Se custo/complexidade bloquearem PvP, publicar timeout real somente no casual, registrando PvP como pendente, não concluído.

Aceite: timeout altera apenas futuro; duas instâncias produzem mesmo placar; refresh/disconnect/retry/replay não duplicam prêmios nem desfazem decisões; ausência tem término definido; custo por partida medido.

### U07 — jogador dos sonhos e estreia do reforço [M]

- Selecionar uma carta-alvo; salvar chave estável e progresso. Caminhos existentes: mercado disponível, desafios aplicáveis e obtenção gratuita quando existir. Não inventar disponibilidade ou chance individual.
- Mostrar saldo faltante, requisitos e alternativas; trocar alvo sem perder patrimônio. Alvos fora de circulação continuam visíveis com disponibilidade correta.
- Comparar titular/reforço usando avaliador U03: função, química e perfil antes/depois. Preview sem consumir item; confirmar escalação explicitamente.
- Ao adquirir, oferecer escalar e estrear. Não substituir carta listada/travada nem vender titular automaticamente.

Aceite: alvo sobrevive a reload/sync; preview bate com escalação real; alvo indisponível tem tratamento; fluxo funciona para quem não compra.

### U08 — compra contextual e oferta inicial com escolha [G]

- Retomar intenção após login/cadastro, mantendo produto e destino; cancelamento volta ao contexto. Não gerar cobrança antes da confirmação do usuário.
- Para saldo insuficiente, mostrar quanto falta e opções ganhar/comprar. Preservar catálogo de coins atual até decisão explícita de preços.
- Especificar oferta inicial de conteúdo conhecido: escolha entre reforços equilibrados e cosmético, com preço configurável ainda a definir. Comparar valor com produtos atuais e fontes de moeda antes de ativar.
- Definir elegibilidade única por conta no servidor, catálogo/versionamento da oferta e política de escolha. Garantir benefício para comprador antigo quando necessário por regra explícita, sem pressupor concessão universal.
- Reusar Pix/Stripe/pedidos, fulfillment e recuperação existentes; registrar versão/conteúdo/preço no pedido. Validar tudo no servidor.
- Webhook repetido, pagamento atrasado, sessão expirada, duas abas, troca de aparelho e estorno precisam de estado definido. Recuperação de compra não pode criar duplicação de patrimônio.

Aceite: conteúdo/preço final claros; débito/entrega exatamente uma vez; escolha retomável após pagamento; produto indisponível não cobra; sandbox cobre sucesso e falhas; nenhum pagamento real de teste.

### U09 — passe com identidade e valor imediato [G]

- Simular economia atual e proposta: moedas, packs, itens, duração, XP, ganho por atividade e custo em partidas para casual/ativo. Comparar com coins de R$30 sem alegar equivalência exata de itens aleatórios.
- Propor tema e benefício imediato principalmente cosmético, escolhas em marcos e preview do que já pode ser resgatado. Preço inicial permanece configuração atual até decisão comercial documentada.
- Não oferecer em fim de temporada sem destacar prazo, progresso atual e recompensas imediatamente disponíveis. Considerar regra de compra tardia na proposta, com impacto econômico explícito.
- Versionar trilhas; preservar direitos de passes comprados e resgates legados. Rollover não apaga inventário ou pedido pago; pagamento atravessando virada tem tratamento definido.

Aceite: premium entrega benefício imediato anunciado; direitos antigos preservados; compra tardia transparente; migração e virada testadas; equilíbrio econômico documentado antes de ativar novos valores.

### U10 — identidade do clube e coleções temáticas [M/G]

- Cosméticos: começar com moldura de carta, escudo/variações próprias e apresentação do squad. Preview antes da compra, inventário/equipamento persistentes, visibilidade no perfil e compartilhamento.
- Reutilizar títulos existentes. Cosmético nunca altera força. Usar ativos próprios ou licenciados e registrar origem dos novos assets.
- Coleções temáticas reaproveitam catálogo, objetivos e recompensas: requisitos claros, progresso por identidade definida (carta única/cópia/variante), prêmio idempotente.
- Definir se coleção exige posse atual ou descoberta histórica; não consumir cartas implicitamente. Premiação vem de orçamento econômico, não de números arbitrários.

Aceite: tema legível mobile/desktop, equipamento sincronizado e sem efeito no resultado; vender/trocar cartas respeita regra declarada; prêmio não repete; coleções seguem válidas após rotação.

### U11 — rivalidades e convites [M/G]

- Reutilizar duelo privado/revanche: histórico entre contas, convite por link/código, comparação de confrontos e card compartilhável com destino funcional.
- Evitar dependência exclusiva de sala temporária para histórico. Identidade é conta/ID, não apelido mutável.
- Nenhum bônus monetário por convite na primeira versão. Se houver prêmio futuro, desenhar elegibilidade e proteção contra auto-convite/farming antes.
- Pequenos campeonatos devem reutilizar infraestrutura existente após mapear capacidade; não lançar novo bracket sem regras de abandono e avanço.

Aceite: convite funciona com usuário deslogado e logado; link expirado explica próximo passo; histórico consistente para os dois lados; compartilhar é ação explícita, sem mensagem automática para terceiros.

### U12 — eventos com elencos variados e operação [G]

- Reutilizar formatos existentes quando aplicáveis: teto de OVR, região, funções ou eras; configuração versionada com janela, regras, recompensas e timezone.
- Começar com poucos eventos rotativos para não fragmentar matchmaking. Definir alternativa casual identificada quando a fila estiver vazia, sem simular humano.
- Validar elegibilidade no servidor ao entrar e travar elenco durante partida. Recompensa idempotente e orçamento conhecido; restrições não podem ser burladas trocando squad depois de entrar.
- Live-ops: preview, agendamento, publicação, encerramento e desligamento; preservar regras de runs já iniciadas.

Aceite: início/fim/fuso e partidas em andamento funcionam; restrição vale para ambos; catálogo dá caminhos gratuitos viáveis; custo, participação e tempo de espera observáveis.

## 6. Arquitetura e migrações

- Extrair componentes e hooks por fluxo quando forem tocados; evitar reescrita total do grande `UltimateSquadScreen.tsx` como pré-requisito.
- Novos nomes possíveis (ainda não existem): `squadAnalysis.ts`, `tacticalPlan.ts`, `matchEvidence.ts`, `ultimateMatchSession.ts`. Confirmar módulos equivalentes antes de criar.
- Engine puro recebe relógio/RNG/entradas. Camada de estado persiste; UI apresenta. Regras do Ultimate entram por adaptador/opções explícitas no engine compartilhado.
- Save: versão, defaults para saves antigos, sanitização, migração idempotente, merge de nuvem e estratégia de conflito para novos campos. Testar comprador antigo e convidado que cria conta.
- Carteira/entitlements: servidor valida preço, elegibilidade e fulfillment. Não assumir que espelhamento atual já dá autoridade completa; U00 deve esclarecer isso.
- Schema novo: migração aditiva versionada, deploy compatível e backfill retomável se necessário. Nenhuma remoção de campo/registro como primeira etapa.
- Flags propostas por subsistema: tática v2, sessão incremental, onboarding v2, oferta inicial, passe v2, eventos. Preferir mecanismo existente. Desligar venda não pode desligar entrega de pedidos já pagos.

## 7. Verificação e lançamento

Comandos existentes, executar conforme escopo e runtime compatível com `package.json`:

```sh
npm run build
npm run lint
npm test
npm run test:sim
```

Executar testes direcionados durante cada lote e suíte ampla ao tocar engine, save, pagamento ou protocolo. Registrar baseline para não atribuir falhas antigas à mudança; não consertar problemas alheios silenciosamente.

Matriz de gameplay: seeds fixas; times equivalentes/diferentes; química baixa/alta; todas as táticas contra todas; mapas/lados; elencos evoluídos e históricos; casual/draft/gauntlet/PvP. Comparar win rate, placar e efeito de decisões, com tamanho da amostra e incerteza. Estabelecer tolerâncias a partir da baseline; não exigir 50% exatos em amostra aleatória. Teste isolado de estratégia não basta para afirmar equilíbrio geral.

Matriz de produto: novo convidado, veterano, conta grátis/paga, comprador de passe antigo, saldo insuficiente, offline, duas abas, retorno de checkout, virada de temporada e mobile estreito. Verificar teclado, foco de modal, estados de carregamento, erros e opção de pular animação.

Antes de produção: demonstrar lote, registrar testes e limitações, definir flag/rollback e observar falhas de entrega, divergência de resultados, retenção e receita por coorte. Não aumentar tráfego pago antes de validar ativação e custo. Com poucos usuários, usar observação e feedback além de números; não anunciar significância estatística inexistente.

Critério de rollback: duplicação/perda de patrimônio, resultado divergente entre clientes, cobrança com oferta incorreta ou impossibilidade relevante de jogar. Desativar novos inícios/vendas afetados, preservar partidas/pedidos e reparar por ledger; não apagar saves.

## 8. Como continuar em outra ferramenta

1. Ler este documento e `docs/ultimate-development-progress.md` integralmente.
2. Conferir `git status`, branch e commit. Este plano se baseia em `74de16f`; reconciliar mudanças novas antes de aplicar decisões.
3. Ler instruções locais e os arquivos do lote. Caminhos propostos não provam existência; comentários não provam comportamento atual.
4. Pegar o primeiro lote pendente com dependências satisfeitas. Começar por U00; não saltar direto para reescrever loja ou engine.
5. Implementar um lote delimitado, verificar e atualizar registro de continuidade com arquivos, comandos, resultados, decisões e próximo passo exato.
6. Não marcar concluído pelo código existir: cumprir critérios de aceite ou registrar explicitamente o que falta. Separar implementado, testado e publicado.
7. Produzir commits pequenos quando solicitado/autorizado no fluxo; não misturar produto, migrações e refactor irrelevante. Não descartar trabalho de outro agente.

Prompt sugerido para o próximo agente:

> Continue o desenvolvimento do Ultimate do Road to Major usando `docs/ultimate-development-plan.md` e `docs/ultimate-development-progress.md`. Leia os dois, confira o checkout e as instruções locais, e comece pelo primeiro lote pendente cujas dependências estejam satisfeitas. O objetivo é gameplay mais compreensível e interessante, coleção com propósito e monetização confiável. Respeite saves/compras existentes, determinismo e compatibilidade online. Atualize o registro ao concluir cada lote e ao parar, com testes e próximo passo. Não trate brainstorm como implementação pronta nem publique mudanças comerciais sem revisar as decisões pendentes com o proprietário.
