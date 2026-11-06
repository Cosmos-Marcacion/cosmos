#!/usr/bin/env bash
# Migra la base "cosmos" de MongoDB Atlas a Azure DocumentDB.
#
# Se lanza en Azure Cloud Shell (Bash), desde la raiz del repositorio:
#
#   export PROY=cosmosck
#   ./infra/azure/migrar-datos.sh qa       # ensayo: copia de produccion en QA
#   ./infra/azure/migrar-datos.sh prod     # corte: con Coolify ya detenido
#
# Que hace, en orden:
#   1. Instala mongodump/mongorestore y mongosh en ~/.local/mongo (Cloud Shell
#      no los trae ni tiene Docker). Solo la primera vez.
#   2. Pide la URI de Atlas (o la toma de Key Vault, o de ATLAS_URI) y la
#      guarda en kv-<PROY>-prod como "atlas-origen-uri" para la proxima vez.
#   3. Muestra la IP publica de esta sesion y espera a que Atlas la acepte.
#   4. Abre esa IP en el firewall de DocumentDB del ambiente (se cierra al
#      terminar, tambien si falla).
#   5. En prod: pide confirmacion y comprueba que nadie escribe en Atlas.
#   6. Vuelca SOLO la base "cosmos" (el cluster de Atlas es compartido).
#   7. Restaura en DocumentDB reemplazando lo que haya (--drop), sin indices.
#   8. Crea los indices uno a uno y dice cuales no admite DocumentDB.
#   9. Compara documentos e indices por coleccion, origen contra destino.
#  10. Guarda el volcado en la cuenta de respaldos (migracion/).
#  11. En prod: comprueba la API y lanza el primer respaldo programado.
#
# Atlas no se modifica en ningun momento: es la vuelta atras.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROY="${PROY:-cosmosck}"
# shellcheck source=vars.sh
source "$DIR/vars.sh"
# shellcheck source=lib-mongo.sh
source "$DIR/lib-mongo.sh"

BASE="cosmos"                           # base de origen y de destino
TRABAJO="$HOME/migracion"               # volcados (fuera del repositorio)
SECRETO_ATLAS="atlas-origen-uri"
LOG="$HOME/cosmos-migracion-$(date +%Y%m%d-%H%M%S).log"
TMP="$(mktemp -d)"
PASO="inicio"

paso() { PASO="$1"; printf '\n\033[1m== %s\033[0m\n' "$1"; }
info() { printf '   %s\n' "$*"; }
error() { echo "ERROR: $*" >&2; exit 1; }

# --------------------------------------------------------------- ambiente
E="${1:-}"
case "$E" in
  prod) RG=$RG_PROD DB=$DB_PROD KVA=$KV_PROD APP=$APP_PROD ;;
  qa)   RG=$RG_QA   DB=$DB_QA   KVA=$KV_QA   APP=$APP_QA ;;
  *) sed -n '2,/^set -E/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; exit 1 ;;
esac

exec > >(tee -a "$LOG") 2>&1

fin() { cerrar_firewall; rm -rf "$TMP"; }
trap fin EXIT
al_fallar() {
  local rc=$?
  echo
  echo "ERROR en el paso '$PASO' (linea $1, codigo $rc):"
  echo "  $2"
  [ "$E" = prod ] && echo "Atlas no se ha tocado. Si estabas en el corte: volver a arrancar el backend en Coolify."
  echo "Registro completo: $LOG"
  exit "$rc"
}
trap 'al_fallar $LINENO "$BASH_COMMAND"' ERR

