// Tutorial in-game (HowToPlay) — T8.1 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// 5 seções:
//   1. Setup — você funda uma org, escolhe tier, monta o elenco
//   2. Loop semanal — circuitos por split, advance week, scrim, treino
//   3. Mercado — propostas, sponsors, finance
//   4. Torneios — circuitos regionais, GSL, playoff
//   5. Major — VRS, ranking mundial, stages do Major
//
// Componente standalone — pode ser renderizado dentro de um Modal (mostrado
// pelo botão "Tutorial" do CareerShell) ou em rota futura `/como-jogar`.

import { useState, type ReactNode } from 'react';
import { CareerIcon, type CareerIconName } from '../components/career/CareerIcon';

interface Section {
  id: string;
  title: string;
  icon: CareerIconName;
  body: ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'setup',
    title: 'Setup — fundar sua org',
    icon: 'rocket',
    body: (
      <>
        <p>
          Você começa fundando uma <b>organização de esports</b>. Escolhe nome, sigla (3 letras),
          cores e logo. A org entra direto no <b>Tier 3</b> (V-League BR / academies do mundo),
          com caixa inicial humilde.
        </p>
        <p>
          Em seguida você monta o <b>cinco titular</b> contratando 5 jogadores e 1 coach.
          O mercado já filtra por orçamento — não dá pra montar dream team de cara. Times
          de alto OVR cobram salários altos.
        </p>
        <p>
          <b>Diretoria</b> dá um objetivo a cada split (terminar top 4, subir de tier, etc.).
          Falhar repetidamente derruba a confiança e pode te demitir.
        </p>
      </>
    ),
  },
  {
    id: 'loop',
    title: 'Loop semanal — split por split',
    icon: 'calendar',
    body: (
      <>
        <p>
          Cada <b>split</b> tem 3 etapas de campeonato + (a cada 4 splits) o <b>Major Mundial</b>.
          Você avança etapa por etapa jogando ou simulando partidas.
        </p>
        <p>
          Entre etapas você gerencia:
        </p>
        <ul>
          <li><b>Treino</b>: escolhe 1 jogador em foco (cresce mais rápido) e até 3 mapas pra treinar (sobem domínio).</li>
          <li><b>Scrim</b>: $5k por sessão, sobe química e tira fadiga. Use antes de torneios decisivos.</li>
          <li><b>Playbook</b>: tático (aggressive / tactical / fast / controlled). Manter o mesmo sobe entrosamento.</li>
          <li><b>Conversas</b>: clica num jogador no profile e abre o "Conversar" — afeta morale/respeito.</li>
        </ul>
        <p>
          No fim do split, a <b>diretoria avalia</b>, sponsors pagam o retainer, contratos vencidos saem,
          jovens da academia evoluem, eventos contextuais aparecem (briga, scandal, oferta de bootcamp).
        </p>
      </>
    ),
  },
  {
    id: 'market',
    title: 'Mercado — contratar, vender, sponsors',
    icon: 'handshake',
    body: (
      <>
        <p>
          O <b>mercado abre na janela entre splits</b>. Durante a temporada você só pode
          fechar pré-acordos (entram em vigor na próxima janela).
        </p>
        <p>
          Cada jogador tem <b>OVR</b> (50-99), <b>função primária</b>, <b>28 atributos</b> FM-style e
          <b> potencial</b> (S/A/B/C). Jovens com S/A podem virar lendas — mas custam caro pra
          renovar quando blow up.
        </p>
        <p>
          <b>Sponsors</b> oferecem contratos dinâmicos no fim do split (modal com aceitar/recusar).
          Sponsors top (Red Bull, Samsung) exigem VRS alto. Cada um paga retainer por split +
          bônus por placement em torneios.
        </p>
        <p>
          A aba <b>Finanças</b> mostra projeção fixa por split (sponsor − folha − infra).
          Saldo negativo queima caixa todo split — atenção.
        </p>
      </>
    ),
  },
  {
    id: 'tournaments',
    title: 'Torneios — circuito → playoff',
    icon: 'trophy',
    body: (
      <>
        <p>
          Cada split tem um <b>circuito regional</b> (Brasil, NA, EMEA, Pacific, China).
          Formato:
        </p>
        <ul>
          <li><b>Fase de grupos</b> (GSL · dupla eliminação): top 2 de cada grupo avança.</li>
          <li><b>Mata-mata</b>: semifinais (MD3) + final (MD5).</li>
        </ul>
        <p>
          Você joga ao vivo ou simula. Estratégia: escolha o <b>plano de jogo</b> antes da partida
          (disciplinado / antistrat / mapfocus / aggressive) — cada um afeta o desempenho.
        </p>
        <p>
          O <b>veto de mapas</b> antes da série usa seu domínio (treino) + histórico vs o oponente.
          Use o painel de tendência pra decidir bans/picks.
        </p>
      </>
    ),
  },
  {
    id: 'major',
    title: 'Major Mundial — o clímax da temporada',
    icon: 'globe',
    body: (
      <>
        <p>
          A cada 4 splits acontece o <b>Major Mundial</b>. Os <b>top 32 do ranking VRS mundial</b>
          se classificam. VRS é rolante: decai a cada split, soma quando você vence.
        </p>
        <p>
          Formato do Major (3 stages):
        </p>
        <ul>
          <li><b>Stage 1</b> (32 times → 16) — entrada de times tier-3+</li>
          <li><b>Stage 2</b> (16 → 8) — entrada de times tier-2+</li>
          <li><b>Stage 3</b> (8 → 8) — entrada de times tier-1</li>
          <li><b>Champions</b> — playoffs MD3/MD5</li>
        </ul>
        <p>
          Vencer um Major é o ápice — paga $1M+ em premiação + bônus de sponsors,
          consolida sua org como <b>lenda mundial</b>, e libera achievements raras.
        </p>
        <p style={{ color: 'var(--em-gold)' }}>
          <b>Dica:</b> mantenha o entrosamento do playbook alto e prepare o time com bootcamp
          antes de Majors. Diferença pequena na prep vira eliminação cedo.
        </p>
      </>
    ),
  },
];

