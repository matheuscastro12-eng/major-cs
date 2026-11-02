// Botão de som reutilizável: liga/desliga o SFX global (persistido). As telas
// só colocam <SoundToggle /> onde quiserem; o estado é um só para o app todo.
// Ao LIGAR, toca um click de confirmação (o próprio clique já é o gesto que
// destrava o AudioContext).

import { Volume2, VolumeX } from 'lucide-react';
import { playSfx } from './sfx';
import { toggleMuted } from './prefs';
import { useJuicePrefs } from './useJuicePrefs';
import './juice.css';

export interface SoundToggleProps {
  /** Mostra o texto "Som"/"Mudo" ao lado do ícone. */
  showLabel?: boolean;
  /** Sem borda nem fundo (para barras de topo e placares). */
  compact?: boolean;
  className?: string;
}

export function SoundToggle({ showLabel = false, compact = false, className }: SoundToggleProps) {
  const { soundOff } = useJuicePrefs();
  const label = soundOff ? 'Ativar som' : 'Desativar som';
  const cls = ['juice-sound-toggle', compact && 'juice-sound-toggle--compact', className].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={cls}
      aria-pressed={!soundOff}
      aria-label={label}
      title={label}
      onClick={() => {
        const nowMuted = toggleMuted();
        if (!nowMuted) playSfx('click');
      }}
    >
      {soundOff ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
      {showLabel && <span className="juice-sound-toggle__label">{soundOff ? 'Mudo' : 'Som'}</span>}
    </button>
  );
}

export default SoundToggle;