# ------------------------------------------------------------- 2. accesos
accesos() {
  paso "Accesos"
  az account show -o none 2> /dev/null || error "sin sesion de Azure: az login"
  if [[ "$SUB" != "<"* ]]; then az account set -s "$SUB"; fi
  info "Suscripcion: $(az account show --query name -o tsv)"
  az group show -n "$RG" -o none 2> /dev/null || error "no existe $RG. Exportar PROY=cosmosck?"

  DEST=$(az keyvault secret show --vault-name "$KVA" -n mongo-uri --query value -o tsv 2> /dev/null) \
    || error "no se pudo leer mongo-uri de $KVA (hace falta Key Vault Secrets Officer/User)"

  if [ -z "${ATLAS_URI:-}" ]; then
    ATLAS_URI=$(az keyvault secret show --vault-name "$KV_PROD" -n "$SECRETO_ATLAS" --query value -o tsv 2> /dev/null || true)
    [ -n "$ATLAS_URI" ] && info "URI de Atlas tomada de $KV_PROD/$SECRETO_ATLAS"
  fi
  if [ -z "${ATLAS_URI:-}" ]; then
    echo "   Pega la URI de Atlas (la MONGO_URI del backend: mongodb+srv://usuario:clave@...mongodb.net/...)."
    echo "   No se muestra al escribir."
    read -rsp "   URI: " ATLAS_URI; echo
    ATLAS_URI="${ATLAS_URI//\"/}"; ATLAS_URI="${ATLAS_URI//\'/}"
    [[ "$ATLAS_URI" == mongodb* ]] || error "la URI debe empezar por mongodb:// o mongodb+srv://"
    az keyvault secret set --vault-name "$KV_PROD" -n "$SECRETO_ATLAS" --value "$ATLAS_URI" -o none \
      && info "Guardada en $KV_PROD/$SECRETO_ATLAS para la proxima ejecucion."
  fi
  ORIGEN_DUMP=$(con_base "$ATLAS_URI" "")
  ORIGEN=$(con_base "$ATLAS_URI" "$BASE")
  DESTINO_RESTORE=$(con_base "$DEST" "")
  DESTINO=$(con_base "$DEST" "$BASE")
  info "Origen:  $(host_de "$ATLAS_URI") / $BASE"
  info "Destino: $(host_de "$DEST") / $BASE  ($E)"
}

# --------------------------------------------------- 3. y 4. red y firewall
red() {
  paso "Red"
  IP=$(ip_publica)
  info "IP publica de esta Cloud Shell: $IP"

  if ping_mongo "$ORIGEN"; then
    info "Atlas acepta esta IP."
  else
    echo
    echo "   Atlas no acepta la conexion. En https://cloud.mongodb.com:"
    echo "     Security > Network Access > + Add IP Address"
    echo "     Access List Entry: $IP/32"
    echo "     Comment: Cloud Shell migracion Cosmos"
    echo "     Marcar 'This entry is temporary' (6 horas) y Confirm."
    echo "   Se reintenta cada 20 s durante 15 minutos."
    local i
    for i in $(seq 1 45); do
      sleep 20
      if ping_mongo "$ORIGEN"; then info "Atlas acepta esta IP."; break; fi
      [ "$i" = 45 ] && error "Atlas sigue sin aceptar $IP. Revisar la lista y la URI (usuario y clave)."
      info "esperando a Atlas ($i/45)..."
    done
  fi

  abrir_firewall "$IP" "$DESTINO"
}

conteos() { # <uri> <salida>
  "$HERR/bin/mongosh" "$1" --quiet --file "$DIR/conteos.js" > "$2"
}

# ------------------------------------------------------- 5. solo en prod
confirmar_prod() {
  [ "$E" = prod ] || return 0
  paso "Confirmacion de produccion"
  local n
  n=$("$HERR/bin/mongosh" "$DESTINO" --quiet --eval \
    'db.getCollectionNames().filter(n => !n.startsWith("system.")).reduce((s, n) => s + db.getCollection(n).estimatedDocumentCount(), 0)')
  info "Documentos hoy en $DB/$BASE: $n (se reemplazan)."
  echo "   El backend de Coolify debe estar DETENIDO: lo que se escriba en Atlas"
  echo "   despues del volcado se pierde."
  read -rp "   Escribir MIGRAR para continuar: " r
  [ "$r" = MIGRAR ] || error "cancelado"

  info "Comprobando que nadie escribe en Atlas (30 s)..."
  conteos "$ORIGEN" "$TMP/quieto1.txt"; sleep 30; conteos "$ORIGEN" "$TMP/quieto2.txt"
  if ! diff -q "$TMP/quieto1.txt" "$TMP/quieto2.txt" > /dev/null; then
    diff "$TMP/quieto1.txt" "$TMP/quieto2.txt" | sed 's/^/     /' || true
    echo "   Los datos de Atlas cambian: algo sigue escribiendo (Coolify encendido?)."
    read -rp "   Continuar igualmente? (s/N): " r
    [ "$r" = s ] || error "cancelado: detener Coolify y relanzar"
  else
    info "Sin escrituras."
  fi
}

