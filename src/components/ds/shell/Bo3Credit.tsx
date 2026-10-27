// Crédito das fotos do bo3.gg. Os termos do bo3.gg (bo3.gg/wiki/use-of-services) pedem
// link ativo pro site em toda tela que mostra as fotos. O GameShell renderiza isso no fim
// do conteúdo de TODA tela do jogo (as fotos entram via PlayerAvatar, que está em dezenas
// de telas). Cards compartilháveis em imagem não usam fotos de jogador no master; se
// passarem a usar, escrever "Fotos: bo3.gg · bo3.gg" como texto no card.
export const BO3_PHOTO_CREDIT = 'Fotos: bo3.gg';
export const BO3_PHOTO_CREDIT_URL = 'https://bo3.gg';

export function Bo3Credit() {
  return (
    <p className="gs-credit">
      <a href={BO3_PHOTO_CREDIT_URL} target="_blank" rel="noopener">{BO3_PHOTO_CREDIT}</a>
    </p>
  );
}
