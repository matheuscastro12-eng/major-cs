# Banners de patrocínio (rodapé sempre visível)

Patrocinador atual: **COPA ACE** — campeonato de CS2 (R$1.500 de premiação,
inscrição R$150, 16 times, formato suíço na FACEIT, início **20.08**).

Componente: `src/components/AdBanner.tsx`. Constantes que você edita lá:

| Constante | O que faz |
|---|---|
| `DEST` | link de destino. **Vazio = o banner não aparece** (banner sem link é poluição, e link errado manda o jogador pro lugar errado) |
| `RETIRE_AFTER` | data ISO em que o banner se aposenta sozinho. `null` desliga |
| `SPONSOR` | rótulo usado na telemetria (`ad_click`) |

## Arquivos

Ficam em `ads/<patrocinador>/`. Os do patrocinador atual:

| Arquivo | Tamanho | Uso |
|---|---|---|
| `ace10/970x90.jpg` | 970×90 | desktop (obrigatório) |
| `ace10/1940x180.jpg` | 1940×180 | desktop retina (2x) |
| `ace10/728x90.jpg` | 728×90 | tablet / largura intermediária (≤820px) |
| `ace10/320x50.jpg` | 320×50 | mobile (obrigatório) |
| `ace10/640x100.jpg` | 640×100 | mobile retina (2x exato de 320×50) |

Todos abaixo de 55KB — bem folgado no limite de ~150KB.

## Convenções aprendidas

- **O 2x tem que ser 2x exato.** O set antigo da G4 usava `650x100` como retina
  de `320×50`, o que não fecha; o da Copa ACE usa `640x100`, que fecha.
- **Se um arquivo referenciado faltar, o banner se esconde sozinho** (`onError`).
  Nada quebra.
- **Aviso etário é por patrocinador, não fixo.** O banner da G4 (site de caixas)
  carregava "18+ · caixas com itens aleatórios · não destinado a menores". A Copa
  ACE é campeonato, então esse aviso saiu. Se voltar um patrocinador de aposta ou
  caixa, o aviso volta com ele.
- O rótulo **"publicidade"** fica sempre, em qualquer patrocinador.
- `body.has-ad-footer` reserva o `padding-bottom` (112px). Os seletores da
  carreira em `career-dashboard.css` dependem dessa classe e ficam inertes
  quando não há banner no ar.

## Arquivos legados

`320x50.jpg`, `650x100.jpg`, `728x90.jpg`, `970x90.jpg` e `1940x180.jpg` na raiz
são criativos da **G4 Skins** (patrocínio encerrado, componente removido em
`70ac50d`). Não são referenciados por nada — dá pra apagar quando quiser.
