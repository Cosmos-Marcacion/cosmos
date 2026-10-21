/**
 * Piezas comunes a la config unitaria y a la de integracion.
 *
 * La configuracion de SWC va aqui y no en un `.swcrc` a proposito: un `.swcrc`
 * en la raiz lo lee tambien el builder de Nest y cambiaria como se compila
 * produccion.
 */

export const swcTransform: [string, Record<string, unknown>] = [
  '@swc/jest',
  {
    sourceMaps: true,
    module: { type: 'commonjs' },
    jsc: {
      target: 'es2023',
      parser: { syntax: 'typescript', decorators: true, dynamicImport: true },
      // Nest resuelve la inyeccion por los metadatos que emiten los
      // decoradores; sin `decoratorMetadata` ningun `Test.createTestingModule`
      // encuentra sus providers.
      transform: { legacyDecorator: true, decoratorMetadata: true },
      keepClassNames: true,
    },
  },
];

/**
 * Codigo que no entra en la medida de cobertura porque no tiene logica que un
 * test pueda romper: modulos de Nest, esquemas, DTOs, tipos y datos generados.
 *
 * Excluirlos no es maquillaje, es lo contrario: incluirlos infla el porcentaje
 * con ficheros que se cubren solos al importarlos y esconde el codigo que si
 * importa.
 */
export const notLogic = [
  '/node_modules/',
  '/dist/',
  '\\.module\\.ts$',
  '\\.entity\\.ts$',
  '\\.schema\\.ts$',
  '\\.dto\\.ts$',
  '\\.interface\\.ts$',
  '\\.enum\\.ts$',
  '\\.d\\.ts$',
  '/main\\.ts$',
  '/src/testing/',
  '/src/modules/format/v2/definitions/generated/',
  '/src/modules/named/mocks/',
  '/src/modules/fingerprint/examples/',
];

/**
 * Los seis servicios que forman un ciclo de importacion se compilan con
 * `ts-jest` y no con SWC.
 *
 * No es una preferencia: es la unica diferencia que importa entre los dos
 * emisores. `tsc` publica cada clase con una asignacion (`exports.X = X`), asi
 * que un `require` reentrante ve `undefined` y sigue. SWC la publica con un
 * getter que devuelve la variable `let`, y leerlo mientras la clase esta en su
 * zona muerta temporal lanza "Cannot access 'X' before initialization" —incluso
 * detras del `typeof`, porque `typeof obj.prop` tambien invoca al getter—.
 *
 * En produccion no salta porque el unico punto de entrada es `main.ts` y ese
 * orden de carga resulta seguro. Cada fichero de test es un punto de entrada
 * distinto, y la mitad de ellos entra al ciclo por el lado que rompe.
 *
 * `isolatedModules` deja a ts-jest transpilando sin comprobar tipos: el chequeo
 * es un gate propio (`npm run typecheck`) y duplicarlo aqui costaba minutos.
 */
// El separador se construye a partir de una constante para no tener que contar
// barras invertidas: la cadena viaja hasta un `new RegExp`, asi que cada `\` del
// patron necesita dos aqui, y en Windows las rutas que Jest pasa al
// transformador vienen con barra invertida.
const SEP = '[\\\\/]';
export const CYCLIC_SERVICES =
  `${SEP}src${SEP}modules${SEP}(entry|named|employee|point|talk|assistant)${SEP}[^\\\\/]+\\.service\\.ts$`;

export const tsJestTransform: [string, Record<string, unknown>] = [
  'ts-jest',
  { isolatedModules: true, tsconfig: { esModuleInterop: true, experimentalDecorators: true, emitDecoratorMetadata: true } },
];
