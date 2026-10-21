<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Integración con el servicio externo Cosmos

Las nombradas y el padrón de personal vienen de un servicio de terceros
(`ListarNombradas` / `ListarUsuarios`). Para no depender de él en cada petición,
la integración resuelve las nombradas en tres niveles:

1. **Caché en memoria** del proceso, por rango de fechas y con agrupación de
   peticiones concurrentes.
2. **Copia local en MongoDB** (colecciones `nameds` y `named_sync_days`), que
   sólo se usa cuando cubre por completo el rango pedido y está vigente.
3. **Servicio externo**, cuya respuesta se guarda para las siguientes veces.

Ante cualquier duda (rango sin cobertura, fecha ilegible, error de base de
datos) se recurre al servicio externo: la copia local nunca puede producir una
respuesta incompleta, en el peor caso no ahorra la llamada.

Un job en segundo plano refresca la ventana de días que todavía pueden cambiar.

### Variables de entorno

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `COSMOS_HTTP_TIMEOUT_MS` | `20000` | Timeout de las llamadas al servicio externo. |
| `COSMOS_TOKEN_TTL_MS` | `1200000` | Vida del token cuando no se puede leer el `exp` del JWT. |
| `NAMEDS_CACHE_TTL_MS` | `60000` | Vida de la caché en memoria de nombradas por rango. |
| `NAMED_STORE_ENABLED` | `true` | `false` desactiva la copia local y vuelve al comportamiento anterior. |
| `NAMED_STORE_VOLATILE_DAYS` | `2` | Días recientes que se consideran mutables. |
| `NAMED_STORE_VOLATILE_TTL_MS` | `300000` | Vigencia de la copia para esos días recientes. |
| `NAMED_STORE_PAST_TTL_MS` | `0` | Vigencia de los días ya cerrados. `0` = no caducan. |
| `NAMED_STORE_MAX_RANGE_DAYS` | `800` | Rangos mayores se delegan siempre al servicio externo. |
| `NAMED_SYNC_ENABLED` | `true` | `false` apaga el refresco periódico. |
| `NAMED_SYNC_INTERVAL_MS` | `600000` | Cada cuánto se refresca la ventana. |
| `NAMED_SYNC_BACK_DAYS` | `2` | Días hacia atrás que refresca el job. |
| `NAMED_SYNC_FORWARD_DAYS` | `1` | Días hacia delante que refresca el job. |
| `DASHBOARD_FILTERS_CACHE_TTL_MS` | `600000` | Vida de la caché de los catálogos del dashboard. |
| `DASHBOARD_FILTERS_WINDOW_DAYS` | `400` | Ventana que se pide al servicio externo para los catálogos, sólo mientras la copia local esté vacía. |

El job no arranca si `URL_COSMOS` no está definida.

## Formatos: los dos motores

Hay dos maneras de emitir el formato de una nombrada, y conviven:

- **`legacy`**, que es lo que hay en producción: se rellena la plantilla `.xlsx`
  oficial del cliente. La maquetación es la suya, byte a byte.
- **`v2`**, en construcción: se genera el documento desde un modelo propio, con
  las tres salidas (Excel, PDF e impresión del navegador) saliendo de una sola
  definición.

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `FORMAT_ENGINE` | `legacy` | Qué motor emite los formatos. `legacy` o `v2`. |
| `FORMAT_ENGINE_ALLOW_OVERRIDE` | `false` | `true` permite forzar el motor por petición con `?engine=v2`. Solo para pruebas. |
| `SOFFICE_BIN` | `soffice` | Binario de LibreOffice que convierte a PDF. |
| `PDF_MAX_CONCURRENCY` | `2` | Conversiones a PDF simultáneas. Cada una ronda los 200 MB. |
| `PDF_TIMEOUT_MS` | `120000` | A partir de aquí se da la conversión por colgada. |

Un valor desconocido en `FORMAT_ENGINE` no impide arrancar: se avisa en el
registro y se sigue con `legacy`.

`GET /format/engine` responde con el motor activo, que es la forma rápida de
comprobar qué está emitiendo un despliegue sin descargar un formato entero. La
descarga además devuelve la cabecera `X-Format-Engine`.

### Vuelta atrás

`FORMAT_ENGINE=legacy` deja los formatos exactamente como estaban, sin desplegar
código. `src/modules/format/format.regression.spec.ts` firma el contenido del
libro emitido por las tres plantillas para que eso sea comprobable y no una
declaración de intenciones.

### Vuelta atrás

`NAMED_STORE_ENABLED=false`, `NAMED_SYNC_ENABLED=false` y
`NAMEDS_CACHE_TTL_MS=0` dejan la integración leyendo siempre del servicio
externo, como antes, sin necesidad de desplegar código.

## Maestro de personal (VISMA TuRecibo)

De aquí salen todas las personas que la plataforma asigna a una nombrada y que
después firman los formatos (jefe de cubierta, supervisores, entrenador,
responsable del registro y aprobadores de la VSI), y también el buscador del
registro de empleados de la app, fusionado con el maestro de Cosmos.

La API es TuRecibo, no People & Payroll Latam. Dos límites suyos mandan sobre el
diseño: no hay endpoint de listado, y `users/search` exige `filter` con al menos
tres caracteres. El buscador sólo devuelve id, nombre completo, documento y
correo; el legajo, el cargo y el estado viven en la ficha, que cuesta una
llamada por persona y sólo se pide al seleccionar a alguien.

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `VISMA_URL` | *(vacío)* | Base de la API. Sin ella se sirve un maestro simulado con datos de prueba. |
| `VISMA_USERNAME` | — | Usuario del login. |
| `VISMA_PASSWORD` | — | Clave del login. **Entre comillas dobles** (ver abajo). |
| `VISMA_TOKEN` | *(vacío)* | JWT fijo. Si se define no se hace login; sólo para pruebas de integración. |
| `VISMA_LOGIN_PATH` | `v2/auth-mod/login` | Ruta del login. |
| `VISMA_SEARCH_PATH` | `v2/admin-mod/users/search` | Ruta del buscador. |
| `VISMA_USERS_PATH` | `v2/admin-mod/users` | Ruta de la ficha. |
| `VISMA_CACHE_TTL_MS` | `900000` | Vida de la caché de búsquedas y fichas. |
| `VISMA_HTTP_TIMEOUT_MS` | `15000` | Timeout de las llamadas. |

Entornos: pruebas en `https://api.stage.turecibo.com` con el usuario
`demo_api_turecibo_pe`; producción en `https://app.turecibo.com` con las
credenciales del cliente.

### La clave hay que entrecomillarla

`dotenv` corta el valor en el primer `#`, así que `VISMA_PASSWORD=algo#` llega a
la aplicación como `algo` y el login devuelve 401 sin más pista. La clave de
producción termina en `#`, de modo que en el `.env` va **siempre** entre
comillas dobles:

```
VISMA_PASSWORD="...#"
```

Vale para cualquier variable cuyo valor contenga `#`. Para comprobar qué está
leyendo de verdad un entorno, sin exponer el valor:

```bash
node -e "require('dotenv').config({path:'.env'});console.log(process.env.VISMA_PASSWORD.length)"
```

### Vuelta atrás

Quitar `VISMA_URL` devuelve el maestro simulado sin desplegar código: el resto
del sistema no cambia porque siempre consume `search()`.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
