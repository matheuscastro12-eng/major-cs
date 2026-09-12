import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.claude/**', '.agents/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Parâmetros/variáveis com prefixo `_` são intencionalmente não usados
      // (assinaturas preparadas pra evolução, ex.: buildTalkOptions(_topic)).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_',
      }],
      // Regras do React Compiler (eslint-plugin-react-hooks v6). O build Vite
      // NÃO usa o React Compiler (sem babel-plugin-react-compiler), então esses
      // padrões não quebram nada em runtime — só impediriam a otimização
      // automática caso o compilador fosse ligado no futuro. Mantemos apenas
      // `rules-of-hooks` e `exhaustive-deps`, que apontam bugs reais.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      // Só afeta HMR (Fast Refresh) em dev: arquivos que exportam componente +
      // helpers recarregam a página inteira em vez de trocar só o componente.
      // Não afeta build nem runtime.
      'react-refresh/only-export-components': 'off',
    },
  },
])
