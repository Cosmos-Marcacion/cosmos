# Cosmos Check-In en Azure: despliegue paso a paso

Desde el estado actual (codigo en `github.com/Cosmos-Marcacion/cosmos`) hasta
produccion funcionando en Azure y Coolify apagado.

| Fase | Que se hace | Tiempo | Afecta a usuarios |
|---|---|---|---|
| 1. Preparacion | Reunir accesos y exportar variables de Coolify | 30 min | No |
| 2. Instalacion | Un comando crea toda la infraestructura | 40-60 min | No |
| 3. DNS de QA | Enviar la solicitud 1 al area de DNS | Lo que tarde esa area | No |
| 4. GitHub | Environments, revisores y rama `develop` | 15 min | No |
| 5. QA | Datos de prueba y validacion funcional | 1-2 h | No |
| 6. Produccion previa | Primer despliegue a prod en Azure, sin trafico real | 30 min | No |
| 7. Corte | Datos de prod y DNS a Azure | 1 h de ventana | Si |
| 8. Cierre | Presupuesto, alertas, apagado de AWS | 30 min | No |

Las fases 1 a 6 se pueden hacer cualquier dia. Solo la 7 necesita ventana de
mantenimiento.

**El DNS de `cosmos.com.pe` lo administra otra area.** No hace falta acceso a
el: el instalador genera un documento, `solicitud-dns-cosmos.md`, con lo que
hay que pedirles y los valores exactos de Azure. Son dos solicitudes: la 1 en
la fase 3 y la 2 durante el corte.

**Situacion actual:** el panel (`checkin.cosmos.com.pe`) esta en **Netlify**
(`checkincosmos.netlify.app`) y la API (`apicheckin.cosmos.com.pe`) en el
servidor de AWS con Coolify (`98.87.37.45`).

---

## Fase 1. Preparacion

### 1.1 Accesos necesarios

- **Azure**: rol **Owner** en la suscripcion. Sin el, fallan las asignaciones de permisos.
- **GitHub**: administrador del repo `Cosmos-Marcacion/cosmos`.
- **Area de DNS**: un contacto y un canal para pedir los cambios y, el dia del
  corte, avisar en el momento.
- **Coolify**: para exportar variables y detener el backend en el corte.
- **Servidor de AWS**: acceso SSH, para sacar el volcado de Mongo.

### 1.2 Exportar las variables del backend

1. Coolify > proyecto `cosmos` > recurso del backend > **Environment Variables**.
2. Copiar todas las variables en formato `.env` (vista "Developer" o "Bulk edit").
3. Guardarlas en un archivo `prod.env` en tu equipo. **No va al repositorio.**

No hace falta editarlo. El instalador ignora `MONGO_URI`, `JWT_SECRET`, `PORT` y
`WEBAUTHN_*` del archivo y los fija el por cada ambiente.

**No hace falta un `qa.env`.** El instalador lo crea solo (`~/qa.env`) a
partir de `prod.env`, con las mismas credenciales de S3, correo y Visma, pero
aislado en lo que QA escribe:

- **Archivos:** QA los guarda en el mismo bucket, bajo la carpeta `qa/`
  (`AWS_S3_KEY_PREFIX=qa/`). No toca los de produccion.
- **Correo:** todo lo que QA envie (codigos de recuperacion de contrasena) va
  al `SOPORTE_EMAIL`, con el destinatario original en el asunto
  (`MAIL_REDIRECT_TO`). QA trabaja con una copia de los usuarios reales y asi
  no les escribe.
- **Visma:** se comparte; la API solo consulta datos, no escribe.

Si se quiere cambiar algo de QA, editar `~/qa.env` en Cloud Shell y relanzar el
instalador: lo reutiliza y no lo sobreescribe.

### 1.3 Version de Mongo

En el servidor de AWS:

```bash
docker ps --format '{{.Names}}  {{.Image}}' | grep -i mongo
docker exec <nombre-del-contenedor-mongo> mongod --version
```

Si la version mayor no es 7 (por ejemplo, 6.0.x), anotarla: en la fase 2 se
exporta `MONGO_VERSION=6.0`.

---

## Fase 2. Instalacion

### 2.1 Abrir Cloud Shell

1. Entrar a https://portal.azure.com con la cuenta Owner.
2. Pulsar el icono `>_` de la barra superior y elegir **Bash**.
3. Si pide almacenamiento la primera vez, aceptar el que propone.

### 2.2 Subir `prod.env`

