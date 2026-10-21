# Escenario B: Azure PaaS

> Paso a paso completo, desde la instalacion hasta el corte: [DESPLIEGUE.md](DESPLIEGUE.md).

Codigo para ejecutar la guia de aprovisionamiento del 21/10/2026, adaptado al
monorepo `Cosmos-Marcacion/cosmos`. Todo se instala con un solo script.

## Instalacion

En Azure Cloud Shell (Bash):

```bash
gh auth login                          # el repo es privado; tambien configura GitHub solo
gh repo clone Cosmos-Marcacion/cosmos && cd cosmos
tmux new -s cosmos                     # Cloud Shell corta sesiones inactivas
export CF_API_TOKEN=<token>            # opcional: crea los DNS en Cloudflare
SUB=<id-suscripcion> SOPORTE_EMAIL=<correo> ./infra/azure/instalar.sh ~/prod.env ~/qa.env
```

`prod.env` y `qa.env` son las variables del backend exportadas de Coolify,
subidas a Cloud Shell (fuera del repositorio). Si solo se pasa uno, sirve para
los dos. No hace falta editarlos: `MONGO_URI`, `JWT_SECRET`, `PORT`,
`WEBAUTHN_*` y `CORS_EXTRA_ORIGINS` los fija el instalador por ambiente.

Tarda de 40 a 60 minutos. Si algo falla, dice en que paso y por que; se
corrige y se relanza el mismo comando: lo creado se respeta.

### Que hace, en orden

1. Comprueba herramientas, sesion, region y que los nombres globales (ACR,
   Key Vault, Storage) esten libres. Si algo falla aqui, no se ha creado nada.
2. Registra los proveedores y espera a que terminen.
3. Grupos, Log Analytics, ACR y un Key Vault por ambiente.
4. DocumentDB de QA (Free) y prod (M10). Genera las contrasenas, arma las
   `MONGO_URI` y un `JWT_SECRET` nuevo, todo en Key Vault.
5. Construye `cosmos-api:inicial` y `mongo-backup:1` en ACR.
6. Identidades administradas con permisos sobre ACR y su Key Vault, y espera a
   que se propaguen.
7. Static Web Apps (prod Standard, QA Free) y entornos de Container Apps.
8. Container App por ambiente desde una especificacion completa: identidad,
   secretos de Key Vault, variables, sondas y escala. Comprueba
   `/health/ready` y solo entonces le pasa el trafico.
9. Almacenamiento de respaldos (borrado a 90 dias), job semanal de respaldo y
   ping semanal al cluster de QA.
10. Alertas, identidad OIDC de GitHub, environments de GitHub (con `gh`), DNS
    (con `CF_API_TOKEN`) y dominios de QA si el DNS ya resuelve.

Los pasos del punto 10 no detienen la instalacion: si fallan quedan en la
lista de pendientes del final.

### Otros comandos

```bash
./infra/azure/instalar.sh promover <prod|qa>          # trafico a la ultima revision sana
./infra/azure/instalar.sh ip <prod|qa> <abrir|cerrar> [ip]   # firewall temporal de la base
./infra/azure/instalar.sh dominios <prod|qa>          # enlazar dominios cuyo DNS ya apunta
./infra/azure/instalar.sh corte                       # paso 21: produccion a Azure
```

## Ficheros

| Fichero | Para que |
|---|---|
| `instalar.sh` | Instalador y comandos de operacion |
| `vars.sh` | Nombres, dominios, tiers y recursos |
| `documentdb.bicep` | Cluster DocumentDB |
| `deploy-revision.sh` | Despliegue con revision a 0 %, prueba y promocion; lo usa `deploy.yml` |
| `mongo-backup/` | Imagen del respaldo semanal y del ping de QA |
| `conteos.js` | Validacion de datos origen contra destino (paso 20.4) |
| `../../.github/workflows/deploy.yml` | CI/CD: gates de `qa.yml`, despues backend y panel |

## Diferencias con la guia, y por que

1. **El panel llama a la API por su dominio tambien en produccion**, no por el
   proxy `/api` de SWA:
   - la conversion a PDF admite 120 s (`PDF_TIMEOUT_MS`) y el proxy corta a 45 s;
   - las imagenes de los formatos estan en `/static`, fuera de `/api`;
   - los APK instalados llaman a `apicheckin.cosmos.com.pe`, que debe seguir vivo.
2. **Dominios de produccion sin cambio** (`checkin.` y `apicheckin.`): las
   llaves WebAuthn estan ligadas al dominio del panel. QA: `qa.` y `api-qa.`.
3. **Salud en `/health` y `/health/ready`** (prefijo `api/v1`), no `/api/health`.
4. **Dockerfile en Debian**, no Alpine: canvas, TensorFlow y LibreOffice.
5. **1 CPU / 2 GiB** por replica en vez de 0.5 / 1 GiB. Medir en QA.
6. **CORS en la API**, no en el ingress: dos capas de CORS se pisan.
7. **Identidades asignadas por el usuario** en vez de la de sistema: se crean y
   autorizan antes que la app, asi la primera revision ya arranca con permisos.
8. **Un Key Vault por ambiente**: QA no puede leer secretos de produccion.
9. **Respaldo sin azcopy**, por la API REST de Blob con el token de la identidad.
10. **Un solo workflow** para los dos ambientes, detras de los gates.

## Antes de lanzarlo

- [x] Repo `Cosmos-Marcacion/cosmos` (privado) con estos cambios en `main`.
- [ ] Version del Mongo de Coolify (`docker exec <mongo> mongod --version`); si
  no es 7, exportar `MONGO_VERSION=<x.0>`.
- [ ] Si vuelve a desplegarse en Coolify antes del corte, anadir alli
  `JWT_SECRET`: el secreto ya no esta en el codigo y en produccion la API no
  arranca sin el.

## Lo que queda a mano

- Revisores requeridos en el environment `produccion` de GitHub.
- Presupuesto mensual y alerta de CPU/almacenamiento de los clusters.
- Datos: copia en QA para probar compatibilidad (con `ip qa abrir`) y, en el
  corte, migracion de prod (paso 20, validada con `conteos.js`).
- Primer respaldo de prueba, una vez haya datos.

## Fuera de esta guia (decidir con el cliente)

- **El panel de hoy esta en Netlify** (`checkincosmos.netlify.app`), no en
  Coolify. Se da de baja tras el periodo de vuelta atras.
- **El DNS lo administra otra area**: `instalar.sh dns` genera la solicitud
  con los valores exactos (`~/solicitud-dns-cosmos.md`).

- **Los archivos subidos siguen en S3** (`AWS_*`): la guia no migra el
  almacenamiento.
- **Repositorios**: los remotos de trabajo estan en Bitbucket; `deploy.yml`
  necesita que el monorepo de GitHub reciba los push de `main` y `develop`.
- **cosmos-app** tiene Dockerfile web. Si se publica en Coolify, necesita su
  propia Static Web App; como APK no cambia.
- **Certificado de `apicheckin`**: se emite al apuntar el CNAME y tarda unos
  minutos, durante los que los APK no conectan. Va dentro de la ventana de corte.
