# Solicitud de cambios DNS: Cosmos Check-In a Azure

Zona: **cosmos.com.pe**. Generado el 30/10/2026 22:21.

Condiciones para todos los registros:

- **TTL 300 s**.
- Si la zona esta en Cloudflare: **"DNS only"** (nube gris), sin proxy. Con
  proxy, Azure no puede validar el dominio ni emitir el certificado HTTPS.
- Los valores se copian tal cual, sin punto final ni comillas.

## Solicitud 1: ahora (no afecta a produccion)

Registros nuevos para el ambiente de QA y validaciones de dominio:

| Nombre | Tipo | Valor | Para que |
|---|---|---|---|
| `qa` | CNAME | `gray-tree-0eb73fe0f.1.azurestaticapps.net` | Panel de QA |
| `api-qa` | CNAME | `ca-cosmosck-api-qa.salmonmeadow-21349ce3.eastus2.azurecontainerapps.io` | API de QA |
| `asuid.api-qa` | TXT | `AD52EA66EF7AB4C5D8BAB2D2B412C76812D51E495AEFF66B9473AB58F162970D` | Azure valida que el dominio es nuestro |
| `asuid.apicheckin` | TXT | `AD52EA66EF7AB4C5D8BAB2D2B412C76812D51E495AEFF66B9473AB58F162970D` | Igual, para produccion. No cambia el trafico |

Y en los registros que **ya existen** de produccion, solo bajar el TTL a 300 s,
**sin cambiar su destino**:

- `checkin`
- `apicheckin`

Esto ultimo se pide con al menos 48 h de antelacion al corte: asi el cambio
del dia del corte se aplica en minutos y se puede deshacer igual de rapido.

## Solicitud 2: el dia del corte, a la hora acordada

Se avisa por el canal acordado al empezar la ventana. Reemplazar el destino de
estos dos registros existentes (pasan a ser CNAME si hoy son de otro tipo):

| Nombre | Tipo | Valor nuevo |
|---|---|---|
| `checkin` | CNAME | `polite-hill-09221710f.2.azurestaticapps.net` |
| `apicheckin` | CNAME | `ca-cosmosck-api-prod.grayforest-d8107249.eastus2.azurecontainerapps.io` |

Confirmar en cuanto este hecho: del otro lado se espera a que resuelva para
emitir los certificados.

### Vuelta atras

Si hubiera que revertir, volver a dejar estos registros como estaban. Hoy
resuelven a:

- `checkin.cosmos.com.pe`: CNAME checkincosmos.netlify.app
- `apicheckin.cosmos.com.pe`: A 98.87.37.45

Si la zona usa proxy de Cloudflare, esos valores son IPs de Cloudflare: el
destino real hay que tomarlo del panel antes del cambio.
