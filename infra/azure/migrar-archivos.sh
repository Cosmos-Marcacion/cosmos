#!/usr/bin/env bash
# Pasa los archivos de la app (firmas, fotos, QR) de AWS S3 a Azure Blob Storage.
#
# Se lanza en Azure Cloud Shell (Bash), desde la raiz del repositorio:
#
#   export PROY=cosmosck
#   ./infra/azure/migrar-archivos.sh qa              # primero en QA
#   ./infra/azure/migrar-archivos.sh prod            # despues del corte de datos
#   ./infra/azure/migrar-archivos.sh <qa|prod> revertir   # vuelta atras
#
# Requisito: la API desplegada debe ser la version que sabe escribir en Azure
# (su /health devuelve "storage"). Hasta que este script la cambia, sigue en S3.
#
# Que hace, en orden:
#   1. Comprueba la API y, en prod, que el corte de datos ya se hizo.
#   2. Crea la cuenta st<PROY>archivos y el contenedor del ambiente, con
#      lectura publica por blob (como hoy en S3), y da a la identidad de la API
#      permiso de escritura solo en ese contenedor.
#   3. Cambia la API a Azure (STORAGE_PROVIDER=azure) y le pasa el trafico. Desde
#      aqui lo nuevo se sube a Azure.
#   4. Busca en la base todas las urls de S3, descarga cada archivo y lo sube
#      al contenedor (s3/<bucket>/<clave>). S3 no se toca.
#   5. Sustituye en la base las urls copiadas por las nuevas y guarda el mapa
#      (vieja -> nueva) para poder revertir.
#   6. Comprueba que no quedan urls de S3 y que las nuevas responden.
#
# Se puede relanzar: copia de nuevo lo que quede en S3 y no repite lo hecho.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROY="${PROY:-cosmosck}"
# shellcheck source=vars.sh
source "$DIR/vars.sh"
# shellcheck source=lib-mongo.sh
source "$DIR/lib-mongo.sh"

BASE="cosmos"
TRABAJO="$HOME/migracion"
LOG="$HOME/cosmos-archivos-$(date +%Y%m%d-%H%M%S).log"
TMP="$(mktemp -d)"
PASO="inicio"
NUEVOS_ROLES=0

paso() { PASO="$1"; printf '\n\033[1m== %s\033[0m\n' "$1"; }
info() { printf '   %s\n' "$*"; }
error() { echo "ERROR: $*" >&2; exit 1; }

E="${1:-}" ACCION="${2:-migrar}"
case "$E" in
  prod) RG=$RG_PROD DB=$DB_PROD KVA=$KV_PROD APP=$APP_PROD IDN=$ID_PROD CONT=$CONT_ARCHIVOS_PROD API=$API_PROD_HOST ;;
  qa)   RG=$RG_QA   DB=$DB_QA   KVA=$KV_QA   APP=$APP_QA   IDN=$ID_QA   CONT=$CONT_ARCHIVOS_QA   API=$API_QA_HOST ;;
  *) sed -n '2,/^set -E/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
case "$ACCION" in migrar|revertir) ;; *) error "accion '$ACCION': usar migrar o revertir" ;; esac

exec > >(tee -a "$LOG") 2>&1
fin() { cerrar_firewall; rm -rf "$TMP"; }
trap fin EXIT
al_fallar() {
  local rc=$?
  echo
  echo "ERROR en el paso '$PASO' (linea $1, codigo $rc):"
  echo "  $2"
  echo "S3 no se ha tocado. Corregir y relanzar el mismo comando."
  echo "Registro completo: $LOG"
  exit "$rc"
}
trap 'al_fallar $LINENO "$BASH_COMMAND"' ERR

BLOB_HOST="$ST_ARCHIVOS.blob.core.windows.net"
BLOB_BASE="https://$BLOB_HOST/$CONT"

# ------------------------------------------------------------------ utilidades
fqdn_api() { az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv; }
storage_api() { curl -fsS --max-time 15 "https://$(fqdn_api)/health" | jq -r '.storage // empty'; }
env_api() { # <nombre>
  az containerapp show -g "$RG" -n "$APP" -o json \
    | jq -r --arg n "$1" '.properties.template.containers[0].env[]? | select(.name==$n) | .value // empty'
}
clave_cuenta() { az storage account keys list -g "$RG_PROD" -n "$ST_ARCHIVOS" --query '[0].value' -o tsv; }