Barra de Cloud Shell > **Manage files** > **Upload** > elegir el archivo. Queda
en la carpeta personal (`~/prod.env`). Comprobar:

```bash
ls -l ~/prod.env
```

### 2.3 Iniciar sesion en GitHub y clonar

El repo es privado, asi que hay que iniciar sesion antes de clonar. Esa sesion
tambien la usa el instalador para configurar GitHub solo.

```bash
gh auth login
```

Responder: `GitHub.com` > `HTTPS` > `Y` > `Login with a web browser`. Copiar el
codigo, abrir https://github.com/login/device, pegarlo y autorizar.

```bash
gh repo clone Cosmos-Marcacion/cosmos
cd cosmos
```

### 2.4 Lanzar el instalador

Cloud Shell corta la sesion tras unos 20 minutos sin actividad, y la
instalacion tarda mas. Por eso va dentro de `tmux`, que la mantiene viva:

```bash
tmux new -s cosmos
```

Ver el id de la suscripcion:

```bash
az account list --query "[].{nombre:name, id:id}" -o table
```

Lanzar (sustituir los valores entre `< >`):

```bash
export SUB=<id-de-la-suscripcion>
export SOPORTE_EMAIL=<correo-que-recibe-alertas>
# export MONGO_VERSION=6.0                    # solo si la 1.3 dio otra version

./infra/azure/instalar.sh ~/prod.env          # crea ~/qa.env solo
```

### 2.5 Que vas a ver

El script avanza por bloques (`== Comprobaciones previas`, `== DocumentDB ...`,
`== Container App ...`, etc.). Los mas lentos son los clusters de base de datos
(5 a 15 min cada uno) y la imagen de la API (10 a 20 min). Al final aparece
`== Resumen` con:

- las direcciones de Azure del panel y de la API de cada ambiente;
- la lista de **pendientes de esta ejecucion**, si los hay.

Todo queda tambien en un registro: `~/cosmos-instalacion-<fecha>.log`.

### 2.6 Si algo falla

El mensaje dice en que paso fue, la linea y que hacer. Corregir la causa y
**lanzar exactamente el mismo comando otra vez**: lo que ya se creo se respeta
y continua donde se quedo.

| Mensaje | Que hacer |
|---|---|
| `falta SUB` / `falta SOPORTE_EMAIL` | Exportar la variable y relanzar |
| `el registro 'acr...' ya existe en otra suscripcion` | Elegir otro prefijo: `export PROY=cosmosck` y relanzar desde cero |
| Error de SKU, tier o region al crear `docdb-...-qa` | La region no ofrece el tier Free: `export QA_DB_TIER=M10` (tiene coste; avisar al cliente) y relanzar |
| `TasksOperationsNotAllowed` | La suscripcion no permite construir en ACR. Ver el final de la seccion 2 |
| `La revision ... no responde tras 10 minutos` | Muestra los ultimos registros de la API. Revisar variables del `.env`, corregir y relanzar |
| Se cerro el navegador o la pestana | Abrir Cloud Shell otra vez y `tmux attach -t cosmos` |

Si aparece `TasksOperationsNotAllowed`, construir la imagen en un equipo con
Docker, desde la raiz del repo:

```bash
az login && az acr login -n acrcosmosciprod
docker build -t acrcosmosciprod.azurecr.io/cosmos-api:inicial cosmos-back
docker push acrcosmosciprod.azurecr.io/cosmos-api:inicial
```

Despues, relanzar el instalador en Cloud Shell.

---

## Fase 3. DNS de QA

### 3.1 Enviar la solicitud 1 al area de DNS

Al terminar, el instalador deja en Cloud Shell el archivo
`~/solicitud-dns-cosmos.md`. Si hiciera falta regenerarlo:

```bash
./infra/azure/instalar.sh dns
```

Descargarlo (Cloud Shell > **Manage files** > **Download** >
`solicitud-dns-cosmos.md`) y enviarlo al area de DNS. Lleva todo explicado:

- **Solicitud 1, para ya:** dos CNAME nuevos de QA (`qa`, `api-qa`), dos TXT
  de validacion (`asuid.api-qa`, `asuid.apicheckin`) y bajar a 300 s el TTL de
  `checkin` y `apicheckin` **sin cambiar su destino**. Nada de esto afecta a
  produccion.
- **Solicitud 2, para el dia del corte:** cambiar el destino de `checkin` y
  `apicheckin`. Se envia ahora para que lo tengan preparado, pero se ejecuta
  solo cuando se les avise (fase 7).
- **Vuelta atras:** los destinos que tienen hoy esos dos registros.

