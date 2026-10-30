#!/usr/bin/env bash
# Muestra en que fase de DESPLIEGUE.md esta la migracion. Solo lee: no crea,
# cambia ni borra nada. Uso, en Cloud Shell desde la raiz del repo:
#   SUB=<id-suscripcion> ./infra/azure/estado.sh
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vars.sh
. "$DIR/vars.sh"

[[ "$SUB" == "<ID_SUSCRIPCION>" ]] && { echo "Exporta SUB=<id-suscripcion>"; exit 1; }
az account set -s "$SUB" || exit 1

ok()    { printf '  \033[32mOK\033[0m     %s\n' "$*"; }
falta() { printf '  \033[31mFALTA\033[0m  %s\n' "$*"; }
aviso() { printf '  \033[33mREVISAR\033[0m %s\n' "$*"; }
fase()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
q()     { "$@" 2>/dev/null; }

recurso() { # <rg> <nombre> <tipo> <texto>
  if q az resource show -g "$1" -n "$2" --resource-type "$3" --query id -o tsv > /dev/null; then
    ok "$4 ($2)"
  else
    falta "$4 ($2)"
  fi
}

fase "Fase 2. Instalacion (instalar.sh)"
for rg in "$RG_PROD" "$RG_QA"; do
  [[ "$(q az group exists -n "$rg")" == "true" ]] && ok "Grupo $rg" || falta "Grupo $rg"
done
recurso "$RG_PROD" "$LAW" Microsoft.OperationalInsights/workspaces "Log Analytics"
recurso "$RG_PROD" "$ACR" Microsoft.ContainerRegistry/registries "Registro de imagenes"
for img in cosmos-api mongo-backup; do
  if q az acr repository show-tags -n "$ACR" --repository "$img" -o tsv | grep -q .; then
    ok "Imagen $img en ACR"
  else
    falta "Imagen $img en ACR"
  fi
