# API externa Cosmos — `ListarUsuarios` y `ListarNombradas`

Referencia de los dos endpoints del sistema portuario externo que consume
`cosmos-back`, con su autenticación, sus cuerpos de petición y respuesta, y cómo
los usa la aplicación.

**Código:** `cosmos-back/src/modules/named/named.service.ts`
**Expuesto en:** `NamedController` (`/api/v1/named/*`)

---

## 1. Credenciales

> **Las credenciales no se escriben en este documento a propósito.**
>
> `cosmos-back/.env` está protegido por `.gitignore`, así que hoy los secretos no
> están en ningún repositorio. Copiarlos a un `.md` los movería a un fichero
> versionado, y los tres repositorios se subieron a Bitbucket hace un momento: a
> partir de ahí quedan en el historial **para siempre**, aunque después se borre
> el fichero. Rotarlos exigiría pedirle credenciales nuevas al proveedor.
>
> Es además el caso exacto que detecta la regla `cosmos-secreto-en-el-codigo` de
> `.semgrep.yml`, que haría fallar la pipeline.

Los valores viven en `cosmos-back/.env`, en estas tres variables:

| Variable | Contenido |
|---|---|
| `URL_COSMOS` | URL base del servicio externo, **con `/` final** |
| `USER_COSMOS` | Usuario de la integración |
| `PASSWORD_COSMOS` | Contraseña de la integración |

Para consultarlas cuando las necesites:

```bash
# Las tres, en tu terminal (no queda en ningún fichero)
grep -E '^(URL_COSMOS|USER_COSMOS|PASSWORD_COSMOS)=' cosmos-back/.env
```

En el código se leen siempre por `ConfigService`, nunca literales:

```ts
const user     = this.configService.get('USER_COSMOS')
const password = this.configService.get('PASSWORD_COSMOS')
const url      = `${this.configService.get('URL_COSMOS')}api/Login/Autenticacion`
```

---

## 2. Autenticación

Todas las llamadas necesitan un token que se obtiene con usuario y contraseña.

### `POST {URL_COSMOS}api/Login/Autenticacion`

**Petición**

```json
{ "user": "<USER_COSMOS>", "password": "<PASSWORD_COSMOS>" }
```

**Respuesta**

