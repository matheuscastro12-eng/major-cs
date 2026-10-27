# Arte das cartas do Ultimate: CS Manager

## O que entrou
- `public/cards/csm/frames/`: 7 molduras (bronze, prata, ouro, diamante, versus1, versus2, tactical).
- `public/cards/csm/players/`: fotos de jogador, só as que casaram com o nosso catálogo.
- `public/cards/csm/teams/`: logos de time, só dos times que casaram com os nossos.
- `src/data/csm-art.json`: jogador nosso (`playerId`) → foto; time nosso (`teamId`) → logo.
  Gerado por `scripts/gen-csm-art.mts` (`npx tsx scripts/gen-csm-art.mts --src <CSManagerSite>`).
- Tabela raridade → moldura em `src/data/csmArt.ts` (`CSM_FRAME_BY_RARITY`).

Crédito na tela: "Arte das cartas: CS Manager (cedida ao projeto)", no fim de toda tela do Ultimate
(`src/components/ultimate/CardArtCredit.tsx`).

## O que se sabe da origem
- O autor do CS Manager cedeu código e arte à empresa e afirma que as imagens são de licença livre.
- O repositório deles não tem arquivo LICENSE nem registro de fonte por imagem.
- `scripts/prepare-card-assets.py` deles só converte para WebP a arte de um bot de Discord anterior
  (`--bot-root ..`). A fonte original das fotos não aparece no código.
- `docs/card-art-generation.md` deles diz que os fundos de evento foram gerados por IA a partir da
  arte do bot, removendo logos de evento.

## O que ficou de fora de propósito
- Molduras com marca de terceiro impressa: `blastr26` (BLAST), `esl23`, `esl23ch`, `esl23s2`,
  `eslmvp1` (ESL).
- `s12025-bg`: tem o logo do CS Manager e rótulos de atributos impressos no fundo.
- As cenas de evento (`cards/events/`) e os PNG de demonstração da raiz do repositório deles.
- Fotos de edição (`<evento>/<nick>`): usamos só a foto base de cada jogador.

## O que falta registrar
- [ ] Termo escrito da cessão (quem cedeu, data, escopo: uso comercial, modificação, sublicença).
- [ ] Fonte de cada foto de jogador (site, fotógrafo, licença). Hoje não há nenhuma.
- [ ] Fonte e licença das molduras (feitas pelo autor? banco de imagem? IA?).
- [ ] Logos de time: são marcas das organizações. "Licença livre" do autor não cobre marca de
      terceiro; confirmar se o uso é aceitável ou trocar pelo logo que já usamos.
- [ ] Direito de imagem dos jogadores (uso de rosto em produto pago, como packs do Ultimate).
- [ ] Decidir se o crédito precisa de link (como o da bo3.gg, PR #124) depois de saber a fonte.

Contexto do repositório: o PR #121 tirou as fotos da Liquipedia por falta de licença, e o #124 pôs
o crédito das fotos da bo3.gg. A arte do CS Manager segue a mesma regra: só fica enquanto houver
base para o uso, e o crédito fica visível.
