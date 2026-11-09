import { createRequire } from 'node:module'

import js from '@eslint/js'
import { plugin as shadcn } from '@shadcn/lint'
import eslintConfigPrettier from 'eslint-config-prettier'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import pluginReact from 'eslint-plugin-react'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import pluginTailwindCss from 'eslint-plugin-tailwindcss'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// eslint-plugin-react's `version: 'detect'` calls context.getFilename(), which
// ESLint 10 removed, so read the installed React version ourselves.
const reactVersion = createRequire(import.meta.url)(
  'react/package.json'
).version

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      react: pluginReact,
      'react-hooks': pluginReactHooks,
      'jsx-a11y': jsxA11y
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser
    },
    settings: { react: { version: reactVersion } },
    rules: {
      ...pluginReact.configs.flat.recommended.rules,
      ...pluginReactHooks.configs['recommended-latest'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/no-array-index-key': 'off',
      'react/jsx-sort-props': [
        'error',
        {
          callbacksLast: true,
          shorthandFirst: true,
          ignoreCase: true,
          reservedFirst: true
        }
      ]
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { shadcn },
    // components.json supplies UI aliases and the Tailwind theme automatically.
    rules: {
      'shadcn/no-restyle': [
        'error',
        {
          allow: ['layout'],
          contracts: [
            {
              pattern: '^(Tabs|Banner|StatTile|Dialog)$',
              allow: ['layout', 'spacing']
            }
          ]
        }
      ],
      'shadcn/no-raw-colors': 'error',
      'shadcn/no-arbitrary-values': ['error', { allow: ['layout'] }],
      'shadcn/no-inline-styles': 'error',
      'shadcn/no-unknown-classes': 'error',
      'shadcn/require-static-classes': 'error'
    }
  },
  {
    files: ['src/renderer/src/components/ui/**/*.{ts,tsx}'],
    // Primitives define their appearance and resolve their own variant functions.
    rules: {
      'shadcn/no-restyle': 'off',
      'shadcn/no-arbitrary-values': 'off',
      'shadcn/require-static-classes': 'off'
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { tailwindcss: pluginTailwindCss },
    settings: {
      tailwindcss: { cssConfigPath: 'src/renderer/src/styles/globals.css' }
    },
    rules: {
      ...pluginTailwindCss.configs.recommended.rules,
      // The kit also uses named CSS classes; the plugin treats them as missing utilities.
      'tailwindcss/no-custom-classname': 'off',
      // Prettier's Tailwind plugin owns class order.
      'tailwindcss/classnames-order': 'off'
    }
  },
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'scripts/**/*.mjs',
      '*.{ts,mjs}'
    ],
    languageOptions: { globals: globals.node }
  },
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] }
]