# ----------------------------------------------------- 6. a 9. migracion
migrar() {
  mkdir -p "$TRABAJO"
  NOMBRE="cosmos-atlas-$(date -u +%Y%m%d-%H%M%S)-$E.archive.gz"
  ARCH="$TRABAJO/$NOMBRE"

  paso "Volcado de Atlas (solo la base $BASE)"
  "$HERR/bin/mongodump" --uri="$ORIGEN_DUMP" --db="$BASE" --archive="$ARCH" --gzip
  [ "$(wc -c < "$ARCH")" -gt 1024 ] || error "el volcado esta casi vacio: revisar la URI y la base"
  info "Volcado: $ARCH ($(du -h "$ARCH" | cut -f1))"

  paso "Restauracion en $DB"
  "$HERR/bin/mongorestore" --uri="$DESTINO_RESTORE" --archive="$ARCH" --gzip \
    --nsInclude="$BASE.*" --drop --noIndexRestore --stopOnError

  paso "Indices"
  "$HERR/bin/mongosh" "$ORIGEN" --quiet --eval '
    const out = {};
    for (const n of db.getCollectionNames().filter((n) => !n.startsWith("system."))) out[n] = db.getCollection(n).getIndexes();
    print(EJSON.stringify(out));' > "$TMP/indices.json"
  local rc=0
  INDICES="$TMP/indices.json" "$HERR/bin/mongosh" "$DESTINO" --quiet --eval '
    const spec = EJSON.parse(require("fs").readFileSync(process.env.INDICES, "utf8"));
    let fallos = 0;
    for (const [c, lista] of Object.entries(spec)) {
      for (const i of lista) {
        if (i.name === "_id_") continue;
        const { v, key, ns, ...opts } = i;
        try { db.getCollection(c).createIndex(key, opts); print("   OK     " + c + "." + i.name); }
        catch (e) { fallos++; print("   FALLO  " + c + "." + i.name + ": " + e.message); }
      }
    }
    if (fallos) quit(3);' || rc=$?
  if [ "$rc" != 0 ]; then
    echo "   DocumentDB no admitio algun indice (lista arriba)."
    [ "$E" = prod ] && error "no se sigue con indices incompletos en produccion: revisarlos en QA primero"
    echo "   En QA se continua para ver el resto; corregir antes del corte."
  fi

  paso "Validacion: documentos e indices por coleccion"
  conteos "$ORIGEN" "$TRABAJO/origen-$E.txt"
  conteos "$DESTINO" "$TRABAJO/destino-$E.txt"
  if diff "$TRABAJO/origen-$E.txt" "$TRABAJO/destino-$E.txt" > "$TMP/diff.txt"; then
    info "Coinciden: $(wc -l < "$TRABAJO/origen-$E.txt") colecciones, $(awk -F'\t' '{s+=$2} END {print s}' "$TRABAJO/origen-$E.txt") documentos."
  else
    sed 's/^/     /' "$TMP/diff.txt"
    [ "$E" = prod ] && error "origen y destino NO coinciden. No seguir con el corte; arrancar Coolify."
    echo "   AVISO: no coinciden (lineas < origen, > destino)."
  fi
}

# --------------------------------------------------- 10. y 11. cierre
cierre() {
  cerrar_firewall

  paso "Copia del volcado en la cuenta de respaldos"
  if az storage blob upload --account-name "$ST" -c respaldos -n "migracion/$NOMBRE" -f "$ARCH" \
       --auth-mode key --overwrite --only-show-errors -o none 2> /dev/null; then
    info "$ST/respaldos/migracion/$NOMBRE (se borra solo a los 90 dias)"
  else
    info "AVISO: no se pudo subir; el volcado sigue en $ARCH"
  fi

  if [ "$E" = prod ]; then
    paso "API de produccion"
    local fqdn
    fqdn=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
    if curl -fsS --max-time 15 "https://$fqdn/health/ready"; then echo; else info "AVISO: /health/ready no responde en https://$fqdn"; fi
    paso "Primer respaldo programado"
    az containerapp job start -g "$RG_PROD" -n "$JOB_BACKUP" -o none \
      && info "Lanzado. Ver: az containerapp job execution list -g $RG_PROD -n $JOB_BACKUP -o table"
  fi

  paso "Listo"
  info "Base $BASE migrada a $DB ($E)."
  info "Volcado local: $ARCH"
  info "Conteos: $TRABAJO/origen-$E.txt y $TRABAJO/destino-$E.txt"
  if [ "$E" = prod ]; then
    info "Siguiente: ./infra/azure/instalar.sh corte (y avisar al area DNS)."
  else
    info "Siguiente: pruebas funcionales en QA (DESPLIEGUE.md, 5.5)."
  fi
  info "Atlas: borrar la entrada temporal de Network Access si no caduco sola."
  info "Registro: $LOG"
}

herramientas
accesos
red
confirmar_prod
migrar
cierre
