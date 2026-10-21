// @ts-check
import eslint from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    /**
     * El lint solo mira el codigo del servicio.
     *
     * Sin esta lista, `eslint .` entra en `dist`, en el SDK generado, en las
     * herramientas sueltas y en los assets, y con las reglas que necesitan tipos
     * (`recommendedTypeChecked`) una pasada completa tardaba mas de diez
     * minutos. Un gate que nadie espera a que termine no es un gate.
     */
    ignores: [
      'eslint.config.mjs',
      'jest.config.ts',
      'dist/**',
      'coverage/**',
      'coverage-integration/**',
      'public/**',
      'templates/**',
      'fonts/**',
      'sdk/**',
      'tools/**',
      '**/*.js',
      '**/*.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 5,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // 'off' no es un valor valido de `endOfLine` y hacia que ESLint abortara
      // con "Invalid endOfLine value" en vez de analizar: el lint llevaba tiempo
      // sin ejecutarse. 'auto' es lo que se buscaba —respetar el final de linea
      // del fichero— y ademas evita el ruido de CRLF en Windows.
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  }
)
