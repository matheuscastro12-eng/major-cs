// /design — vitrine viva do design system "Broadcast Desk".
// Mostra os tokens (com o contraste medido no navegador) e todos os
// primitivos de src/components/ds/, com troca de modo (acento) e de tema.
// Serve pro Matheus ver o sistema e pro QA visual das próximas ondas.
// Só tokens e primitivos aqui: nenhum hexadecimal, nenhum fontSize inline.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, Inbox, Moon, Plus, Sun, Trophy } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardButton, EmptyState, InfoTip, LiveBadge, LowerThird, Panel, ProgressBar,
  Scoreboard, Sheet, Skeleton, Stat, Table, Tabs, TabPanel, Tag, type Column,
} from '../components/ds/index';
import '../styles/design-screen.css';

type Mode = 'base' | 'carreira' | 'rtp' | 'ultimate' | 'diario' | 'online';
const MODES: { value: Mode; label: string }[] = [
  { value: 'base', label: 'Hub' },
  { value: 'carreira', label: 'Carreira' },
  { value: 'rtp', label: 'Road to Pro' },
  { value: 'ultimate', label: 'Ultimate' },
  { value: 'diario', label: 'Diário' },
  { value: 'online', label: 'Online' },
];

const SECTIONS = [
  ['cor', 'Cor'], ['tipo', 'Tipografia'], ['escala', 'Espaço e raio'], ['motion', 'Motion'],
  ['botoes', 'Botões'], ['paineis', 'Painéis'], ['tags', 'Tags'], ['abas', 'Abas'], ['tabela', 'Tabela'],
  ['numeros', 'Números'], ['alertas', 'Alertas'], ['estados', 'Vazio e carga'], ['camadas', 'Sheet e InfoTip'],
  ['transmissao', 'Transmissão'],
] as const;

// tokens de cor que o QA confere (o contraste é medido contra --c-surface-2)
const SURFACES = ['--c-surface-0', '--c-surface-1', '--c-surface-2', '--c-surface-3'];
const INKS = ['--c-ink', '--c-ink-dim', '--c-ink-faint'];
const SIGNALS: { token: string; use: string }[] = [
  { token: '--c-accent', use: 'Ação primária, seleção, foco. Muda por modo.' },
  { token: '--c-achievement', use: 'Só conquista: título, carta rara, Fundador.' },
  { token: '--c-win', use: 'Vitória, alta, positivo.' },
  { token: '--c-loss', use: 'Derrota, queda, destrutivo.' },
  { token: '--c-warn', use: 'Atenção que não é erro.' },
  { token: '--c-ct', use: 'Lado CT.' },
  { token: '--c-t', use: 'Lado T.' },
  { token: '--c-live', use: 'AO VIVO (ponto e texto).' },
  { token: '--c-epic', use: 'Momento raro: clutch, ícone.' },
];

