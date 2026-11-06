# Migración de Cosmos Check-In a Azure: paso a paso desde Cloud Shell

Todo se hace desde **Azure Cloud Shell (Bash)**. La infraestructura ya está
creada; aquí se mueven los datos (MongoDB Atlas), los archivos (AWS S3) y el
tráfico (DNS).

| Fase | Qué | Afecta a usuarios |
|---|---|---|
| 0 | Preparar Cloud Shell | No |
| 1 | DNS de QA (solicitud 1) | No |
| 2 | Ensayo completo en QA | No |
| 3 | Producción preparada, sin tráfico | No |
| 4 | **Corte** (ventana de mantenimiento) | **Sí, 30-60 min** |
| 5 | Cierre y apagado de lo antiguo | No |

Nada de esto modifica Atlas ni S3: siguen intactos como vuelta atrás hasta la fase 5.

---

## Antes de empezar: qué tener a mano

- Cuenta `admin.azure@cosmos.com.pe` (Owner de la suscripción Check-In).
- Acceso a **MongoDB Atlas** (cloud.mongodb.com) con permiso para editar *Network Access*.
- La **URI de Atlas**: la `MONGO_URI` del backend (`mongodb+srv://focodigitaldb:...@focodigitalmongodb.xrwsc5h.mongodb.net/...`). Está en Coolify y en `cosmos-back/.env`.
- Acceso a **Coolify** (para detener el backend en el corte).
- Contacto del **área DNS** (Optical IP) y los PDF de `infra/azure/entregables/`.
- Acceso de administrador al repo `Cosmos-Marcacion/cosmos` en GitHub.

---

## Fase 0. Preparar Cloud Shell

Se repite cada vez que se abre una sesión nueva.

1. https://portal.azure.com > icono `>_` > **Bash**.
2. Abrir una sesión que no se corte por inactividad:

```bash
tmux new -s cosmos          # si ya existe: tmux attach -t cosmos
```

3. Traer el repositorio (la primera vez) o actualizarlo:

```bash
# Primera vez (el repo es privado)
gh auth login               # GitHub.com > HTTPS > Y > Login with a web browser
gh repo clone Cosmos-Marcacion/cosmos ~/cosmos

# Siempre
cd ~/cosmos && git checkout develop && git pull
```

4. Variables de la sesión (**obligatorio en cada sesión**):

```bash
export PROY=cosmosck
export SUB=c02ac35c-2fd4-4903-ad88-27a313620306
az account set -s $SUB
```

5. Comprobar el estado general:

```bash
./infra/azure/estado.sh
```

6. Comprobar que la API de QA ya tiene la versión nueva (debe aparecer `"storage":"s3"`):

```bash
curl -s https://$(az containerapp show -g rg-cosmosck-qa -n ca-cosmosck-api-qa \
  --query properties.configuration.ingress.fqdn -o tsv)/health
```

Si no aparece `storage`, el despliegue de `develop` aún no terminó: revisar
GitHub > Actions > **Deploy** y esperar a que acabe.

**Ayuda para comprobar DNS** (se usa en varias fases; pegarla una vez por sesión):

```bash
dns() { curl -s -H 'accept: application/dns-json' "https://cloudflare-dns.com/dns-query?name=$1&type=$2" | jq -r '.Answer[]? | "\(.TTL)s  \(.data)"'; }
```

---

## Fase 1. DNS de QA (solicitud 1)

1. Enviar al área DNS el correo con `infra/azure/entregables/Solicitud-DNS-Cosmos-CheckIn-Azure.pdf`.
   Pide 4 registros nuevos (QA y validación) y bajar el TTL de `checkin` y `apicheckin` a 300 s **sin cambiar su destino**.
2. Cuando confirmen, comprobar:

```bash
dns qa.cosmos.com.pe CNAME                  # gray-tree-0eb73fe0f.1.azurestaticapps.net
dns api-qa.cosmos.com.pe CNAME              # ca-cosmosck-api-qa...azurecontainerapps.io
dns asuid.api-qa.cosmos.com.pe TXT
dns asuid.apicheckin.cosmos.com.pe TXT
dns apicheckin.cosmos.com.pe A              # debe mostrar 300s (o menos)
dns checkin.cosmos.com.pe CNAME             # debe mostrar 300s (o menos)
```

