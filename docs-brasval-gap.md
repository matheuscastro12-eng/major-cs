# Brasval Gap Analysis — roadmap de evolução single-player

Comparação major-cs vs Brasval (referência). 57 features single-player identificadas, ranqueadas por valor↓ e esforço↑. Vetados (backend/online/BUT/SoloQ/Valorant) já filtrados.

## Implementado nesta rodada
- ✅ Sala de Troféus (TrophyRoomPage) — vitrine de conquistas lendo save.history
- ✅ Perfil do Treinador (CoachProfilePage) — carreira do coach via coachStints
- ✅ Stats de mapa por time + engine reutilizável (#1/#3) — src/engine/teamMapStats.ts (computeMapPerformance, mapRecordFromStats); save.mapStats acumulado em recordCareerMatch (migração v13, backfill {})
- ✅ Veto AI guiado por win-rate real (#5) — aiChoice(v, teams, rng, statsCtx?) bane seus mapas fortes / te dá de pick os fracos (VETO_MIN_GAMES=2, fallback mapPrefs); VetoScreen mostra seu W-L real + veredito por mapa
- ✅ Página Stats dedicada (#11) — src/pages/career/StatsTab.tsx: toggle Liga/Meu time, top rating, top dano (ADR), distribuição de funções, desempenho por mapa (mine) e tabela rankeada (30). Reusa seasonPlayerStats + computeMapPerformance; barras CSS no padrão em-*

## Backlog rankeado

### 1. Stats de mapa por time (win-rate real por mapa) [ALTO · 1.5d · self-contained]
- **Gap:** Não temos uma função de engine reutilizável que produza o histórico real de win-rate por mapa do time agregando TODAS as fontes (liga + torneios + scrims). O cálculo está preso a um componente e a uma única fonte de dados, então nem o veto nem o analista conseguem usar o histórico real.
- **Brasval:** engine/teamMapStats.ts: computeTeamMapPerformance(state, teamId) varre tournaments + scrims + matches do save e agrega W/L/winRate POR MAPA do pool ativo do split, marcando inActivePool. É um motor puro reutilizado em VetoModal, Stats.tsx e mapVeto.
- **Plano:** Criar src/engine/teamMapStats.ts exportando computeTeamMapPerformance(state, teamId): MapPerformanceRow[] (mapId, mapName via MAP_LABELS de types.ts, wins, losses, winRate, rf/ra para round-diff). Agregar de todas as fontes de MapResult do save (torneios da carreira + scrims). Refatorar CareerTeamPage para consumir o motor em vez do useMemo local, e mostrar numa DashCard nova 'Desempenho por mapa' com tabela no padrão em-* (barra de winRate). É puro/determinístico, sem backend.

### 2. Ratings recentes por partida + forma derivada (janela deslizante) [ALTO · 2d · self-contained]
- **Gap:** Sem janela de ratings não dá pra mostrar 'forma recente' legível, nem alimentar felicidade por performance própria, nem detectar breakthrough de potencial. O form escalar atual some a cada série.
- **Brasval:** Player.recentRatings[] (janela de 5-6), alimentado por recordMatchRating em cada série. playerStatus.formStatus() deriva 5 tiers (Em chamas/Boa/Média/Ruim/Péssima) da média recente; é insumo de happiness (performanceFactor) E de potencial dinâmico. academyRecentRatings espelha pro time B.
- **Plano:** Adicionar `recentRatings: Record<string, number[]>` no save (cap 6, shift no overflow). Popular no hook pós-série do CareerScreen onde já computamos rating/MVP da partida. Criar helper formStatus(ratings) em engine/career/ retornando {tier,label,color} no padrão dos nossos tokens (--em-ok/--em-warn/--em-danger). É pré-requisito barato dos findings de felicidade e potencial dinâmico.

### 3. Engine teamMapStats (win-rate por mapa) como dependência reutilizável [ALTO · 2d · self-contained]
- **Gap:** Sem esse engine, a Stats page (finding #1) e o veto/scouting não têm de onde tirar 'win-rate por mapa', que em CS2 é informação de primeira ordem (mais do que em Valorant até).
- **Brasval:** src/engine/teamMapStats.ts (110 linhas) — computeTeamMapPerformance(state, teamId) retorna por mapa: jogos, vitórias, derrotas, winRate. Alimenta o gráfico de performance por mapa na Stats.
- **Plano:** Criar src/engine/teamMapStats.ts portando a lógica do Brasval mas iterando sobre league.matches / save.history por MapId do CS2. Persistir contadores por mapa no save (ou recomputar do league atual). Servir tanto StatsTab quanto o relatório do adversário no CareerOverview (que hoje só mostra mapPrefs estáticos).

### 4. Dificuldade separa economia (user) de força da IA (rivais) [ALTO · 2d · self-contained]
- **Gap:** Nossa dificuldade é puramente combativa. Brasval faz a dificuldade remodelar a EXPERIÊNCIA de gestão (caixa apertado, salários pesados, board mais exigente no hard) — que é o coração de um manager. Sem isso, hard/legend só significam "adversários mais fortes", não uma carreira mais difícil de administrar.
- **Brasval:** DIFFICULTY_MODS modela DOIS eixos independentes: economia do time do USER (startBudgetMul, incomeMul, salaryMul, sponsorValueMul, sponsorChanceMul, startingBoardApproval) E força dos RIVAIS (enemyStrengthMul na sim estatística + enemyAimBonus no combate). easy/normal/hard com valores calibrados (ex.: hard = caixa 0.6x, salários 1.3x, patrocínios 0.55x, IA +10% força). difficulty.ts L37-71.
- **Plano:** Expandir DIFFICULTY_OPP_BOOST pra um DIFFICULTY_MODS no padrão deles (mantendo nossos 3 níveis normal/hard/legend). Aplicar os mults onde já calculamos caixa inicial no setup, renda/folha na liquidação semanal, e valor/frequência de propostas em sponsors.ts. Adicionar startingBoardApproval pra que hard comece com board mais baixo. Não tocar a força dos rivais já existente.

### 5. Veto AI guiado por win-rate histórico real [ALTO · 2d · self-contained]
- **Gap:** Nosso veto ignora completamente o histórico real da carreira. Um time que ganhou 100% em Nuke nesta temporada não vê a IA banir Nuke; o veto é sempre o mesmo padrão estático, sem memória da run.
- **Brasval:** engine/mapVeto.ts: aiChoose() recebe VetoStatsContext {ownStats, oppStats} de computeTeamMapPerformance. No PICK soma (ownWinRate-50)*0.5 e subtrai força do oponente; no BAN tira o melhor mapa do oponente ((oppWinRate-50)*0.5) com VETO_MIN_GAMES=2 de amostra mínima. VetoModal.tsx monta statsByTeam e passa pro runVeto.
- **Plano:** Estender aiChoice(v, teams, rng, statsCtx?) em veto.ts pra aceitar um contexto opcional de winRate por mapId (saída do novo teamMapStats). Adicionar peso ao edge: no pick +((ownWR-50)*k), no ban -((oppWR-50)*k), com mínimo de ~2 jogos de amostra (fallback nos mapPrefs quando sem histórico). Passar statsCtx de MatchScreen/VetoModal. Mantém back-compat (param opcional), puro e determinístico via Rng.

### 6. Seleção de adversário de scrim por prestígio + disponibilidade [ALTO · 2d · self-contained]
- **Gap:** Falta agência: o manager não decide contra quem prepara. Escolher sparring forte vs. fraco antes de um playoff é decisão de carreira clássica que não existe no nosso jogo.
- **Brasval:** scrimOpponents.ts: evaluateScrimOpponents() lista times reais elegíveis ordenados por proximidade de prestígio e força, marcando cada um como available/busy_tournament/busy_scrim/prep/prestige_mismatch/declined com seed determinístico. O jogador ESCOLHE contra quem treinar. Refs: /tmp/brasval/src/engine/scrimOpponents.ts, /tmp/brasval/src/engine/scrimCalendar.ts (listScrimOpponents)
- **Plano:** Criar src/engine/career/scrimOpponents.ts que filtra os TTeam do circuito do usuário por banda de prestígio/força e retorna lista com disponibilidade determinística (hashStr por split+ids). UI: lista de cards de oponentes elegíveis (TeamLogo + força estimada via teamStrength + badge de disponibilidade) numa nova aba/seção de scrim.

### 7. Form do clube dirige o mercado (computeTeamForm) [ALTO · 2d · self-contained]
- **Gap:** Sem isso, qualquer mercado de IA que a gente adicione seria aleatório — Brasval só fica realista porque a atividade é proporcional ao fracasso recente. É a peça que faz 'time que afundou no Major reforça, campeão fica quieto'.
- **Brasval:** computeTeamForm(state, team) → 0-100 a partir de placements dos últimos 3 torneios + win-rate do evento vivo + penalidade de caixa negativo. Alimenta tickAIMarketActivity (form>=55 passivo, form baixo hiperativo) e o formFactor do decideOffer (time em alta resiste a vender; em baixa libera).
- **Plano:** Implementar computeTeamForm(save, team) usando nosso histórico de resultados por split (save.history/SplitRecord) + caixa do clube se modelarmos isso pra IA. Pré-requisito dos findings de mercado contínuo e decideOffer. Cachear por split pra não recalcular por jogador.

### 8. Board approval contínuo com log de eventos [ALTO · 2.5d · self-contained]
- **Gap:** Nossa aprovação é um único delta semestral por objetivo — o user não sente a diretoria reagindo a cada vitória/derrota/caixa no vermelho, e a demissão chega sem rastro do porquê. Brasval dá feedback constante e justificado, deixando o arco de "técnico em apuros" legível.
- **Brasval:** Aprovação 0-100 ajustada CONTINUAMENTE por evento granular: matchWin +2, matchLoss -3, semana com caixa negativo -2, campeão regional +35, campeão intl +55, vice +12, top4 +5, último -25, DNQ -8 (APPROVAL_DELTAS). `adjustBoardApproval` grava `boardApprovalLog` (ring de 12) com semana/delta/motivo, que a UI mostra e o `checkDemission` usa pra compor o texto da demissão ("os últimos eventos pesaram: X; Y"). career.ts L186-228, L406-465.
- **Plano:** Adicionar APPROVAL_DELTAS + adjustBoardApproval(state, delta, reason) + save.boardLog ao nosso fluxo. Chamar matchWin/matchLoss no mesmo callsite onde já registramos resultado, e weekNegativeBudget na liquidação financeira. Manter o delta de objetivo no fim do split como o maior peso. Renderizar o log num DashCard novo na OverviewTab (lista delta+motivo+semana) e usar os 3-4 últimos motivos no texto do FiredModal.

### 9. Engine de prêmios baseado em performance real (não proxies) [ALTO · 2.5d · self-contained]
- **Gap:** Prêmios premiam quem tem OVR alto, não quem JOGOU melhor naquele ano. Sem Team of the Season. Sem peso por importância do campeonato (vencer Major == vencer tier-3).
- **Brasval:** yearEndAwards.ts::scorePlayerForYear soma tournamentStats do ANO: performanceIndex(rating,acs,kda,ovr) × volumeMultiplier(matches) + placementPoints (peso por tipo de torneio via tournamentTypeWeight) + bônus de MVP de torneio + mvps. POTY/Rookie/Team-of-the-Season saem desse score; compareYearScores faz desempate por títulos→mvps→rating→kda.
- **Plano:** Depois do seasonStats, reescrever detectYearAwards para somar SeasonStatLine do ano: índice de performance (rating + kd + ADR + impact derivado por deriveCareer) × volume com retornos decrescentes, + pontos de colocação ponderados por tier do circuito/Major (reusar PLACE_SHORT e tipo de campeonato). Adicionar award 'Time da Temporada' (5 jogadores: melhor por role + melhor restante, como buildTeamOfTheSeason). Manter as accents/slides do YearAwardsModal.

### 10. Promessas formais rastreadas (playing-time / salary / signing / workload) [ALTO · 3d · self-contained]
- **Gap:** Conversas não têm peso de longo prazo. O manager pode 'prometer titularidade' sem nenhum custo se não cumprir. Falta o loop FM de prometer→cobrança→consequência que é o coração da gestão de pessoas.
- **Brasval:** playerHappiness.ts createPromise()/promiseIsFulfilled() + tickPlayerHappiness avalia toda semana: cumprir no prazo → status 'kept' (+10 moral, +12 vínculo, notícia), estourar prazo → 'broken' (-15 moral, -18 vínculo, notícia). new-signing guarda baselineRosterIds+minSigningOvr pra detectar reforço real. promiseModifier alimenta a felicidade (esperança ativa, penalidade janela de 8 semanas). Criadas pelas conversas 1-a-1.
- **Plano:** Adicionar `promises: Record<string, Promise[]>` no save de carreira. Tipo Promise { kind: 'playtime'|'salary'|'signing'|'workload', madeAtSplit, deadlineSplit, status }. Os tópicos de promessa entram no PlayerTalkModal (já temos 'playtime' e 'extension' como tópicos). Avaliar no advanceSplit usando dados que já temos (titular = lineup, salário = market, fadiga = fatigue Record). Gerar NewsItem no inbox (já temos sistema de inbox migrado). Depende do finding de felicidade pra o modificador surtir efeito.

### 11. Página Stats dedicada (estatísticas da liga com gráficos) [ALTO · 3d · self-contained]
- **Gap:** Não existe uma tela única que agregue estatísticas da temporada em gráficos visuais (rating, fraggers, distribuição de roles, win-rate por mapa). O usuário não consegue ver 'desempenho do meu time por mapa' em lugar nenhum — dado crucial em CS2 (veto de mapa é central).
- **Brasval:** src/pages/Stats.tsx — página inteira só de estatísticas. Toggle 'Todos vs Meu Time', 4 gráficos recharts (Top 5 rating, Top fraggers, distribuição de roles em pizza, pontos da liga OU performance por mapa quando scope='mine') + tabela rankeada de 30 jogadores (K/D/A, K/D, rating, matches). Performance por mapa vem de engine/teamMapStats.ts (computeTeamMapPerformance).
- **Plano:** Criar src/pages/career/StatsTab.tsx + adicionar 'stats' ao HubTab em CareerScreen.tsx. Reusar seasonPlayerStats(save.league) (já existe). Criar engine/teamMapStats.ts portando computeTeamMapPerformance do Brasval mas baseado nos MapId/MAP_LABELS do CS2 (não roles). Usar recharts (já há DashCharts/SparkLine no projeto) ou DashCard + barras CSS no padrão em-*. Toggle 'Liga / Meu time' via segmented control em-*.

### 12. Página Trophy Room (sala de troféus do time) [ALTO · 3d · self-contained]
- **Gap:** Não há uma vitrine visual dos troféus que o time conquistou na carreira (agrupada por tier, com medalhas, prêmio e MVP de cada conquista). É a recompensa emocional de longo prazo do modo carreira — hoje inexistente offline.
- **Brasval:** src/pages/Trophies.tsx — sala de troféus dedicada. Hero card por time (logo, total earnings, KPIs: títulos/campeão/masters/regional/internacional), troféus agrupados por tier (internacional/regional/doméstico) com medalhas 🥇🥈🥉, ano, split, MVP e prêmio por troféu. Aba 'compare' permite confrontar a sala de troféus do seu time vs outro por região.
- **Plano:** Criar src/pages/career/TrophiesTab.tsx no padrão em-*/DashCard. Derivar troféus de save.history (circuit titles, major titles/placements, academyTrophies) — não precisa de novo modelo de dados pesado; mapear cada SplitRecord com champion=true em um TrophyRecord {event, year, split, placement, prize, tier}. Agrupar por tier (Major=internacional, Circuito tier1=regional, demais=doméstico). KPIs no topo (total títulos, majors, prêmio acumulado). Pular a aba 'compare' por time no v1 (online-ish); foco no próprio time.

### 13. Stats persistentes por jogador/temporada (year-by-year stat history) [ALTO · 3d · self-contained]
- **Gap:** Não dá pra perguntar 'quais foram os números do jogador X na temporada 3' nem montar histórico de evolução por temporada. Toda a profundidade de prêmios/lendas/perfil fica refém de proxies de peakOvr.
- **Brasval:** player.tournamentStats[tournamentId] guarda matches/K/D/A/rating/acs/hsPct/mvps/mapsWon/mapsLost com campo `year` por evento, alimentado em trackTournamentMatch a cada partida (engine/tournamentStats.ts). Tudo fica no save, consultável por ano para sempre.
- **Plano:** Criar src/engine/seasonStats.ts com um shape SeasonStatLine reusando os campos do CareerStatLine + { year/split, titles, top4, finalPlacement por evento, mvps }. Estender CareerSave com seasonStats?: Record<playerId, Record<split, SeasonStatLine>>, populado no mesmo ponto onde accumulateCareerStats roda (bankStats em CareerScreen.tsx ~3406), gravando por split em vez de só somar. Migração: campo opcional, default {}. Isso é o pré-requisito de quase todos os outros findings.

### 14. decideOffer multifatorial (IA do clube vendedor) [ALTO · 3d · self-contained]
- **Gap:** Nossa IA não considera contexto do elenco/temporada na hora de aceitar venda. Não há 'estrela não está à venda por proposta de mercado', nem desconto por jogador infeliz, nem resistência maior de time em ótima fase.
- **Brasval:** decideOffer() pondera 8 fatores: offerRatio vs marketValue, importância (estrela/titular/elite), reposição na função (hasReplacement), tamanho de contrato, moral, gap de prestígio, atratividade salarial e FORM do time — devolve accept/reject/counter com razão textual. Inclui proteção de franchise-core e cláusula de rescisão.
- **Plano:** Expandir clubReply (ou substituir por decideOffer no novo transferAI.ts) somando fatores: rank do jogador no elenco (sortByOvr), morale (save.morale), reposição na role dentro do TeamSeason.players, e form do clube. Manter a assinatura NegoReply atual pra não quebrar NegotiationModal.

### 15. Listar jogador SEU à venda + IA dá lances semanais [ALTO · 3d · self-contained]
- **Gap:** Falta o loop de 'coloquei o reserva no mercado por R$X e nas próximas semanas alguém compra'. Hoje o user precisa empurrar cada venda manualmente e ela só efetiva no próximo split.
- **Brasval:** player.listedPrice é definido pelo user; tickListedPlayerOffers(state) roda toda semana, sorteia UM comprador elegível (role-fit + caixa + buffer de salário 6 sem) e aplica listingSaleChancePerWeek(ratio) — curva contínua (~20% a 100% do mercado, ~1,2% a 150%). Fecha a venda sozinho e abre PlayerSoldModal.
- **Plano:** Adicionar listedPrice?: Record<playerId, number> no CareerSave + botão 'Listar' no SquadTab/MarketScreen. Implementar tickListedPlayerOffers no novo transferAI.ts rodando no mesmo tick semanal; reaproveitar PlayerSoldModal (já existe componente). Teto via TRANSFER_LISTING_MAX_RATIO já portado em economyConstants conceitualmente — definir um equivalente nosso.

### 16. Sistema de Felicidade agregado (FM-style) [ALTO · 4d · self-contained]
- **Gap:** Felicidade hoje é um número opaco (morale) movido por eventos pontuais. Falta um modelo composto e legível que explique POR QUE o jogador está feliz/infeliz (titularidade, salário justo, resultados, vínculo) e que corroa naturalmente quem está no banco ou mal pago.
- **Brasval:** playerHappiness.ts: computeHappiness() agrega 6 fatores observáveis (playingTime, performance, results, salary, coachBond, chemistry) com pesos somando 1.0 + modificador de promessas, grava SUAVIZADO em p.satisfaction a cada semana e faz drift leve da moral. tickPlayerHappiness() roda no weekEndProgression, conta benchWeeks (banco corrói ~4/semana), e dispara notícia única quando jogador cruza pra zona crítica (<30).
- **Plano:** Criar src/engine/career/happiness.ts com computeHappiness(save, playerId) puro retornando os fatores + overall. Reaproveitar os Records existentes (morale, fatigue) e derivar salário justo do nosso calcSalary/market.ts, química do chemistry.ts, e performance de recentRatings (ver finding de ratings). Persistir `satisfaction` e `benchWeeks` como novos Records no save (mesma migração-leve de numericRecord que já usamos em save.ts). Tickar no advanceSplit. Expor os 6 fatores no CareerPlayerPage trocando o alias morale por uma barra real por fator (DashCard com mini-bars).

### 17. Potencial dinâmico / breakthroughs (teto que sobe com performance) [ALTO · 4d · self-contained]
- **Gap:** Prospects que jogam muito bem não 'furam o teto' — o C continua C pra sempre. Some a narrativa mais gostosa de scouting single-player (o achado que vira estrela acima do previsto).
- **Brasval:** potential.ts: tryDynamicBreakthrough avalia a janela de ratings e, com triggers (média≥1.4, 3+ MVPs, explosão≥1.75 no teto), sobe dynamicPotentialOvr respeitando damper por tier de OVR + ageFactor (jovem fura mais fácil) + overflowPenalty + developmentRate. Gera notícia 'Furando o teto: C→B'. ovrCeiling() é o que treino respeita. potentialOvr scouted nunca muda — só o dinâmico.
- **Plano:** Adicionar `dynamicPotentialOvr`/`breakthroughs` Records no save (default = potencial scouted). Portar tryDynamicBreakthrough usando nosso rng.ts (não Math.random) e os recentRatings do finding acima. Ligar a curva ao nosso aging/peak por role e ao playerAge.ts. Treino/evolução passam a respeitar o teto dinâmico. Notícia de breakthrough no inbox. Mostrar 'C → B' no CareerPlayerPage com seta.

### 18. Coach Profile como PÁGINA completa (não só card) [ALTO · 4d · self-contained]
- **Gap:** Falta a PÁGINA que transforma os stints já modelados numa narrativa de carreira do treinador: tier+reputação visual, KPIs agregados de carreira inteira, timeline rica com legacy comments, e troféus atribuídos a cada passagem. É o coração da identidade single-player.
- **Brasval:** src/pages/CoachProfile.tsx — página /coach inteira: hero com avatar customizável (CoachAvatarBuilder), tier do coach (rookie→legend via deriveCoachTierId) com barra de progresso de reputação rumo ao próximo tier, faixa de 6 KPIs agregados (matches/wins/winrate/títulos/top4/prêmio), timeline de passagens (StintCard: org, período, W-L, win-rate, troféus, prêmio, badge de endReason fired/resigned/hired-away, e 'legacy comment' como 'Ídolo'/'Fez história' por anos/títulos), e sala de troféus filtrada por passagem do coach.
- **Plano:** Criar src/pages/career/CoachProfileTab.tsx (ou tela acessível do menu) no padrão em-*/DashCard, consumindo save.coachStints + summarizeCoach + deriveCoachTierId já existentes. Portar: barra de progresso de reputação→tier, faixa de KPiTile (reusar .em-fin-stat/cstat), StintCard com win-rate colorido + endReason badge + legacy comment (deriveStintLegacyKind: ídolo≥5 títulos, longa permanência≥7 anos). Reaproveitar CoachStintsCard como base, mas elevar a página. Pular avatar builder/CoachAvatar no v1 (esforço extra) — usar iniciais do nick.

### 19. Loop de recontratação pós-demissão (job hunt mesma carreira) [ALTO · 4d · self-contained]
- **Gap:** Brasval transforma a demissão num ato dramatúrgico recuperável (procurar emprego, ser rejeitado por clube grande, recomeçar tier abaixo) preservando o histórico do coach. Nosso fluxo é game-over hard que apaga toda a progressão — desincentiva risco e mata a continuidade single-player.
- **Brasval:** Quando o board approval chega a 0 o user é demitido mas a CARREIRA CONTINUA: `initJobOffers` revela 2 clubes interessados, `revealMoreJobOffers` libera +1/semana enquanto desempregado, e `applyForTeamJob` deixa o user se candidatar a QUALQUER clube com chance calculada por `computeJobApplicationChance` (tier do coach + gap de prestígio + região + anos de casa). Aceite/rejeição com motivos i18n (`rejectionReasonKey`). engine/career.ts L607-834.
- **Plano:** Criar src/engine/career/jobHunt.ts portando initJobOffers/revealMoreJobOffers/applyForTeamJob/computeJobApplicationChance. Reusar nosso `deriveCoachTierId` (já temos coachCareer.ts mais rico que o deles) pra modular a chance. Substituir o wipe no FiredModal por uma nova tela JobHuntScreen (padrão em-*, DashCard com grid de clubes + chip de tier/chance), preservando save.history/coachHistory e só trocando save.org/teamId ao aceitar. Avançar 1 semana por candidatura.

### 20. Táticas round-a-round por site (stack/exec/rush/split/lurk) com leitura de adversário [ALTO · 4d · self-contained]
- **Gap:** Nossa camada tática ao vivo é abstrata (postura global). Falta a decisão concreta e cságil 'qual bombsite stackar / executar' e o mini-jogo de LEITURA (acertar o stack = grande vantagem, errar = penalidade), que é o coração da profundidade single-player do Brasval.
- **Brasval:** data/roundTactics.ts define táticas ligadas ao MAPA: defenseTactics gera 'Stackar A/B/C' por site + estilos (aggro/passive/retake); attackTactics gera Executar/Rush/Split POR SITE + Default/Lurk. liveMatchSim.tacticOutcomeDelta() recompensa stack no site certo (+0.16) e pune o errado (-0.11), e cruza rush/aggro com o BUY inimigo (enemyPoor). RoundTacticModal mostra grid + toggle 'auto-tática'. A tática também posiciona a IA no canvas.
- **Plano:** Criar src/data/roundTactics.ts no nosso padrão: siteLabelsForMap(mapId) (CS2: A/B; quase nenhum mapa tem 3 sites — tratar como 2), defenseTactics/attackTactics gerando stacks por site + estilos. Em match.ts adicionar um tacticOutcomeDelta no cálculo do round (a IA inimiga sorteia o site de ataque; acertar o stack dá delta forte) e expor enemyBuyHint (já temos buys()). Estender StepMods com {tacticId} e adaptar MatchScreen pra um RoundTacticModal com toggle auto-tática. Opcionalmente alimentar o alvo de site no liveCanvasSim (advanceTarget já escolhe site por hash — passar o site escolhido).

### 21. Scrim contra adversário real + simulação de partida [ALTO · 4d · self-contained]
- **Gap:** Nosso scrim é um botão de farm de química/fadiga sem substância. O Brasval transforma scrim numa partida de treino real contra um time do mundo, com consequências individuais (evolução, fadiga, MVP). É a diferença entre 'apertar um botão' e 'jogar um treino'.
- **Brasval:** scrimSim.ts roda o MOTOR de partida real (simulateMatch) num MD1 contra um adversário concreto do mundo, e devolve um relatório de treino com rating por jogador, crescimento de atributos, ganho de fadiga, morale e MVP. scrimOpponents.ts escolhe o adversário dentro de uma banda de prestígio (±14) e modela disponibilidade (busy_tournament/busy_scrim/prep/declined). Refs: /tmp/brasval/src/engine/scrimSim.ts, /tmp/brasval/src/engine/scrimOpponents.ts
- **Plano:** Reescrever scrim.ts pra: (1) escolher adversário real via banda de prestígio (espelhar isScrimPrestigeMatch sobre os TTeam do dataset bo3); (2) rodar o nosso simulateMatch já existente em Bo1 num mapa do pool ativo; (3) gerar um relatório de treino (rating/K-D-A por starter, MVP, crescimento leve de aim/consistency respeitando ovrCeiling) reusando ratings.ts/playerOvr. Surfacar num componente ScrimResultView no padrão em-*/DashCard.

### 22. Página de Treino dedicada com foco de atributo por jogador [ALTO · 5d · self-contained]
- **Gap:** Desenvolvimento de jogador no nosso jogo é uma caixa-preta com 1 alavanca binária. O Brasval dá controle granular (treinar aim do entry, igl do líder) com feedback visual de quanto cada atributo pode crescer — núcleo de um manager de carreira.
- **Brasval:** Training.tsx é uma PÁGINA inteira: tabela do elenco + FocusTrainingModal onde o manager escolhe em qual conjunto de atributos cada jogador trabalha (TRAINING_FOCUSES), com selo 'recomendado' (suggestTrainingFocus calcula a maior lacuna até o teto + alinhamento de role) e preview de barra atributo-vs-teto. Custo escala com OVR, cooldown de 2 semanas. Refs: /tmp/brasval/src/pages/Training.tsx, attributes.ts (TRAINING_FOCUSES, suggestTrainingFocus)
- **Plano:** Definir TRAINING_FOCUS catalog mapeando nossos atributos (aim/consistency/clutch/awp/igl) → focos; criar engine career/training.ts com suggestFocus (lacuna até ovrCeiling × alinhamento de role) e applyTrainingFocus respeitando o teto. Página src/pages/career/TrainingTab.tsx no padrão em-* com modal de foco + barra atributo-vs-teto (FocusAttrPreview). Migrar o trainingFocus binário pra esse modelo.

### 23. Mercado da IA contínuo (tick semanal) [ALTO · 5d · self-contained]
- **Gap:** Nosso mercado é um feed cosmético recalculado por hash do split; o de Brasval é um ecossistema vivo que reage a resultados. Times rivais nunca melhoram nem afundam de forma orgânica entre splits no nosso.
- **Brasval:** transferAI.ts exporta tickAIMarketActivity(state) — roda TODA semana via weekEndProgression. Cada time da IA, gated por form, tenta assinar FA-upgrade (aiUpgradeFromFreeAgent) ou roubar de rival (aiPoachFromAnotherTeam), com stagger por hash de id pra não mover todo mundo no mesmo tick. O mundo se mexe sozinho o tempo inteiro.
- **Plano:** Criar src/engine/career/transferAI.ts com tickAIMarketActivity(save) que roda no fechamento de cada evento/semana (onde já chamamos consummateDeals/evolveSquad). Como nosso roster da IA é derivado de CS2_REAL_2026 + moves/extraOnTeam, persistir movimentos da IA via save.moves/extraOnTeam (mesma rota das vendas do user). Gate por uma forma de clube (ver finding de form). Emitir NewsItem cat:'transfer' no feed existente.

### 24. Dica de buy do adversário no freezetime (enemyBuyHint) [MEDIO · 0.5d · self-contained]
- **Gap:** O jogador escolhe stance/call no escuro quanto à economia inimiga. O Brasval transforma o buy inimigo numa leitura ('eles estão de eco → force compensa'), fechando o loop risco/recompensa.
- **Brasval:** RoundTacticModal recebe enemyBuyHint (string) e mostra 'Inimigo: <buy>' no header; tacticOutcomeDelta usa enemyBuy (eco/half/full) pra decidir se rush/aggro compensa. Dá ao jogador informação pra a leitura tática.
- **Plano:** Expor o buy do time inimigo no MatchScreen durante o freezetime (já temos sim.buys()). Mostrar um chip 'Inimigo: eco/force/full' no painel de call no padrão em-*. Custo trivial e potencializa o finding 3 (delta de tática vs buy). Considerar mostrar como 'provável' com leve ruído pra manter tensão.

### 25. Recomendação de pick/ban do analista cruzando win-rate real [MEDIO · 1d · self-contained]
- **Gap:** A recomendação do analista é boa mas 'cega' ao desempenho real: sugere ban/pick por prefs fixas, não pelo que o time vem ganhando/perdendo de fato na temporada. Depende do finding de teamMapStats existir.
- **Brasval:** engine/analystReport.ts (Brasval) calcula recommendedBans = top-2 por score (oppPref - myPref) e recommendedPick por (myPref - oppPref) excluindo o que o oponente já prefere; no VetoModal esse eixo é reforçado pelo win-rate real via teamMapStats.
- **Plano:** Depois de criar teamMapStats, injetar winRate real no generateAnalystReport: ajustar o score de ban/pick com (oppWR-50) e (myWR-50) quando houver amostra >=2 jogos, e exibir 'vc ganhou X% aqui / ele ganhou Y%' ao lado de cada mapa recomendado. Reaproveita o motor do finding 1 — baixo custo, alto realismo na pré-partida (MatchPreview/LockerRoom).

### 26. Stats por campeonato no perfil do jogador [MEDIO · 1d · self-contained]
- **Gap:** Falta a granularidade narrativa que torna o perfil 'vivo' — ver que o jogador detonou no Major mas sumiu no circuito.
- **Brasval:** getPlayerTournamentStatSlice + a tabela 'Stats por campeonato' na aba Desempenho do perfil FM-style: o usuário vê linha-a-linha como o jogador foi em CADA evento da temporada (rating/kda/colocação/MVPs).
- **Plano:** Com seasonStats no lugar, adicionar uma seção DashCard no modal/aba de perfil do jogador listando cada evento do split com rating/K-D-A/colocação. Reusar deriveCareer por linha de evento. Tokens --em-*, tabela .stats já existente.

### 27. Histórico cerimonial de prêmios consultável (Hall of Fame de awards) [MEDIO · 1d · self-contained]
- **Gap:** Prêmios viram efêmeros; o jogador não consegue olhar pra trás e ver a galeria de MVPs/campeões da sua era.
- **Brasval:** lastAwardsNight + yearAwards[] persistem cada noite de premiação; há modal/histórico (PlayerOfTheYearModal, TournamentChampionsHistory) pra revisitar todos os POTY/Team-of-Season passados.
- **Plano:** Adicionar seção 'Galeria de Prêmios' na HistoryTab.tsx (ou nova aba Legado) iterando save.yearAwardsHistory: card por ano com MVP/Revelação/Time da Temporada. Puramente leitura do save existente; reusa DashCard + accents do YearAwardsModal.

### 28. Proteção de franchise-core / estrela fora de venda [MEDIO · 1d · self-contained]
- **Gap:** No nosso, com insistência dá pra tirar quase qualquer estrela perto do valor de tabela; falta o 'a FaZe NUNCA vende o broky por 1.1x'. Empobrece a fantasia de que grandes nomes são intocáveis.
- **Brasval:** isFranchiseCore (prestige>=78 & ovr>=84 & top-2 do elenco) + franchiseSellMinRatio (1.9-2.25x). decideOffer rejeita venda do core abaixo do múltiplo e impede que série ruim vire liquidação (formFactor capado). aiUpgradeFromFreeAgent/aiPoach nunca cortam um 85+ por um FA ~78.
- **Plano:** Adicionar isFranchiseCore(player, fromTeam) baseado em teamTier + OVR + rank no elenco, e um minSellRatio que o clubReply respeita como piso ABSOLUTO da contraproposta (não só softening por round). Calibrar com os tiers reais (FaZe/Vitality/Spirit).

### 29. Tracking de colocação final por jogador (finalPlacement) [MEDIO · 1.5d · self-contained]
- **Gap:** Impossível dizer 'jogador X foi campeão 3x, vice 2x' pra qualquer um além do seu elenco; prêmios não conseguem ponderar conquistas reais.
- **Brasval:** engine/tournamentStats.ts::finalizeTournamentStats carimba finalPlacement (1=campeão, 2,3,4...) em cada jogador de cada roster ao fim do torneio, lendo tournament.finalPlacements. Vira insumo direto pro placementPoints dos prêmios e pra histórico.
- **Plano:** Ao fechar cada circuito/Major (onde já montamos a tabela final/bracket), gravar a colocação de cada jogador participante no SeasonStatLine.finalPlacement do split. Para circuitos só-do-usuário isso cobre o elenco; para a cena mundial (currentEra) gravar a partir das standings simuladas. Self-contained, roda no rollover.

### 30. Lenda geracional com tiers (Prospect→Rising→Great→Legend→GOAT) [MEDIO · 1.5d · self-contained]
- **Gap:** Não há reconhecimento visual/narrativo de jogadores geracionais ao longo da carreira; o arco 'ascensão→pico→declínio→lenda' não existe na UI.
- **Brasval:** generationalLegend.ts: classifica jogadores SS por peakOvr em 5 tiers, com copy ativa vs 'legacy' (passado quando OVR caiu do pico), tema visual por tier (gradientes/cores) e isGenerationalLegacyPhase pra narrar declínio.
- **Plano:** Portar como src/engine/legend.ts: tier por peakOvr (ajustar bandas pro nosso range de OVR CS2), fase legacy quando ovr<peakOvr, e um GenerationalLegendBadge no padrão em-* (gradiente por tier via CSS vars, sem hardcode dos hex do Valorant). Plugar no perfil e no Top20 de carreira.

### 31. Vínculo com o treinador (coachBond) como eixo separado da moral [MEDIO · 2d · self-contained]
- **Gap:** Falta o eixo 'relacionamento' que faz gestão de pessoas ter memória. Hoje cobrar firme um jogador hoje não muda como ele te recebe amanhã.
- **Brasval:** coachBond (0-100) é campo próprio do Player. Conversas 1-a-1 movem bond e moral separadamente; criticismTolerance lê bond (coach respeitado pode cobrar sem explodir); discuss-future com bond alto faz o jogador se abrir. coachBond pesa 0.16 na felicidade. Promessas cumpridas/quebradas batem forte no bond (+12/-18).
- **Plano:** Adicionar `coachBond: Record<string,number>` (default 50). Fazer o PlayerTalkModal mover bond junto com moral e gatear a aceitação de tom firme pelo bond (combina com nosso personalityTalkResponse já existente). Mostrar barra de Vínculo no CareerPlayerPage. Casa naturalmente com os findings de felicidade e promessas. Considerar bônus do psicólogo (facilities.ts já tem stabilizeMorale) aplicando ao bond também.

### 32. Cards de status derivado no perfil (forma/físico/satisfação/disciplina/reputação) [MEDIO · 2d · self-contained]
- **Gap:** A UI de perfil mostra números sem semântica. Falta a camada de 'tradução' (tier+cor) que torna o perfil legível de relance, e ela depende dos campos novos (satisfaction real, forma, físico).
- **Brasval:** playerStatus.ts expõe formStatus, physicalStatus (combina fadiga+stamina+nível physio em 'readiness' 0-100), satisfactionStatus, disciplineStatus (lê atributo discipline), reputationStatus (world/continental/national/local) — cada um com tier+label+cor pra renderizar pills consistentes no PlayerProfile.
- **Plano:** Criar engine/career/playerStatus.ts com as funções de tier puras, reaproveitando nossos atributos derivados (attributes.ts já tem discipline/stamina 1-20) e o readiness de fatigue.ts. Substituir os valores crus do CareerPlayerPage por pills com tokens --em-*. Reputação pode ser derivada de peakOvr+títulos (já no save) sem novo campo. Consome os findings de forma/felicidade.

### 33. Gráfico de evolução de colocações + Hall da Fama de aposentados (página History) [MEDIO · 2d · self-contained]
- **Gap:** A HistoryTab é uma tabela estática. Falta a visualização de trajetória (line chart de colocações ao longo da carreira) e a memória dos jogadores que se aposentaram — duas coisas que dão peso de longevidade ao single-player.
- **Brasval:** src/pages/History.tsx — LineChart de colocação por split (eixo Y invertido, 1º no topo, ReferenceLine em 1º/Top4, dots coloridos por resultado), média de colocação, CareerTimeline (marcos narrados), tabela de splits passados (campeão/vice/MVP) e tabela 'Hall da Fama' de jogadores APOSENTADOS (peak OVR, final OVR, ano de aposentadoria).
- **Plano:** Estender src/pages/career/HistoryTab.tsx: adicionar LineChart de save.history[].position (eixo invertido) usando DashCharts/recharts; adicionar tabela de jogadores aposentados se houver retiredPlayers no save (já temos PlayerRetirementModal, então o evento existe — verificar se persistimos a lista). Reusar PlayerAvatar/Flag já presentes.

### 34. Pool de mapas ativo por split (rotação dinâmica) + bench [MEDIO · 2d · self-contained]
- **Gap:** O pool nunca evolui. CS2 também rotaciona o Active Duty (~2x/ano, troca 1-2 mapas). Em carreira de vários anos, jogar sempre os mesmos 7 mapas mata a sensação de meta viva e remove a estratégia de 'preparar o mapa novo'.
- **Brasval:** engine/mapPoolRotation.ts: getActiveMapPool(year, split) parte do pool VCT real e a cada split rotaciona 1 mapa pra fora / 1 do banco pra dentro (determinístico via hash). getBenchedMaps telegrafa o que volta. teamMapStats e mapVeto usam o pool ativo do split pra que veto e stats acompanhem a meta vigente.
- **Plano:** Criar src/engine/mapPoolRotation.ts com getActiveMapPool(year, split) sobre um catálogo CS2 maior (incluir bench: overpass, vertigo, cache/cobblestone como histórico) rotacionando determinísticamente. Cuidado: nosso MapId é union literal — migrar para um catálogo string-based como o Brasval (data/maps.ts) ou ampliar o union. Veto (newVeto/autoVeto) e o novo teamMapStats devem receber o pool ativo do split. Ganho de imersão multi-ano alto, mas exige tocar o tipo MapId (daí o esforço/risco).

### 35. Bootcamp do time (intensivo pago) + auto-treino de carga [MEDIO · 2d · self-contained]
- **Gap:** Falta uma alavanca de preparação coletiva (gastar caixa pra subir morale/aliviar fadiga antes de um Major) e uma opção de auto-gestão de carga pra quem não quer microgerenciar fadiga toda semana.
- **Brasval:** teamBootcamp.ts: startTeamBootcamp() é um bootcamp de 2 semanas por R$25K que dá +5 morale a todos, alivia fadiga e bloqueia treino concorrente (pendingTeamTraining/trainingCooldownMatches). Além disso um modo autoTeamTraining que, quando ligado, faz o elenco NÃO acumular fadiga (carga gerida) e ter recuperação semanal reforçada (escala com physioLevel). Refs: /tmp/brasval/src/engine/teamBootcamp.ts
- **Plano:** Criar engine career/bootcamp.ts: startBootcamp(cost, weeks) que aplica +morale e usa recoverFatigue() já existente; pendingBootcamp com completesOnWeek pra resolver no avanço de semana. Adicionar flag autoTeamTraining que zera o ganho de fadiga (no updateMatchFatigue de fatigue.ts) e reforça recoverFatigue (escala com facilities.training). Botão na InfrastructurePage ou TrainingTab.

### 36. Relatório de treino pós-scrim (rating por jogador, fadiga, destaque) [MEDIO · 2d · self-contained]
- **Gap:** O feedback do nosso scrim é decorativo. O Brasval dá um relatório acionável (quem brilhou, quem está cansado, o que evoluiu) que informa decisões de escalação/descanso.
- **Brasval:** scrimSim.ts → buildTrainingReport(): após cada scrim gera bullets — nota média do elenco, destaque (melhor rating com 'evolução acelerada aplicada'), alerta de titulares com fadiga ≥70%, e nota sobre quais atributos progrediram. Vira um ScrimResultView. Refs: /tmp/brasval/src/engine/scrimSim.ts (buildTrainingReport, ScrimPlayerLine)
- **Plano:** Como subproduto do finding #1 (scrim com partida real): montar ScrimPlayerLine[] (rating/K-D-A/fadiga depois) e um buildTrainingReport com destaque + alerta de fadiga ≥ threshold (reusar fatigueBand de fatigue.ts). Exibir em ScrimResultView (DashCard, padrão em-*) com MVP e lista de notas.

### 37. Cláusula de rescisão / buyout ativo [MEDIO · 2d · self-contained]
- **Gap:** Contrato longo no nosso não protege o jogador nem custa caro pra quebrar. Falta a mecânica de 'paguei a multa pra arrancar o cara antes do fim do contrato'.
- **Brasval:** lockedPlayerMinFee(player) = valor + 50% multa quando há cláusula ativa; transferLockWeeksRemaining conta semanas. decideOffer rejeita abaixo de 80% da multa e faz counter pelo valor cheio; suggestFairOffer já pré-preenche a multa pra o user ver o custo real de forçar a saída.
- **Plano:** Derivar uma multa de save.contracts: se restam >=N splits, askingPrice ganha piso = playerValue*1.5 (escalonado por splits restantes). Mostrar no NegotiationModal como 'Cláusula ativa: R$X'. Pré-preencher no preset 'Justa'.

### 38. Aba/alvo 'jogadores infelizes' + desconto por moral [MEDIO · 2d · self-contained]
- **Gap:** A moral só afeta o elenco do user; não vira oportunidade de mercado. Falta o filtro 'quem está infeliz e sairia barato' e o respectivo desconto.
- **Brasval:** Transfers.tsx tem tab 'unhappy': lista contratados com morale<55, com badge e tooltip; decideOffer aplica moraleFactor (-0.30 se <=35, -0.10 se <=55) tornando-os alvos baratos. Gameplay oportunista de garimpar descontente.
- **Plano:** Como hoje a moral só existe pro elenco do user, primeiro precisaria de uma moral leve pros jogadores da IA (derivável de form do clube + tempo de banco). Então adicionar tab 'Infelizes' no MarketScreen e um moraleFactor no clubReply. Médio esforço por causa do pré-requisito de moral da IA.

### 39. Split Review imersivo (recap de fim de etapa) [MEDIO · 2.5d · self-contained]
- **Gap:** O recap deles fecha o loop emocional do split ("quem evoluiu/regrediu, quem estourou de potencial, quanto lucrei"). O nosso é só placar+prêmio. Esse delta de OVR/potencial por split é exatamente o feedback que faz o player de manager sentir o desenvolvimento do elenco.
- **Brasval:** buildSplitReview gera um recap rico ao fim de cada torneio: top-3 jogadores POR AQUELE torneio (tournamentStats), deltas de OVR vs snapshot do início do split (improved/declined), breakthroughs de potencial, resumo financeiro (startCash→endCash, profit) e conquistas. Alimentado por snapshotSplitStart no começo do split. career.ts L40-165.
- **Plano:** Adicionar snapshotSplitStart (gravar splitStartOvr/pot/cash por player no início do split) e enriquecer a tela de fim de split com seções de improved/declined (delta OVR), breakthroughs de potencial e profit start→end. Reusar nossos campos de ratings/potencial existentes; renderizar como sub-cards na CareerDashFrame atual.

### 40. Histórico de passagens (career stints) com stats por clube [MEDIO · 3d · self-contained]
- **Gap:** Falta a biografia do jogador — a linha do tempo de clubes que dá peso de 'lenda' a um veterano. Especialmente valioso porque já temos retirement/peakOvr e modais de aposentadoria.
- **Brasval:** playerStatus.ts mantém Player.careerHistory: CareerStint[] com teamId/nome/cor, start/end ano+split, matches/wins/losses/K/D/A/trophies, startOvr/endOvr. recordCareerTransfer fecha/abre stint em transferência; recordAcademyPromotion/Demotion registra subida/descida do time B; updateActiveStint acumula stats por partida. ensureCareerHistory faz backfill em saves antigos.
- **Plano:** Adicionar `careerHistory: Record<string, CareerStint[]>` no save. Chamar um recordCareerTransfer no nosso fluxo de signings/market.ts (e na promoção/rebaixamento da academia que já existe) e acumular stats no hook pós-série. Backfill leve no load (ensureCareerHistory). Renderizar timeline no CareerPlayerPage como lista de DashCards por passagem com cor do time.

### 41. Watchlist com scouting progressivo (fog-of-war que afina por relatório) [MEDIO · 3d · self-contained]
- **Gap:** Falta o loop 'marquei esse moleque, mande olheiro toda semana, a cada relatório eu sei mais'. Hoje o scouting não acumula conhecimento por alvo específico — é tudo ou nada por split.
- **Brasval:** watchlist.ts: o user adiciona qualquer prospect a uma lista de atenção e scouts livres geram relatórios semanais que revelam progressivamente — Report 1 (range largo de OVR + 4 atributos), Report 2 (range menor + 8 attrs + personalidade), Report 3 (+sub-role), Report 4 (scoutedPotential=true). reports[] guardado na entry pra UI mostrar a timeline da revelação.
- **Plano:** Adicionar `watchlist: { playerId, revealLevel, reports: ScoutReport[] }[]` no save. Reusar nosso generateScoutReports() direcionando aos alvos da watchlist e subindo revealLevel a cada relatório (afinando a faixa exibida). UI: botão 'Acompanhar' no perfil + aba/seção mostrando a timeline de revelação. Mapa-específico (CS2) é neutro aqui — nada de Valorant.

### 42. Champions Points / leaderboard de qualificação ao Major [MEDIO · 3d · self-contained]
- **Gap:** Falta a tensão de "corrida por pontos": no Brasval o user acompanha semana a semana se está dentro/fora da vaga ao evento maior. Nosso caminho ao Major é mais opaco (qualifica via posição no split). É um motivador de temporada que CS2 comporta (RMR/Major points são reais).
- **Brasval:** buildChampionshipLeaderboard monta ranking de pontos de campeonato por liga + status de vaga ao Champions (champions-direct / points-slot / points-race / eliminated), com preview de quem entraria em cada Masters, congelamento de pontos, e página ChampionsPoints.tsx paginada mostrando a corrida ao vivo. championshipLeaderboard.ts + ChampionsPoints.tsx.
- **Plano:** Criar src/engine/majorPoints.ts que acumula pontos por colocação em cada etapa do circuito (campos no save por time/ano) e deriva status de vaga ao Major (dentro/na briga/eliminado) por região, reusando nosso routing regional já existente (FRENTE 3). Nova aba MajorRaceTab no padrão DashCard reaproveitando o layout tabular do VrsTab, destacando a linha do user e a linha de corte.

### 43. Detecção de 'destaque' na academia que fura o teto de OVR por idade [MEDIO · 3d · self-contained]
- **Gap:** Falta a narrativa de 'joia explodindo na base' — o prospect de 17 anos que rende tão acima que justifica subir antes da hora. É um gancho de carreira forte (descobrir e proteger um talento).
- **Brasval:** academyMatch.ts: simula scrim semanal por prospect alimentando academyRecentRatings/academyStats, e detecta isAcademyStandout — quando um prospect rende consistentemente acima do esperado (delta de rating × nº de scrims), ele ganha academyStandoutAgeCapBonus (+4 a +12 no teto de OVR por idade) e academyStandoutTrainingMul (×1.2-1.35 na chance de +1 OVR), permitindo que uma joia FURE o cap etário sem ser promovida ao time A. Refs: /tmp/brasval/src/engine/academyMatch.ts
- **Plano:** Acumular rating das scrims/liga da academia em academyStats por prospect; definir standout = média de rating acima do esperado-para-OVR por N partidas. Aplicar bônus no teto de OVR por idade (já temos playerAge.ts/progress.ts) e multiplicador na chance de ganho semanal. Sinalizar na AcademyTab com badge 'Destaque' (selo verde no padrão em-*).

### 44. Caça-talentos da IA (tickAIProspectHunt + autoSignStaleProspects) [MEDIO · 3d · self-contained]
- **Gap:** Não há pressão competitiva: o user pode deixar um S POT livre por anos sem ninguém fisgar. Falta a sensação de 'precisei correr pra assinar o talento antes da G2'.
- **Brasval:** tickAIProspectHunt: orgs prestige>=70 têm ciclo de 3 sem pra assinar A/S/SS jovens (<=24) do pool de FA, INDEPENDENTE de form (chance 25-65% por tier). findBestProspectFA ranqueia por POT_WEIGHT*1000 + ceiling + ageBonus + roleNeed. canAffordCommitment exige caixa cobrindo salário+fração do valor. autoSignStaleProspects varre FA encalhado >=12 sem e força contratação relaxando reputação/caixa.
- **Plano:** Portar findBestProspectFA + aiSignProspect adaptando ao nosso POT (pot: 'S'|'A'...) e às idades importadas (task #67). Rodar tickAIProspectHunt no fechamento de split. SS deve seguir RESERVADO ao user enquanto jovem (regra do isReservedForPlayer) pra não roubar a fantasia. Reaproveitar o feed cat:'scout'/'transfer'.

### 45. Calendário de scrims com agendamento (dia/hora, limite mensal, conflito com oficiais) [MEDIO · 6d · self-contained]
- **Gap:** Sem dimensão de planejamento temporal: não dá pra montar uma semana de prep (2 scrims fortes antes do playoff). O Brasval faz do scrim parte do calendário, com tensão de agenda. Porém o nosso modelo de tempo é por etapa/split (não dia/hora), então adoção completa exigiria repensar o tempo.
- **Brasval:** scrimCalendar.ts (~960 linhas): grade mensal civil onde o manager AGENDA scrims em slots de dia+hora (SCRIM_HOUR_SLOTS 10/13/18/21h), com limite de 3/mês, dias bloqueados, e resolução de conflito com o jogo oficial (scrim na quarta em outra hora coexiste; senão empurra o oficial). Scrims agendadas aparecem no calendário com W/L e bloqueiam o avanço até serem jogadas. Refs: /tmp/brasval/src/engine/scrimCalendar.ts, /tmp/brasval/src/pages/Scrim.tsx
- **Plano:** Versão enxuta compatível com nosso tempo por-etapa: permitir agendar N scrims POR ETAPA (entre rodadas) escolhendo adversário, integrando na CalendarTab existente como eventos 'scrim'. Não copiar a malha dia/hora civil (incompatível com nosso loop de split). Reusar scheduledScrims[] + status scheduled/completed e mostrar W/L no calendário.

### 46. Reputação/tier do coach derivado de conquistas [BAIXO · 0d · self-contained]
- **Gap:** Nenhum gap real — nossa implementação de coach career já supera a do Brasval. Só falta CONSUMIR esse tier num lugar que importe (a chance de recontratação do finding #1).
- **Brasval:** summarizeCoach calcula reputation 0-100 de troféus+winRate+tier médio dos clubes, com reputationLabel/Color. Usado pra modular chance de ser contratado. coachCareer.ts (simples, ~1 escala linear).
- **Plano:** Não reimplementar nada. Apenas garantir que o loop de job hunt (#1) use nosso deriveCoachTierId existente como fator dominante da chance, exatamente como Brasval usa o tier dele em TIER_APPLICATION_MODS.

### 47. Estimativa de KAST a partir de K/D/A agregados [BAIXO · 0d · self-contained]
- **Gap:** Nenhum gap real — nosso modelo de stats já é mais granular nesse ponto específico.
- **Brasval:** stats.ts::estimateKast deriva KAST% de kills/deaths/assists + rounds quando não há dado round-a-round, calibrado por taxas (kRate/aRate/surviveRate/tradeRate).
- **Plano:** Não portar. Documentar que nosso KAST é medido (não estimado); só usar a heurística de estimateKast como fallback se algum dia exibirmos jogadores sem rounds trackados.

### 48. Sponsors dinâmicos (oferta/cooldown/placement bonus) [BAIXO · 0.5d · self-contained]
- **Gap:** Praticamente nenhum no core. Diferenças menores: Brasval tem computeForm/expiry-warning e categorias de imagem (IMAGE_NEGATIVE_CATEGORIES) que podem casar com identidade do clube; não é gap estrutural.
- **Brasval:** engine/sponsors: tryGenerateOffer por split com chance modulada por tier/slots e peso inverso ao perSplit, cooldown pós-recusa, placementBonusTotal ao terminar torneio, cleanupExpired.
- **Plano:** Não reimplementar. No máximo adicionar aviso de expiração (SPONSOR_EXPIRY_WARNING_WEEKS) e, se quiser sabor, sponsors que rejeitam clube com imagem negativa. Opcional/baixa prioridade.

### 49. Marco de lenda geracional (peakOvr → tiers GOAT/legend/great) [BAIXO · 1d · self-contained]
- **Gap:** Falta o reconhecimento visual/narrativo de craques excepcionais — a 'aura' que premia o single-player por desenvolver/segurar uma lenda. Barato porque o dado (peakOvr) já existe.
- **Brasval:** generationalLegend.ts: pra jogadores SS, deriva tier por peakOvr (prospect<80, rising 80-89, great 90-94, legend 95-99, goat 100+), alterna copy ativa↔legacy quando o cara já passou do pico, e dá tema visual (gradiente/cor) por tier. Usado em PlayerCard/modais pra dar aura a craques históricos.
- **Plano:** Portar generationalLegend.ts quase 1:1 (é puro, sem schema novo — só lê ovr/peakOvr). Trocar 'SS' pelo nosso topo de potencial e os gradientes pelos tokens --em-*. Aplicar borda/badge no PlayerCard e no CareerPlayerPage quando peakOvr cruza os limiares. Combina bem com o finding de career stints (biografia da lenda).

### 50. Pick rate / tier de meta por mapa (telemetria de meta do split) [BAIXO · 1d · self-contained]
- **Gap:** Falta a camada de meta-flavour por mapa que faz o mundo parecer vivo (ex.: 'Nuke está em alta neste split, 84% pick rate'). É puramente cosmético/imersivo mas barato e casa com nossa MetaPage já existente.
- **Brasval:** mapPoolRotation.ts: getMapMetaPct(mapId, year, split) + bandFor (tiers S/A/B/C) + mapMetaTone gera um pick-rate% por mapa por split com tom visual (fire/meta/solid/niche/off) e rankedMapsForSplit pra rankear. Alimenta uma UI de 'meta de mapas' do split.
- **Plano:** Adicionar getMapMetaPct(mapId, year/split) + tiers no mapPoolRotation.ts (ou num mapMeta.ts) e renderizar na MetaPage existente uma faixa 'Meta de mapas do split' com badges no padrão em-* (cores por tom). Só dado derivado/determinístico, zero backend. Fazer depois do pool rotation (finding 4) pra os tiers acompanharem a rotação.

### 51. CareerTimeline visual (linha do tempo de marcos por ano) [BAIXO · 1.5d · self-contained]
- **Gap:** O componente deles transforma o histórico numa narrativa visual escaneável (anos como seções, troféus/quedas como chips coloridos). O nosso comunica os mesmos dados mas sem o apelo de "jornada". Gap puramente de apresentação.
- **Brasval:** Componente CareerTimeline.tsx: timeline vertical agrupada por ano, cada evento como chip com ícone/cor por tipo (champion/title/podium/split-top/split-bottom), montado de team.trophies + state.history. CareerTimeline.tsx.
- **Plano:** Criar components/CareerTimeline no padrão em-* (DashCard, tokens --em-gold etc.) lendo nosso save.history + troféus, agrupando por ano com ícones lucide. Plugar como bloco no topo da HistoryTab mantendo a tabela abaixo pro detalhe.

### 52. Setup gaming real do pro (mouse/DPI/sens/crosshair) no perfil [BAIXO · 2d · self-contained]
- **Gap:** Falta a camada de imersão de 'ficha técnica' do pro. É puramente cosmético mas é exatamente o tipo de detalhe que vende o single-player de manager de CS pra quem é da cena.
- **Brasval:** playerSettings.ts: carrega data/playerSettings.json (scrapeado do prosettings.net) e faz overlay do setup real (dpi, sens, edpi, pollingHz, resolution, crosshairCode, monitor/mouse/keyboard/mousepad/headset/chair) por nick no seed; cai em rollSetup aleatório se o nick não existe. Exibido no PlayerProfile como flavor de imersão.
- **Plano:** Adicionar setup opcional ao Player (ou Record no save) com rollSetup determinístico via nosso hashStr/rng pra todos, e um JSON curado de crosshair codes/sens reais pros pros conhecidos do nosso banco. Renderizar um card 'Setup' no CareerPlayerPage. Self-contained: o JSON pode ser curado manualmente (não precisa scraper online).

### 53. Aba Compare de troféus entre times por região [BAIXO · 2d · self-contained]
- **Gap:** Comparar legado de times é puramente cosmético/informativo offline e depende de modelar trophies de TODOS os times (não só o seu) — custo alto pra valor moderado.
- **Brasval:** Trophies.tsx aba 'compare' — escolhe região + time e mostra lado-a-lado a sala de troféus do seu time vs outro (TeamTrophies compact).
- **Plano:** Adiar. Só vale depois de TrophiesTab (finding #2) existir e de termos trophies modelados para todos os times. Não priorizar no single-player; o foco é a sala do próprio time.

### 54. Regeneração procedural de cenário/liga (preencher pirâmide) [BAIXO · 2d · self-contained]
- **Gap:** Brasval garante uma pirâmide competitiva CHEIA mesmo em regiões com poucos times reais, com identidade visual procedural. Sem isso, tiers baixos/regiões secundárias podem ficar ralos e a promoção/rebaixamento perde profundidade.
- **Brasval:** vleagueRegen.ts gera times REGEN pra completar a base da pirâmide (V-League BR tier 3 → 12 times): nome procedural (prefix+suffix sem colisão), logo procedural (CustomTeamLogo: shape/glyph/cores), prestige/budget/income modestos, e roster regen jovem. ensureVleagueBrFilled é idempotente e roda no buildInitialState.
- **Plano:** Portar buildVleagueRegenTeam/ensureFilled adaptando ao CS2: pools de nomes/tags BR, reusar nosso gerador de logo procedural (já temos Logo Builder T7.2) e nosso regen de players. Rodar no boot da carreira pra completar tiers abaixo do alvo por região. Só priorizar se sentirmos tiers inferiores vazios — daí o valor baixo.

### 55. Eventos de desenvolvimento sintéticos da academia (tabela de stats Tier 2/bootcamps) [BAIXO · 2d · self-contained]
- **Gap:** O perfil do prospect carece de um histórico de campeonatos menores que dê textura (mostrar que o garoto foi top-4 num VRL, dominou um showcase). Enriquece a página do jogador da academia sem precisar simular tudo.
- **Brasval:** academyEvents.ts: gera deterministicamente uma lista de eventos off-stage por prospect (VRL Brasil, Challengers Ascension, Bootcamp EU/KR, Tier 2 Showcase, LAN Prospect Cup) com placar/KDA/colocação coerentes com o OVR e a região do jogador, pra preencher a aba 'Desempenho' do prospect (que ficaria vazia já que academy não joga oficial). Puramente cosmético, varia por safra/ano. Refs: /tmp/brasval/src/engine/academyEvents.ts
- **Plano:** Criar engine career/academyEvents.ts (mulberry32 por id+ano) gerando 2-4 TournamentStat-like (Desafiante BR, Bootcamp, Showcase Tier 2) coerentes com ovr/role pra exibir na CareerPlayerPage quando inAcademy. Cosmético, derivado, não infla o save. Adaptar nomes pro CS2 (Desafiante, ESEA, Tier 2).

### 56. Renovação/FA com IA de aceite (decideContractRenewalOffer / decideFreeAgentOffer) [BAIXO · 2d · self-contained]
- **Gap:** Renovação no nosso tende a ser 'aceita o termo padrão ou perde de graça'; falta a barganha salarial com counter e o jogador pedir aumento proporcional ao mercado/lealdade.
- **Brasval:** decideContractRenewalOffer e decideFreeAgentOffer devolvem accept/counter/reject com piso salarial (não aceita corte fácil), desconto por prestígio do clube, bônus por contrato longo e lealdade por moral alta. suggestRenewalOffer/suggestFairOffer pré-preenchem propostas plausíveis.
- **Plano:** Se a renovação atual for binária, portar a lógica de minAccept/counterSalary do decideContractRenewalOffer pra dentro do nosso RenewalScreen/playerTalks. Baixo valor relativo porque já temos um fluxo de renovação funcional; é polimento.

### 57. Championship Points leaderboard (corrida por vaga ao Major) [BAIXO · 4d · self-contained]
- **Gap:** Conceitualmente útil (transparência de 'quem está perto de se classificar'), mas o modelo de pontos é Valorant-específico e exigiria reescrever nossa lógica de classificação ao Major.
- **Brasval:** championshipLeaderboard.ts: ranking por championshipPoints com status de classificação (direto/por-pontos/eliminado), rank por liga e global, paginação.
- **Plano:** Não portar 1:1. Se quisermos a sensação de 'corrida pela vaga', adaptar como um painel de projeção de classificação ao Major baseado nas standings atuais do circuito, sem inventar um sistema de pontos. Baixa prioridade vs. seasonStats/awards.