// ── contraste WCAG medido do CSS calculado ──────────────────────────────────
function parseRgb(v: string): [number, number, number] | null {
  const m = v.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const c = v.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (c) return [Number(c[1]) * 255, Number(c[2]) * 255, Number(c[3]) * 255];
  return null;
}
function luminance([r, g, b]: [number, number, number]): number {
  const f = (x: number) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Lê a cor resolvida de um token dentro do escopo (modo/tema) atual. */
function useResolved(scope: RefObject<HTMLElement | null>, tokens: string[], deps: unknown[]) {
  const [vals, setVals] = useState<Record<string, [number, number, number] | null>>({});
  useEffect(() => {
    const host = scope.current;
    if (!host) return;
    const probe = document.createElement('span');
    host.appendChild(probe);
    const out: Record<string, [number, number, number] | null> = {};
    for (const t of tokens) {
      probe.style.color = `var(${t})`;
      out[t] = parseRgb(getComputedStyle(probe).color);
    }
    probe.remove();
    setVals(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return vals;
}

function toHex(rgb: [number, number, number] | null | undefined): string {
  if (!rgb) return '—';
  return `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="dsg-section" aria-labelledby={`${id}-h`}>
      <header className="dsg-section__head">
        <h2 id={`${id}-h`} className="dsg-section__title">{title}</h2>
        {lead != null && <p className="dsg-section__lead">{lead}</p>}
      </header>
      {children}
    </section>
  );
}

interface Row { pos: number; nick: string; team: string; role: string; ovr: number; rating: number; me?: boolean }
const ROWS: Row[] = [
  { pos: 1, nick: 'FalleN', team: 'Imperial', role: 'AWP · IGL', ovr: 88, rating: 1.18 },
  { pos: 2, nick: 'coldzera', team: 'MIBR', role: 'Rifler', ovr: 91, rating: 1.31, me: true },
  { pos: 3, nick: 'fer', team: 'Imperial', role: 'Entry', ovr: 86, rating: 1.09 },
  { pos: 4, nick: 'TACO', team: 'MIBR', role: 'Suporte', ovr: 80, rating: 0.97 },
  { pos: 5, nick: 'fnx', team: 'Imperial', role: 'Lurker', ovr: 82, rating: 1.02 },
];
const COLS: Column<Row>[] = [
  { key: 'pos', header: '#', cell: (r) => r.pos, num: true, width: 36 },
  { key: 'nick', header: 'Jogador', cell: (r) => <strong>{r.nick}</strong> },
  { key: 'team', header: 'Time', cell: (r) => r.team, dim: true },
  { key: 'role', header: 'Função', cell: (r) => r.role, dim: true },
  { key: 'ovr', header: 'OVR', cell: (r) => r.ovr, num: true },
  { key: 'rating', header: 'Rating', cell: (r) => <span className={r.rating >= 1 ? 'dsg-up' : 'dsg-down'}>{r.rating.toFixed(2)}</span>, num: true },
];

export function DesignScreen({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('base');
  const [light, setLight] = useState(false);
  const [tab, setTab] = useState<'elenco' | 'tatica' | 'financas'>('elenco');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const vals = useResolved(root, [...SURFACES, ...INKS, ...SIGNALS.map((s) => s.token)], [mode, light]);
  const ref2 = vals['--c-surface-2'];

  const ratio = (t: string) => {
    const v = vals[t];
    if (!v || !ref2) return null;
    return contrast(v, ref2);
  };

  return (
    <div
      ref={root}
      className="dsg"
      data-mode={mode === 'base' ? undefined : mode}
      data-theme={light ? 'light' : undefined}
    >
      <header className="dsg-bar">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} aria-hidden />} onClick={onBack}>Voltar</Button>
        <span className="dsg-bar__brand">ROAD TO <span className="dsg-bar__slash">MAJOR</span></span>
        <Tag tone="accent">Broadcast Desk</Tag>
        <span className="dsg-bar__spacer" />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={light ? 'Ver no tema escuro' : 'Ver no tema claro'}
          aria-pressed={light}
          onClick={() => setLight((v) => !v)}
        >
          {light ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
        </Button>
      </header>

      <div className="dsg-hero-wrap">
      <div className="dsg-hero">
        <div className="dsg-hero__copy">
          <p className="ds-eyebrow">Design system · v1</p>
          <h1 className="dsg-hero__title">O app é uma transmissão de CS.</h1>
          <p className="dsg-hero__lead">
            Placar, lower third, faixa AO VIVO e os lados CT e T viram a gramática de todos os modos. Uma paleta, três
            fontes, uma escala. O modo muda só o acento.
          </p>
          <div className="dsg-modes" role="radiogroup" aria-label="Modo (acento)">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                className="dsg-mode"
                data-mode={m.value === 'base' ? undefined : m.value}
                onClick={() => setMode(m.value)}
              >
                <span className="dsg-mode__dot" aria-hidden />
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="dsg-hero__stage">
          <Scoreboard
            a={{ name: 'MIBR', score: 12, side: 'ct' }}
            b={{ name: 'Imperial', score: 9, side: 't' }}
            meta="Mapa 2 · Mirage · MD3"
            maps={['me', null, null]}
          />
          <LowerThird kicker="Clutch 1v3" name="coldzera" sub="Rifler · MIBR · 1.31 rating" />
        </div>
      </div>
      </div>

      <nav className="dsg-toc" aria-label="Seções">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} className="dsg-toc__link">{label}</a>)}
      </nav>

      <main className="dsg-main">
        <Section id="cor" title="Cor" lead="Cor com significado. Os números ao lado são o contraste medido agora, contra a superfície 2. Texto precisa de 4,5:1.">
          <h3 className="dsg-sub">Superfícies (grafite-azulado em 4 degraus)</h3>
          <div className="dsg-swatches">
            {SURFACES.map((t, i) => (
              <div key={t} className="dsg-swatch">
                <span className="dsg-swatch__chip" style={{ background: `var(${t})` }} />
                <code className="dsg-swatch__name">{t}</code>
                <span className="dsg-swatch__meta ds-num">{toHex(vals[t])}</span>
                <span className="dsg-swatch__use">{['Fundo da página', 'Painel', 'Card, cabeçalho', 'Elevado: hover, input'][i]}</span>
              </div>
            ))}
          </div>
          <h3 className="dsg-sub">Tinta</h3>
          <div className="dsg-swatches">
            {INKS.map((t, i) => {
              const r = ratio(t);
              return (
                <div key={t} className="dsg-swatch">
                  <span className="dsg-swatch__text" style={{ color: `var(${t})` }}>Aa 1.31</span>
                  <code className="dsg-swatch__name">{t}</code>
                  <span className="dsg-swatch__meta ds-num">{toHex(vals[t])} · {r ? `${r.toFixed(1)}:1` : '—'}</span>
                  <span className="dsg-swatch__use">{['Texto principal', 'Texto secundário, rótulos', 'Metadado, legenda'][i]}</span>
                </div>
              );
            })}
          </div>
          <h3 className="dsg-sub">Sinais</h3>
          <div className="dsg-swatches dsg-swatches--wide">
            {SIGNALS.map(({ token, use }) => {
              const r = ratio(token);
              return (
                <div key={token} className="dsg-swatch">
                  <span className="dsg-swatch__chip" style={{ background: `var(${token})` }} />
                  <code className="dsg-swatch__name">{token}</code>
                  <span className="dsg-swatch__meta ds-num">{toHex(vals[token])} · {r ? `${r.toFixed(1)}:1` : '—'}</span>
                  <span className="dsg-swatch__use">{use}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="tipo" title="Tipografia" lead="Duas famílias, três papéis. Barlow Condensed para display, placar e cabeçalho de painel; Barlow para interface; números em Barlow com dígitos tabulares. Seis degraus, piso de 11px.">
          <div className="dsg-type">
            {([
              ['--fs-display', 'Display', 'Campeão do Major', 'dsg-type__display'],
              ['--fs-6', '28px', 'Semana 14 · Pós-série', 'dsg-type__h1'],
              ['--fs-5', '20px', 'Elenco principal', 'dsg-type__h2'],
              ['--fs-4', '16px', 'Contrato renovado por mais duas temporadas.', 'dsg-type__f4'],
              ['--fs-3', '14px', 'Corpo do Desk: densidade de gestão, estilo FM.', 'dsg-type__f3'],
              ['--fs-2', '12px', 'Metadado · rótulo de campo', 'dsg-type__f2'],
              ['--fs-1', '11px', 'Legenda em caps', 'dsg-type__f1'],
            ] as const).map(([tok, size, sample, cls]) => (
              <div key={tok} className="dsg-type__row">
                <code className="dsg-type__tok">{tok}<span className="ds-dim"> · {size}</span></code>
                <span className={cls}>{sample}</span>
              </div>
            ))}
          </div>
          <div className="dsg-fonts">
            <Card><p className="dsg-font dsg-font--display">Barlow Condensed 700</p><p className="ds-dim">Display, placar, títulos de painel, abas.</p></Card>
            <Card><p className="dsg-font dsg-font--ui">Barlow 400 / 600 / 700</p><p className="ds-dim">Interface, corpo, botões.</p></Card>
            <Card><p className="dsg-font dsg-font--num">1.31 · R$ 2.400.000</p><p className="ds-dim">Números tabulares: OVR, rating, dinheiro.</p></Card>
          </div>
        </Section>

        <Section id="escala" title="Espaço e raio" lead="Espaço em escala de 4. Raio pequeno em controle, médio em painel; o chanfro fica para a gramática de transmissão.">
          <div className="dsg-space">
            {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => (
              <div key={n} className="dsg-space__row">
                <code className="dsg-type__tok">--sp-{n}</code>
                <span className="dsg-space__bar" style={{ width: `var(--sp-${n})` }} />
                <span className="ds-num ds-dim">{n * 4}px</span>
              </div>
            ))}
          </div>
          <div className="dsg-radii">
            {['--rad-1', '--rad-2', '--rad-3', '--rad-4', '--rad-pill'].map((r) => (
              <div key={r} className="dsg-radius" style={{ borderRadius: `var(${r})` }}><code>{r}</code></div>
            ))}
            <div className="dsg-radius dsg-radius--notch"><code>--notch</code></div>
          </div>
        </Section>

        <Section id="motion" title="Motion" lead="Rápido no controle, lento no momento. Tudo desliga com movimento reduzido.">
          <div className="dsg-motion">
            {([['--dur-1', '120ms', 'hover, foco'], ['--dur-2', '200ms', 'troca de estado'], ['--dur-3', '320ms', 'sheet, modal'], ['--dur-4', '600ms', 'reveal, placar']] as const).map(([t, ms, use]) => (
              <div key={t} className="dsg-motion__row">
                <code className="dsg-type__tok">{t}</code>
                <span className="dsg-motion__track"><span className="dsg-motion__dot" style={{ animationDuration: `calc(var(${t}) * 4)` }} /></span>
                <span className="ds-dim">{ms} · {use}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="botoes" title="Botões" lead="Uma ação primária por tela, no acento do modo. Dourado só para conquista ou premium. Todo botão tem hover, foco visível e 44px no toque.">
          <div className="dsg-row">
            <Button variant="primary">Jogar partida</Button>
            <Button variant="secondary">Ver elenco</Button>
            <Button variant="ghost">Pular</Button>
            <Button variant="danger">Demitir técnico</Button>
            <Button variant="achievement" icon={<Trophy size={16} aria-hidden />}>Virar Fundador</Button>
          </div>
          <div className="dsg-row">
            <Button variant="primary" size="lg">Começar série</Button>
            <Button variant="primary" size="sm">Confirmar</Button>
            <Button variant="secondary" size="sm" icon={<Plus size={14} aria-hidden />}>Adicionar</Button>
            <Button variant="secondary" disabled>Sem saldo</Button>
            <Button variant="primary" loading={busy} onClick={() => { setBusy(true); window.setTimeout(() => setBusy(false), 1400); }}>
              {busy ? 'Salvando' : 'Salvar na nuvem'}
            </Button>
          </div>
        </Section>

        <Section id="paineis" title="Painéis e cards" lead="Painel é o bloco do Desk: cabeçalho condensado com a luz de tally. Card é a unidade dentro dele. Card clicável é um botão de verdade.">
          <div className="dsg-grid">
            <Panel title="Próxima partida" tone="accent" actions={<Tag tone="accent">Semana 14</Tag>}>
              <p className="dsg-p">MIBR x Imperial, MD3, sábado às 16h. O vencedor fecha a fase suíça.</p>
            </Panel>
            <Panel title="Sala de troféus" tone="achievement">
              <p className="dsg-p">3 títulos · 1 Major · MVP da temporada 2026.</p>
            </Panel>
            <Panel title="Caixa">
              <Stat label="Saldo" value="R$ 2,4 mi" delta="+R$ 180 mil" hint="Patrocínio pago na virada da semana" />
            </Panel>
          </div>
          <div className="dsg-grid">
            <Card><p className="ds-eyebrow">Card</p><p className="dsg-p">Conteúdo agrupado, sem ação.</p></Card>
            <CardButton onClick={() => undefined}><p className="ds-eyebrow">Card clicável</p><p className="dsg-p">Tab e Enter funcionam.</p></CardButton>
            <CardButton selected onClick={() => undefined}><p className="ds-eyebrow">Selecionado</p><p className="dsg-p">Contorno no acento.</p></CardButton>
          </div>
        </Section>

        <Section id="tags" title="Tags e badges" lead="O tom diz o que é. Tag nunca é botão.">
          <div className="dsg-row">
            <Tag>Neutro</Tag>
            <Tag tone="accent">Novo</Tag>
            <Tag tone="solid">Destaque</Tag>
            <Tag tone="win">Vitória</Tag>
            <Tag tone="loss">Derrota</Tag>
            <Tag tone="warn">Lesionado</Tag>
            <Tag tone="achievement">Campeão</Tag>
            <Tag tone="epic">Ícone</Tag>
            <Tag tone="ct">CT</Tag>
            <Tag tone="t">T</Tag>
            <LiveBadge />
          </div>
          <div className="dsg-row">
            <span className="dsg-inline">Mensagens <Badge>3</Badge></span>
            <span className="dsg-inline">Propostas <Badge tone="loss">12</Badge></span>
            <span className="dsg-inline">Arquivadas <Badge tone="muted">40</Badge></span>
          </div>
        </Section>

        <Section id="abas" title="Abas" lead="Setas do teclado trocam de aba. No celular a faixa rola e some na borda.">
          <Tabs
            label="Gestão do time"
            idPrefix="dsg-tab"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'elenco', label: 'Elenco', badge: <Badge tone="muted">5</Badge> },
              { value: 'tatica', label: 'Tática' },
              { value: 'financas', label: 'Finanças' },
            ]}
          />
          <TabPanel value={tab} idPrefix="dsg-tab" className="dsg-tabpanel">
            {tab === 'elenco' && <p className="dsg-p">Cinco titulares, dois reservas. Química do elenco: 82.</p>}
            {tab === 'tatica' && <p className="dsg-p">Estilo padrão: controle de mapa, execuções lentas no lado T.</p>}
            {tab === 'financas' && <p className="dsg-p">Folha salarial dentro do teto. Próximo pagamento em 3 dias.</p>}
          </TabPanel>
        </Section>

        <Section id="tabela" title="Tabela densa" lead="Estilo FM: linhas de 34px, números tabulares à direita, sua linha marcada no acento.">
          <Table caption="Ranking de jogadores" columns={COLS} rows={ROWS} rowKey={(r) => r.nick} isMe={(r) => !!r.me} />
        </Section>

        <Section id="numeros" title="Números e progresso">
          <div className="dsg-stats">
            <Stat label="OVR" value="91" delta={3} />
            <Stat label="Rating" value="1.31" delta={-0.04} />
            <Stat label="K/D" value="1.24" size="sm" />
            <Stat label="Títulos" value="3" size="lg" />
          </div>
          <div className="dsg-progress">
            <ProgressBar label="Passe da temporada" value={34} max={50} valueText="34 / 50" />
            <ProgressBar label="Rumo ao Fundador" value={812} max={1000} valueText="812 / 1000" tone="achievement" />
            <ProgressBar label="Moral do elenco" value={72} tone="win" />
            <ProgressBar label="Pressão da diretoria" value={64} tone="warn" size="lg" />
            <ProgressBar label="Controle CT" value={58} tone="ct" />
          </div>
        </Section>

        <Section id="alertas" title="Alertas" lead="Erro diz o que houve e como resolver. Sem desculpas, sem vaguezas.">
          <div className="dsg-stack">
            <Alert title="Save na nuvem ativo">Seus 5 slots sincronizam a cada fim de partida.</Alert>
            <Alert tone="success" title="Contrato assinado">fer chega ao elenco na próxima semana.</Alert>
            <Alert tone="warn" title="Streak em risco">Jogue o Diário até 23h59 para manter os 12 dias.</Alert>
            <Alert tone="danger" title="Não deu para salvar" action={<Button size="sm" variant="secondary">Tentar de novo</Button>}>
              A conexão caiu durante o envio. O save local continua neste navegador.
            </Alert>
          </div>
        </Section>

        <Section id="estados" title="Vazio e carregando" lead="Tela vazia convida a agir. Skeleton tem o formato do que vai chegar.">
          <div className="dsg-grid">
            <EmptyState icon={<Inbox size={40} />} title="Nenhuma proposta" action={<Button variant="primary" size="sm">Abrir mercado</Button>}>
              Coloque um jogador na lista de transferência para receber ofertas.
            </EmptyState>
            <Card aria-busy="true">
              <div className="dsg-skel">
                <Skeleton variant="circle" width={44} height={44} />
                <div className="dsg-skel__lines">
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="40%" />
                </div>
              </div>
              <Skeleton height={72} />
            </Card>
          </div>
        </Section>

        <Section id="camadas" title="Sheet e InfoTip" lead="No celular o sheet sobe de baixo; no desktop vira diálogo. InfoTip abre no toque e substitui o title=.">
          <div className="dsg-row">
            <Button variant="secondary" onClick={() => setSheet(true)}>Abrir sheet</Button>
            <span className="dsg-inline">
              Chance de vencer 62%
              <InfoTip label="Como a chance é calculada">O % mostrado é o % rolado: soma o atributo efetivo, o momentum e a leitura tática.</InfoTip>
            </span>
          </div>
          <Sheet
            open={sheet}
            onClose={() => setSheet(false)}
            title="Renovar contrato"
            footer={<><Button variant="ghost" onClick={() => setSheet(false)}>Cancelar</Button><Button variant="primary" onClick={() => setSheet(false)}>Renovar</Button></>}
          >
            <p className="dsg-p">coldzera pede R$ 48 mil por semana por mais duas temporadas.</p>
            <ProgressBar label="Folha salarial após renovar" value={88} tone="warn" />
          </Sheet>
        </Section>

        <Section id="transmissao" title="Transmissão" lead="A assinatura: placar com chanfro, barra do lado e faixa AO VIVO. O mesmo placar em Carreira, RtP e ranked.">
          <div className="dsg-stack">
            <Scoreboard a={{ name: 'FURIA', score: 2, sub: 'Série' }} b={{ name: 'Vitality', score: 1, sub: 'Série' }} status="final" meta="MD3 · Final do Major" maps={['me', 'them', 'me']} />
            <Scoreboard a={{ name: 'paiN', score: 0 }} b={{ name: 'Liquid', score: 0 }} status="upcoming" meta="Sábado · 16h" />
            <div className="dsg-row">
              <LowerThird kicker="Análise" name="Mesa do Major" sub="Pré-jogo · 15h45" />
              <LowerThird kicker="MVP da final" name="KSCERATO" sub="1.42 rating · 27 abates" tone="achievement" />
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}
