# Banners de patrocínio (rodapé sempre visível)

Patrocinador atual: **G4 Skins** — código `RTMBRASIL`.
Link de destino (já embutido em `src/components/AdBanner.tsx`): https://g4skins.com/ref/RTMBRASIL

Solte os criativos aqui com **exatamente estes nomes** (o componente aponta pra eles):

| Arquivo | Tamanho | Uso |
|---|---|---|
| `g4skins-970x90.png` | 970×90 | desktop (obrigatório) |
| `g4skins-1940x180.png` | 1940×180 | desktop retina (2x) |
| `g4skins-320x50.png` | 320×50 | mobile (obrigatório) |
| `g4skins-640x100.png` | 640×100 | mobile retina (2x) |

- Formato: PNG, JPG ou GIF leve. Mantenha cada arquivo **abaixo de ~150KB** pra carregar rápido.
- Pode usar `.jpg` em vez de `.png`: nesse caso, troque a extensão nos caminhos dentro de `AdBanner.tsx`.
- Enquanto os arquivos não estiverem aqui, o banner **não aparece** (o componente se esconde sozinho), então nada quebra no site.
- Para trocar de patrocinador no futuro: troque as imagens e a constante `DEST` em `AdBanner.tsx`.
