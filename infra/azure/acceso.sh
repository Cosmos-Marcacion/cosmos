#!/usr/bin/env bash
# Diagnostico de acceso a una suscripcion. Solo lee: no crea, cambia ni borra nada.
# Uso, en Cloud Shell:
#   bash acceso.sh <id-suscripcion> | tee ~/acceso-$(date +%F).txt
set -uo pipefail

SUB="${1:-${SUB:-}}"
[[ -z "$SUB" ]] && { echo "Uso: bash acceso.sh <id-suscripcion>"; exit 1; }
az account set -s "$SUB" || exit 1
OID="$(az ad signed-in-user show --query id -o tsv)"
API="https://management.azure.com/subscriptions/$SUB/providers/Microsoft.Authorization"

echo "== Fecha (UTC): $(date -u +%FT%TZ)"
echo
echo "== Cuenta y suscripcion"
az account show --query "{usuario:user.name, tenant:tenantId, suscripcion:name, id:id}" -o yaml
echo "objectId: $OID"
echo
echo "== Roles asignados (directos, por grupo y heredados)"
az role assignment list --scope "/subscriptions/$SUB" --assignee "$OID" \
  --include-groups --include-inherited \
  --query "[].{rol:roleDefinitionName, ambito:scope}" -o table
echo
echo "== Roles aptos en PIM (pendientes de activar)"
az rest --method get --url "$API/roleEligibilityScheduleInstances?api-version=2020-10-01&\$filter=asTarget()" \
  --query "value[].properties.expandedProperties.roleDefinition.displayName" -o tsv 2>/dev/null \
  || echo "(no se pudo consultar)"
echo
echo "== Permisos efectivos sobre las acciones que necesita el despliegue"
PERMISOS="$(az rest --method get --url "$API/permissions?api-version=2022-04-01" -o json)"
PERMISOS="$PERMISOS" python3 - <<'PY'
import json, os, fnmatch
perms = json.loads(os.environ["PERMISOS"])["value"]
def permitido(accion):
    a = accion.lower()
    for p in perms:
        if any(fnmatch.fnmatch(a, x.lower()) for x in p.get("actions", [])) and \
           not any(fnmatch.fnmatch(a, x.lower()) for x in p.get("notActions", [])):
            return True
    return False
acciones = [
    ("Crear grupos de recursos",         "Microsoft.Resources/subscriptions/resourceGroups/write"),
    ("Registrar proveedores",            "Microsoft.App/register/action"),
    ("Crear Container Registry",         "Microsoft.ContainerRegistry/registries/write"),
    ("Crear Key Vault",                  "Microsoft.KeyVault/vaults/write"),
    ("Crear base DocumentDB",            "Microsoft.DocumentDB/mongoClusters/write"),
    ("Crear identidades administradas",  "Microsoft.ManagedIdentity/userAssignedIdentities/write"),
    ("Crear Container Apps",             "Microsoft.App/containerApps/write"),
    ("Crear Static Web Apps",            "Microsoft.Web/staticSites/write"),
    ("Crear cuenta de almacenamiento",   "Microsoft.Storage/storageAccounts/write"),
    ("Asignar roles (RBAC)",             "Microsoft.Authorization/roleAssignments/write"),
]
faltan = 0
for nombre, accion in acciones:
    ok = permitido(accion)
    faltan += not ok
    print(f"  {'SI' if ok else 'NO':3} {nombre:34} {accion}")
print()
if faltan:
    print(f"RESULTADO: faltan {faltan} de {len(acciones)} permisos. Con este acceso no se puede desplegar.")
    print("Se necesita Owner, o Contributor + Role Based Access Control Administrator, sobre la suscripcion.")
else:
    print("RESULTADO: el acceso es suficiente para desplegar.")
PY