export function HowToPlay({ onClose }: { onClose?: () => void }) {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr',
        gap: 18,
        maxWidth: 880,
        minHeight: 420,
      }}
    >
      {/* Sidebar de seções */}
      <nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: 4,
          borderRight: '1px solid var(--em-border)',
        }}
      >
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveId(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: activeId === s.id ? 'var(--em-panel-2)' : 'transparent',
              border: '1px solid',
              borderColor: activeId === s.id ? 'var(--em-gold)' : 'transparent',
              borderRadius: 4,
              color: activeId === s.id ? 'var(--em-text)' : 'var(--em-muted)',
              fontFamily: 'inherit',
              fontSize: '0.82rem',
              fontWeight: activeId === s.id ? 700 : 500,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: activeId === s.id ? 'var(--em-gold)' : 'var(--em-panel-2)',
                color: activeId === s.id ? '#1a1205' : 'var(--em-muted)',
                borderRadius: 3,
                fontSize: '0.7rem',
                fontWeight: 800,
              }}
            >
              {i + 1}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CareerIcon name={s.icon} size={14} />
              <span>{s.title.split(' — ')[0]}</span>
            </span>
          </button>
        ))}
      </nav>

      {/* Conteúdo */}
      <article style={{ padding: '4px 6px', overflowY: 'auto', maxHeight: '60vh' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 42,
              height: 42,
              background: 'var(--em-gold)',
              color: '#1a1205',
              borderRadius: 6,
            }}
          >
            <CareerIcon name={active.icon} size={22} />
          </span>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--em-text)' }}>
            {active.title}
          </h2>
        </header>
        <div
          style={{
            color: 'var(--em-text)',
            fontSize: '0.92rem',
            lineHeight: 1.6,
          }}
        >
          {active.body}
        </div>
        {onClose && (
          <div style={{ marginTop: 24, textAlign: 'right', borderTop: '1px solid var(--em-border)', paddingTop: 14 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 16px',
                background: 'var(--em-gold)',
                color: '#1a1205',
                border: 'none',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Vamos jogar
            </button>
          </div>
        )}
      </article>
    </div>
  );
}