Puntos que conviene recalcar al enviarlo:

1. Si la zona esta en Cloudflare, los registros van en **"DNS only"** (nube
   gris). Con proxy, Azure no puede emitir los certificados.
2. El TTL de 300 s se necesita **al menos 48 h antes del corte**.
3. Acordar con ellos la fecha y hora del corte y un canal para avisar en el
   momento: durante la ventana se espera su cambio.

### 3.2 Enlazar los dominios de QA

Cuando el area de DNS confirme la solicitud 1 (suele propagar en minutos):

```bash
./infra/azure/instalar.sh dominios qa
```

Comprobar:

```bash
curl https://api-qa.cosmos.com.pe/health/ready     # {"status":"ok","db":"up"}
```

`https://qa.cosmos.com.pe` mostrara una pagina de Azure hasta el primer
despliegue del panel (fase 4).

---

## Fase 4. GitHub

### 4.1 Comprobar lo que dejo el instalador

En GitHub > repo `cosmos` > **Settings** > **Environments** deben existir
`produccion` y `qa`, cada uno con las variables `AZURE_CLIENT_ID`,
`AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `ACR_NAME`, `RG` y `APP_NAME`, y el
secret `SWA_TOKEN`. En **Settings > Secrets and variables > Actions >
Variables** debe estar `AZURE_DEPLOY_ENABLED = true`.

Si el resumen lo marco como pendiente (no habia sesion de `gh`), crearlos a mano
con los valores que imprime el resumen. Los `SWA_TOKEN` salen de:

```bash
az staticwebapp secrets list -g rg-cosmosci-prod -n swa-cosmosci-prod --query properties.apiKey -o tsv
az staticwebapp secrets list -g rg-cosmosci-qa   -n swa-cosmosci-qa   --query properties.apiKey -o tsv
```

### 4.2 Proteger produccion

Settings > Environments > **produccion**:

- **Required reviewers**: anadir a quien aprueba los pases a produccion.
- **Deployment branches**: "Selected branches" > anadir `main`.

En **qa**: Deployment branches > `develop`.

### 4.3 Crear la rama `develop` (primer despliegue de QA)

Desde cualquier clon del repo:

```bash
git checkout -b develop && git push -u origin develop
```

Eso lanza el workflow **Deploy**: primero los gates de calidad (unos 15
minutos), despues la API de QA y el panel de QA. Seguirlo en la pestana
**Actions**. Al terminar, `https://qa.cosmos.com.pe` muestra el panel.

---

## Fase 5. QA con datos de prueba

La base de QA nace vacia: sin usuarios no se puede entrar. Se carga una copia
de produccion.

### 5.1 Abrir el firewall de QA a la IP del servidor de AWS

En Cloud Shell, desde la carpeta `cosmos`:

```bash
./infra/azure/instalar.sh ip qa abrir <IP-PUBLICA-DEL-SERVIDOR-AWS>
az keyvault secret show --vault-name kv-cosmosci-qa -n mongo-uri --query value -o tsv
```

Copiar la URI que imprime (es la cadena de conexion de QA, con su contrasena).

### 5.2 Volcar y restaurar, en el servidor de AWS

```bash
docker exec <contenedor-mongo> mongodump --archive --gzip -d cosmos > cosmos.archive.gz
docker run --rm -i mongo:7 mongorestore --uri='<URI-DE-QA>' --archive --gzip --drop < cosmos.archive.gz
```

`mongo:7` es una imagen temporal con las herramientas de Mongo: no hay que
instalar nada. Usar la misma version mayor que la 1.3. `--drop` reemplaza lo
que hubiera en QA.

### 5.3 Validar conteos

Crear `conteos.js` en el servidor con el contenido de
`infra/azure/conteos.js` (son 10 lineas) y ejecutar:

```bash
docker exec -i <contenedor-mongo> mongosh cosmos --quiet < conteos.js > origen.txt
docker run --rm -i mongo:7 mongosh '<URI-DE-QA>' --quiet < conteos.js > destino.txt
diff origen.txt destino.txt && echo "Coinciden"
```

Si `diff` muestra diferencias de indices, anotarlas: son las que DocumentDB no
admite, y hay que revisarlas antes del corte (plan B de la guia).

### 5.4 Cerrar el firewall

```bash
./infra/azure/instalar.sh ip qa cerrar <IP-PUBLICA-DEL-SERVIDOR-AWS>
```

### 5.5 Pruebas funcionales en QA

En `https://qa.cosmos.com.pe`:

