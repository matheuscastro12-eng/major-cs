// Patch notes — T6.3 do roadmap em .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Cada entrada é um patch com data, título e itens. Para adicionar um patch novo:
//   1) Coloque um NOVO entry no TOPO do array PATCHES (mais recente primeiro)
//   2) Use um `id` único e estável (ex.: '2026.07.10' — vira a key do
//      localStorage de "já viu este patch")
//   3) Itens com 1 linha, tom direto, sem emoji (alinhado com a politica do
//      design em-* — emojis foram retirados em b46b61b)
//
// A versão atual exibida na UI é PATCHES[0].id. O componente PatchNotesModal
// usa esse id pra decidir se mostra o modal automaticamente (uma vez por user).

export interface PatchNoteItem {
  // tom: 'feature' destaca; 'fix' marca como conserto; 'tweak' = ajuste.
  kind: 'feature' | 'fix' | 'tweak';
  area: string; // 'Carreira', 'Online', 'UI', 'Engine', etc.
  text: string;
}

export interface PatchNote {
  id: string; // ex.: '2026.06.26'
  date: string; // texto formatado (ex.: '26 jun 2026')
  title: string;
  items: PatchNoteItem[];
}

export const PATCHES: PatchNote[] = [
  {
    id: '2026.07.22',
    date: '22 jul 2026',
    title: 'A GRANDE ATUALIZAÇÃO: janela 2026.2, demissão sem game-over e muito mais',
    items: [
      { kind: 'feature', area: 'Carreira', text: 'Demitido? A carreira CONTINUA: procure um novo clube, seja recusado, recomece um tier abaixo — com todo o seu histórico preservado.' },
      { kind: 'feature', area: 'Carreira', text: 'Scrim de verdade: escolha o sparring (banda de força + disponibilidade) e jogue um MD1 real com relatório por titular e MVP.' },
      { kind: 'feature', area: 'Carreira', text: 'Lendas geracionais: craques ganham aura por pico de carreira (Em ascensão → Craque → LENDA → GOAT), com fase "legacy" no declínio.' },
      { kind: 'feature', area: 'Carreira', text: 'Analista com memória: o relatório pré-veto agora cruza seu W-L REAL por mapa ("você: 4-1 aqui") nas recomendações de pick/ban.' },
      { kind: 'feature', area: 'Carreira', text: 'Linha do tempo visual da carreira por temporada (títulos, Majors e tropeços como marcos) no topo do Histórico.' },
      { kind: 'feature', area: 'Carreira', text: 'Ficha técnica do pro no perfil: eDPI, resolução, crosshair e gear — determinística por jogador.' },
      { kind: 'feature', area: 'Carreira', text: 'Elencos atualizados com a janela do meio do ano: 88 transferências reais, 34 organizações novas (127 times no total).' },
      { kind: 'feature', area: 'Carreira', text: 'Mercado de free agents renovado: 87 nomes disponíveis, incluindo estrelas deslocadas na janela (broky, SunPayus, siuhy, nawwk).' },
      { kind: 'feature', area: 'Carreira', text: 'Cena BR mais profunda: Luminosity, Grêmio, Vasco, RED Canids e times de base (MIBR Academy, paiN Academy) entram no circuito.' },
      { kind: 'feature', area: 'Carreira', text: 'Diretoria viva: a confiança agora reage a CADA série, caixa no vermelho e campanha de Major — com histórico no dashboard.' },
      { kind: 'feature', area: 'Carreira', text: 'Demissão justificada: o comunicado da diretoria cita os eventos que derrubaram sua confiança.' },
      { kind: 'tweak', area: 'Carreira', text: 'Idades reais importadas pra ~300 jogadores e funções secundárias (AWP+IGL) no dataset.' },
      { kind: 'feature', area: 'Road to Pro', text: '3 minigames novos: Prefire nos ângulos, Utilitária perfeita (estilingue de granada) e Segure o ângulo (cuidado com o aliado).' },
      { kind: 'feature', area: 'Road to Pro', text: 'Treinos rotacionam o minijogo a cada semana — mira alterna com prefire, demos alterna com leitura de peek.' },
      { kind: 'feature', area: 'Road to Pro', text: 'Sala com mais mão na partida: 5 execuções por série, casadas com a situação (retake = utilitária, pós-plant = segurar o ângulo).' },
    ],
  },
  {
    id: '2026.06.26',
    date: '26 jun 2026',
    title: 'Visual novo em toda a app + Academia jogável',
    items: [
      { kind: 'feature', area: 'UI', text: 'Design system em-* aplicado em todas as telas (Home, Carreira, Online, Admin, fluxo de partida).' },
      { kind: 'feature', area: 'Carreira', text: 'Time Academy + Liga Academy: prospectos agora competem em sua própria copa.' },
      { kind: 'feature', area: 'Carreira', text: 'Veto reescrito: animado, sem emojis, com painel de tendência por mapa.' },
      { kind: 'feature', area: 'Carreira', text: 'Chave do Major redesenhada: cartinhas, grupos e resultboxes no visual novo.' },
      { kind: 'tweak', area: 'Carreira', text: 'Prêmios aumentados (~2× circuito, ~1.7× Major).' },
      { kind: 'fix', area: 'Carreira', text: 'Bug do veto que pedia "Recarregar" ao iniciar partida com decider.' },
      { kind: 'fix', area: 'Carreira', text: 'Save travado no fim do Stage Suíço (Stage 3 R5).' },
    ],
  },
  {
    id: '2026.06.15',
    date: '15 jun 2026',
    title: 'Polish técnico',
    items: [
      { kind: 'feature', area: 'UI', text: 'Killfeed com ícones SVG oficiais do CS e arsenal calibrado por round.' },
      { kind: 'tweak', area: 'Landing', text: 'Deep-link /?criar abre direto a criação de conta.' },
      { kind: 'tweak', area: 'Acesso', text: 'Fundadores numerados por ORDEM DE PAGAMENTO (#001 = primeiro do Stripe).' },
      { kind: 'fix', area: 'UI', text: 'Ícone de arma virando bloco branco no killfeed.' },
    ],
  },
];

// Versão atual (a que vai ser exibida e marcada como "visto" quando o user fecha).
export const CURRENT_PATCH_ID = PATCHES[0]?.id ?? '';

// Chave do localStorage que marca quais patches o user já viu.
// Salvamos como array JSON pra suportar histórico (caso queiramos botar badge
// "novidade" em patch antigo no futuro). Hoje só verificamos o CURRENT.
export const PATCH_SEEN_KEY = 'rtm-patch-seen-v1';

export function getSeenPatchIds(): string[] {
  try {
    const raw = localStorage.getItem(PATCH_SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]).filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function markPatchSeen(id: string): void {
  try {
    const seen = new Set(getSeenPatchIds());
    seen.add(id);
    localStorage.setItem(PATCH_SEEN_KEY, JSON.stringify(Array.from(seen)));
  } catch {
    /* sem storage */
  }
}

// True se o user ainda não viu o patch atual — usado pra abrir o modal
// automaticamente e pra mostrar um pontinho de "novidade" no botão flutuante.
export function hasUnseenPatch(): boolean {
  if (!CURRENT_PATCH_ID) return false;
  return !getSeenPatchIds().includes(CURRENT_PATCH_ID);
}
