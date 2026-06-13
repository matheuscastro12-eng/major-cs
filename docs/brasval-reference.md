# Referência: Brasval (Valorant Esports Manager)

Exploração do https://brasval-production.up.railway.app — norte de profundidade
para o modo Carreira do Road to Major. Capturado em 2026-06 via navegador.

## Navegação (topo)
- **Dashboard** — torneio atual: bracket completo (ex. "Eliminação Tripla — 3 chaves, 3 vagas"),
  Overview / Campeonato Atual, Próximas Partidas + Resultados Recentes.
- **Meu Time ▾**: Visão do Time · Squad · **Vestiário** · Perfil do Treinador · **Treinamento** · **Scrim** · **Academy**
- **Em Jogo ▾**: Classificação · Top Ranking Atual · **Champions Points** · Torneios · Sala de Troféus · Estrutura
- **Mercado ▾**: **Transferências** · Ranking Radiant · **Patrocínios**
- **Inbox** (caixa de mensagens / notícias)
- **Análise ▾**: Estatísticas · Comparar · Times · **Meta de Agentes** · Histórico
- Topo direito: busca, idioma, settings, **calendário (Temporada · Split · Semana)**, **JOGAR** (veto+agentes+round a round) / **SIMULAR**, menu do sistema.
- Barra fina: `LOUD · US$ 4,6 mi · 72%` (caixa + confiança/algo do time) sempre visível.

## Visão do Time (/team/<slug>) — a tela central
- Header: nome, país, **Prestígio 92**, **233.613 fãs**, link vlr.gg, "SEU TIME".
- **CAIXA US$ 4,6 mi** · **Receita +US$ 202,4 mil/split** · **Despesas −US$ 91,6 mil/split**.
- Cards: **OVR MÉDIO 85** · **POT MÉDIO 89** · **IDADE MÉDIA 20.2** · ELENCO 5 · LIGA 0-0 · **TROFÉUS 7**.
- Abas: Elenco · Stats · Troféus · Calendário · **Patrocinadores** · Estrutura.
- Tabela do elenco: JOGADOR (foto+nick+nome real) · **FUNÇÃO** (SENT/FLEX/IGL/INIT/DUEL) ·
  **OVR** · **POT.** (S/A/B) · **IDADE** · **CONTRATO** (em splits) · **VALOR** · STATUS (Titular) ·
  AÇÕES (renovar / listar / liberar).

## Perfil de Jogador (/player/<id>) — nível FM
- Header: nick, país, função + **sub-role** (ex. SENT · ANCHOR), nome real, **idade**, **Pot. S**,
  **Reputação Continental**, time; **VALOR**, **SALÁRIO/semana**, **CONTRATO (splits)**, OVR, POT.
- Abas: **Cartão · Visão geral · Dados pessoais · Desempenho · Carreira**.
- **Cartão** (estilo FIFA Ultimate Team): OVR grande, tier (GOLD), 4 stats no card (AIM/UTL/CLT/GS),
  **Potencial Revelado**, botão "Potencial de Estrela".
- **Perfil de atributos** (radar, escala 0-20): Mecânica · Mental · Físico · Mira · Utilidade · Clutch.
- Stats de carreira: Jogos · Vitórias · Rating · K/D · ACS · MVPs · Títulos · **Pico OVR**; rating por jogo (gráfico).
- **Dados pessoais**: **Personalidade** (ex. "Volátil — bônus em moral alta, quebra em moral baixa"),
  cartão "Potencial de Estrela", Idiomas, Nacionalidade; **Contrato** (salário semanal, valor de mercado,
  splits restantes, **Satisfação 62/100**); **Setup gaming** (DPI/sens/mouse/teclado — flavor, link prosettings).

## Sistemas que o Brasval tem e ainda faltam pra nós
| Sistema | Brasval | Road to Major (hoje) |
|---|---|---|
| Idade real + potencial (S/A/B) | ✅ | ❌ (fase por hash) |
| Atributos detalhados (6 eixos, radar) | ✅ | parcial (aim/awp/igl/clutch/consist.) |
| Personalidade / moral / satisfação | ✅ | ❌ |
| Contrato (salário/sem, duração, valor) | ✅ | ✅ duração + salário/split (recém) |
| Finanças (receita/despesa por período) | ✅ | ✅ painel básico (recém) |
| Prestígio + fãs | ✅ | ❌ (só VRS/títulos) |
| Treinamento / Scrim / Academy | ✅ | ❌ |
| Patrocínios | ✅ contratos | ✅ contratos (recém) |
| Transferências (mercado vivo) | ✅ | ✅ swaps + ofertas (recém) |
| Champions Points / ranking | ✅ | ✅ VRS / Top 20 |
| Inbox / notícias | ✅ | ❌ |
| Calendário multi-torneio | ✅ | parcial (splits + Major) |
| Cartão estilo FUT | ✅ | ❌ |
| Diretoria / objetivos | parcial | ✅ (recém) |

## Roadmap sugerido (ordem de impacto pra chegar no nível)
1. **Jogadores vivos**: idade real (fetch bo3) + potencial (S/A/B) + curva de evolução por idade; moral/forma; personalidade.
2. **Perfil de jogador rico**: aba de perfil com radar de atributos, carreira, pico OVR, cartão estilo FUT.
3. **Prestígio + fãs** da org (cresce com títulos; afeta patrocínio/atração de jogador).
4. **Inbox/notícias**: manchetes da imprensa (ofertas, marcos, cobrança da diretoria).
5. **Treinamento**: distribuir foco (mira/utilidade/tática) → evolução direcionada.
6. **Calendário/temporada**: múltiplos torneios por split, Champions Points acumulando pro Major.
