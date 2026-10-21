#!/usr/bin/env bash
# Instalador unico del Escenario B (Azure PaaS).
#
# Se lanza en Azure Cloud Shell (Bash), desde la raiz del repositorio:
#
#   gh auth login && gh repo clone Cosmos-Marcacion/cosmos && cd cosmos   (repo privado)
#   tmux new -s cosmos       # Cloud Shell corta las sesiones inactivas; tmux las mantiene
#   SUB=<id> SOPORTE_EMAIL=<correo> ./infra/azure/instalar.sh ~/prod.env [~/qa.env]
#
# Crea todo lo de la guia salvo el corte: bases, registro, Key Vault, imagenes,
# Container Apps con sondas, Static Web Apps, respaldos, alertas, OIDC de
# GitHub y los dominios de QA. Tarda entre 40 y 60 minutos.
#
# Se puede relanzar las veces que haga falta: lo que ya existe se respeta, y
# un fallo dice en que paso fue. Los pasos secundarios (alertas, GitHub, DNS)
# no detienen la instalacion: quedan en la lista de pendientes del final.
#
# Otros usos:
#   instalar.sh promover <prod|qa>          pasa el trafico a la ultima revision sana
#   instalar.sh ip <prod|qa> <abrir|cerrar> [ip]   regla temporal en el firewall de la base
#   instalar.sh dominios <prod|qa>          enlaza dominios cuyo DNS ya apunta a Azure
#   instalar.sh dns                         genera la solicitud para el area de DNS
#   instalar.sh corte                       paso 21: DNS de produccion a Azure y certificados
#
# Archivos .env: las variables del backend exportadas de Coolify, fuera del
# repositorio. MONGO_URI y JWT_SECRET se ignoran: los genera el instalador. Si
# no se pasa el de QA, se crea ~/qa.env desde el de produccion, con los
# archivos de S3 bajo qa/ y el correo desviado al de soporte.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
# shellcheck source=vars.sh
source "$DIR/vars.sh"

# Variables del .env que van a Key Vault. El resto entra como variable normal.
SECRETOS=" PASSWORD_COSMOS AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY PASSWORD_EMAIL SMTP_PASS VISMA_PASSWORD VISMA_TOKEN "
# Las fija el instalador o no aplican en Azure.
SALTAR=" PORT NODE_ENV TZ DNSNODE_DNS_SERVERS MONGO_URI JWT_SECRET CORS_EXTRA_ORIGINS WEBAUTHN_RP_ID WEBAUTHN_ORIGIN "
REGIONES_SWA=" westus2 centralus eastus2 westeurope eastasia "

TMP="$(mktemp -d)"
LOG="$HOME/cosmos-instalacion-$(date +%Y%m%d-%H%M%S).log"
PASO="inicio"
# En fichero y no en un array: los pasos secundarios corren en un subshell.
PENDIENTES="$TMP/pendientes"
: > "$PENDIENTES"

# ------------------------------------------------------------- utilidades
fin() { rm -rf "$TMP"; }
trap fin EXIT
al_fallar() {
  local rc=$?
  echo
  echo "ERROR en el paso '$PASO' (linea $1, codigo $rc):"
  echo "  $2"
  echo "Registro completo: $LOG"
  echo "Corregir la causa y volver a lanzar el mismo comando: lo ya creado se respeta."
  exit "$rc"
}
trap 'al_fallar $LINENO "$BASH_COMMAND"' ERR

paso() { PASO="$1"; printf '\n\033[1m== %s\033[0m\n' "$1"; }
info() { printf '   %s\n' "$*"; }
error() { echo "ERROR: $*" >&2; exit 1; }
existe() { "$@" > /dev/null 2>&1; }
pendiente() { printf '%s\n' "$*" >> "$PENDIENTES"; printf '   PENDIENTE: %s\n' "$*"; }

# reintentar <intentos> <segundos> comando...
reintentar() {
  local n="$1" s="$2" i; shift 2
  for ((i = 1; i <= n; i++)); do
    if "$@"; then return 0; fi
    if [ "$i" -lt "$n" ]; then info "reintento $i/$n en ${s}s..."; sleep "$s"; fi
  done
  return 1
}

# Paso secundario: si falla se anota y se sigue. Corre en un subshell con
# `set -e` propio; no va dentro de un `if`, porque ahi bash ignora `set -e`
# incluso dentro del subshell y el paso seguiria tras un error.
suave() { # <descripcion> <funcion> [args]
  local d="$1" rc; shift
  trap - ERR; set +e
  ( set -e; "$@" ); rc=$?
  set -e; trap 'al_fallar $LINENO "$BASH_COMMAND"' ERR
  if [ "$rc" -ne 0 ]; then pendiente "$d (fallo; ver registro)"; fi
  return 0
}

# Fija las variables de un ambiente.
amb() {
  case "${1:-}" in
    prod) E=prod RG=$RG_PROD ENVN=$ENV_PROD APP=$APP_PROD DB=$DB_PROD SWA=$SWA_PROD KVA=$KV_PROD IDN=$ID_PROD
          MINR=1 FRONT=$FRONT_PROD_HOST API=$API_PROD_HOST TIER=$PROD_DB_TIER GH_ENV=produccion ;;
    qa)   E=qa RG=$RG_QA ENVN=$ENV_QA APP=$APP_QA DB=$DB_QA SWA=$SWA_QA KVA=$KV_QA IDN=$ID_QA
          MINR=0 FRONT=$FRONT_QA_HOST API=$API_QA_HOST TIER=$QA_DB_TIER GH_ENV=qa ;;
    *) error "ambiente invalido '${1:-}': usar prod o qa" ;;
  esac
}

yo() { az ad signed-in-user show --query id -o tsv; }
acr_id() { az acr show -n "$ACR" --query id -o tsv; }
kv_id() { az keyvault show -n "$1" --query id -o tsv; }

# Asigna un rol si no esta, con reintentos: una identidad recien creada tarda
# en verse en Entra ID.
NUEVOS_ROLES=0
rol() { # <principalId> <rol> <scope>
  local n
  n=$(az role assignment list --assignee "$1" --role "$2" --scope "$3" --query "length(@)" -o tsv 2>/dev/null || echo 0)
  [ "${n:-0}" -gt 0 ] && return 0
  reintentar 6 20 az role assignment create --assignee-object-id "$1" --assignee-principal-type ServicePrincipal \
    --role "$2" --scope "$3" -o none
  NUEVOS_ROLES=1
}
rol_usuario() { # <rol> <scope>
  local n me; me=$(yo)
  n=$(az role assignment list --assignee "$me" --role "$1" --scope "$2" --query "length(@)" -o tsv 2>/dev/null || echo 0)
  [ "${n:-0}" -gt 0 ] && return 0
  az role assignment create --assignee-object-id "$me" --assignee-principal-type User --role "$1" --scope "$2" -o none
  NUEVOS_ROLES=1
}
# Los permisos nuevos tardan en propagarse; mejor esperar que fallar despues.
esperar_roles() {
  if [ "$NUEVOS_ROLES" = 1 ]; then info "esperando 90 s a que se propaguen los permisos..."; sleep 90; NUEVOS_ROLES=0; fi
}

