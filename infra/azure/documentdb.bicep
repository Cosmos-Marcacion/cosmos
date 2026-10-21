// Cluster de Azure DocumentDB (antes "Cosmos DB for MongoDB vCore").
// El tipo de recurso conserva el nombre antiguo: Microsoft.DocumentDB/mongoClusters.
//
// Antes del dia 1, confirmar que la version de API existe en la suscripcion:
//   az provider show -n Microsoft.DocumentDB \
//     --query "resourceTypes[?resourceType=='mongoClusters'].apiVersions" -o tsv

param clusterName string
param location string = resourceGroup().location
param adminUser string
@secure()
param adminPassword string
@allowed(['Free', 'M10', 'M20', 'M30'])
param tier string = 'M10'
param storageGb int = 32
@description('Igualar a la version mayor del Mongo de origen')
param serverVersion string = '7.0'

resource cluster 'Microsoft.DocumentDB/mongoClusters@2025-09-01' = {
  name: clusterName
  location: location
  properties: {
    administrator: { userName: adminUser, password: adminPassword }
    serverVersion: serverVersion
    compute: { tier: tier }
    storage: { sizeGb: storageGb }
    sharding: { shardCount: 1 }
    highAvailability: { targetMode: 'Disabled' }
    publicNetworkAccess: 'Enabled'
  }
}

// Equivale a la casilla "Permitir acceso desde servicios de Azure".
resource azureServices 'Microsoft.DocumentDB/mongoClusters/firewallRules@2025-09-01' = {
  parent: cluster
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

output host string = '${clusterName}.global.mongocluster.cosmos.azure.com'
