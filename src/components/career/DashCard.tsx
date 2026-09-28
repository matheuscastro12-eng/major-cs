// DashCard — o cartão de painel das telas de modo (Carreira, Road to Pro,
// Ultimate). Tem a forma do painel da "nova interface" (skin.css): cabeçalho
// em gradiente, ícone dourado e título Barlow Condensed em caixa-alta.
// Sem `icon`, o ícone vem do título (mapa de palavras-chave abaixo), pra que
// todo painel do jogo tenha ícone coerente sem mexer em cada tela.
import type { ReactNode } from 'react';
import {
  Activity, ArrowLeftRight, Award, BarChart3, BookOpen, Building2, CalendarDays, ChartNoAxesColumn, Crosshair,
  DoorOpen, Dumbbell, Flame, GitBranch, Globe, GraduationCap, History, Landmark, Layers, Map, Medal, Newspaper,
  Radar, Search, ShieldHalf, Sparkles, Star, Swords, Target, Trophy, UserRound, Users, Wallet, Binoculars,
  Handshake, Megaphone, Eye, Tent, type LucideIcon,
} from 'lucide-react';

const ICON_RULES: [RegExp, LucideIcon][] = [
  [/adversári|rival|analista/i, Binoculars],
  [/melhores|destaque/i, Star],
  [/scout|olheir/i, Search],
  [/finan|folha|salári|orçamento|patrocín/i, Wallet],
  [/calend|agenda|roadmap/i, CalendarDays],
  [/ranking|vrs|top 20|hltv/i, ChartNoAxesColumn],
  [/notíc|draft5|imprensa|mídia/i, Newspaper],
  [/diretoria/i, Landmark],
  [/elenco|seu time|jogadores|titular/i, Users],
  [/forma|evolução|números/i, Activity],
  [/identidade|trait/i, Sparkles],
  [/playbook|tátic|plano/i, Target],
  [/mapa/i, Map],
  [/treino|bootcamp/i, Dumbbell],
  [/scrim/i, Crosshair],
  [/comissão|coach|técnic/i, ShieldHalf],
  [/academia|base/i, GraduationCap],
  [/transfer|mercado|janela|contrat|rumor/i, ArrowLeftRight],
  [/chave|playoff|fase|grupos|classifica|resultado|partida|série/i, Swords],
  [/troféu|conquist|prêmio|vitrine|recorde|lenda|marco/i, Trophy],
  [/histór|linha do tempo|eras|carreira/i, History],
  [/cena|mundial|circuito/i, Globe],
  [/vestiário/i, DoorOpen],
  [/infra|instala/i, Building2],
  [/perk|árvore/i, GitBranch],
  [/como funciona|guia/i, BookOpen],
  [/clube|org/i, Star],
  [/aguardando|procurando/i, Eye],
  [/stat|estatíst|desempenho/i, BarChart3],
  [/confirmad/i, Handshake],
  [/megafone|anúncio/i, Megaphone],
  [/medalha/i, Medal],
  [/radar/i, Radar],
  [/hype|momento/i, Flame],
  [/acampamento/i, Tent],
  [/award/i, Award],
  [/camada|layer/i, Layers],
  [/perfil|você/i, UserRound],
];

export function iconForTitle(title: ReactNode): LucideIcon | null {
  if (typeof title !== 'string') return null;
  for (const [re, Icon] of ICON_RULES) if (re.test(title)) return Icon;
  return null;
}

export function DashCard({ title, info, actions, flush, children, className = '', icon }: {
  title?: ReactNode;
  /** ícone dourado do cabeçalho (lucide 16px); sem ele, vem do título */
  icon?: ReactNode;
  info?: string;
  actions?: ReactNode;
  flush?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const Auto = icon == null ? iconForTitle(title) : null;
  const ic = icon ?? (Auto ? <Auto size={16} /> : null);
  return (
    <section className={`dash-card ${className}`.trim()}>
      {title != null && (
        <header className="dash-card-head">
          {ic != null && <span className="dash-card-ic" aria-hidden>{ic}</span>}
          <b>{title}</b>
          <span style={{ flex: 1 }} />
          {actions}
          {info && <span className="dash-info" title={info}>i</span>}
        </header>
      )}
      <div className={`dash-card-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}
