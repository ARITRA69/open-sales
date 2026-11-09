/** @type {import('prettier').Config} */
const config = {
  semi: false,
  tabWidth: 2,
  singleQuote: true,
  endOfLine: 'auto',
  trailingComma: 'none',
  arrowParens: 'always',
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './src/renderer/src/styles/globals.css',
  tailwindAttributes: ['/.*ClassName$/'],
  tailwindFunctions: ['clsx', 'cn', 'cva'],
  overrides: [
    {
      files: '*.{js,mjs,jsx,ts,tsx}',
      options: {
        plugins: [
          '@ianvs/prettier-plugin-sort-imports',
          'prettier-plugin-tailwindcss'
        ],
        importOrder: [
          '<BUILTIN_MODULES>',
          '^react$',
          '',
          '<THIRD_PARTY_MODULES>',
          '',
          '^@/(.*)$',
          '',
          '^../(.*)$',
          '^./(.*)$'
        ]
      }
    }
  ]
}

export default config
