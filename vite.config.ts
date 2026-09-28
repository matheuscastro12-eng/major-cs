import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react()],
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
            { name: 'types', test: src('(types\\.ts|data[\\\\/](media\\.ts|team-logos\\.json|player-photos\\.json|bo3-photos\\.json))'), tags: ['$initial'], priority: 90 },
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