3. Enlazar los dominios de QA y emitir sus certificados:

```bash
./infra/azure/instalar.sh dominios qa
curl -s https://api-qa.cosmos.com.pe/health/ready     # {"status":"ok","db":"up"}
```

4. GitHub > repo > **Settings > Environments > produccion**:
   - *Required reviewers*: quien aprueba los pases a producción.
   - *Deployment branches*: solo `main`.

> Anotar la fecha en que el TTL quedó en 300 s: el corte debe ser **al menos 48 h después**.

---

## Fase 2. Ensayo completo en QA

### 2.1 Copiar la base de Atlas a QA

```bash
./infra/azure/migrar-datos.sh qa
```

El script:

1. Instala `mongodump`, `mongorestore` y `mongosh` (solo la primera vez).
2. **Pide la URI de Atlas.** Pegarla y pulsar Enter (no se ve al escribir). Queda guardada en Key Vault (`kv-cosmosck-prod`, secreto `atlas-origen-uri`) y no la vuelve a pedir.
3. Muestra la **IP pública de la sesión** y prueba la conexión. Si Atlas la rechaza, en https://cloud.mongodb.com:
   - **Security > Network Access > + Add IP Address**
   - *Access List Entry*: la IP que muestra el script, con `/32`
   - *Comment*: `Cloud Shell migracion Cosmos`
   - Marcar **This entry is temporary** (6 horas) > **Confirm**

   El script reintenta solo cada 20 s; no hay que relanzarlo.
4. Abre esa IP en el firewall de la base de QA (la cierra al terminar).
5. Copia **solo la base `cosmos`** (el cluster de Atlas es compartido con otros proyectos), crea los índices uno a uno y compara documentos e índices por colección.

Resultado esperado al final: `Coinciden: 22 colecciones, ~17.000 documentos.`

Si sale `FALLO` en algún índice, anotarlo: DocumentDB no lo admite y hay que
resolverlo antes del corte (en producción el script se detiene ante eso).

> La IP de Cloud Shell cambia en cada sesión. Si se abre otra sesión, el script
> la vuelve a mostrar y habrá que añadirla de nuevo en Atlas.

### 2.2 Pasar los archivos de QA a Azure Blob

```bash
./infra/azure/migrar-archivos.sh qa
```

El script crea la cuenta `stcosmosckarchivos` y el contenedor `archivos-qa`, pasa
la API de QA a Azure Blob, copia los archivos que la base referencia en S3 y
reescribe sus direcciones.

Resultado esperado con los datos actuales:

```
Copiados: 7. Ya no existian en S3: 40. Fallidos: 0.
Quedan 40 urls de S3: 40 ya no existian en S3 y 0 fallaron.
```

Las 7 son las firmas. Las 40 son fotos de empleados cuyo bucket
(`cosmos-bucket-aws`) ya no existe: ya se veían rotas y **se dejan así**.

Si se detiene en la creación de la cuenta con `RequestDisallowedByPolicy`, la
organización prohíbe el acceso público a blobs: pedir una excepción para
`stcosmosckarchivos` y relanzar.

### 2.3 Pruebas en https://qa.cosmos.com.pe

Todos tendrán que iniciar sesión de nuevo (el secreto de sesión es nuevo).

- [ ] Login.
- [ ] Marcación completa (entrada y salida), facial incluida.
- [ ] Consulta de reportes.
- [ ] Generar un formato con **firma** y descargarlo en PDF: la firma debe salir.
- [ ] Subir una foto nueva de un empleado: debe verse.
- [ ] Recuperar la contraseña de un usuario: el código llega al correo de soporte, no al usuario.
- [ ] Sincronización con Visma.

Si algo falla:

```bash
az containerapp logs show -g rg-cosmosck-qa -n ca-cosmosck-api-qa --tail 100
```

---

## Fase 3. Producción preparada (sin tráfico real)

1. En GitHub, crear un PR de `develop` a `main` y fusionarlo.
2. GitHub > Actions > **Deploy** > la ejecución > **Review deployments** > aprobar `produccion`.
3. Comprobar la API de producción en su dirección de Azure (debe aparecer `"storage":"s3"`):