- [ ] Login. La primera vez todos vuelven a iniciar sesion: el secreto JWT es nuevo.
- [ ] Marcacion completa (entrada y salida) desde la app o el panel.
- [ ] Consulta de reportes.
- [ ] Generar un formato y descargarlo en PDF. Es lo mas pesado: valida memoria y LibreOffice.
- [ ] Subir un archivo: debe quedar en el bucket bajo `qa/`.
- [ ] Recuperar la contrasena de un usuario: el codigo llega al `SOPORTE_EMAIL`,
      no al usuario, con `[QA para <correo>]` en el asunto.
- [ ] Sincronizacion con Visma.

Si algo falla, los registros de la API:

```bash
az containerapp logs show -g rg-cosmosci-qa -n ca-cosmosci-api-qa --tail 100
```

### 5.6 Probar la vuelta atras automatica

Hacer un commit en `develop` que rompa el arranque (por ejemplo, un `throw` en
`main.ts`) y subirlo. El workflow debe terminar en rojo con
`... no respondio en /health/ready. El trafico sigue en ...`, y QA seguir
funcionando. Revertir el commit.

---

## Fase 6. Produccion previa (sin trafico real)

1. Crear un Pull Request de `develop` a `main` y fusionarlo.
2. El workflow **Deploy** se detiene esperando aprobacion del environment
   `produccion`. Aprobarlo en Actions > la ejecucion > **Review deployments**.
3. Queda desplegado en Azure, pero nadie lo usa todavia: los dominios siguen
   apuntando a AWS.

Comprobar la API de prod en su direccion de Azure (la del resumen de la fase 2):

```bash
curl https://<fqdn-de-ca-cosmosci-api-prod>/health/ready
```

> El panel de prod en su URL de Azure (`*.azurestaticapps.net`) llama a
> `apicheckin.cosmos.com.pe`, que hasta el corte sigue siendo **el backend de
> Coolify**. No usarlo para probar escrituras.

Los valores actuales de `checkin` y `apicheckin`, que sirven de vuelta atras,
estan en la seccion "Vuelta atras" de `solicitud-dns-cosmos.md`. Pedir al area
de DNS que los confirme contra su panel antes del corte.

---

## Fase 7. Corte (ventana de mantenimiento)

Elegir un horario de bajo uso, acordado con el area de DNS: tienen que estar
disponibles durante la ventana. Duracion tipica: 30 a 60 minutos.

Comprobar el dia anterior que el TTL de `checkin` y `apicheckin` ya es 300 s:

```bash
curl -s -H 'accept: application/dns-json' 'https://cloudflare-dns.com/dns-query?name=apicheckin.cosmos.com.pe&type=A' | jq '.Answer[].TTL'
```

Debe dar 300 o menos. Si da mas, pedirlo de nuevo y aplazar el corte.

### 7.1 Congelar Coolify

1. Avisar a los usuarios.
2. En Coolify, **detener el backend** (no borrarlo). Desde aqui nadie escribe en la base.

### 7.2 Migrar los datos

Igual que la fase 5, pero contra produccion:

```bash
# Cloud Shell
./infra/azure/instalar.sh ip prod abrir <IP-PUBLICA-DEL-SERVIDOR-AWS>
az keyvault secret show --vault-name kv-cosmosci-prod -n mongo-uri --query value -o tsv
```

```bash
# Servidor de AWS
docker exec <contenedor-mongo> mongodump --archive --gzip -d cosmos > cosmos-corte.archive.gz
docker run --rm -i mongo:7 mongorestore --uri='<URI-DE-PROD>' --archive --gzip --drop < cosmos-corte.archive.gz
docker exec -i <contenedor-mongo> mongosh cosmos --quiet < conteos.js > origen.txt
docker run --rm -i mongo:7 mongosh '<URI-DE-PROD>' --quiet < conteos.js > destino.txt
diff origen.txt destino.txt && echo "Coinciden"
```

**Si los conteos no coinciden, no seguir.** Arrancar de nuevo el backend en
Coolify y revisar.

```bash
# Cloud Shell
./infra/azure/instalar.sh ip prod cerrar <IP-PUBLICA-DEL-SERVIDOR-AWS>
```

### 7.3 Llevar el trafico a Azure

```bash
./infra/azure/instalar.sh corte
```

Pide escribir `CORTE` para confirmar y muestra los dos cambios.

1. **Avisar en ese momento al area de DNS** para que ejecute la solicitud 2.
2. El script comprueba cada minuto, hasta 60 minutos, si el DNS ya apunta a
   Azure. En cuanto lo hace, enlaza los dominios y emite los certificados.