```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

**Cabecera para el resto de llamadas**

```
Content-Type: application/json
Authorization: Bearer <token>
```

### Cómo lo gestiona el backend

`NamedService.getToken()` **cachea el token**. No pide uno nuevo en cada llamada:

1. **Reutiliza** el token en memoria mientras siga vivo.
2. **Lee la caducidad del propio JWT** (campo `exp`) y descuenta un margen de
   seguridad de 60 s. Si el token no es un JWT legible, cae al TTL de
   `COSMOS_TOKEN_TTL_MS` (por defecto 20 minutos).
3. **Agrupa peticiones simultáneas**: si llegan varias a la vez con la caché
   fría, se hace un solo login y todas esperan al mismo.
4. **Reintenta una vez** si el externo responde `401` o `403`: descarta el token
   cacheado y vuelve a autenticarse. Así cachear no puede dejar la integración
   atascada con un token inválido.

Si el login falla, el backend responde `401` con
`"Error de autenticación con el servicio externo"`.

---

## 3. `ListarUsuarios` — maestro de personal

### `POST {URL_COSMOS}api/Users/ListarUsuarios`

Devuelve el maestro de personal del sistema portuario.

**Petición**

```json
{}
```

**Respuesta**

```json
{
  "listUsers": [
    {
      "staff_id": 4022,
      "personal_id": "41169567",
      "first_name": "HENRY IVAR",
      "last_name": "ESPINOZA",
      "mother_last_name": "RETO",
      "status_description": "ACTIVO"
    }
  ]
}
```

**Notas**

- `personal_id` es el DNI. Es **la única clave estable** entre este sistema y
  Cosmos: `staff_id` no aparece en todos los orígenes.
- El maestro **no devuelve el cargo** de la persona. El cargo por jornada llega
  en `ListarNombradas`, dentro de `staff_role_type_description`.
- Los nombres vienen en mayúsculas.

### Variante: buscar por documento

### `POST {URL_COSMOS}api/Users/ListarUsuarios/`

Misma ruta **con `/` final**, filtrando por documento.

```json
{ "prDocumentNumber": "41169567" }
```

No hay un endpoint dedicado: es la misma operación con filtro.

### Manejo de errores en el backend

`NamedService.getAllUsers()` traduce el fallo según su origen:

| Situación | Respuesta del backend |
|---|---|
| El externo responde con error | Se conserva **su** código y su cuerpo |
| La petición sale y no responde nadie | `503 Servicio externo no disponible` |
| Cualquier otro fallo | `500 Error interno en la solicitud` |

Distinguir el `503` importa: dice que el problema está al otro lado y que
reintentar tiene sentido.

---

## 4. `ListarNombradas` — asignaciones por nave y turno

### `POST {URL_COSMOS}api/Users/ListarNombradas`

Una *nombrada* es la asignación de un equipo de personal a una nave, una fecha y
un turno. Es la unidad de trabajo real del puerto.

**Petición**

```json
{ "sInitialDate": "10/09/2025", "sFinalDate": "10/09/2025" }
```

> **El formato de fecha es `dd/mm/yyyy`.** Con ISO (`2025-09-10`) el servicio
> devuelve una lista vacía **sin dar error**, que es el peor fallo posible:
> parece que no hay nombradas ese día. En el código lo convierte
> `NamedService.formatDate()`, y hay pruebas que fijan que se conservan los ceros
> a la izquierda (`05/01/2026`, no `5/1/2026`).

**Respuesta**

```json
{
  "codigoRespuesta": "0",
  "descripcionResp": "OK",
  "listStaff": [
    {
      "staff_transmission_id": 2856,
      "staff_vessel_id": 2884,
      "vessel_description": "CMA CGM VOLTAIRE",
      "voyage_number": "0DVMSN1MA",
      "location_id": "PEPAI - TPE",
      "worker_date": "10/09/2025",
      "shift_description": "07:00 - 15:00",
      "pier_description": "2-A",
      "berth_description": "",
      "staff_vessel_number": "0875-1",
      "listStaffDetail": [
        {
          "staff_transmission_id": 2856,
          "staff_vessel_id": 2884,
          "staff_transmission_detail_id": 44349,
          "staff_id": 4022,
          "personal_id": "41169567",
          "last_name": "ESPINOZA",
          "mother_last_name": "RETO",
          "first_name": "HENRY IVAR",
          "staff_role_type_id": 29,
          "staff_role_type_description": "LIQUIDADOR DE NAVE",
          "order_number": 1,
          "team_number": 1
        }
      ]
    }
  ]
}
```

**Campos que conviene conocer**

| Campo | Significado |
|---|---|
| `staff_transmission_id` | Identificador de la nombrada. **Es numérico**: buscarlo como texto no encuentra nada |
| `worker_date` | Fecha de la jornada, en `dd/mm/yyyy` |
| `shift_description` | Turno. Solo tres valores: `07:00 - 15:00`, `15:00 - 23:00`, `23:00 - 07:00` |
| `listStaffDetail[].staff_id` | Enlaza con el empleado local |
| `staff_role_type_description` | Rol **en esa jornada**, no el puesto de RR. HH. |

**`codigoRespuesta`**

- `"0"` → hay datos.
- `"1"` → sin datos. **No es un error**: es un día sin nombradas, por ejemplo un
  domingo. Tratarlo como fallo muestra un error en pantalla donde no lo hay.

### Cómo lo gestiona el backend

`NamedService.getNameds()` no llama al externo siempre:

1. **Consulta primero lo guardado** (`NamedStoreService`). Si el rango ya está
   almacenado, lo sirve sin salir a la red.
2. Si no lo está, **llama al externo y guarda** el resultado.
3. Todo ello detrás de una **caché por rango de fechas** (`NAMEDS_CACHE_TTL_MS`,
   60 s por defecto), con agrupación de peticiones simultáneas.

El turno de noche (`23:00 - 07:00`) cruza la medianoche, así que las consultas de
jornada piden **ayer y hoy**, no solo hoy: quien entró anoche y aún no ha salido
se quedaría fuera.

---

## 5. Rutas internas que exponen esta integración

Todas cuelgan de `/api/v1/named` y **exigen sesión y el módulo `marcaciones`**:

```
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@RequireModule('marcaciones')
```

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/named` | Devuelve el token del externo |
| `POST` | `/named/users` | **No llama al externo**: devuelve los empleados locales (`findAllLean`) |
| `POST` | `/named/users/doc` | Proxy a `ListarUsuarios/` filtrando por documento |
| `POST` | `/named/nameds` | Proxy a `ListarNombradas` |
| `POST` | `/named/nameds/grouped` | Nombradas cruzadas con empleados, marcaciones y puntos |
| `POST` | `/named/date-turn` | Personal de una fecha, turno y charla |
| `POST` | `/named/board` | Nombradas de un rango con ficha, asistencias y capacitación |
| `GET` | `/named/detail/:staffTransmissionId` | Todo lo que se sabe de una nombrada |
| `GET` `/` `PUT` | `/named/records/:staffTransmissionId` | Ficha que la plataforma guarda de la nombrada |

> **Cuidado con `POST /named/users`.** No es lo mismo que
> `NamedService.getAllUsers()`. La ruta devuelve **empleados locales**; el método
> que consulta el `ListarUsuarios` externo solo se usa desde
> `EmployeeService.syncEmployeesFromNamedService()`, que es lo que dispara
> `POST /api/v1/employee/sync-from-named`.

---

## 6. Probarlos a mano

```bash
# 1. Cargar las credenciales sin escribirlas en ningún sitio
set -a && source cosmos-back/.env && set +a

# 2. Autenticarse
TOKEN=$(curl -s -X POST "${URL_COSMOS}api/Login/Autenticacion" \
  -H 'Content-Type: application/json' \
  -d "{\"user\":\"$USER_COSMOS\",\"password\":\"$PASSWORD_COSMOS\"}" \
  | python -c 'import json,sys; print(json.load(sys.stdin)["token"])')

# 3. Listar usuarios
curl -s -X POST "${URL_COSMOS}api/Users/ListarUsuarios" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | head -c 2000

# 4. Listar nombradas de un día (ojo al formato dd/mm/yyyy)
curl -s -X POST "${URL_COSMOS}api/Users/ListarNombradas" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"sInitialDate":"10/09/2025","sFinalDate":"10/09/2025"}' | head -c 2000
```

En Postman, define `URL_COSMOS`, `USER_COSMOS` y `PASSWORD_COSMOS` como
**variables de entorno del workspace**, no dentro de la colección: las
colecciones se exportan y se comparten, los entornos no.

---

## 7. Datos de ejemplo sin tocar el externo

`cosmos-back/src/modules/named/mocks/nameds.mock.json` tiene una respuesta
completa de `ListarNombradas`, útil para desarrollar sin credenciales. En
`getNameds()` hay código comentado que la usaba como respaldo; hoy está
desactivado y siempre se llama al servicio real.

Las pruebas de `named.service.spec.ts` simulan las dos rutas con `HttpService`
mockeado y cubren el token cacheado, la agrupación de peticiones, el reintento
ante `401` y la traducción de errores.