```bash
curl -s https://ca-cosmosck-api-prod.grayforest-d8107249.eastus2.azurecontainerapps.io/health
```

> Hasta el corte nadie usa esta API: los dominios siguen en Netlify y AWS. No
> usar el panel de producción de Azure para escribir datos.

4. Acordar con el área DNS **fecha y hora del corte** (bajo uso, 48 h o más tras el TTL a 300 s) y un canal de aviso inmediato.

---

## Fase 4. Corte (ventana de mantenimiento)

### 4.1 El día anterior

```bash
dns apicheckin.cosmos.com.pe A       # 300s o menos
dns checkin.cosmos.com.pe CNAME      # 300s o menos
```

Si da más de 300 s, pedirlo de nuevo al área DNS y **aplazar el corte**.

### 4.2 Al empezar la ventana

1. Avisar a los usuarios.
2. Cloud Shell: fase 0 (tmux, `git pull`, `export PROY` y `SUB`).
3. Coolify > backend de Cosmos > **Stop** (detener, **no borrar**). Desde aquí nadie escribe en Atlas.

### 4.3 Copiar la base de producción

```bash
./infra/azure/migrar-datos.sh prod
```

- Pide escribir `MIGRAR`.
- Comprueba durante 30 s que nadie escribe en Atlas. Si detecta cambios, Coolify sigue encendido: detenerlo y responder `N`.
- Si Atlas rechaza la IP, añadirla como en la fase 2.1.
- Al final debe decir **`Coinciden`**. Además lanza el primer respaldo semanal.

**Si los conteos no coinciden o algún índice falla, el script se detiene: NO seguir.**
Arrancar el backend en Coolify y revisar con calma. Nada ha cambiado para los usuarios.

### 4.4 Llevar el tráfico a Azure

```bash
./infra/azure/instalar.sh corte
```

1. Pide escribir `CORTE`.
2. **En ese momento, avisar al área DNS** para que ejecute la solicitud 2:
   - `checkin` → CNAME `polite-hill-09221710f.2.azurestaticapps.net`
   - `apicheckin` → **borrar el registro A** y crear CNAME `ca-cosmosck-api-prod.grayforest-d8107249.eastus2.azurecontainerapps.io`
3. El script espera (hasta 60 min) a que el DNS apunte a Azure, enlaza los dominios y emite los certificados. No cerrar Cloud Shell.

Mientras se emite el certificado de `apicheckin` (unos minutos) la app móvil no
conecta: es lo esperado.

Si se agota la espera, cuando el DNS ya apunte:

```bash
./infra/azure/instalar.sh dominios prod
```

### 4.5 Pruebas de humo

```bash
curl -s https://apicheckin.cosmos.com.pe/health/ready     # {"status":"ok","db":"up"}
```

- [ ] https://checkin.cosmos.com.pe carga y permite iniciar sesión.
- [ ] Marcación desde un teléfono con la app instalada (**sin reinstalarla**).
- [ ] Reporte y PDF de un formato.

### 4.6 Pasar los archivos de producción a Azure Blob

Solo después de 4.3 y 4.4 (el script comprueba que `apicheckin` ya apunta a Azure):

```bash
./infra/azure/migrar-archivos.sh prod
```

Mismo resultado esperado que en QA (7 copiados, 40 que ya no existían). Después:

- [ ] PDF de un formato con firma: la firma sale.
- [ ] Subir una foto nueva: se ve.

### 4.7 Comprobar el primer respaldo

```bash
az containerapp job execution list -g rg-cosmosck-prod -n job-respaldo-semanal -o table
```

Debe terminar en `Succeeded`.

### 4.8 Cerrar la ventana

Avisar a los usuarios. Desde aquí, el sistema funciona entero en Azure.

---

## Vuelta atrás

Solo tiene sentido en las primeras horas: lo escrito en Azure después del corte no estará en Atlas.

**Archivos** (si fallan firmas o fotos):

```bash
./infra/azure/migrar-archivos.sh prod revertir     # pide escribir REVERTIR
```

**Todo** (si la API o los datos fallan):

