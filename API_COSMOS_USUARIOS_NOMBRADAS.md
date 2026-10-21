# API externa "Cosmos" — Usuarios y Nombradas

Documentación del servicio externo de terceros ("Cosmos" / sistema portuario) que `cosmos-back`
consume para obtener **usuarios (personal/staff)** y **nombradas (asignaciones de trabajo por
turno)**. La integración vive en `cosmos-back/src/modules/named/named.service.ts` y se expone al
resto de la app a través de `NamedController` (`/named/*`).

## 1. Configuración

Variables de entorno (`cosmos-back/.env`):

| Variable          | Uso                                              |
|-------------------|---------------------------------------------------|
| `URL_COSMOS`      | Base URL del servicio externo (con `/` final)      |
| `USER_COSMOS`     | Usuario para autenticación contra el servicio       |
| `PASSWORD_COSMOS` | Password para autenticación contra el servicio      |

## 2. Autenticación

El servicio externo usa autenticación por token, obtenido en cada llamada (no se cachea).

**`POST {URL_COSMOS}api/Login/Autenticacion`**

Body:
```json
{ "user": "<USER_COSMOS>", "password": "<PASSWORD_COSMOS>" }
```

Respuesta (usada por el resto de llamadas como `Authorization: Bearer <token>`):
```json
{ "token": "..." }
```

Implementado en `NamedService.getToken()`. Si falla, se lanza `401 Unauthorized` con mensaje
`"Error de autenticación con el servicio externo"`.

## 3. Endpoints externos consumidos

Todos requieren el header:
```
Content-Type: application/json
Authorization: Bearer <token>
```
(el token se pide de nuevo en cada método público, vía `getToken()`).

### 3.1 Listar usuarios (personal)

**`POST {URL_COSMOS}api/Users/ListarUsuarios`** — body `{}`

Usado por `NamedService.getAllUsers()`. Respuesta:

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

Campos mínimos usados en el código (pueden existir más en la respuesta real, no documentados
porque el código no los consume): `staff_id`, `personal_id`, `first_name`, `last_name`,
`mother_last_name`, `status_description`.

Solo se procesan los usuarios con `status_description === 'ACTIVO'`.

Consumidor interno principal: `EmployeeService.syncEmployeesFromNamedService()`, que mapea cada
usuario activo a un `Employee` local:

| Campo externo                          | Campo local `Employee` |
|-----------------------------------------|--------------------------|
| `staff_id`                              | `id`                      |
| `first_name`                            | `firstName`               |
| `` `${last_name} ${mother_last_name}` `` | `lastName`                |
| `personal_id`                           | `document`                |
| (fijo)                                  | `status: 'active'`        |

Match contra empleados existentes por `employee.id === staff_id` o `employee.document === personal_id`.

### 3.2 Obtener usuario por documento

**`POST {URL_COSMOS}api/Users/ListarUsuarios/`** — body `{ "prDocumentNumber": "<doc>" }`

Usado por `NamedService.getUserByDoc(prDocumentNumber)`. Nota: llama a la **misma ruta** que
"listar todos" (con `/` final) pero filtrando por `prDocumentNumber` en el body; no hay un
endpoint dedicado documentado aparte en el código.

### 3.3 Listar nombradas (asignaciones de personal por nave/turno)

**`POST {URL_COSMOS}api/Users/ListarNombradas`**

Body:
```json
{ "sInitialDate": "dd/mm/yyyy", "sFinalDate": "dd/mm/yyyy" }
```

Usado por `NamedService.getNameds(dto)`. Respuesta (ver
`cosmos-back/src/modules/named/mocks/nameds.mock.json` para un ejemplo completo):

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

`codigoRespuesta === '1'` indica "sin datos" (se maneja como lista vacía en
`getNamesGrouped`). `shift_description` toma uno de estos 3 valores fijos usados por el código:
`"07:00 - 15:00"`, `"15:00 - 23:00"`, `"23:00 - 07:00"`.

Hay código comentado en `getNameds()` que muestra un fallback previo a datos mock
(`mocks/nameds.mock.json`) filtrados por rango de fechas; actualmente está desactivado y siempre
se llama al servicio real.

## 4. Endpoints internos que exponen esta integración (`/named/*`)

Expuestos por `cosmos-back` sin guard de auth propio (`NamedController` no tiene `@UseGuards`);
son consumidos por el frontend autenticado igualmente vía el JWT de la app en otras rutas.

