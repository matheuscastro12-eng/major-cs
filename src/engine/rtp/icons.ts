// Nomes dos ícones do Road to Pro — módulo SEM React (puro), pra que metadados
// do engine (ações, eventos de vida, arquétipos) possam tipar seu `icon` como
// RtpIconName sem criar ciclo de import com a camada de componentes.
//
// A geometria (paths SVG) vive em components/rtp/RtpIcon.tsx, que importa este
// tipo. Engine só carrega o tipo (`import type`), zero runtime.

export type RtpIconName =
  | 'energy' | 'fitness' | 'morale' | 'focus' | 'fame' | 'money'
  | 'mech' | 'tactic' | 'physical' | 'demos' | 'gym' | 'rest' | 'stream' | 'social'
  | 'brain' | 'crosshair' | 'bomb' | 'skull' | 'trade' | 'spark'
  | 'injury' | 'fire' | 'snow'
  | 'career' | 'health' | 'personal' | 'media' | 'team'
  | 'mouse' | 'keyboard' | 'monitor' | 'headset' | 'chair' | 'pc' | 'wifi' | 'pad'
  | 'trophy' | 'calendar' | 'chart' | 'users' | 'shop'
  // utilitários de navegação / status (P0)
  | 'chevR' | 'chevL' | 'arrowUp' | 'arrowDown' | 'grid' | 'close' | 'check'
  | 'balance' | 'party';