1. Pedir al área DNS que restaure:
   - `checkin` → CNAME `checkincosmos.netlify.app`
   - `apicheckin` → borrar el CNAME y crear A `98.87.37.45`
2. Coolify > backend > **Start**.

Netlify, Coolify, Atlas y S3 no se han tocado: vuelven a servir en cuanto el DNS apunta a ellos.

**Versión anterior de la API** (si un despliegue nuevo falla):

```bash
az containerapp revision list -g rg-cosmosck-prod -n ca-cosmosck-api-prod -o table
az containerapp ingress traffic set -g rg-cosmosck-prod -n ca-cosmosck-api-prod --revision-weight <revision-anterior>=100
```

---

## Fase 5. Cierre

### En la semana del corte

- [ ] **Atlas**: borrar la entrada temporal de *Network Access* si no caducó sola.
- [ ] **Presupuesto**: Portal > Cost Management > Budgets > Add. Mensual, ~150 USD, alertas al 50, 80 y 100 % al correo de soporte.
- [ ] **Alertas de las bases**: Portal > `docdb-cosmosck-prod` > Alerts > Create. CPU y almacenamiento al 80 %, grupo de acciones `ag-cosmos`.
- [ ] **Firewall de las bases**: Portal > cada cluster > Networking. Solo debe quedar la regla de servicios de Azure (ninguna `tmp-migracion-...`).
- [ ] **Permisos**: avisar al partner CSP y a TI del rol Owner de `admin.azure@cosmos.com.pe`, y retirar el acceso elevado en `/` (Entra ID > Propiedades > *Access management for Azure resources* = No).

### A los 7-14 días estables

- [ ] Comprobar que no quedan urls de S3 salvo las 40 rotas:

```bash
./infra/azure/migrar-archivos.sh prod      # relanzarlo no repite nada; informa lo que queda
```

- [ ] Guardar una copia completa de los buckets de S3 antes de apagarlos.
- [ ] Apagar **S3** (`aws-marcostorresalarcon-bucket`, solo la parte de Cosmos).
- [ ] Apagar el **servidor de AWS con Coolify**.
- [ ] Dar de baja el sitio de **Netlify** `checkincosmos`.
- [ ] **Atlas**: borrar la base `cosmos` del cluster `focodigitalmongodb` (hay un volcado en `stcosmosckrespaldos/respaldos/migracion/`).
- [ ] Borrar el secreto con la URI de Atlas:

```bash
az keyvault secret delete --vault-name kv-cosmosck-prod -n atlas-origen-uri
```

- [ ] Revisar el consumo real de la API y ajustar CPU y memoria (`API_CPU` y `API_MEM` en `vars.sh`, después `./infra/azure/instalar.sh ~/prod.env`).

---

## Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| `no existe ... Exportar PROY=cosmosck?` | Falta `export PROY=cosmosck` en esta sesión |
| `sin sesion de Azure` | `az login` |
| `Atlas sigue sin aceptar <ip>` | Revisar *Network Access* en Atlas y la URI. Para cambiar la URI guardada: `az keyvault secret delete --vault-name kv-cosmosck-prod -n atlas-origen-uri` y relanzar |
| `la API desplegada ... no informa 'storage'` | La versión nueva no está desplegada en ese ambiente: esperar al workflow Deploy (o hacer la fase 3 para prod) |
| `apicheckin aun no apunta a Azure` | `migrar-archivos.sh prod` va después del corte (4.3 y 4.4) |
| `FALLO` en un índice | DocumentDB no lo admite. En QA se sigue; antes del corte hay que resolverlo |
| `RequestDisallowedByPolicy` | La organización prohíbe blobs públicos: pedir excepción para `stcosmosckarchivos` |
| Se cerró el navegador | Abrir Cloud Shell y `tmux attach -t cosmos`. Si se perdió, relanzar el mismo comando: los scripts respetan lo hecho |
| `DocumentDB ... no responde` | Reintentar; si persiste, revisar en el portal que el cluster está en estado *Ready* |

Registros: cada script deja el suyo en `~/` (`cosmos-migracion-*.log`, `cosmos-archivos-*.log`) y los volcados y mapas en `~/migracion/`.
