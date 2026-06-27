# Road to Major — SUPER ATUALIZAÇÃO

> Branch `feat/new-visual-ui-ux` · **+51.332 linhas líquidas** (61.717 inseridas / 10.385 removidas) · **268 commits** · 271 arquivos tocados.

Esta é a maior atualização desde o lançamento. O jogo foi **reconstruído visualmente do zero** com um padrão de design coeso (`em-*` tokens), o engine ganhou **profundidade FM-style** (sub-roles, sponsors dinâmicos, team events, ofertas pra prospects), e o conteúdo do CS2 foi **atualizado pra 2026** com 95+ times reais, 12 academies e 50 free agents.

---

## 🎨 IDENTIDADE VISUAL — Reskin completo no padrão `em-*`

Praticamente toda tela do modo carreira foi refeita do zero. O resultado: hierarquia visual clara, banners gold padronizados, DashCards consistentes, monospace pra números, accent colors por estado (verde=ganho, vermelho=perda, gold=destaque, azul=meta).

| Tela | Antes | Depois |
|---|---|---|
| **Mercado** | Lista vertical compacta | Layout **3 colunas**: Elenco / Mercado / Coach+Sponsors+Rumores · sticky bottom com warnings |
| **Escolher time** | 9 times tier 2/3 fixos | **Qualquer time** do dataset (95+) · filtros tier/região/busca · 5 avatares por card |
| **Cenários** | Cards básicos | DashCards por categoria · TeamBadge real · objetivos em chips gold |
| **Renovação** | Lista chata | Header banner · borders coloridas por decisão · sticky bottom com hud cost/budget |
| **Negociação** | Modal antigo `nego-*` | `<Modal>` padrão · slider gold · presets · 3 figures inline · reply colorido por tipo |
| **Proposta tier 1** | Panel básico | Banner gold cinematográfico · 2 cards (player + fee) · narrativa contextual |
| **Fundar org** | Form panel | DashCard 2-col · ColorSwatch · grid emblems · preview mini-thumbs |
| **Gerenciador saves** | Inline styles `rtm-*` | DashCards · SlotHudPill colorida · SlotMeta accent por valor |
| **Academia** | 2 DashCards basicos | Banner header · 5 cards clicáveis · ofertas pendentes · "Como evoluem" explainer com fórmula |
| **/jogar landing** | Animação WebGL pesada | Estática (3 orbs sem animation, vignette) · zero GPU continuo |

### Tela de mercado (highlight)
**Antes:** 263 linhas empilhadas verticalmente com tooltip preto sobrepondo título.
**Depois:** 463 linhas em 3 colunas com:
- Header com 3 HudPills (Orçamento, Elenco X/5, Coach ✓)
- Coluna esquerda: Seu Elenco + Promover Academia (FutCards clicáveis com hover accent)
- Coluna centro: Mercado filtrável (search + país select + role chips + sort)
- Coluna direita: Coach em rows + Patrocínios + Confirmadas + Rumores
- Sticky bottom: warnings inline + "✔ Fechar elenco e escolher o campeonato" gold

---

## 🎬 MODAIS CINEMATOGRÁFICOS — Beats narrativos pros momentos altos

Antes, eventos importantes eram um modal genérico. Agora são **sequências cinematográficas** que dão peso ao momento.

- **ChampionCelebrationModal** — quando você levanta o troféu de um circuito ou Major
- **PlayerRetirementModal** — quando um veterano pendura as armas
- **TournamentEliminationModal** — eliminação dramática (estilo "fim de jornada")
- **FiredModal** — diretoria te demite com quote do chairman + stats da run + opção continuar/reiniciar
- **SeasonRecapModal** *(novo)* — 4 slides pós-split: posição final → MVP do split → recap financeiro → próximos passos
- **YearAwardsModal** — cerimônia de fim de temporada (MVP/Rookie/Coach/Surpresa)

Pacing: ESC pula tudo, ←/→ navega, accent gold consistente.

---

## 🌍 NOVO CONTEÚDO — Dataset CS2 2026 + Academies + Free Agents

### 95+ times reais atualizados via planilha
Importação completa dos elencos CS2 atualizados (top mundial até regionais). Cada player com:
- 5 atributos numéricos (aim/consistency/clutch/awp/igl)
- Roles primária + secundária
- País (ISO 2)
- Idade real (parcial — em progresso via Liquipedia)
- Coach + estilo tático
- Teamwork do time