done
for e in prod qa; do
  if [[ $e == prod ]]; then RG=$RG_PROD KV=$KV_PROD DB=$DB_PROD ID=$ID_PROD SWA=$SWA_PROD ENVN=$ENV_PROD APP=$APP_PROD
  else RG=$RG_QA KV=$KV_QA DB=$DB_QA ID=$ID_QA SWA=$SWA_QA ENVN=$ENV_QA APP=$APP_QA; fi
  echo "  -- $e"
  recurso "$RG" "$KV" Microsoft.KeyVault/vaults "Key Vault"
  for s in mongo-uri jwt-secret; do
    if q az keyvault secret show --vault-name "$KV" -n "$s" --query id -o tsv > /dev/null; then
      ok "Secreto $s"
    else
      aviso "Secreto $s (no existe o tu usuario no puede leer el vault)"
    fi
  done
  estado_db=$(q az resource show -g "$RG" -n "$DB" --resource-type Microsoft.DocumentDB/mongoClusters \
    --query properties.provisioningState -o tsv)
  case "$estado_db" in
    Succeeded) ok "DocumentDB ($DB)" ;;
    "")        falta "DocumentDB ($DB)" ;;
    *)         aviso "DocumentDB ($DB) en estado $estado_db" ;;
  esac
  recurso "$RG" "$ID" Microsoft.ManagedIdentity/userAssignedIdentities "Identidad de la API"
  recurso "$RG" "$SWA" Microsoft.Web/staticSites "Static Web App"
  recurso "$RG" "$ENVN" Microsoft.App/managedEnvironments "Entorno de Container Apps"
  fqdn=$(q az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
  if [[ -z "$fqdn" ]]; then
    falta "Container App ($APP)"
  else
    ok "Container App ($APP)"
    salud=$(curl -s -m 15 "https://$fqdn/health/ready" || true)
    [[ "$salud" == *'"up"'* ]] && ok "API responde: https://$fqdn" || aviso "API no responde en https://$fqdn/health/ready: ${salud:-sin respuesta}"
    echo "         trafico:"
    q az containerapp revision list -g "$RG" -n "$APP" \
      --query "[?properties.active].{revision:name, trafico:properties.trafficWeight, salud:properties.healthState, creada:properties.createdTime}" \
      -o table | sed 's/^/         /'
  fi
done
recurso "$RG_PROD" "$ID_RESPALDO" Microsoft.ManagedIdentity/userAssignedIdentities "Identidad de respaldos"
recurso "$RG_PROD" "$ST" Microsoft.Storage/storageAccounts "Almacenamiento de respaldos"
recurso "$RG_PROD" "$JOB_BACKUP" Microsoft.App/jobs "Job de respaldo semanal"
recurso "$RG_QA" "$JOB_PING" Microsoft.App/jobs "Job de ping a QA"
recurso "$RG_PROD" ag-cosmos Microsoft.Insights/actionGroups "Grupo de alertas"
recurso "$RG_PROD" api-errores-5xx Microsoft.Insights/metricAlerts "Alerta de errores 5xx"
recurso "$RG_PROD" "$ID_GITHUB" Microsoft.ManagedIdentity/userAssignedIdentities "Identidad OIDC de GitHub"
[[ -f "$HOME/solicitud-dns-cosmos.md" ]] && ok "~/solicitud-dns-cosmos.md generado" || falta "~/solicitud-dns-cosmos.md (./infra/azure/instalar.sh dns)"

fase "Fase 3. DNS de QA"
dns_de() { q dig +short "$1" "$2" | tail -1; }
for h in "$FRONT_QA_HOST" "$API_QA_HOST"; do
  d=$(dns_de "$h" CNAME); [[ -n "$d" ]] && ok "$h -> $d" || falta "CNAME de $h (solicitud 1)"
done
for h in "asuid.$API_QA_HOST" "asuid.$API_PROD_HOST"; do
  [[ -n "$(dns_de "$h" TXT)" ]] && ok "TXT $h" || falta "TXT $h (solicitud 1)"
done
for e in prod qa; do
  if [[ $e == prod ]]; then RG=$RG_PROD APP=$APP_PROD SWA=$SWA_PROD; else RG=$RG_QA APP=$APP_QA SWA=$SWA_QA; fi
  api_dom=$(q az containerapp hostname list -g "$RG" -n "$APP" --query "[].name" -o tsv | tr '\n' ' ')
  swa_dom=$(q az staticwebapp hostname list -g "$RG" -n "$SWA" --query "[].domainName" -o tsv | tr '\n' ' ')
  [[ -n "$api_dom" ]] && ok "Dominio enlazado a la API $e: $api_dom" || falta "Dominio de la API $e (instalar.sh dominios $e)"
  [[ -n "$swa_dom" ]] && ok "Dominio enlazado al panel $e: $swa_dom" || falta "Dominio del panel $e (instalar.sh dominios $e)"
done

fase "Fase 4. GitHub"
if command -v gh > /dev/null && gh auth status > /dev/null 2>&1; then
  envs=$(q gh api "repos/$GH_REPO/environments" --jq '.environments[].name' | tr '\n' ' ')
  for e in produccion qa; do
    [[ " $envs " == *" $e "* ]] && ok "Environment $e" || falta "Environment $e"
  done
  [[ "$(q gh variable get AZURE_DEPLOY_ENABLED -R "$GH_REPO")" == "true" ]] \
    && ok "AZURE_DEPLOY_ENABLED=true" || falta "Variable AZURE_DEPLOY_ENABLED=true"
  revisores=$(q gh api "repos/$GH_REPO/environments/produccion" --jq '[.protection_rules[]?|select(.type=="required_reviewers")]|length')
  [[ "${revisores:-0}" -gt 0 ]] && ok "Revisores requeridos en produccion" || falta "Revisores requeridos en produccion"
  q gh api "repos/$GH_REPO/branches/develop" --jq .name > /dev/null && ok "Rama develop" || falta "Rama develop (dispara el primer despliegue de QA)"
  echo "         ultimas ejecuciones de Deploy:"
  q gh run list -R "$GH_REPO" -w Deploy -L 5 | sed 's/^/         /'
else
  aviso "Sin sesion de gh: 'gh auth login' para revisar esta fase"
fi

fase "Fase 5. Datos en QA"
echo "  No se puede leer la base sin abrir el firewall. Si el panel de QA deja"
echo "  iniciar sesion, los datos ya estan cargados."
for e in prod qa; do
  if [[ $e == prod ]]; then RG=$RG_PROD DB=$DB_PROD; else RG=$RG_QA DB=$DB_QA; fi
  reglas=$(q az resource list -g "$RG" --resource-type Microsoft.DocumentDB/mongoClusters/firewallRules --query "[].name" -o tsv)
  [[ -z "$reglas" ]] && reglas=$(q az rest --method get \
    --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.DocumentDB/mongoClusters/$DB/firewallRules?api-version=2025-09-01" \
    --query "value[].name" -o tsv)
  extra=$(printf '%s\n' "$reglas" | grep -vi 'azure' | grep . || true)
  [[ -z "$extra" ]] && ok "Firewall de $DB sin reglas temporales" || aviso "Reglas temporales abiertas en $DB: $(echo "$extra" | tr '\n' ' ') (instalar.sh ip $e cerrar <ip>)"
done

fase "Fase 6-7. Produccion y corte"
for h in "$FRONT_PROD_HOST" "$API_PROD_HOST"; do
  d=$(q dig +short "$h" | head -3 | tr '\n' ' ')
  if [[ "$d" == *azurestaticapps* || "$d" == *azurecontainerapps* ]]; then
    ok "$h ya apunta a Azure ($d)"
  else
    aviso "$h aun no apunta a Azure: $d (normal antes del corte)"
  fi
  ttl=$(q dig +noall +answer "$h" | awk 'NR==1{print $2}')
  [[ -n "$ttl" && "$ttl" -le 300 ]] && ok "TTL de $h = $ttl s" || aviso "TTL de $h = ${ttl:-?} s (debe ser 300 al menos 48 h antes del corte)"
done
ejec=$(q az containerapp job execution list -g "$RG_PROD" -n "$JOB_BACKUP" --query "[0].{estado:properties.status, inicio:properties.startTime}" -o tsv)
[[ -n "$ejec" ]] && ok "Ultimo respaldo: $ejec" || aviso "Aun no hay ninguna ejecucion del respaldo (fase 7.5)"

fase "Fase 8. Cierre"
pres=$(q az consumption budget list --query "length(@)" -o tsv)
[[ "${pres:-0}" -gt 0 ]] && ok "Presupuesto creado" || falta "Presupuesto mensual (Cost Management > Budgets)"
db_alertas=$(q az monitor metrics alert list -g "$RG_PROD" --query "[?contains(to_string(scopes), 'mongoClusters')].name" -o tsv)
[[ -n "$db_alertas" ]] && ok "Alertas del cluster: $db_alertas" || falta "Alerta de CPU/almacenamiento de $DB_PROD"

echo
ls -t "$HOME"/cosmos-instalacion-*.log 2>/dev/null | head -1 | sed 's/^/Ultimo registro del instalador: /'
