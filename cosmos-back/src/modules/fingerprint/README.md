# Módulo Fingerprint

Este módulo maneja la gestión de huellas dactilares de los empleados.

## Endpoints

### POST /fingerprint/save

Guarda una huella dactilar de un empleado.

**Body:**

```json
{
  "employeeId": "string (ObjectId)",
  "template": "string (Base64)",
  "quality": "number (opcional)",
  "templateLen": "number (opcional)"
}
```

**Response:**

```json
{
  "status": "success",
  "fingerprintId": "string"
}
```

### POST /fingerprint/identity

Identifica un empleado por su huella dactilar.

**Body:**

```json
{
  "template": "string (Base64)"
}
```

**Response:**

```json
{
  "employee": {
    // Datos del empleado o null si no se encuentra
  }
}
```

### PATCH /employee/:employeeId

Actualiza el estado de huella dactilar de un empleado.

**Body:**

```json
{
  "issetFinger": "boolean"
}
```

**Response:**

```json
{
  // Datos del empleado actualizado
}
```

## Modelo de Datos

### Fingerprint (colección: fingerprints)

- `employeeId`: ObjectId (referencia a Employee)
- `template`: string (Base64)
- `quality`: number (opcional)
- `templateLen`: number (opcional)
- `createdAt`: Date

### Employee (campo agregado)

- `issetFinger`: boolean (por defecto: false)

## Funcionalidades

1. **Guardar huella**: Crea un nuevo documento en la colección fingerprints
2. **Identificar huella**: Busca coincidencias exactas de templates Base64
3. **Actualizar estado**: Marca si un empleado tiene huella registrada

## Notas de Implementación

- La identificación actualmente busca coincidencias exactas de templates Base64
- Se puede extender para usar algoritmos de comparación más sofisticados
- El campo `issetFinger` en Employee se actualiza manualmente
- Todos los endpoints incluyen validación de datos y manejo de errores