### 12 academies com **logo do time pai + "ACADEMY"** embaixo
Pedido visual: "mouz nxt → logo da mouz + escrito academy embaixo". Implementado.

Academies com roster real:
- NAVI Junior, MOUZ NXT, Eternal Fire Academy, fnatic Rising, Heroic Academy, 9INE Academy, BIG Academy
- **+5 novos da planilha**: MIBR Academy, paiN Academy, Bestia Academy, Oddik Academy, Red Canids AC

### 50 Free Agents jogáveis
"Free Agents" virou um time virtual `__free__` no dataset — aparece no Mercado pra contratar (25% mais barato que clube), filtrado das ligas online.

---

## 🏆 ENGINE PROFUNDO — Mecânicas FM-style

### Sub-roles derivados (T3.3)
6 sub-roles emergem das stats: **AWPer**, **IGL**, **Entry Fragger**, **Lurker**, **Support**, **Rifler genérico**. Cada player tem `subRoleStars` (0-5 em cada). `compositionPenalty` penaliza time com 3+ AWPers ou 4+ Entries.

### Sponsors dinâmicos (T3.5)
Marcas reais (Red Bull, Samsung, HyperX, Logitech, etc) propõem contratos por split. Compromisso por X splits (não rescinde). Filtragem por VRS — top marcas só pra orgs grandes. Cooldown pós-recusa.

### Team events (T3.6)
12+ eventos narrativos por split: brigas internas, propostas de boot camp, drama de coach, ofertas de fundos, etc. Cada evento tem 2-3 escolhas com tradeoffs reais (morale/budget/board).

### Region routing (Frente 3)
Times BR fracos (Vasco, Yawara, ALKA, etc — country=br + teamwork≤65) **NÃO** aparecem mais em circuitos europeus. Pool segmentado: SA (Brasil/Argentina/etc), EU, Ásia. User BR no T3 só vê T3-SA por padrão; tier-up libera global.

### Mais campeonatos no CircuitPicker (Frente 2)
De 3 opções por split → **8 opções**:
- T1 + T1-Alt (variante com field rotativo)
- T2 + T2-Alt
- T3 Global + T3-SA + T3-EU + T3-Ásia
T1_EVENTS de 20 → 35 nomes (BLAST Spring/Fall, PGL Wallachia, IEM Berlin/Beijing/Atlanta, BetBoom Dacha, etc). T2: 30. T3 regionais: 16 SA + 15 EU + 8 Asia.

### Sistema de Academy expandido
- Times jogáveis com playoff top-4 (semis + final) — em andamento
- Treino dos prospects com fórmula transparente: **base 2.1 + foco +1 + treino +N/3 = até +4.1 OVR/split**
- Ofertas determinísticas pra prospects (35% chance se OVR≥72 · seed prospectId+split)
- Modal de player abre da Academy também (resolvePlayerById ampliado)

### Save migrations v1→v11
Backfill obrigatório em toda atualização — saves antigos **nunca quebram**. Adicionados campos: facilities, sponsors, sponsorUntil, scenarios, academy, academyTeam, academyFocus, pendingTeamEvent, coachStints, hiredScoutId, etc.

---

## 🛠️ ARQUITETURA

### Monolito quebrado: 14 abas extraídas
`CareerScreen.tsx` foi de 7660 linhas → ~6900, com 14 abas migradas pra `src/pages/career/`:
- StandingsTab, ResultsTab, VrsTab, Top20Tab, HistoryTab
- BracketTab, InboxTab, CalendarTab, WorldTab
- AcademyTab, MajorTab, FinanceTab, SquadTab, OverviewTab

Cada uma com props tipadas, state local, lógica de derive isolada.

### Store Zustand centralizado
`useState<CareerSave>` migrado pra `useGame` (T1.1) — saves persistem automaticamente via gameStore com:
- `loadFromSlot(n, hydrate)` com migration chain
- Cloud sync por slot (apoiador)
- Tombstones pra delete persistir entre devices

### 23 testes automatizados
Engine coberto via `npm run test:sim`:
- Save migrations (6 testes)
- Sponsor engine (8 testes)
- Sub-roles (9 testes)
Todos verdes em cada commit.

---

## ✨ POLISH & QUALIDADE DE VIDA

### Onboarding interativo (T8.2)
Modal slideshow estático virou **tour com spotlight nos elementos reais do DOM**. 5 steps: welcome → topbar → nav principal → ferramentas → ready. ESC pula, Enter avança, ←/→ navega.

