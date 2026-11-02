// Arte do pack na Loja: um pacote físico (papel metalizado com a cor do pack,
// serrilha em cima e embaixo, emblema e contagem de cartas). Só visual; a cor
// vem de --pack no card pai.
import type { LucideIcon } from 'lucide-react';

export function PackArt({ icon: Icon, label, cards }: { icon: LucideIcon; label: string; cards: number }) {
  return (
    <div className="ut-packart" aria-hidden="true">
      <div className="ut-packart__foil">
        <span className="ut-packart__brand">ROAD TO MAJOR</span>
        <span className="ut-packart__tear" />
        <span className="ut-packart__emblem"><Icon size={34} strokeWidth={1.6} /></span>
        <span className="ut-packart__label">{label}</span>
        <span className="ut-packart__count">{cards} cartas</span>
        <span className="ut-packart__sheen" />
      </div>
    </div>
  );
}
