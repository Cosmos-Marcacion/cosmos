# API Visma TuRecibo — Maestro de personal

Integración con la **API de VISMA TuRecibo** (`gu_a_de_uso_de_api_turecibo.md`,
[manual online](https://documenter.getpostman.com/view/12528420/TVCFVndU)) que alimenta el maestro
de personal propio. De aquí salen **todas** las personas que la vista de marcaciones asigna a una
jornada y que después firman los formatos:

| Bloque de la vista | Campo | Obligatorio |
|--------------------|-------|-------------|
| Responsables de la jornada | Jefe de cubierta | Sí |
| Responsables de la jornada | Supervisor de operaciones | Sí |
| Responsables de la jornada | Supervisor SSOMA | Sí |
| Capacitación | Entrenador | No |
| Capacitación | Responsable del registro | No |
| Aprobadores de la inspección de nave | Aprobador · Jefe de cubierta | No |
| Aprobadores de la inspección de nave | Aprobador · SSOMA | No |

Ninguno viene en la nombrada (`API_COSMOS_USUARIOS_NOMBRADAS.md`): son personal de la empresa.
Todos se buscan por **nombre o documento** contra el mismo maestro.

Desde la fusión del registro de empleados (§7), este maestro alimenta además el buscador de
`cosmos-app`, junto al maestro de Cosmos.

> **Cambio de API.** La primera versión de este módulo se escribió contra
> *Visma People & Payroll — WEB API Latam* (`developer.vismalatam.com`): pasarela APIM con
> `Ocp-Apim-Subscription-Key` y `X-Tenant-Id`, login `grant_type=password` y
> `search-engines/employees` paginado. **No es la API del cliente.** La documentación entregada es
> TuRecibo, que es otro producto, con otro login, otra autenticación y sin endpoint de listado.
> Todo lo que sigue está verificado contra `https://api.stage.turecibo.com` con el usuario de
> pruebas de Perú.

## 1. Configuración

Variables en `cosmos-back/.env`. **Sin `VISMA_URL` el backend sirve un maestro simulado** con
datos de prueba, y el resto del sistema funciona igual.

| Variable | Por defecto | Uso |
|----------|-------------|-----|
| `VISMA_URL` | — | Base de la API. Su presencia activa el modo real |
| `VISMA_USERNAME` / `VISMA_PASSWORD` | — | Credenciales del login |
| `VISMA_TOKEN` | — | JWT fijo; si se define no se hace login (útil en pruebas) |
| `VISMA_LOGIN_PATH` | `v2/auth-mod/login` | Ruta del login |
| `VISMA_SEARCH_PATH` | `v2/admin-mod/users/search` | Ruta del buscador |
| `VISMA_USERS_PATH` | `v2/admin-mod/users` | Ruta de la ficha completa |
| `VISMA_CACHE_TTL_MS` | `900000` | Vigencia de lo cacheado (15 min) |
| `VISMA_HTTP_TIMEOUT_MS` | `15000` | Timeout HTTP |

Ambientes de la guía:

| Ambiente | `VISMA_URL` | Usuario |
|----------|-------------|---------|
| Pruebas Perú | `https://api.stage.turecibo.com` | `demo_api_turecibo_pe` |
| Producción | `https://app.turecibo.com` | a solicitar tras la implantación |

## 2. Autenticación

**`POST {VISMA_URL}/v2/auth-mod/login`**

```
Content-Type: application/json

{ "user": "<VISMA_USERNAME>", "password": "<VISMA_PASSWORD>" }
```

Respuesta:

```json
{ "jwt": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." }
```

El token es un **JWT** y la guía le da 12 h de vigencia, pero el dato que manda es el `exp` del
propio token: se decodifica y se guarda en memoria hasta un minuto antes de esa hora. Un `401` o
un `403` lo descarta y reintenta el login una sola vez.

Sin cabecera `Authorization` la API responde `403 {"code":"00009","message":"Method unauthorized"}`.

## 3. Búsqueda de colaboradores

**`GET {VISMA_URL}/v2/admin-mod/users/search?filter=<texto>`**

```
Authorization: Bearer <jwt>
```

```json
{
  "data": [
    {
      "id": "1177106",
      "nombre": "Leandro Royer Maldonado Garcia",
      "cuil": "41591769",
      "mail": "lmaldonadog@torreblanca.com.pe"
    }
  ]
}
```

`filter` casa contra nombre, apellido, usuario y documento.

### Dos límites que condicionan todo el diseño

1. **`filter` es obligatorio y exige 3 caracteres.** Menos devuelve
   `400 SYSTEM_API_MIN_LENGTH_VALUE_NOT_REACHED`; ninguno,
   `400 SYSTEM_API_PARAMETER_REQUIRED`. **No existe endpoint de listado**, y cualquier parámetro
   extra (`page`, `limit`, `pageSize`) se rechaza con `400 SYSTEM_API_PARAMETER_NOT_EXPECTED`.

   Por eso el maestro **no se descarga entero**: se consulta por término y se cachea cada término
   15 minutos. Con menos de 3 caracteres el backend devuelve lista vacía en lugar de provocar el
   400, y el campo `minLength` de la respuesta interna permite que el selector diga «escribe al
   menos 3 caracteres» en vez de «nadie coincide».

2. **El buscador devuelve identidad mínima.** `nombre` viene en una sola cadena, sin separar
   apellidos, y no hay legajo, cargo ni estado. Todo eso está en la ficha (§4).

Sin coincidencias la API responde `404`, que el servicio traduce a lista vacía: el selector
consulta en cada tecla y lo normal es no acertar.

## 4. Ficha completa

**`GET {VISMA_URL}/v2/admin-mod/users/{id}`**

```json
{
  "usuario": "41591769",
  "nombre": "Leandro Royer",
  "apellido": "Maldonado Garcia",
  "mail": "lmaldonadog@torreblanca.com.pe",
  "dni": "41591769",
  "cuil": "41591769",
  "fecha_nacimiento": "19/03/1981",
  "fecha_contratacion": "16/01/2013",
  "numero_legajo": 417580,
  "external_id": null,
  "sector": "G11",
  "locacion": "264",
  "ingreso": 1,
  "estado_empresa": 1,
  "cargo": null,
  "reporta": null
}
```

Cuesta una llamada por persona, así que se pide **solo al seleccionar a alguien**, no por cada
resultado de la lista. Es la única forma de saber dónde acaba el apellido y empieza el nombre.

### El cargo depende de la carga del cliente

**El buscador no devuelve el cargo en absoluto**; solo la ficha lo trae, y solo si el cliente lo
ha cargado en TuRecibo. En el ambiente de pruebas hay de los dos: usuarios con
`"cargo": "OPERARIO II"`, `"sector": "OPERACIONES"` y `"locacion": "OFICINA PRINCIPAL"`, y usuarios
con `cargo: null`.

`VismaPerson.position` se rellena si viene y si no queda en cadena vacía; **nada del sistema
depende de que traiga algo**, y los datos de prueba lo dejan vacío a propósito para que el modo
simulado no prometa un dato que puede no estar.

Eso no es un problema: los 7 campos de la vista de marcaciones no son cargos de RR. HH., son
**roles de esa jornada**. La misma persona es jefe de cubierta un turno y no el siguiente. Por eso
ninguno filtra por puesto y todos se resuelven por nombre o documento.

`search({ position })` y `GET /visma/personal?position=` siguen existiendo, pero hoy no los usa
ningún campo y solo devuelven algo si el cliente publica el cargo.

Lo único que lo necesita es `format.service.ts`, que rellena `Cargo:` en la hoja de charla con
`talk.registerResponsible.position` bajo un `if (position)`: sin cargo deja la casilla en blanco.

## 5. Normalización

| Campo TuRecibo | Campo interno `VismaPerson` |
|----------------|------------------------------|
| `id` | `id` |
| `nombre` (buscador) | `fullName` (mayúsculas, tal cual) |
| `apellido` + `nombre` (ficha) | `fullName` (mayúsculas, "APELLIDOS NOMBRES") |
| `nombre` (ficha) | `firstName` |
| `apellido` (ficha) | `lastName` |
| `dni` ?? `cuil` | `document` |
| `numero_legajo` | `fileNumber` |
| `cargo` | `position` (normalmente vacío) |
| `estado_empresa === 1` | `active` |
| `mail`, `sector`, `locacion` | `email`, `sector`, `location` |

En Perú `cuil` y `dni` traen el mismo valor, y el buscador solo devuelve `cuil`: por eso es lo que
se usa como documento en la lista.

## 6. Endpoints internos

Todos bajo `JwtAuthGuard` + `RolesGuard` + `ModuleGuard('sincronizar-empleados')`.

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/visma/personal` | `SUPER_ADMIN`, `ADMIN`, `USER` | Busca por nombre o documento. Query: `search`, `position`, `limit` (máx. 100), `includeInactive` |
| GET | `/visma/personal/:id` | `SUPER_ADMIN`, `ADMIN`, `USER` | Ficha completa: nombres y apellidos separados, legajo, sector y estado |
| POST | `/visma/refresh` | `SUPER_ADMIN`, `ADMIN` | Descarta las búsquedas cacheadas y el token |

Respuesta de `/visma/personal`:

```json
{
  "source": "visma",
  "minLength": 3,
  "data": [
    { "id": "1177106", "fullName": "LEANDRO ROYER MALDONADO GARCIA",
      "document": "41591769", "position": "", "active": true,
      "email": "lmaldonadog@torreblanca.com.pe" }
  ]
}
```

`source` vale `"mock"` mientras no haya `VISMA_URL`, y entonces `minLength` es `0`: el maestro
simulado se busca en memoria y se puede listar entero.

## 7. Fusión con el maestro de Cosmos (registro de empleados)

El registro de `cosmos-app` listaba solo el maestro de Cosmos (`api/Users/ListarUsuarios`,
sincronizado en la colección `employees`). A quien no apareciera ahí no se le podía registrar
huella, firma ni rostro.

**`GET /employee/directory?search=&limit=`** devuelve los dos maestros fusionados:

```json
{
  "data": [
    { "key": "74355639", "employeeId": "665f...", "id": 4412, "vismaId": "1177106",
      "firstName": "DARWIN JAVIER", "lastName": "HIDALGO CASTILLO",
      "fullName": "HIDALGO CASTILLO DARWIN JAVIER", "document": "74355639",
      "fileNumber": "1001", "status": "active", "issetFinger": true,
      "signature": "https://...", "sources": ["cosmos", "visma"] }
  ],
  "total": 1,
  "minLength": 3,
  "vismaAvailable": true
}
```

- **Sin `search`** devuelve solo Cosmos, que es la lista completa con la que arranca la pantalla.
  Visma no se puede listar (§3).
- **Con `search`** de al menos `minLength` caracteres se suma Visma.
- El cruce va **por documento**, normalizado sin separadores ni ceros a la izquierda: los dos
  orígenes escriben el mismo DNI de formas distintas (`03501122` / `3501122`) y si no coincidieran
  la misma persona saldría dos veces.
- Quien está en los dos aparece una vez, con `sources: ["cosmos", "visma"]`, el nombre de la ficha
  local (que es el que se imprime) y el legajo de Visma.
- Quien está solo en Visma llega **sin `employeeId` ni `id`**: al seleccionarlo la app pide su
  ficha (`GET /visma/personal/:id`) para separar nombres de apellidos y traer el legajo.
- Si Visma falla, `vismaAvailable: false` y la lista sale solo de Cosmos: una caída de Visma no
  puede dejar sin registrar a quien ya está en la plataforma.

`staff_id` (`Employee.id`) deja de ser obligatorio en la colección: quien viene solo de Visma no lo
tiene. La identidad de la ficha es el documento, que es el único campo con índice único. Se añaden
`vismaId` y `fileNumber`.

## 8. Errores

| Origen | Excepción |
|--------|-----------|
| Faltan `VISMA_USERNAME` / `VISMA_PASSWORD` con `VISMA_URL` puesto | `500` "Faltan credenciales de Visma" |
| Login sin `jwt` | `401` "Visma no devolvió token de acceso" |
| API caída o error de red | `503` "No se pudo buscar … en Visma" |
| Búsqueda sin coincidencias (`404` de TuRecibo) | lista vacía, no es error |

El frontend consulta con el contexto `silent()`, así que un fallo no lanza toast: el selector
queda vacío y el usuario puede reintentar.

## 9. Datos de prueba (modo simulado)

`MOCK_PERSONAL` en `visma.service.ts`: 25 personas con nombre, documento y legajo, y **`position`
vacío**, igual que en producción.

Los legajos van por bloques para que en pruebas manuales se pueda repartir la plantilla entre los
campos de la vista sin repetir persona. Es solo una convención del fichero, no un dato que la
aplicación lea:

| Legajos | Pensados para | Cantidad |
|---------|---------------|----------|
| 1001-1008 | Jefe de cubierta | 8 (uno de baja, para probar `includeInactive`) |
| 2001-2005 | Supervisor de operaciones | 5 |
| 3001-3004 | Supervisor SSOMA | 4 |
| 4001-4003 | Entrenador | 3 |
| 5001-5003 | Responsable del registro | 3 |
| 6001-6002 | Aprobadores de la VSI | 2 |

Nombres y documentos con forma peruana real (DNI de 8 dígitos y antiguos con cero inicial) para que
las columnas del formato se vean como en producción.

## 10. Referencias en código

- `cosmos-back/src/modules/visma/visma.service.ts` — cliente TuRecibo, caché y buscador.
- `cosmos-back/src/modules/visma/visma.controller.ts` — rutas `/visma/*`.
- `cosmos-back/src/modules/employee/employee-directory.service.ts` — fusión Cosmos + Visma.
- `cosmos-back/src/modules/employee/employee.controller.ts` — `GET /employee/directory`.
- `cosmos-front/src/app/services/person-directory.service.ts` — consumo desde el front.
- `cosmos-front/src/app/components/person-picker/` — selector reutilizado por los 7 campos.
- `cosmos-app/src/app/modules/employee-register/` — registro de empleados con los dos maestros.
