# Guía de uso de API TuRecibo - VISMA

## Visión General

### Sobre VISMA TuRecibo
TuRecibo.com es una plataforma tipo SaaS y "multi-tenant" que ofrece soluciones tecnológicas e innovadoras que ayudan a las empresas a gestionar sus legajos, documentos, licencias y la comunicación con sus colaboradores de forma eficaz.

VISMA TuRecibo dispone de una API cuyo propósito es servir como una interfaz con la cual integrarse y así permitir conectar directamente con el repositorio de datos, facilitando la integración con otros sistemas.

### Introducción
El presente documento es una guía general que detalla los pasos a seguir para la integración a través de la API, no reemplaza el manual de la API disponible online a través de:
[https://documenter.getpostman.com/view/12528420/TVCFVndU](https://documenter.getpostman.com/view/12528420/TVCFVndU)

Para avanzar con el desarrollo de interfaces VISMA pone a disposición un ambiente de pruebas para realizar los desarrollos pertinentes. El presente documento ofrece un usuario para una empresa de pruebas con el que se podrán realizar testeos de los procesos disponibles para integrar con la API; para el uso productivo se deberá solicitar un usuario una vez realizada la implementación de la plataforma a nuestro equipo de consultoría y/o soporte.

## Aspectos Técnicos

La API está construida respetando la arquitectura RESTFul, esto quiere decir que toda la comunicación se basa en el protocolo HTTP. En dicha comunicación, se realizan distintas peticiones, que se encargará de responder el servidor, proporcionando una respuesta con un formato específico. El formato de respuesta respeta las cabeceras propias del protocolo, que variarán según un resultado positivo o negativo, y el mensaje en el cuerpo del mismo tendrá formato JSON, con la codificación UTF-8.

Toda la documentación técnica que un desarrollador necesita para poder consumir los servicios está publicada en las URL del manual indicado en la introducción del presente documento. Esta documentación es auto-generada cada vez que se despliega una nueva versión de la API, por lo que se garantiza que la información allí provista siempre estará al día y consistente.

El manual online contiene todo el detalle de uso de los endpoint disponibles, además de dar ejemplos de las posibles respuestas a peticiones.

### Login
La API requiere que el usuario que desee usarla realice un Login, previo al posterior consumo de los servicios. Esto se debe a que al proveer las credenciales (usuario y password) la API determina los roles y permisos del usuario y así permitirá o denegará las peticiones a ciertos servicios, en función de si el usuario tiene suficientes permisos.

Por lo tanto, el primer servicio a consumir es el del Login, una vez hecho esto la API devuelve un Token que tiene vigencia de 12 hs y deberá ser utilizado para realizar todas las peticiones requeridas al resto de los servicios.

---

## Datos de acceso

| Ambiente | URL | Usuario | Clave |
| :--- | :--- | :--- | :--- |
| **Pruebas api Argentina** | `https://api.stage.turecibo.com` | demo_api_turecibo | Tur3c1b04p1 |
| **Pruebas api Perú** | `https://api.stage.turecibo.com` | demo_api_turecibo_pe | Tur3c1b04p1 |
| **Pruebas api Chile** | `https://api.stage.turecibo.com` | demo_api_turecibo_cl | Tur3c1b04p1 |
| **Pruebas (front admi) Argentina** | `https://admin.stage.turecibo.com` | demo_rrhh_turecibo | Tur3c1b0r4h4 |
| **Pruebas (front admi) Perú** | `https://admin.stage.turecibo.com` | demo_rrhh_turecibo_pe | Tur3c1b0r4h4 |
| **Pruebas (front admi) Chile** | `https://admin.stage.turecibo.com` | demo_rrhh_turecibo_cl | Tur3c1b0r4h4 |
| **Pruebas (front web empleado)** | `http://web.stage.turecibo.com/` | usuarios creados en pruebas (responsable cliente) | pass asignada en las pruebas por el cliente |
| **Producción** | `https://app.turecibo.com` | *Solicitar tras implementación* | *Solicitar tras implementación* |

*\* Para el uso productivo de la API se deberán solicitar los datos de acceso una vez realizada la implementación de la plataforma a nuestro equipo de consultoría.*

---

## Procesos y Endpoints Disponibles

Esta guía detalla los pasos a seguir para la integración con nuestra API a través de los distintos endpoints disponibles para cada proceso. 

### 1. Login
Es el primer paso antes de realizar cualquier acción vía API, en este caso solo se envían los datos de usuario y clave.
*   **Endpoint:** `POST /v2/auth-mod/login`
*   **Parámetros:**
    *   `user`: el usuario según el ambiente
    *   `password`: la clave del usuario según el ambiente
*   *Nota:* El endpoint devolverá un JWT que tiene vigencia de 12 hs y deberá ser utilizado para realizar todas las peticiones requeridas.

### 2. Empleados

#### 2.1. Crear un empleado
*   **Endpoint:** `POST /user-management/users`
*   **Parámetros:**
    *   `userName`: Nombre de usuario
    *   `FirstName`: Nombres
    *   `lastName`: Apellidos
    *   `email`: Correo electrónico
    *   `password`: Contraseña *(Largo mínimo de 8 caracteres. Deberá contener letras y números. No se admiten números consecutivos)*
    *   `personalIdNumber`: Número del documento de identidad
    *   `laborIdNumber`: Número del documento de identidad laboral
    *   `birthDate`: Fecha de nacimiento
    *   `hireDate`: Fecha de contratación
    *   `FileNumber`: Número para identificar al usuario en la empresa (ej. Número de legajo en Argentina, Número de expediente en México, etc.)
    *   `skipWelcomeMail`: Indicar si se envía o no el correo de bienvenida
    *   `sector`: Nombre de la división a la que pertenece dentro de la empresa (ej. FINANZAS)
    *   `location`: Nombre de ubicación geográfica dentro de la empresa (ej. CAPITAL)
    *   `jobPosition`: Nombre del puesto o cargo que desempeña dentro de la empresa
    *   `reportsTo`: Número del documento de identidad del jefe
*   *Nota:* Al confirmar la creación, el endpoint devolverá un ID único de usuario necesario para posteriores operaciones.

#### 2.2. Crear un empleado con Onboarding
Para utilizar este proceso se deberá tener contratado el módulo de Onboarding y haber configurado previamente al menos un template.
*   **Paso A: Consultar los templates de OB activos**
    *   **Endpoint:** `GET /company-onboarding/onboardings`
    *   *Nota:* Devolverá una lista de templates activos indicando el ID a utilizar.
*   **Paso B: Crear un empleado con OB**
    *   **Endpoint:** `POST /user-management/users`
    *   **Parámetros:** Los mismos que en la creación de empleado estándar, agregando:
        *   `obTemplate`: Identificador del template de onboarding a asignar al empleado.

#### 2.3. Modificar un empleado
A través de la API se podrá actualizar la información básica, el sector, la locación, la posición y a quien reporta el empleado.

*   **2.3.1. Modificar la información básica de un empleado**
    *   **Endpoint:** `PUT /v2/admin-mod/users/{idusuario}`
    *   **Parámetros:** `usuario`, `nombre`, `apellido`, `mail`, `dni` (Identificación personal), `cuil` (Identificación fiscal), `fecha_nacimiento`, `fecha_contratacion`, `numero_legajo`.

*   **2.3.2. Modificar Sector y Locación**
    *   **Endpoint:** `PUT /v2/admin-mod/users/{idusuario}/sectorandlocation`
    *   **Parámetros:** `sector`, `locacion`

*   **2.3.3. Modificar Posición y Reporta a**
    *   **Endpoint:** `PUT /v2/admin-mod/users/{idusuario}/positionandreport`
    *   **Parámetros:** `cargo`, `reporta`

#### 2.4. Dar de baja un empleado
Este proceso permite dar de baja un empleado y ser desvinculado de la compañía.
*   **Endpoint:** `PUT /employees/{idusuario}`
*   **Parámetros:**
    *   `motivo`: Los motivos pueden ser Desvinculación, Fin de contrato, Renuncia, Jubilación, Baja de candidato u Otros.
    *   `fechabaja`
    *   `observaciones`

#### 2.5. Buscar empleados creados
Búsqueda de empleados creados mediante distintos filtros de consulta.
*   **Endpoint:** `GET /v2/admin-mod/users/search`
*   **Parámetros:**
    *   `filter`: Se pueden utilizar valores como Nombre, Apellido, Usuario o CUIL.

#### 2.6. Consultar datos de un empleado
Este proceso permite obtener toda la información básica de un empleado.
*   **Endpoint:** `GET /v2/admin-mod/users/{idusuario}`

#### 2.7. Consultar datos de Onboarding de un empleado
Este endpoint permite consultar los datos completados por un empleado en el proceso de Onboarding.
*   **Endpoint:** `POST /v2/users/onboardings`
*   **Parámetros:**
    *   `documentid`: Permite filtrar por CUIL o documento de identificación. Es un array (permite buscar varios a la vez).
    *   `dateTo`
    *   `To date` (sic)
    *   `dateFrom`
    *   `From date` (sic)
    *   `templateApprovalDate`
    *   `approvingUserId`
    *   `templateId`

### 3. Documentos

#### 3.1. Publicar un documento a todos los empleados
Permite la publicación masiva de documentos programando una ejecución asíncrona.
*   **Paso A: Consultar los tipos de documentos (subfolder) disponibles**
    *   **Endpoint:** `POST /folders/documentTypes/available`
*   **Paso B: Publicar documentos**
    *   **Endpoint:** `POST /scheduler/documents`
    *   **Parámetros:**
        *   `period`: MM/AAAA
        *   `documentType`: ID del subfolder a asignar la publicación
        *   `sendMail`: Envía correo a los empleados. 1=Si, 0=no
        *   `companyEmail`: Correo para notificar el resultado de la ejecución.
        *   `compressedFile`: ZIP con los documentos a publicar.

#### 3.2. Buscar documentos publicados
Permite realizar consultas mediante distintos filtros.
*   **Endpoint:** `POST /v2/admin-mod/documents/search`
*   **Parámetros:**
    *   `orderBy`: id (documentid), employee, fiscalId, name, period, sector, location, signStatus
    *   `orderType`: asc, desc
    *   `subFolderId`
    *   `sector`
    *   `location`
    *   `publishDateFrom`
    *   `publishDateTo`
*   *Nota:* Devolverá un JSON con el ID del documento necesario para su descarga.

#### 3.3. Descargar documentos en ZIP
Permite descargar en un ZIP un listado de documentos (máximo 500 por petición).
*   **Endpoint:** `POST /v2/admin-mod/documents/downloadFilesAsZip`
*   **Parámetros:**
    *   `documentsId`: Array con los Id de documentos a descargar.

### 4. Licencias

#### 4.1. Consultar los tipos de licencias disponibles
*   **Endpoint:** `GET /v2/licensesUser/types`
*   **Parámetros:** `name` (Permite filtrar por el nombre de una licencia)

#### 4.2. Consultar el balance de licencias disponibles
Permite consultar el balance de las licencias disponibles para los empleados activos en la plataforma.
*   **Endpoint:** `POST /v2/licensesUser/balances`

#### 4.3. Consultar el detalle de licencias disponibles de un empleado
Permite consultar el balance de las licencias disponibles para un empleado específico.
*   **Endpoint:** `POST /licensesUser/available/{idusuario}`

#### 4.4. Consultar las licencias solicitadas
Permite consultar las licencias solicitadas por los empleados activos.
*   **Endpoint:** `POST /v2/licensesUser/licenses`

#### 4.5. Consultar el detalle de una licencia solicitada
*   **Endpoint:** `GET /licensesUser/details/{Idlicencia}`

#### 4.6. Consultar el historial de movimientos de una licencia solicitada
*   **Endpoint:** `GET /licensesUser/movements/{idlicencia}`

#### 4.7. Consultar el historial de licencias de un empleado
*   **Endpoint:** `GET /licensesUser/history/{idusuario}`