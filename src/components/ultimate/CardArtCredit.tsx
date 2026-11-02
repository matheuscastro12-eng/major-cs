// Crédito da arte das cartas do Ultimate (molduras, fotos e logos vindos do
// CS Manager, cedidos ao projeto pelo autor). Origem e pendências de licença em
// docs/csmanager/arte-licenca.md. Vai no fim de toda tela do Ultimate.
export const CSM_ART_CREDIT = 'Arte das cartas: CS Manager (cedida ao projeto)';

export function CardArtCredit() {
  return <p className="ut-art-credit">{CSM_ART_CREDIT}</p>;
}