rol() { # <principalId> <rol> <scope>
  local n
  n=$(az role assignment list --assignee "$1" --role "$2" --scope "$3" --query "length(@)" -o tsv 2>/dev/null || echo 0)
  [ "${n:-0}" -gt 0 ] && return 0
  local i
  for i in 1 2 3 4 5 6; do
    az role assignment create --assignee-object-id "$1" --assignee-principal-type ServicePrincipal \
      --role "$2" --scope "$3" -o none && { NUEVOS_ROLES=1; return 0; }
    sleep 20
  done
  error "no se pudo asignar '$2' en $3"
}

# Cambia la API de almacenamiento y le pasa el trafico cuando responde.
cambiar_api() { # <s3|azure>
  if [ "$1" = azure ]; then
    local cid
    cid=$(az identity show -g "$RG" -n "$IDN" --query clientId -o tsv)
    az containerapp update -g "$RG" -n "$APP" -o none --set-env-vars \
      STORAGE_PROVIDER=azure AZURE_STORAGE_ACCOUNT="$ST_ARCHIVOS" AZURE_STORAGE_CONTAINER="$CONT" AZURE_CLIENT_ID="$cid"
  else
    az containerapp update -g "$RG" -n "$APP" -o none --set-env-vars STORAGE_PROVIDER=s3
  fi
  # Revisiones multiples: la nueva nace sin trafico hasta que pasa /health/ready.
  "$DIR/instalar.sh" promover "$E"
  local i
  for i in $(seq 1 12); do
    [ "$(storage_api || true)" = "$1" ] && { info "La API guarda los archivos en: $1"; return 0; }
    sleep 10
  done
  error "la API no informa storage=$1 tras el cambio"
}

base_abierta() {
  local dest
  dest=$(az keyvault secret show --vault-name "$KVA" -n mongo-uri --query value -o tsv) \
    || error "no se pudo leer mongo-uri de $KVA"
  DESTINO=$(con_base "$dest" "$BASE")
  abrir_firewall "$(ip_publica)" "$DESTINO"
}

# Sube un fichero a la cuenta de respaldos (migracion/), si se puede.
guardar_en_respaldos() { # <fichero>
  local k
  k=$(az storage account keys list -g "$RG_PROD" -n "$ST" --query '[0].value' -o tsv 2>/dev/null || true)
  if [ -n "$k" ] && az storage blob upload --account-name "$ST" --account-key "$k" -c respaldos \
       -n "migracion/$(basename "$1")" -f "$1" --overwrite --only-show-errors -o none 2>/dev/null; then
    info "Copia en $ST/respaldos/migracion/$(basename "$1")"
  fi
}