| Método | Ruta                          | Handler                          | Descripción |
|--------|--------------------------------|------------------------------------|-------------|
| POST   | `/named`                      | `getToken`                         | Obtiene token del servicio externo |
| POST   | `/named/users`                | `getAllUsers`                      | **No** llama al externo: devuelve `EmployeeService.findAll()` (empleados locales) |
| POST   | `/named/users/doc`            | `getUserByDoc`                     | Proxy a `api/Users/ListarUsuarios/` filtrando por documento |
| POST   | `/named/nameds`                | `getNameds`                        | Proxy a `api/Users/ListarNombradas`, body `GetNamedsDto` (`sInitialDate`, `sFinalDate`) |
| POST   | `/named/nameds/grouped`        | `getNamedsGrouped`                 | Nombradas + cruce con empleados/entradas/puntos locales, agrupadas por fecha y turno |
| POST   | `/named/date-turn`             | `getNamesByDateAndTurn`            | Personal nombrado para una fecha+turno+charla (`talkId`), cruzado con asistentes/entradas |
| POST   | `/named/generate-random-entries` | `generateRandomEntries`          | Utilidad de seed: genera entradas aleatorias a partir de nombradas de un rango fijo |

> Nota: `POST /named/users` (`getAllUsers` del controller) **no** es lo mismo que
> `NamedService.getAllUsers()` (el método que sí llama al externo `ListarUsuarios`). El controller
> llama a `NamedService.getUsers()`, que retorna empleados locales (`EmployeeService.findAll()`).
> `NamedService.getAllUsers()` solo se usa internamente desde
> `EmployeeService.syncEmployeesFromNamedService()`.

Además, `EmployeeController` expone la sincronización real de usuarios externos:

| Método | Ruta                        | Roles                          | Descripción |
|--------|------------------------------|----------------------------------|-------------|
| POST   | `/employee/sync-from-named`  | `SUPER_ADMIN`, `ADMIN`           | Llama a `NamedService.getAllUsers()` → filtra `ACTIVO` → crea/actualiza `Employee` local |

## 5. Consumidores en el frontend

- `cosmos-front/src/app/services/named.service.ts` → `POST /named/nameds/grouped`
  (payload `INamedPayload { sInitialDate, sFinalDate, iStaffTransmissionId? }`, usado en el
  dashboard).
- `cosmos-front/src/app/modules/talks/services/talks.service.ts` →
  `getAssistantsByWorkerDateAndTurn()` → `POST /named/date-turn`
  (`{ workerDate, turn, talkId }`), usado en el módulo de charlas (`talks`) para listar el
  personal nombrado y marcar asistencia.
- Interfaces de tipado: `cosmos-front/src/app/interfaces/named.interface.ts`
  (`INamedPayload`, `INamedResponse`, `INamed`, `IListStaff`, `INamedResponseFormat`, etc.).

## 6. Errores

| Origen                                   | Excepción                                                          |
|-------------------------------------------|----------------------------------------------------------------------|
| Falla de autenticación externa            | `401` "Error de autenticación con el servicio externo"                |
| `ListarUsuarios` sin respuesta del servidor | `503` "Servicio externo no disponible"                              |
| `ListarUsuarios` error genérico            | `500` "Error interno en la solicitud"                                |
| `getUserByDoc` error                       | `500` "Error al obtener usuario"                                     |
| `getNameds` error                          | `500` "Error al obtener nombradas"                                   |
| `getNamesByDateAndTurn` sin datos para fecha | `404` "No se encontraron datos para la fecha de la charla"          |
| `getNamesByDateAndTurn` sin datos para turno | `404` con turnos disponibles listados en el mensaje                 |

## 7. Referencias en código

- `cosmos-back/src/modules/named/named.service.ts` — lógica de integración.
- `cosmos-back/src/modules/named/named.controller.ts` — rutas internas.
- `cosmos-back/src/modules/named/dto/get-nameds.dto.ts` — `GetNamedsDto`.
- `cosmos-back/src/modules/named/dto/name-and-turn.dto.ts` — `GetNamesByDateAndTurnDto`.
- `cosmos-back/src/modules/named/mocks/nameds.mock.json` — ejemplo de respuesta de nombradas.
- `cosmos-back/src/modules/employee/employee.service.ts` — `syncEmployeesFromNamedService()`.
- `cosmos-back/src/modules/employee/employee.controller.ts` — `POST /employee/sync-from-named`.
- `cosmos-front/src/app/services/named.service.ts`, `cosmos-front/src/app/modules/talks/services/talks.service.ts`.