# Escribe un secreto por fichero: el valor no pasa por la linea de comandos.
kv_set() { # <vault> <nombre> <valor>
  local f="$TMP/secreto"
  printf '%s' "$3" > "$f"
  if reintentar 10 15 az keyvault secret set --vault-name "$1" -n "$2" --file "$f" --encoding utf-8 -o none; then
    rm -f "$f"
  else
    rm -f "$f"; return 1
  fi
}
kv_get() { az keyvault secret show --vault-name "$1" -n "$2" --query value -o tsv 2>/dev/null || true; }

# Contrasena solo alfanumerica (no necesita codificarse en la URI) con
# mayusculas, minusculas y digitos, como exige DocumentDB.
generar_password() { local r; r=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9'); printf 'Cx%s9' "${r:0:28}"; }
nombre_secreto() { echo "$1" | tr 'A-Z_' 'a-z-'; }

# Lee un .env: "CLAVE<TAB>VALOR" por linea. Respeta comillas: la clave de
# Visma termina en # y sin comillas se cortaria ahi.
leer_env() {
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" == *=* ]] || continue
    line="${line#export }"
    key="${line%%=*}"; val="${line#*=}"
    key="${key//[[:space:]]/}"
    if [[ "$val" == \"*\" && ${#val} -ge 2 ]]; then val="${val:1:${#val}-2}"
    elif [[ "$val" == \'*\' && ${#val} -ge 2 ]]; then val="${val:1:${#val}-2}"
    else val="${val%%[[:space:]]#*}"; val="${val%"${val##*[![:space:]]}"}"
    fi
    printf '%s\t%s\n' "$key" "$val"
  done < "$1"
}

# DNS publico por DoH, sin depender de dig ni nslookup.
dns() { # <nombre> <tipo>
  curl -fsS -H 'accept: application/dns-json' "https://cloudflare-dns.com/dns-query?name=$1&type=$2" 2>/dev/null \
    | jq -r '.Answer[]?.data' | sed -e 's/\.$//' -e 's/^"//' -e 's/"$//' | tr 'A-Z' 'a-z'
}
apunta_a() { dns "$1" CNAME | grep -qx "$(echo "$2" | tr 'A-Z' 'a-z')"; }
# "CNAME <destino>" si lo es; si no, "A <ip> <ip>...".
destino_actual() {
  local c a
  c=$(dns "$1" CNAME | head -n 1)
  if [ -n "$c" ]; then echo "CNAME $c"; return 0; fi
  a=$(dns "$1" A | grep -E '^[0-9.]+$' | paste -sd ' ' - || true)
  echo "${a:+A $a}"
}

# --------------------------------------------------------------- cloudflare
cf() { curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" "https://api.cloudflare.com/client/v4/$1" "${@:2}"; }
cf_zona() { cf "zones?name=$DOMINIO" | jq -r '.result[0].id // empty'; }
cf_registro() { # <tipo> <nombre> <contenido>
  local zona id body
  zona=$(cf_zona); [ -n "$zona" ] || { echo "Zona $DOMINIO no encontrada en Cloudflare"; return 1; }
  id=$(cf "zones/$zona/dns_records?type=$1&name=$2" | jq -r '.result[0].id // empty')
  if [ "$1" = CNAME ]; then
    body=$(jq -n --arg t "$1" --arg n "$2" --arg c "$3" '{type:$t,name:$n,content:$c,ttl:300,proxied:false}')
  else
    body=$(jq -n --arg t "$1" --arg n "$2" --arg c "$3" '{type:$t,name:$n,content:$c,ttl:300}')
  fi
  if [ -n "$id" ]; then cf "zones/$zona/dns_records/$id" -X PUT --data "$body" > /dev/null
  else cf "zones/$zona/dns_records" -X POST --data "$body" > /dev/null; fi
  info "DNS $1 $2 -> $3"
}
cf_bajar_ttl() { # <nombre>: TTL 300 sin cambiar el destino
  local zona r
  zona=$(cf_zona)
  for r in $(cf "zones/$zona/dns_records?name=$1" | jq -r '.result[] | select(.ttl != 300 and .ttl != 1) | .id'); do
    cf "zones/$zona/dns_records/$r" -X PATCH --data '{"ttl":300}' > /dev/null
    info "TTL de $1 a 300 s"
  done
}

# Sin qa.env, se crea desde el de produccion: mismas credenciales de terceros,
# pero aislado en lo que QA escribe. Los archivos van a S3 bajo qa/ y todo el
# correo al de soporte, porque QA trabaja con una copia de los usuarios reales.
# Si ya existe de una ejecucion anterior se respeta, por si se edito a mano.
preparar_qa_env() {
  [ -z "$ENV_FILE_QA" ] || return 0
  ENV_FILE_QA="$HOME/qa.env"
  if [ -f "$ENV_FILE_QA" ]; then
    info "QA usa $ENV_FILE_QA, creado en una ejecucion anterior."
    return 0
  fi
  {
    echo "# Generado por instalar.sh desde $(basename "$ENV_FILE_PROD") el $(date '+%d/%m/%Y %H:%M')."
    echo "# Mismas credenciales que produccion, aislado en lo que QA escribe:"
    echo "#   archivos de S3 bajo qa/ y todo el correo a $SOPORTE_EMAIL."
    echo "# Se puede editar: el instalador lo reutiliza en las siguientes ejecuciones."
    grep -vE '^[[:space:]]*(export[[:space:]]+)?(AWS_S3_KEY_PREFIX|MAIL_REDIRECT_TO)[[:space:]]*=' "$ENV_FILE_PROD" || true
    echo
    echo "AWS_S3_KEY_PREFIX=qa/"
    echo "MAIL_REDIRECT_TO=$SOPORTE_EMAIL"
  } > "$ENV_FILE_QA"
  chmod 600 "$ENV_FILE_QA"
  info "Creado $ENV_FILE_QA desde $ENV_FILE_PROD (S3 bajo qa/, correo a $SOPORTE_EMAIL)."
}

# Comprueba un nombre unico en todo Azure: libre, ya nuestro, o de otro.
# Cloud Shell corta conexiones a veces; un fallo al preguntar no es "ocupado".
acr_existe() { az acr show -n "$1" -o none 2> /dev/null; }
st_existe() { az storage account show -n "$1" -o none 2> /dev/null; }
kv_existe() { az keyvault show -n "$1" -o none 2> /dev/null; }
nombre_global() { # <estricto|aviso> <descripcion> <nombre> <funcion-existe> <comando check...>
  local modo="$1" que="$2" n="$3" ex="$4" r="" err="$TMP/check-err" i; shift 4
  "$ex" "$n" && return 0
  for i in 1 2 3; do
    r=$("$@" --query nameAvailable -o tsv 2> "$err") && break
    info "sin respuesta de Azure al comprobar $que '$n'; reintento $i/3 en 10s..."
    sleep 10
  done
  case "$r" in
    true) return 0 ;;
    # Ocupado: puede ser nuestro y haber fallado la consulta de antes.
    false) reintentar 3 10 "$ex" "$n" && return 0
           error "$que '$n' ya existe en otra suscripcion: cambiar PROY (export PROY=otro) y relanzar" ;;
  esac
  info "Azure dijo: $(tail -n 1 "$err" 2> /dev/null)"
  [ "$modo" = aviso ] || error "no se pudo comprobar $que '$n'. Relanzar en unos minutos"
  info "No se pudo comprobar $que '$n'; se sigue. Si estuviera ocupado, fallara al crearlo."
}

# ============================================================ comprobaciones
comprobar() {
  paso "Comprobaciones previas"
  [ "${BASH_VERSINFO[0]}" -ge 4 ] || error "hace falta bash 4 o superior"
  local t; for t in az jq curl openssl; do command -v "$t" > /dev/null || error "falta '$t' en el PATH"; done
  [[ "$SUB" != *"<"* ]] || error "falta SUB (id de la suscripcion): exportarlo o editar infra/azure/vars.sh"
  [[ "$SOPORTE_EMAIL" != *"<"* ]] || error "falta SOPORTE_EMAIL"
  [[ "$REGIONES_SWA" == *" $LOC "* ]] || error "Static Web Apps no existe en '$LOC'. Usar una de:$REGIONES_SWA"
  [ -f "$REPO/cosmos-back/Dockerfile" ] || error "lanzar desde un clon del repositorio (no encuentro cosmos-back/Dockerfile)"
  [ -f "$ENV_FILE_PROD" ] || error "no existe el archivo $ENV_FILE_PROD"
  preparar_qa_env
  [ -f "$ENV_FILE_QA" ] || error "no existe el archivo $ENV_FILE_QA"
  leer_env "$ENV_FILE_PROD" > /dev/null; leer_env "$ENV_FILE_QA" > /dev/null

  az account show > /dev/null 2>&1 || error "sin sesion de Azure: az login"
  az account set --subscription "$SUB"
  info "Suscripcion: $(az account show --query name -o tsv)"

  local roles
  roles=$(az role assignment list --assignee "$(yo)" --scope "/subscriptions/$SUB" --include-inherited --query "[].roleDefinitionName" -o tsv 2>/dev/null || true)
  if ! grep -qx Owner <<< "$roles"; then
    info "AVISO: no veo el rol Owner asignado directamente. Si viene por un grupo, no pasa nada; si no tienes Owner, fallara al asignar permisos, en el paso del Key Vault."
  fi

  az extension add --name containerapp --upgrade -y -o none 2>/dev/null || true
  az bicep version > /dev/null 2>&1 || az bicep install

  # Nombres globales: mejor saberlo ahora que a mitad de instalacion.
  nombre_global estricto "el registro" "$ACR" acr_existe az acr check-name -n "$ACR"
  nombre_global estricto "la cuenta de almacenamiento" "$ST" st_existe az storage account check-name -n "$ST"
  local kv
  for kv in "$KV_PROD" "$KV_QA"; do
    # Uno borrado se recupera al instalar: su nombre sigue siendo nuestro.
    [ -n "$(reintentar 3 10 az keyvault list-deleted --query "[?name=='$kv'].name" -o tsv)" ] && continue
    nombre_global aviso "el Key Vault" "$kv" kv_existe az rest --method post       --uri "https://management.azure.com/subscriptions/$SUB/providers/Microsoft.KeyVault/checkNameAvailability?api-version=2022-07-01"       --body "{\"name\":\"$kv\",\"type\":\"Microsoft.KeyVault/vaults\"}"
  done
  info "Todo listo para empezar."
}

# ================================================================== pasos
proveedores() {
  paso "Proveedores de recursos (paso 2)"
  local p ps="Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry Microsoft.KeyVault Microsoft.DocumentDB Microsoft.Web Microsoft.Storage Microsoft.Insights Microsoft.ManagedIdentity"
  # register devuelve enseguida y avisa con un WARNING que la activacion sigue:
  # se oculta y se espera aqui, que dice que falta.
  for p in $ps; do az provider register --namespace "$p" -o none 2> /dev/null; done
  registrado() { [ "$(az provider show -n "$1" --query registrationState -o tsv)" = Registered ]; }
  for p in $ps; do
    registrado "$p" && continue
    info "Activando $p en la suscripcion (la primera vez tarda de 2 a 10 min; no cortar)..."
    reintentar 40 15 registrado "$p" || error "el proveedor $p no termina de registrarse"
  done
  info "Proveedores registrados."
}

grupos() {
  paso "Grupos de recursos (paso 3)"
  az group create -n "$RG_PROD" -l "$LOC" --tags proyecto=cosmos-checkin ambiente=prod -o none
  az group create -n "$RG_QA" -l "$LOC" --tags proyecto=cosmos-checkin ambiente=qa -o none
}

base() {
  paso "Log Analytics, registro y Key Vault (paso 5)"
  existe az monitor log-analytics workspace show -g "$RG_PROD" -n "$LAW" \
    || az monitor log-analytics workspace create -g "$RG_PROD" -n "$LAW" -l "$LOC" -o none
  existe az acr show -n "$ACR" \
    || az acr create -g "$RG_PROD" -n "$ACR" --sku Basic --admin-enabled false -o none
  az acr config authentication-as-arm update -r "$ACR" --status enabled -o none
  local x
  for x in prod qa; do
    amb "$x"
    if ! existe az keyvault show -n "$KVA"; then
      if [ -n "$(az keyvault list-deleted --query "[?name=='$KVA'].name" -o tsv 2>/dev/null)" ]; then
        info "Recuperando $KVA, borrado antes y retenido por Azure"
        az keyvault recover -n "$KVA" -o none
      else
        az keyvault create -g "$RG" -n "$KVA" -l "$LOC" --enable-rbac-authorization true -o none
      fi
    fi
    rol_usuario "Key Vault Secrets Officer" "$(kv_id "$KVA")"
  done
  esperar_roles
  for x in prod qa; do amb "$x"; kv_set "$KVA" acceso-instalador ok; done
  info "Key Vault accesible."
}

base_datos() { # <prod|qa>
  amb "$1"
  paso "DocumentDB $DB, tier $TIER (pasos 4 y 6)"
  local pass
  pass=$(kv_get "$KVA" docdb-admin-password)
  if existe az resource show -g "$RG" -n "$DB" --resource-type Microsoft.DocumentDB/mongoClusters; then
    [ -n "$pass" ] || error "$DB existe pero su contrasena no esta en $KVA (secreto docdb-admin-password). Guardarla alli y relanzar."
    info "Ya existe."
  else
    if [ -z "$pass" ]; then pass=$(generar_password); kv_set "$KVA" docdb-admin-password "$pass"; fi
    info "Creando el cluster (tarda entre 5 y 15 minutos)..."
    if ! az deployment group create -g "$RG" -n "documentdb-$E" -f "$DIR/documentdb.bicep" -o none \
         -p clusterName="$DB" adminUser=cosmosadmin adminPassword="$pass" tier="$TIER" storageGb=32 serverVersion="$MONGO_VERSION"; then
      [ "$E" = qa ] && echo "Si el error habla de SKU, tier o region: QA_DB_TIER=M10 (tiene coste) y relanzar."
      return 1
    fi
  fi
  kv_set "$KVA" mongo-uri "mongodb+srv://cosmosadmin:$pass@$DB.global.mongocluster.cosmos.azure.com/cosmos?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000"
  # El secreto JWT viejo estaba en el repositorio: siempre uno nuevo.
  [ -n "$(kv_get "$KVA" jwt-secret)" ] || kv_set "$KVA" jwt-secret "$(openssl rand -base64 48 | tr -d '\n')"
}

imagenes() {
  paso "Imagenes en el registro (paso 7)"
  if [ -n "$(az acr repository show-tags -n "$ACR" --repository cosmos-api --query "[?@=='inicial']" -o tsv 2>/dev/null)" ]; then
    info "cosmos-api:inicial ya existe."
  else
    info "Construyendo la API en ACR (10 a 20 minutos: LibreOffice y TensorFlow)..."
    if ! az acr build -r "$ACR" -t cosmos-api:inicial "$REPO/cosmos-back" -o none; then
      echo "Si el error dice 'TasksOperationsNotAllowed', la suscripcion no permite ACR Tasks:"
      echo "construir con Docker en otra maquina, 'docker push $ACR.azurecr.io/cosmos-api:inicial' y relanzar."
      return 1
    fi
  fi
  if [ -n "$(az acr repository show-tags -n "$ACR" --repository mongo-backup --query "[?@=='1']" -o tsv 2>/dev/null)" ]; then
    info "mongo-backup:1 ya existe."
  else
    az acr build -r "$ACR" -t mongo-backup:1 --build-arg MONGO_TAG="${MONGO_VERSION%%.*}" "$DIR/mongo-backup" -o none
  fi
}

identidades() {
  paso "Identidades administradas y permisos"
  local x pid
  for x in prod qa; do
    amb "$x"
    existe az identity show -g "$RG" -n "$IDN" || az identity create -g "$RG" -n "$IDN" -o none
    pid=$(az identity show -g "$RG" -n "$IDN" --query principalId -o tsv)
    rol "$pid" AcrPull "$(acr_id)"
    rol "$pid" "Key Vault Secrets User" "$(kv_id "$KVA")"
  done
  existe az identity show -g "$RG_PROD" -n "$ID_RESPALDO" || az identity create -g "$RG_PROD" -n "$ID_RESPALDO" -o none
  pid=$(az identity show -g "$RG_PROD" -n "$ID_RESPALDO" --query principalId -o tsv)
  rol "$pid" AcrPull "$(acr_id)"
  rol "$pid" "Key Vault Secrets User" "$(kv_id "$KV_PROD")"
  esperar_roles
}

static_web_apps() {
  paso "Static Web Apps (paso 9)"
  existe az staticwebapp show -g "$RG_PROD" -n "$SWA_PROD" \
    || az staticwebapp create -g "$RG_PROD" -n "$SWA_PROD" -l "$LOC" --sku Standard -o none
  existe az staticwebapp show -g "$RG_QA" -n "$SWA_QA" \
    || az staticwebapp create -g "$RG_QA" -n "$SWA_QA" -l "$LOC" --sku Free -o none
}

entornos() {
  paso "Entornos de Container Apps"
  local law_id law_key x
  law_id=$(az monitor log-analytics workspace show -g "$RG_PROD" -n "$LAW" --query customerId -o tsv)
  law_key=$(az monitor log-analytics workspace get-shared-keys -g "$RG_PROD" -n "$LAW" --query primarySharedKey -o tsv)
  for x in prod qa; do
    amb "$x"
    existe az containerapp env show -g "$RG" -n "$ENVN" \
      || az containerapp env create -g "$RG" -n "$ENVN" -l "$LOC" -o none \
           --logs-workspace-id "$law_id" --logs-workspace-key "$law_key"
  done
}

# Construye la especificacion completa de la app (identidad, registro,
# secretos de Key Vault, variables, sondas y escala) y la crea o actualiza.
# Una sola revision, que nace ya con permisos y configuracion.
app() { # <prod|qa> <archivo.env>
  amb "$1"
  paso "Container App $APP (paso 8)"
  local file="$2" key val kv swa_host image uami_id env_id plain_json secs_json traffic_json current spec
  local -a plain=() secs=(MONGO_URI JWT_SECRET)

  while IFS=$'\t' read -r key val; do
    [[ "$SALTAR" == *" $key "* ]] && continue
    [ -z "$val" ] && continue
    if [[ "$SECRETOS" == *" $key "* ]]; then
      kv_set "$KVA" "$(nombre_secreto "$key")" "$val"
      secs+=("$key")
      info "$key -> Key Vault"
    else
      plain+=("$key=$val")
    fi
  done < <(leer_env "$file")

  swa_host=$(az staticwebapp show -g "$RG" -n "$SWA" --query defaultHostname -o tsv)
  plain+=("NODE_ENV=production" "PORT=$API_PORT" "TZ=America/Lima"
          "WEBAUTHN_RP_ID=$FRONT" "WEBAUTHN_ORIGIN=https://$FRONT"
          "CORS_EXTRA_ORIGINS=https://$swa_host")

  uami_id=$(az identity show -g "$RG" -n "$IDN" --query id -o tsv)
  env_id=$(az containerapp env show -g "$RG" -n "$ENVN" --query id -o tsv)
  # Si la app ya existe se conserva su imagen: la que haya desplegado el CI.
  image=$(az containerapp show -g "$RG" -n "$APP" --query "properties.template.containers[0].image" -o tsv 2>/dev/null || true)
  [ -n "$image" ] || image="$ACR.azurecr.io/cosmos-api:inicial"

  # Clave a clave con --arg: jq escapa comillas, # y cualquier otro caracter.
  # Si una clave se repite gana la ultima (las fijadas aqui van al final).
  plain_json='{}'
  for kv in "${plain[@]}"; do
    plain_json=$(jq -c --arg k "${kv%%=*}" --arg v "${kv#*=}" '. + {($k): $v}' <<< "$plain_json")
  done
  secs_json=$(printf '%s\n' "${secs[@]}" | jq -R . | jq -sc 'unique')

  # Trafico explicito: al actualizar se queda en la revision actual hasta que
  # la nueva pase /health/ready (promover). Sin esto, la nueva podria entrar en
  # vivo sin prueba.
  current=$(az containerapp ingress traffic show -g "$RG" -n "$APP" --query "[?weight==\`100\`].revisionName | [0]" -o tsv 2>/dev/null || true)
  [ -n "$current" ] || current=$(az containerapp show -g "$RG" -n "$APP" --query properties.latestReadyRevisionName -o tsv 2>/dev/null || true)
  if [ -n "$current" ]; then
    traffic_json=$(jq -nc --arg r "$current" '[{revisionName: $r, weight: 100}]')
  else
    traffic_json='[{"latestRevision": true, "weight": 100}]'
  fi

  spec="$TMP/app-$E.yaml"   # JSON es YAML valido
  jq -n \
    --arg loc "$LOC" --arg uami "$uami_id" --arg envid "$env_id" --arg acr "$ACR.azurecr.io" \
    --arg img "$image" --arg kv "https://$KVA.vault.azure.net/secrets" --arg cpu "$API_CPU" --arg mem "$API_MEM" \
    --argjson port "$API_PORT" --argjson minr "$MINR" --argjson plain "$plain_json" --argjson secs "$secs_json" \
    --argjson traffic "$traffic_json" '
    def sname: ascii_downcase | gsub("_"; "-");
    def probe($t; $p; $period; $fail; $delay):
      {type: $t, httpGet: {path: $p, port: $port}, initialDelaySeconds: $delay,
       periodSeconds: $period, failureThreshold: $fail, timeoutSeconds: 5};
    {
      location: $loc,
      identity: {type: "UserAssigned", userAssignedIdentities: {($uami): {}}},
      properties: {
        managedEnvironmentId: $envid,
        configuration: {
          activeRevisionsMode: "Multiple",
          ingress: {external: true, targetPort: $port, transport: "auto", allowInsecure: false, traffic: $traffic},
          registries: [{server: $acr, identity: $uami}],
          secrets: [$secs[] | {name: sname, keyVaultUrl: ($kv + "/" + sname), identity: $uami}]
        },
        template: {
          containers: [{
            name: "api",
            image: $img,
            resources: {cpu: ($cpu | tonumber), memory: $mem},
            env: (($plain | to_entries | map({name: .key, value: .value}))
                  + ($secs | map({name: ., secretRef: sname}))),
            probes: [
              probe("Startup"; "/health"; 10; 10; 10),
              probe("Liveness"; "/health"; 30; 3; 0),
              probe("Readiness"; "/health/ready"; 10; 3; 0)
            ]
          }],
          scale: {minReplicas: $minr, maxReplicas: 3}
        }
      }
    }' > "$spec"

  if existe az containerapp show -g "$RG" -n "$APP"; then
    info "Actualizando (imagen actual: $image)"
    az containerapp update -g "$RG" -n "$APP" --yaml "$spec" -o none
  else
    info "Creando con $image"
    az containerapp create -g "$RG" -n "$APP" --yaml "$spec" -o none
  fi
  promover "$E"
}

# Pasa el trafico a la ultima revision si responde /health/ready y apaga las
# demas. En modo de revisiones multiples una revision nueva nace sin trafico.
promover() { # <prod|qa>
  amb "$1"
  local rev fqdn ok=0 i r
  rev=$(az containerapp show -g "$RG" -n "$APP" --query properties.latestRevisionName -o tsv)
  fqdn=$(az containerapp revision show -g "$RG" -n "$APP" --revision "$rev" --query properties.fqdn -o tsv)
  info "Probando $rev en https://$fqdn/health/ready"
  for i in $(seq 1 40); do
    if curl -fsS --max-time 10 "https://$fqdn/health/ready" > /dev/null 2>&1; then ok=1; break; fi
    sleep 15
  done
  if [ "$ok" != 1 ]; then
    echo "La revision $rev no responde tras 10 minutos. Ultimos registros:"
    az containerapp logs show -g "$RG" -n "$APP" --revision "$rev" --tail 40 2>/dev/null || true
    return 1
  fi
  az containerapp ingress traffic set -g "$RG" -n "$APP" --revision-weight "$rev=100" -o none
  for r in $(az containerapp revision list -g "$RG" -n "$APP" --query "[?properties.active && name!='$rev'].name" -o tsv); do
    az containerapp revision deactivate -g "$RG" -n "$APP" --revision "$r" -o none || true
  done
  info "Trafico en $rev."
}

respaldos() {
  paso "Respaldos (paso 18)"
  existe az storage account show -g "$RG_PROD" -n "$ST" \
    || az storage account create -g "$RG_PROD" -n "$ST" -l "$LOC" --sku Standard_LRS \
         --min-tls-version TLS1_2 --allow-blob-public-access false -o none
  # Por el plano de control: no hace falta rol de datos para crear el contenedor.
  existe az storage container-rm show --storage-account "$ST" -n respaldos \
    || az storage container-rm create --storage-account "$ST" -n respaldos --public-access off -o none
  printf '%s' '{"rules":[{"enabled":true,"name":"borrar-90-dias","type":"Lifecycle","definition":{"actions":{"baseBlob":{"delete":{"daysAfterModificationGreaterThan":90}}},"filters":{"blobTypes":["blockBlob"],"prefixMatch":["respaldos/"]}}}]}' > "$TMP/policy.json"
  az storage account management-policy create --account-name "$ST" -g "$RG_PROD" --policy "@$TMP/policy.json" -o none

  local st_id rid rcid qid qcid
  st_id=$(az storage account show -g "$RG_PROD" -n "$ST" --query id -o tsv)
  rid=$(az identity show -g "$RG_PROD" -n "$ID_RESPALDO" --query id -o tsv)
  rcid=$(az identity show -g "$RG_PROD" -n "$ID_RESPALDO" --query clientId -o tsv)
  rol "$(az identity show -g "$RG_PROD" -n "$ID_RESPALDO" --query principalId -o tsv)" "Storage Blob Data Contributor" "$st_id"
  esperar_roles

  # Domingo 07:00 UTC = 02:00 en Lima.
  existe az containerapp job show -g "$RG_PROD" -n "$JOB_BACKUP" \
    || az containerapp job create -g "$RG_PROD" -n "$JOB_BACKUP" --environment "$ENV_PROD" -o none \
         --trigger-type Schedule --cron-expression "0 7 * * 0" \
         --replica-timeout 3600 --replica-retry-limit 1 --parallelism 1 --replica-completion-count 1 \
         --image "$ACR.azurecr.io/mongo-backup:1" --registry-server "$ACR.azurecr.io" --registry-identity "$rid" \
         --mi-user-assigned "$rid" --cpu 0.5 --memory 1.0Gi \
         --secrets "mongo-uri=keyvaultref:https://$KV_PROD.vault.azure.net/secrets/mongo-uri,identityref:$rid" \
         --env-vars MONGO_URI=secretref:mongo-uri MODE=backup STORAGE_ACCOUNT="$ST" AZURE_CLIENT_ID="$rcid"

  # El cluster Free de QA se pausa tras 60 dias sin conexiones.
  qid=$(az identity show -g "$RG_QA" -n "$ID_QA" --query id -o tsv)
  qcid=$(az identity show -g "$RG_QA" -n "$ID_QA" --query clientId -o tsv)
  existe az containerapp job show -g "$RG_QA" -n "$JOB_PING" \
    || az containerapp job create -g "$RG_QA" -n "$JOB_PING" --environment "$ENV_QA" -o none \
         --trigger-type Schedule --cron-expression "0 8 * * 1" \
         --replica-timeout 300 --replica-retry-limit 1 --parallelism 1 --replica-completion-count 1 \
         --image "$ACR.azurecr.io/mongo-backup:1" --registry-server "$ACR.azurecr.io" --registry-identity "$qid" \
         --mi-user-assigned "$qid" --cpu 0.25 --memory 0.5Gi \
         --secrets "mongo-uri=keyvaultref:https://$KV_QA.vault.azure.net/secrets/mongo-uri,identityref:$qid" \
         --env-vars MONGO_URI=secretref:mongo-uri MODE=ping AZURE_CLIENT_ID="$qcid"

  # No se lanza aqui: con la base aun vacia el volcado sale casi vacio y el job
  # lo rechaza a proposito. Probarlo tras cargar datos.
  pendiente "Tras cargar datos: az containerapp job start -g $RG_PROD -n $JOB_BACKUP (y ver: az containerapp job execution list -g $RG_PROD -n $JOB_BACKUP -o table)"
}

alertas() {
  paso "Alertas (paso 16)"
  existe az monitor action-group show -g "$RG_PROD" -n ag-cosmos \
    || az monitor action-group create -g "$RG_PROD" -n ag-cosmos --short-name cosmos \
         --action email soporte "$SOPORTE_EMAIL" -o none
  local app_id
  app_id=$(az containerapp show -g "$RG_PROD" -n "$APP_PROD" --query id -o tsv)
  existe az monitor metrics alert show -g "$RG_PROD" -n api-errores-5xx \
    || az monitor metrics alert create -g "$RG_PROD" -n api-errores-5xx --scopes "$app_id" -o none \
         --condition "total Requests > 20 where statusCodeCategory includes 5xx" \
         --window-size 5m --evaluation-frequency 1m --action ag-cosmos --severity 2
  existe az monitor metrics alert show -g "$RG_PROD" -n api-reinicios \
    || az monitor metrics alert create -g "$RG_PROD" -n api-reinicios --scopes "$app_id" -o none \
         --condition "total RestartCount > 3" --window-size 15m --action ag-cosmos --severity 2
}

github_oidc() {
  paso "Identidad de GitHub Actions (paso 11)"
  existe az identity show -g "$RG_PROD" -n "$ID_GITHUB" || az identity create -g "$RG_PROD" -n "$ID_GITHUB" -o none
  local pid e g
  pid=$(az identity show -g "$RG_PROD" -n "$ID_GITHUB" --query principalId -o tsv)
  for e in produccion qa; do
    existe az identity federated-credential show -g "$RG_PROD" --identity-name "$ID_GITHUB" -n "gh-$e" \
      || az identity federated-credential create -g "$RG_PROD" --identity-name "$ID_GITHUB" -n "gh-$e" -o none \
           --issuer https://token.actions.githubusercontent.com \
           --subject "repo:$GH_REPO:environment:$e" --audiences api://AzureADTokenExchange
  done
  rol "$pid" AcrPush "$(acr_id)"
  rol "$pid" Reader "$(acr_id)"            # az acr login lee el registro por ARM
  for g in "$RG_PROD" "$RG_QA"; do
    rol "$pid" "Container Apps Contributor" "$(az group show -n "$g" --query id -o tsv)" \
      || rol "$pid" Contributor "$(az group show -n "$g" --query id -o tsv)"
  done
}

# Configura los environments de GitHub si hay sesion de gh con permisos.
github_config() {
  paso "Environments de GitHub (paso 12)"
  if ! command -v gh > /dev/null || ! gh auth status > /dev/null 2>&1 || ! gh repo view "$GH_REPO" > /dev/null 2>&1; then
    pendiente "Configurar GitHub: 'gh auth login' y relanzar, o cargar a mano lo que imprime el resumen"
    return 0
  fi
  local cid tid x token
  cid=$(az identity show -g "$RG_PROD" -n "$ID_GITHUB" --query clientId -o tsv)
  tid=$(az account show --query tenantId -o tsv)
  for x in prod qa; do
    amb "$x"
    gh api -X PUT "repos/$GH_REPO/environments/$GH_ENV" > /dev/null
    gh variable set AZURE_CLIENT_ID --env "$GH_ENV" --body "$cid" -R "$GH_REPO"
    gh variable set AZURE_TENANT_ID --env "$GH_ENV" --body "$tid" -R "$GH_REPO"
    gh variable set AZURE_SUBSCRIPTION_ID --env "$GH_ENV" --body "$SUB" -R "$GH_REPO"
    gh variable set ACR_NAME --env "$GH_ENV" --body "$ACR" -R "$GH_REPO"
    gh variable set RG --env "$GH_ENV" --body "$RG" -R "$GH_REPO"
    gh variable set APP_NAME --env "$GH_ENV" --body "$APP" -R "$GH_REPO"
    token=$(az staticwebapp secrets list -g "$RG" -n "$SWA" --query properties.apiKey -o tsv)
    printf '%s' "$token" | gh secret set SWA_TOKEN --env "$GH_ENV" -R "$GH_REPO"
    info "Environment $GH_ENV configurado."
  done
  gh variable set AZURE_DEPLOY_ENABLED --body true -R "$GH_REPO"
  pendiente "GitHub > Settings > Environments > produccion: anadir revisores requeridos y limitar a la rama main"
}

registros_dns() {
  paso "Registros DNS (paso 10)"
  local x swa_host fqdn txt
  for x in prod qa; do
    amb "$x"
    swa_host=$(az staticwebapp show -g "$RG" -n "$SWA" --query defaultHostname -o tsv)
    fqdn=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
    txt=$(az containerapp show -g "$RG" -n "$APP" --query properties.customDomainVerificationId -o tsv)
    if [ -n "$CF_API_TOKEN" ]; then
      cf_registro TXT "asuid.$API" "$txt"
      if [ "$E" = qa ]; then
        cf_registro CNAME "$FRONT" "$swa_host"
        cf_registro CNAME "$API" "$fqdn"
      else
        cf_bajar_ttl "$FRONT"; cf_bajar_ttl "$API"
      fi
    fi
  done
  if [ -z "$CF_API_TOKEN" ]; then
    solicitud_dns
    pendiente "Enviar ~/solicitud-dns-cosmos.md al area de DNS (solicitud 1 ahora; la 2 es para el corte)"
  fi
}

# Escribe la solicitud para el area que administra el DNS, con los valores
# reales de Azure. Se puede regenerar cuando haga falta: instalar.sh dns
solicitud_dns() {
  local f="$HOME/solicitud-dns-cosmos.md" x
  local p_swa p_fqdn p_txt q_swa q_fqdn q_txt act_front act_api
  amb prod
  p_swa=$(az staticwebapp show -g "$RG" -n "$SWA" --query defaultHostname -o tsv)
  p_fqdn=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
  p_txt=$(az containerapp show -g "$RG" -n "$APP" --query properties.customDomainVerificationId -o tsv)
  amb qa
  q_swa=$(az staticwebapp show -g "$RG" -n "$SWA" --query defaultHostname -o tsv)
  q_fqdn=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
  q_txt=$(az containerapp show -g "$RG" -n "$APP" --query properties.customDomainVerificationId -o tsv)
  # Lo que resuelven hoy, como referencia para la vuelta atras.
  act_front=$(destino_actual "$FRONT_PROD_HOST")
  act_api=$(destino_actual "$API_PROD_HOST")

  cat > "$f" <<EOF
# Solicitud de cambios DNS: Cosmos Check-In a Azure

Zona: **$DOMINIO**. Generado el $(date '+%d/%m/%Y %H:%M').

Condiciones para todos los registros:

- **TTL 300 s**.
- Si la zona esta en Cloudflare: **"DNS only"** (nube gris), sin proxy. Con
  proxy, Azure no puede validar el dominio ni emitir el certificado HTTPS.
- Los valores se copian tal cual, sin punto final ni comillas.

## Solicitud 1: ahora (no afecta a produccion)

Registros nuevos para el ambiente de QA y validaciones de dominio:

| Nombre | Tipo | Valor | Para que |
|---|---|---|---|
| \`${FRONT_QA_HOST%.$DOMINIO}\` | CNAME | \`$q_swa\` | Panel de QA |
| \`${API_QA_HOST%.$DOMINIO}\` | CNAME | \`$q_fqdn\` | API de QA |
| \`asuid.${API_QA_HOST%.$DOMINIO}\` | TXT | \`$q_txt\` | Azure valida que el dominio es nuestro |
| \`asuid.${API_PROD_HOST%.$DOMINIO}\` | TXT | \`$p_txt\` | Igual, para produccion. No cambia el trafico |

Y en los registros que **ya existen** de produccion, solo bajar el TTL a 300 s,
**sin cambiar su destino**:

- \`${FRONT_PROD_HOST%.$DOMINIO}\`
- \`${API_PROD_HOST%.$DOMINIO}\`

Esto ultimo se pide con al menos 48 h de antelacion al corte: asi el cambio
del dia del corte se aplica en minutos y se puede deshacer igual de rapido.

## Solicitud 2: el dia del corte, a la hora acordada

Se avisa por el canal acordado al empezar la ventana. Reemplazar el destino de
estos dos registros existentes (pasan a ser CNAME si hoy son de otro tipo):

| Nombre | Tipo | Valor nuevo |
|---|---|---|
| \`${FRONT_PROD_HOST%.$DOMINIO}\` | CNAME | \`$p_swa\` |
| \`${API_PROD_HOST%.$DOMINIO}\` | CNAME | \`$p_fqdn\` |

Confirmar en cuanto este hecho: del otro lado se espera a que resuelva para
emitir los certificados.

### Vuelta atras

Si hubiera que revertir, volver a dejar estos registros como estaban. Hoy
resuelven a:

- \`$FRONT_PROD_HOST\`: ${act_front:-sin respuesta}
- \`$API_PROD_HOST\`: ${act_api:-sin respuesta}

Si la zona usa proxy de Cloudflare, esos valores son IPs de Cloudflare: el
destino real hay que tomarlo del panel antes del cambio.
EOF
  info "Solicitud para el area de DNS: $f"
}

# Enlaza los dominios cuyo DNS ya apunta a Azure. Lo que no, queda pendiente.
dominios() { # <prod|qa> [espera_en_minutos]
  amb "$1"
  paso "Dominios de $E (paso 15)"
  local espera="${2:-0}" swa_host fqdn i
  swa_host=$(az staticwebapp show -g "$RG" -n "$SWA" --query defaultHostname -o tsv)
  fqdn=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
  for ((i = 0; i <= espera; i++)); do
    if apunta_a "$FRONT" "$swa_host" && apunta_a "$API" "$fqdn"; then break; fi
    if [ "$i" -lt "$espera" ]; then info "esperando DNS ($i/$espera min)..."; sleep 60; fi
  done

  if apunta_a "$FRONT" "$swa_host"; then
    if [ "$(az staticwebapp hostname show -g "$RG" -n "$SWA" --hostname "$FRONT" --query status -o tsv 2>/dev/null)" = Ready ]; then
      info "$FRONT ya enlazado."
    else
      reintentar 3 60 az staticwebapp hostname set -g "$RG" -n "$SWA" --hostname "$FRONT" -o none
      info "$FRONT enlazado; SWA emite el certificado."
    fi
  else
    pendiente "$FRONT aun no apunta a $swa_host. Despues: instalar.sh dominios $E"
  fi

  if apunta_a "$API" "$fqdn"; then
    if [ -z "$(az containerapp hostname list -g "$RG" -n "$APP" --query "[?name=='$API'].name | [0]" -o tsv 2>/dev/null)" ]; then
      reintentar 5 60 az containerapp hostname add -g "$RG" -n "$APP" --hostname "$API" -o none
    fi
    if [ "$(az containerapp hostname list -g "$RG" -n "$APP" --query "[?name=='$API'].bindingType | [0]" -o tsv)" != SniEnabled ]; then
      reintentar 3 120 az containerapp hostname bind -g "$RG" -n "$APP" --hostname "$API" \
        --environment "$ENVN" --validation-method CNAME -o none
    fi
    info "https://$API listo."
  else
    pendiente "$API aun no apunta a $fqdn. Despues: instalar.sh dominios $E"
  fi
}

# Paso 21: lleva produccion a Azure. Antes, la migracion de datos (paso 20).
corte() {
  amb prod
  paso "Corte de produccion"
  cat <<EOF
Antes de seguir, el paso 20 debe estar hecho:
  1. Backend de Coolify detenido.
  2. Volcado restaurado en $DB y conteos iguales (infra/azure/conteos.js).
  3. Regla temporal de firewall cerrada (instalar.sh ip prod cerrar <ip>).
Los APK no conectaran durante los minutos que tarde el certificado de $API.
EOF
  local r
  read -r -p "Escribir CORTE para continuar: " r
  [ "$r" = CORTE ] || error "cancelado"
  local swa_host fqdn
  swa_host=$(az staticwebapp show -g "$RG" -n "$SWA" --query defaultHostname -o tsv)
  fqdn=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
  if [ -n "$CF_API_TOKEN" ]; then
    cf_registro CNAME "$FRONT" "$swa_host"
    cf_registro CNAME "$API" "$fqdn"
  else
    echo "Pedir ahora al area de DNS la solicitud 2 de ~/solicitud-dns-cosmos.md:"
    echo "  CNAME $FRONT -> $swa_host"
    echo "  CNAME $API -> $fqdn"
    echo "Se espera hasta 60 minutos a que resuelva. Si tardan mas: instalar.sh dominios prod"
  fi
  dominios prod 60
  resumen
}

ip_temporal() { # <prod|qa> <abrir|cerrar> [ip]
  amb "$1"
  local ip="${3:-$(curl -fsS https://api.ipify.org)}" rule
  rule="$DB/tmp-$(echo "$ip" | tr . -)"
  case "${2:-}" in
    abrir)
      az resource create -g "$RG" --resource-type Microsoft.DocumentDB/mongoClusters/firewallRules \
        -n "$rule" --api-version 2025-09-01 -o none \
        -p "{\"properties\":{\"startIpAddress\":\"$ip\",\"endIpAddress\":\"$ip\"}}"
      echo "Abierta $ip en $DB. URI en: az keyvault secret show --vault-name $KVA -n mongo-uri --query value -o tsv"
      echo "Cerrar con: $0 ip $E cerrar $ip" ;;
    cerrar)
      az resource delete -g "$RG" --resource-type Microsoft.DocumentDB/mongoClusters/firewallRules \
        -n "$rule" --api-version 2025-09-01 -o none
      echo "Cerrada $ip en $DB." ;;
    *) error "usar: ip <prod|qa> <abrir|cerrar> [ip]" ;;
  esac
}

resumen() {
  paso "Resumen"
  local x
  for x in prod qa; do
    amb "$x"
    info "$E: panel https://$FRONT  (Azure: https://$(az staticwebapp show -g "$RG" -n "$SWA" --query defaultHostname -o tsv))"
    info "$E: API   https://$API  (Azure: https://$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv))"
  done
  info "GitHub: AZURE_CLIENT_ID=$(az identity show -g "$RG_PROD" -n "$ID_GITHUB" --query clientId -o tsv 2>/dev/null || echo '?')"
  info "        AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)  AZURE_SUBSCRIPTION_ID=$SUB  ACR_NAME=$ACR"
  info "El panel se publica con el primer push a develop (QA) y a main (prod)."
  echo
  echo "Siempre a mano (no se automatizan):"
  info "- Presupuesto mensual con alertas al 50/80/100 % (Cost Management > Budgets)"
  info "- Alerta de CPU y almacenamiento de los clusters al 80 % (portal > Alerts)"
  info "- Datos: restaurar una copia en QA y probar; en el corte, migrar prod (paso 20)"
  if [ -s "$PENDIENTES" ]; then
    echo; echo "Pendientes de esta ejecucion:"
    sed 's/^/   - /' "$PENDIENTES"
  fi
  echo; echo "Registro: $LOG"
}

instalar() {
  comprobar
  proveedores
  grupos
  base
  base_datos qa
  base_datos prod
  imagenes
  identidades
  static_web_apps
  entornos
  app prod "$ENV_FILE_PROD"
  app qa "$ENV_FILE_QA"
  respaldos
  suave "Alertas de la API" alertas
  github_oidc
  suave "Configuracion de GitHub" github_config
  suave "Registros DNS" registros_dns
  # Sin token, los registros los crea otra area: no tiene sentido esperarlos.
  if [ -n "$CF_API_TOKEN" ]; then suave "Dominios de QA" dominios qa 10; fi
  resumen
}

# ================================================================= entrada
exec > >(tee -a "$LOG") 2>&1

case "${1:-}" in
  promover) amb "${2:-}"; promover "$2" ;;
  ip)       ip_temporal "${2:-}" "${3:-}" "${4:-}" ;;
  dominios) dominios "${2:-}" "${3:-0}"; resumen ;;
  corte)    corte ;;
  dns)      solicitud_dns; cat "$HOME/solicitud-dns-cosmos.md" ;;
  ""|-h|--help)
    sed -n '2,/^set -E/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'
    [ -n "${1:-}" ] || exit 1 ;;
  *)
    ENV_FILE_PROD="$1"
    ENV_FILE_QA="${2:-}"     # vacio: lo crea preparar_qa_env
    instalar ;;
esac