### Avatares procedurais (T7.1)
Quando player não tem foto real, agora gera avatar único determinístico pelo nick: 8 paletas dark/saturated + 4 shapes decorativos + iniciais em monospace. **Cada jogador é visualmente distinto**, mesmo na fallback.

### Logo Builder
Editor de logo da org reusável: 6 shapes (escudo/círculo/hex/raio/estrela/losango) × 2 cores × iniciais customizáveis × layout (centralizado/embaixo) × contorno. Preview ao vivo + mini-thumbs.

### Compare Page
Comparação side-by-side de 2-4 players: atributos lado a lado, role pills, accent no maior de cada stat. Acessível do SquadTab.

### Meta Page
Snapshot agregado da temporada: distribuição de roles no top, países mais fortes, mapas mais picados, campeões regionais atuais. Acessível via menu Ferramentas.

### Infrastructure Page
3 facilities (Centro de Treino · Sala de Analista · Sala de Psicólogo) com descrição clara do benefit por nível, custo do upgrade, upkeep por split. Auto-refresh ao investir.

### LockerRoom Page
Snapshot pre-match: 5 jogadores com mood, briefing tático do oponente, plano de jogo selecionado. Acessível via menu Ferramentas (só se há próxima partida).

### How To Play
Tutorial in-game consultável: 6 seções explicando carreira, mercado, circuitos, sub-roles, academy, sponsors. Acessível via ❔.

### Account management
**AccountChip no top-right do /jogar** sempre visível: status (Fundador / Vitalícia / Grátis) + email + dropdown com Meu perfil / Upgrade / Sair.

Click em "Carreira" no /jogar agora aguarda `account.ready` antes de decidir caminho — antes podia cair no slot 1 direto se clicava rápido demais.

### Save manager
Tela de "Suas carreiras" (conta vitalícia, até 5 slots) refeita: SlotHudPill colorida por % uso, slot rows com TeamBadge + meta em monospace, confirmação de delete inline com border vermelho, sync nuvem visível.

### CircuitPicker
Cada opção mostra: prize pool real ($), sede com bandeira, vagas pro Major, prêmio ×N, VRS ×N, badge de região (🌎 SA / 🇪🇺 EU / 🌏 Ásia) quando regional.

---

## 🐛 BUGS CORRIGIDOS NESSA BRANCH

- VetoScreen crash com decider (`p.team === -1`)
- Live canvas agents não se moviam (walkable mask) — feature posteriormente escondida
- Rounds longos demais (IDLE_FAST_FORWARD ×6)
- Modal de player academy "não encontrado" (resolver não olhava academyTeam)
- Cards de time academy com OvrBadge sobreposto ao texto
- Navbar lotada com 8 ícones (consolidado em menu ⋯ Ferramentas)
- Save reparado banner pra slots inválidos
- Coach stints + trophies não persistiam corretamente

---

## ⚙️ DEPRECATED / ESCONDIDO

- **LiveCanvasGame Replay 2D** — feature beta escondida atrás de `?broadcast=1`. Canvas ainda sem pathfinding/LOS reais. Código mantido pra reativar quando estiver maduro.
- **Animação WebGL do /jogar** — removida. Performance significativamente melhor em mobile/laptops mais simples.

---

## 📊 NÚMEROS DA BRANCH

| Métrica | Valor |
|---|---|
| Commits | **268** |
| Linhas adicionadas | **+61.717** |
| Linhas removidas | **−10.385** |
| Líquido | **+51.332** |
| Arquivos tocados | **271** |
| Tempo de desenvolvimento | Várias semanas |
| Testes automatizados | **23 passing** |

---

## 🎮 EXPERIÊNCIA NO TODO

Antes desta branch, o jogo era funcional mas tinha:
- UI inconsistente (mix de padrões `panel-*`, `rtm-*`, inline)
- Times BR irrealistas batendo em europeus
- 3 campeonatos por split
- Transição entre splits seca (pagou folha → mercado)
- Free agents hardcoded (20 jogadores fictícios)
- Academy decorativa (não interativa)
- Modal de player academy quebrado

Agora:
- **Padrão visual único** em todo o modo carreira
- **Cada região respeita seu calendário** (BR não joga ESL EU)
- **8 campeonatos por split** com variedade real
- **Sequência cinematográfica** ao fim de cada split/temporada
- **50 free agents reais** + 5 academies novos
- **Academy funcional** com matches jogáveis (em andamento), ofertas pra prospects, treino transparente
- **Account management fácil** com chip no canto

Bem-vindo à nova era do **Road to Major**. 🏆
