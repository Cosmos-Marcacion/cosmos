# shellcheck shell=bash
# Variables del Escenario B. Las carga instalar.sh.
#
# Obligatorio antes de lanzar: SUB y SOPORTE_EMAIL (o exportarlos en la shell).
# ACR, Key Vault y la cuenta de almacenamiento deben ser unicos en todo Azure;
# instalar.sh lo comprueba al empezar y, si alguno esta tomado, basta con
# cambiar PROY.

export SUB="${SUB:-<ID_SUSCRIPCION>}"
export SOPORTE_EMAIL="${SOPORTE_EMAIL:-<CORREO_SOPORTE>}"
export LOC="${LOC:-eastus2}"
export PROY="${PROY:-cosmosci}"

export RG_PROD="rg-$PROY-prod" RG_QA="rg-$PROY-qa"
export ACR="acr${PROY}prod"                         # solo minusculas y numeros
# Un Key Vault por ambiente: la identidad de QA no puede leer secretos de prod.
export KV_PROD="kv-$PROY-prod" KV_QA="kv-$PROY-qa"
export LAW="law-$PROY"
export ENV_PROD="cae-$PROY-prod" ENV_QA="cae-$PROY-qa"
export APP_PROD="ca-$PROY-api-prod" APP_QA="ca-$PROY-api-qa"
export ID_PROD="id-$PROY-api-prod" ID_QA="id-$PROY-api-qa" ID_RESPALDO="id-$PROY-respaldo"
export DB_PROD="docdb-$PROY-prod" DB_QA="docdb-$PROY-qa"
export SWA_PROD="swa-$PROY-prod" SWA_QA="swa-$PROY-qa"
export ST="st${PROY}respaldos"
# Archivos de la app (firmas, fotos, QR), en lugar de S3. Lectura publica por
# blob, como hoy en S3: el panel los muestra con <img>. Un contenedor por
# ambiente, y cada API solo puede escribir en el suyo. Ver migrar-archivos.sh.
export ST_ARCHIVOS="st${PROY}archivos"
export CONT_ARCHIVOS_PROD="archivos" CONT_ARCHIVOS_QA="archivos-qa"
export JOB_BACKUP="job-respaldo-semanal" JOB_PING="job-ping-qa"
export ID_GITHUB="id-github-deploy"

# Dominios. En produccion se conservan los de hoy: los APK instalados llaman a
# apicheckin y las llaves de acceso (WebAuthn) estan ligadas al dominio del
# panel. Cambiarlos obligaria a reinstalar la app y volver a registrar llaves.
export DOMINIO="cosmos.com.pe"
export FRONT_PROD_HOST="checkin.$DOMINIO"
export API_PROD_HOST="apicheckin.$DOMINIO"
export FRONT_QA_HOST="qa.$DOMINIO"
export API_QA_HOST="api-qa.$DOMINIO"

export GH_REPO="Cosmos-Marcacion/cosmos"

# Tier de la base de QA. Free solo existe en algunas regiones y uno por
# suscripcion; si el despliegue falla por SKU o region, poner M10 (tiene coste:
# avisar al cliente) y volver a lanzar.
export QA_DB_TIER="${QA_DB_TIER:-Free}"
export PROD_DB_TIER="M10"
# Igualar a la version mayor del Mongo de Coolify: docker exec <mongo> mongod --version
export MONGO_VERSION="${MONGO_VERSION:-7.0}"

# Recursos de la API. La guia propone 0.5 CPU / 1 GiB, pero la imagen carga
# TensorFlow (reconocimiento facial) y lanza LibreOffice por cada PDF, dos a la
# vez: con 1 GiB el contenedor muere por memoria. Medir en QA y ajustar.
export API_CPU="1.0" API_MEM="2.0Gi" API_PORT="3000"

# Opcional. Con un token de Cloudflare (permiso Zone.DNS:Edit) el instalador
# crea los registros de QA y los TXT de validacion, y baja a 300 s el TTL de
# los registros de produccion. Sin token, los imprime para crearlos a mano.
export CF_API_TOKEN="${CF_API_TOKEN:-}"
