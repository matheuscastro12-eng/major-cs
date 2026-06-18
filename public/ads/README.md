# Banners de patrocínio (rodapé sempre visível)

Patrocinador atual: **G4 Skins** — código `RTMBRASIL`.
Link de destino (constante `DEST` em `src/components/AdBanner.tsx`): https://g4skins.com/ref/RTMBRASIL

Arquivos usados pelo componente (caminhos referenciados em `AdBanner.tsx`):

| Arquivo | Tamanho | Uso |
|---|---|---|
| `970x90.jpg` | 970×90 | desktop (obrigatório) |
| `1940x180.jpg` | 1940×180 | desktop retina (2x) |
| `728x90.jpg` | 728×90 | tablet / largura intermediária (≤820px) |
| `320x50.jpg` | 320×50 | mobile (obrigatório) |
| `650x100.jpg` | 650×100 | mobile retina (2x) |

- Mantenha cada arquivo abaixo de ~150KB (o `1940x180.jpg` está em ~270KB; ok, mas dá pra otimizar).
- Se um arquivo referenciado faltar, o banner **se esconde sozinho** (nada quebra).
- Para trocar de patrocinador: substitua as imagens e a constante `DEST` em `AdBanner.tsx`.