# ------------------------------------------------------------------- 1. previos
previos() {
  paso "Comprobaciones"
  az account show -o none 2> /dev/null || error "sin sesion de Azure: az login"
  if [[ "$SUB" != "<"* ]]; then az account set -s "$SUB"; fi
  info "Suscripcion: $(az account show --query name -o tsv)"
  az containerapp show -g "$RG" -n "$APP" -o none 2> /dev/null || error "no existe $APP en $RG. Exportar PROY=cosmosck?"

  local s="" i
  # QA escala a cero: la primera peticion despierta la API y puede tardar.
  for i in $(seq 1 9); do
    s=$(storage_api || true)
    [ -n "$s" ] && break
    [ "$(curl -fsS --max-time 15 "https://$(fqdn_api)/health" 2>/dev/null | jq -r '.status // empty')" = ok ] && break
    sleep 10
  done
  [ -n "$s" ] || error "la API desplegada en $APP no informa 'storage' en /health: es una version anterior.
  Desplegar primero el cambio del backend (push a develop para QA, PR a main para prod) y relanzar."
  info "API desplegada con soporte de Azure Blob (hoy usa: $s)."

  if [ "$E" = prod ] && [ "$ACCION" = migrar ] && [ "${FORZAR:-0}" != 1 ]; then
    local cname
    cname=$(curl -fsS -H 'accept: application/dns-json' "https://cloudflare-dns.com/dns-query?name=$API&type=CNAME" \
      | jq -r '.Answer[]?.data' | tr 'A-Z' 'a-z')
    if [[ "$cname" != *azurecontainerapps.io* ]]; then
      error "$API aun no apunta a Azure: el corte de datos no se ha hecho.
  Las urls se reescriben en la base de Azure; si despues se vuelve a copiar la base desde Atlas,
  se pierde el cambio. Hacer antes el corte (migrar-datos.sh prod), o FORZAR=1 si se sabe lo que se hace."
    fi
    info "$API ya apunta a Azure."
  fi
}

# ------------------------------------------------------------ 2. almacenamiento
almacenamiento() {
  paso "Cuenta $ST_ARCHIVOS y contenedor $CONT"
  if ! az storage account show -g "$RG_PROD" -n "$ST_ARCHIVOS" -o none 2> /dev/null; then
    if ! az storage account create -g "$RG_PROD" -n "$ST_ARCHIVOS" -l "$LOC" --sku Standard_LRS --kind StorageV2 \
         --min-tls-version TLS1_2 --allow-blob-public-access true --https-only true -o none; then
      error "no se pudo crear $ST_ARCHIVOS. Si el error menciona una directiva (RequestDisallowedByPolicy),
  la organizacion prohibe el acceso publico a blobs: pedir una excepcion para esta cuenta."
    fi
    info "Cuenta creada."
  fi
  # Por si se creo antes sin acceso publico: el panel muestra las imagenes con <img>.
  az storage account update -g "$RG_PROD" -n "$ST_ARCHIVOS" --allow-blob-public-access true -o none
  if ! az storage container-rm show --storage-account "$ST_ARCHIVOS" -n "$CONT" -o none 2> /dev/null; then
    az storage container-rm create --storage-account "$ST_ARCHIVOS" -n "$CONT" --public-access blob -o none
    info "Contenedor creado (lectura publica por blob, sin listado)."
  else
    az storage container-rm update --storage-account "$ST_ARCHIVOS" -n "$CONT" --public-access blob -o none
  fi

  local pid scope
  pid=$(az identity show -g "$RG" -n "$IDN" --query principalId -o tsv)
  scope="$(az storage account show -g "$RG_PROD" -n "$ST_ARCHIVOS" --query id -o tsv)/blobServices/default/containers/$CONT"
  rol "$pid" "Storage Blob Data Contributor" "$scope"
  if [ "$NUEVOS_ROLES" = 1 ]; then info "esperando 90 s a que se propague el permiso..."; sleep 90; fi
  info "$IDN puede escribir en $CONT."
}

# ------------------------------------------------------------- 4. y 5. copia
copiar_y_reescribir() {
  base_abierta
  mkdir -p "$TRABAJO"

  paso "Inventario de urls de S3 en la base"
  BLOB_BASE="$BLOB_BASE" "$HERR/bin/mongosh" "$DESTINO" --quiet --file "$DIR/archivos/inventario.js" > "$TMP/inventario.tsv"
  local total invalidas
  total=$(grep -vc '^INVALIDA' "$TMP/inventario.tsv" || true)
  invalidas=$(grep -c '^INVALIDA' "$TMP/inventario.tsv" || true)
  info "$total urls distintas de S3; $invalidas que no se pueden interpretar."
  grep '^INVALIDA' "$TMP/inventario.tsv" | cut -f2 | sed 's/^/     no valida: /' || true
  if [ "${total:-0}" = 0 ]; then info "Nada que copiar."; return 0; fi

  paso "Copia de S3 a $ST_ARCHIVOS/$CONT"
  local k raw descarga nombre nueva r http tipo ok=0 fallos=0 perdidos=0
  k=$(clave_cuenta)
  MAPA="$TRABAJO/archivos-$E-$(date -u +%Y%m%d-%H%M%S).tsv"
  PERDIDOS="$TRABAJO/archivos-$E-no-existen.txt"
  : > "$MAPA"; : > "$PERDIDOS"
  while IFS=$'\t' read -r raw descarga nombre nueva; do
    [ "$raw" = INVALIDA ] && continue
    r=$(curl -sS --max-time 60 -o "$TMP/archivo" -w '%{http_code} %{content_type}' "$descarga" < /dev/null || echo "000 ")
    http="${r%% *}" tipo="${r#* }"
    if [ "$http" = 404 ]; then
      # El archivo o el bucket ya no existen: la url ya estaba rota antes de migrar.
      perdidos=$((perdidos + 1)); printf '%s\n' "$raw" >> "$PERDIDOS"; continue
    fi
    if [ "$http" != 200 ]; then
      fallos=$((fallos + 1)); info "FALLO al descargar ($http) $descarga"; continue
    fi
    [ -n "$tipo" ] || tipo=application/octet-stream
    if ! az storage blob upload --account-name "$ST_ARCHIVOS" --account-key "$k" -c "$CONT" -n "$nombre" \
         -f "$TMP/archivo" --content-type "$tipo" --overwrite --only-show-errors -o none < /dev/null; then
      fallos=$((fallos + 1)); info "FALLO al subir $nombre"; continue
    fi
    if ! curl -fsS --max-time 30 -o /dev/null "$nueva"; then
      fallos=$((fallos + 1)); info "FALLO: $nueva no responde en publico"; continue
    fi
    printf '%s\t%s\n' "$raw" "$nueva" >> "$MAPA"
    ok=$((ok + 1))
  done < "$TMP/inventario.tsv"
  info "Copiados: $ok. Ya no existian en S3: $perdidos. Fallidos: $fallos."
  [ "$perdidos" = 0 ] || info "Las que no existian ya se veian rotas; se dejan igual. Lista: $PERDIDOS"
  [ "$fallos" = 0 ] || info "Las fallidas no se cambian: relanzar el script las reintenta."
  if [ "$ok" = 0 ]; then
    [ "$fallos" = 0 ] || error "no se pudo copiar ningun archivo"
    info "Nada que reescribir."; return 0
  fi

  paso "Reescritura de urls en la base"
  MAPA="$MAPA" "$HERR/bin/mongosh" "$DESTINO" --quiet --file "$DIR/archivos/reescribir.js" | sed 's/^/   /'
  info "Mapa guardado (para revertir): $MAPA"
  guardar_en_respaldos "$MAPA"

  paso "Verificacion"
  BLOB_BASE="$BLOB_BASE" "$HERR/bin/mongosh" "$DESTINO" --quiet --file "$DIR/archivos/inventario.js" > "$TMP/quedan.tsv"
  local quedan
  quedan=$(grep -vc '^INVALIDA' "$TMP/quedan.tsv" || true)
  if [ "${quedan:-0}" = 0 ]; then
    info "No queda ninguna url de S3 en la base."
  else
    local rotas
    rotas=$(grep -v '^INVALIDA' "$TMP/quedan.tsv" | cut -f1 | grep -Fxc -f "$PERDIDOS" || true)
    info "Quedan $quedan urls de S3: $rotas ya no existian en S3 y $((quedan - rotas)) fallaron."
    info "Apagar S3 no cambia nada para las que no existian. Las que fallaron dependen de S3 todavia."
  fi
}

# ----------------------------------------------------------------- revertir
revertir() {
  local mapa="${MAPA:-}"
  [ -n "$mapa" ] || mapa=$(ls -1t "$TRABAJO"/archivos-"$E"-*.tsv 2> /dev/null | head -1 || true)
  [ -n "$mapa" ] && [ -s "$mapa" ] || error "no hay mapa en $TRABAJO (archivos-$E-*.tsv). Pasarlo con MAPA=<fichero>."
  paso "Vuelta atras con $(basename "$mapa")"
  read -rp "   Escribir REVERTIR para devolver la API y las urls a S3: " r
  [ "$r" = REVERTIR ] || error "cancelado"
  cambiar_api s3
  base_abierta
  MAPA="$mapa" INVERTIR=1 "$HERR/bin/mongosh" "$DESTINO" --quiet --file "$DIR/archivos/reescribir.js" | sed 's/^/   /'
  cerrar_firewall
  info "Hecho. Lo subido a Azure mientras tanto sigue alli y se sigue viendo."
}

# -------------------------------------------------------------------- entrada
herramientas
previos
if [ "$ACCION" = revertir ]; then
  revertir
else
  almacenamiento
  paso "API a Azure Blob"
  if [ "$(env_api STORAGE_PROVIDER)" = azure ] && [ "$(storage_api || true)" = azure ]; then
    info "Ya estaba en Azure."
  else
    cambiar_api azure
  fi
  copiar_y_reescribir
  cerrar_firewall
  paso "Listo"
  info "Archivos de $E en $BLOB_BASE"
  info "Probar en el panel: fotos de empleados, firma en un formato PDF y subir una foto nueva."
  if [ "$E" = prod ]; then
    info "Con las pruebas bien y sin urls de S3 en la base, S3 se puede apagar: la API ya no lo usa."
    info "Recomendado: esperar 7 dias y guardar antes una copia completa de los buckets."
  fi
fi
info "Registro: $LOG"
