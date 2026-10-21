// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

/**
 * Lint de la aplicacion movil.
 *
 * El proyecto no tenia ninguno: se genero con `ng new` sin schematics de lint y
 * nunca se anadio. Las reglas de `angular-eslint` no son estilo, son las que
 * detectan lo que rompe una aplicacion Angular en produccion —una suscripcion
 * que nadie cierra, un `@Input` con nombre que choca con un atributo nativo, un
 * componente declarado dos veces—.
 *
 * El gate es un trinquete (`npm run lint:ci`, ver tools/lint-ratchet.mjs): la
 * deuda que ya existe no bloquea, pero no puede crecer.
 */
export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'karma.conf.js',
      'postcss.config.js',
      'tailwind.config.js',
      'dist/**',
      'coverage/**',
      '.angular/**',
      'android/**',
      'fingercosmos-plugin/**',
      '**/*.js',
      '**/*.mjs',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      // El proyecto usa `any` a conciencia en los limites con la API; marcarlo
      // como error aqui solo produciria ruido que nadie leeria.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      // Accesibilidad en las plantillas: es la mitad que axe no puede ver desde
      // fuera, porque axe solo mira lo que se llego a renderizar.
    },
  }
);