3. Cuando el area de DNS confirme, el script sigue solo. No cerrar Cloud Shell.

Mientras se emite el certificado de `apicheckin` (unos minutos) la app movil no
conecta: es lo esperado.

Si el tiempo de espera se agota, relanzar cuando el DNS ya apunte:

```bash
./infra/azure/instalar.sh dominios prod
```

### 7.4 Pruebas de humo

```bash
curl https://apicheckin.cosmos.com.pe/health/ready
```

- [ ] `https://checkin.cosmos.com.pe` carga y permite iniciar sesion.
- [ ] Marcacion desde un equipo con la app instalada (sin reinstalarla).
- [ ] Reporte y PDF de un formato.
- [ ] Subida de un archivo.

### 7.5 Primer respaldo

```bash
az containerapp job start -g rg-cosmosci-prod -n job-respaldo-semanal
az containerapp job execution list -g rg-cosmosci-prod -n job-respaldo-semanal -o table
```

Debe terminar en `Succeeded` y dejar un archivo en la cuenta
`stcosmoscirespaldos`, contenedor `respaldos`.

### 7.6 Si hay que volver atras

Solo tiene sentido en las primeras horas: lo que se escriba en Azure despues
del corte no estara en Coolify.

1. Pedir al area de DNS que restaure los valores de la seccion "Vuelta atras"
   de `solicitud-dns-cosmos.md`.
2. Arrancar el backend en Coolify. El panel de Netlify no se toca hasta el
   cierre, asi que vuelve a servir en cuanto `checkin` apunte otra vez a el.

---

## Fase 8. Cierre

- [ ] **Presupuesto**: Portal > Cost Management > Budgets > Add. Mensual, monto
  acordado, alertas al 50, 80 y 100 % al correo de soporte.
- [ ] **Alerta de los clusters**: Portal > `docdb-cosmosci-prod` > Alerts >
  Create > metricas de CPU y de almacenamiento, umbral 80 %, grupo `ag-cosmos`.
- [ ] Ninguna regla temporal en los firewalls de la base:
  Portal > cada cluster > Networking. Solo debe quedar la de servicios de Azure.
- [ ] Mantener Coolify **detenido pero intacto** y el sitio de Netlify
  (`checkincosmos`) sin borrar, de 7 a 14 dias. Despues, dar de baja la
  instancia de AWS y el sitio de Netlify. **Ojo**: los archivos subidos siguen en S3; esa
  parte de AWS se mantiene salvo que se decida migrarla.
- [ ] Revisar los consumos de la API tras una semana real y ajustar CPU y memoria
  (`API_CPU` y `API_MEM` en `vars.sh`, despues relanzar el instalador).

---

## Operacion del dia a dia

| Quiero... | Como |
|---|---|
| Publicar en QA | Push a `develop` |
| Publicar en produccion | PR a `main`, fusionar y aprobar en Actions |
| Volver a la version anterior de la API | `az containerapp ingress traffic set -g rg-cosmosci-prod -n ca-cosmosci-api-prod --revision-weight <revision-anterior>=100` (el nombre sale en el log del despliegue) |
| Ver los registros de la API | `az containerapp logs show -g rg-cosmosci-prod -n ca-cosmosci-api-prod --tail 100` |
| Cambiar una variable normal | `az containerapp update -g <rg> -n <app> --set-env-vars CLAVE=valor` y despues `./infra/azure/instalar.sh promover <prod\|qa>` |
| Cambiar un secreto | `az keyvault secret set --vault-name kv-cosmosci-<prod\|qa> -n <nombre> --value '<valor>'` y despues `az containerapp revision restart -g <rg> -n <app> --revision <revision-activa>` |
| Restaurar un respaldo en QA | Descargarlo de `stcosmoscirespaldos/respaldos` y `mongorestore` como en la fase 5 |

**Importante sobre los cambios en caliente.** La API funciona en modo de
revisiones multiples: cualquier cambio de configuracion crea una revision nueva
**sin trafico**. Hasta ejecutar `promover`, sigue respondiendo la anterior.

## Donde trabajar a partir de ahora

El repo de GitHub `Cosmos-Marcacion/cosmos` es el que despliega. Los tres repos
de Bitbucket no estan conectados a el. Lo recomendable es pasar a trabajar
directamente sobre el de GitHub; mientras no sea asi, cada cambio hecho en
Bitbucket hay que subirlo tambien a GitHub para que llegue a Azure.
