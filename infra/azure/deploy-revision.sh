#!/usr/bin/env bash
# Despliegue sin corte y con vuelta atras automatica.
#
#   deploy-revision.sh <grupo> <container-app> <imagen> <sufijo>
#
# 1. Fija el trafico, por nombre, en la revision que hoy lo recibe. Si quedara
#    en "latest", la revision nueva se llevaria el 100 % nada mas crearse.
# 2. Crea la revision nueva con 0 % y la prueba en su URL propia.
# 3. Solo si /health/ready responde, le pasa el 100 %. Si no, la desactiva y el
#    trafico sigue donde estaba.
# 4. Desactiva las revisiones mas viejas; la anterior queda encendida para
#    volver atras en segundos: az containerapp ingress traffic set
#    --revision-weight <anterior>=100
set -euo pipefail

RG="$1" APP="$2" IMAGE="$3" SUFFIX="$4"
HEALTH_PATH="${HEALTH_PATH:-/health/ready}"
INTENTOS="${INTENTOS:-30}"     # 30 x 10 s: la imagen tarda en cargar TensorFlow

OLD=$(az containerapp ingress traffic show -g "$RG" -n "$APP" \
  --query "[?weight==\`100\`].revisionName | [0]" -o tsv)
if [ -z "$OLD" ]; then
  OLD=$(az containerapp show -g "$RG" -n "$APP" --query properties.latestReadyRevisionName -o tsv)
fi
echo "Revision actual: $OLD"
az containerapp ingress traffic set -g "$RG" -n "$APP" --revision-weight "$OLD=100" -o none

az containerapp update -g "$RG" -n "$APP" --image "$IMAGE" --revision-suffix "$SUFFIX" -o none
NEW="$APP--$SUFFIX"
FQDN=$(az containerapp revision show -g "$RG" -n "$APP" --revision "$NEW" --query properties.fqdn -o tsv)
echo "Revision nueva: $NEW ($FQDN)"

OK=0
for i in $(seq 1 "$INTENTOS"); do
  if curl -fsS --max-time 10 "https://$FQDN$HEALTH_PATH" > /dev/null; then OK=1; break; fi
  echo "Esperando a $NEW ($i/$INTENTOS)..."
  sleep 10
done

if [ "$OK" != 1 ]; then
  echo "::error::$NEW no respondio en $HEALTH_PATH. El trafico sigue en $OLD."
  az containerapp revision deactivate -g "$RG" -n "$APP" --revision "$NEW" -o none || true
  exit 1
fi

az containerapp ingress traffic set -g "$RG" -n "$APP" --revision-weight "$NEW=100" "$OLD=0" -o none
echo "Trafico en $NEW. Vuelta atras: --revision-weight $OLD=100"

for R in $(az containerapp revision list -g "$RG" -n "$APP" \
  --query "[?properties.active && name!='$NEW' && name!='$OLD'].name" -o tsv); do
  echo "Desactivando $R"
  az containerapp revision deactivate -g "$RG" -n "$APP" --revision "$R" -o none || true
done
