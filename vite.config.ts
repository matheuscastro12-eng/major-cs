import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// SEO: no fim de TODO `vite build` (Vercel, CI e local) roda scripts/prerender.mts,
// que grava o HTML pré-renderizado das páginas públicas, o app.html (casca do SPA
// das rotas do jogo) e o sitemap.xml em dist/. Se ele falhar, o build falha: os
// rewrites do vercel.json apontam pra esses arquivos. Fica fora do dev server.
function seoPrerender(): Plugin {
  let root = ''
  let outDir = ''
  return {
    name: 'rtm-seo-prerender',
    apply: 'build',
    configResolved(c) {
      root = c.root
      outDir = resolve(c.root, c.build.outDir)
    },
    async closeBundle() {
      const { tsImport } = await import('tsx/esm/api')
      const mod = (await tsImport(pathToFileURL(resolve(root, 'scripts/prerender.mts')).href, import.meta.url)) as {
        prerender: (o: { root: string; outDir: string }) => string
      }
      this.info(mod.prerender({ root, outDir }))
    },
  }
}

// Divisão do bundle inicial. Sem isto, o Rolldown decide sozinho quais módulos
// compartilhados viram chunk à parte; quando o shell passou a importar
// estaticamente DailyScreen/RtP/Ultimate, ele fundiu ui, bo3, ds, i18n, match,
// ratings e os ícones no `index` (1.019 kB → 1.442 kB). Os grupos abaixo
// restauram essa divisão. `tags: ['$initial']` limita cada grupo aos módulos que
// já fazem parte da carga inicial: nada que hoje só vive num chunk lazy
// (CareerScreen, RoadToPro, Ultimate…) é puxado para a primeira carga.
// `codeSplitting.groups` é o sucessor de `manualChunks` no Vite 8/Rolldown
// (`manualChunks` está deprecado e é convertido para isto internamente).
const sep = '[\\\\/]'
const src = (p: string) => new RegExp(`${sep}src${sep}${p}$`)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), seoPrerender()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Folhas primeiro (prioridade maior): cada grupo puxa as dependências
            // junto, então quem é dependência dos outros precisa ser capturado antes,
            // senão o React ou os tipos acabam dentro de `icons`/`ratings`.
            { name: 'react', test: new RegExp(`${sep}node_modules${sep}(react|react-dom|scheduler)${sep}`), tags: ['$initial'], priority: 100 },
            { name: 'career-i18n', test: src('state[\\\\/]career-(strings|i18n)\\.ts'), tags: ['$initial'], priority: 90 },
            { name: 'hash', test: src('state[\\\\/]hash\\.ts'), tags: ['$initial'], priority: 90 },
            { name: 'types', test: src('(types\\.ts|data[\\\\/](media\\.ts|team-logos\\.json|bo3-photos\\.json))'), tags: ['$initial'], priority: 90 },
            { name: 'icons', test: new RegExp(`${sep}node_modules${sep}lucide-react${sep}`), tags: ['$initial'], priority: 60 },
            { name: 'i18n', test: src('state[\\\\/]i18n\\.tsx'), tags: ['$initial'], priority: 50 },
            { name: 'bo3', test: src('data[\\\\/]bo3(\\.ts|-2026\\.json)'), tags: ['$initial'], priority: 50 },
            { name: 'ratings', test: src('(engine[\\\\/]ratings\\.ts|data[\\\\/]bo3-earnings\\.json)'), tags: ['$initial'], priority: 40 },
            { name: 'match', test: src('engine[\\\\/](match|rng|career[\\\\/]teamIdentity)\\.ts'), tags: ['$initial'], priority: 40 },
            { name: 'ui', test: src('(components[\\\\/]ui\\.tsx|state[\\\\/]crm\\.ts|data[\\\\/]teams\\.(ts|json))'), tags: ['$initial'], priority: 30 },
            { name: 'ds', test: new RegExp(`${sep}src${sep}components${sep}ds${sep}`), tags: ['$initial'], priority: 20 },
          ],
        },
      },
    },
  },
})
