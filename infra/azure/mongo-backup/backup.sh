#!/bin/sh
# Dos modos, segun MODE:
#   backup (por defecto)  mongodump de MONGO_URI y subida a Blob Storage.
#   ping                  solo abre una conexion. Sirve para que el cluster
#                         Free de QA no se pause tras 60 dias sin conexiones.
#
# Variables: MONGO_URI, y para backup STORAGE_ACCOUNT, STORAGE_CONTAINER (por
# defecto "respaldos") y AZURE_CLIENT_ID (la identidad del job). El token sale
# de IDENTITY_ENDPOINT / IDENTITY_HEADER, que Container Apps inyecta solo.
set -eu

: "${MONGO_URI:?Falta MONGO_URI}"
MODE="${MODE:-backup}"

if [ "$MODE" = "ping" ]; then
  mongosh "$MONGO_URI" --quiet --eval 'db.runCommand({ ping: 1 }).ok'
  exit 0
fi

: "${STORAGE_ACCOUNT:?Falta STORAGE_ACCOUNT}"
: "${IDENTITY_ENDPOINT:?Sin identidad administrada: activar la identidad del job}"
CONTAINER="${STORAGE_CONTAINER:-respaldos}"
NAME="cosmos-$(date -u +%Y%m%d-%H%M).archive.gz"
FILE="/tmp/$NAME"
trap 'rm -f "$FILE"' EXIT

echo "Volcando la base..."
mongodump --uri="$MONGO_URI" --archive="$FILE" --gzip
SIZE=$(wc -c < "$FILE")
echo "Volcado: $SIZE bytes"
# Un volcado casi vacio es un respaldo fallido aunque mongodump salga con 0.
[ "$SIZE" -gt 1024 ] || { echo "El volcado es demasiado pequeno; se aborta."; exit 1; }

# Con identidad asignada por el usuario hay que decir cual: AZURE_CLIENT_ID.
ID_PARAM=""
[ -n "${AZURE_CLIENT_ID:-}" ] && ID_PARAM="&client_id=$AZURE_CLIENT_ID"
TOKEN=$(curl -fsS -H "X-IDENTITY-HEADER: $IDENTITY_HEADER" \
  "$IDENTITY_ENDPOINT?resource=https://storage.azure.com/&api-version=2019-08-01$ID_PARAM" | jq -r .access_token)
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { echo "No se obtuvo token de la identidad."; exit 1; }

# Put Blob admite hasta 5000 MiB en una sola peticion.
curl -fsS -X PUT -T "$FILE" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-ms-version: 2021-08-06" \
  -H "x-ms-blob-type: BlockBlob" \
  "https://$STORAGE_ACCOUNT.blob.core.windows.net/$CONTAINER/$NAME"

echo "Respaldo subido: $CONTAINER/$NAME"
