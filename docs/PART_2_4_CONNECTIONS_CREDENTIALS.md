# Part 2.4 – Connections (Credentials)

This document specifies how **Connections** are modeled and how they satisfy the checklist items in section **2.4 Connections (Credentials)**.

---

## 1. Overview

A **Connection** represents a concrete set of credentials and configuration that a tenant uses to talk to a given App (and optionally a specific AppVersion).  

Examples:

- \"Shopify – Store A\" connection for tenant X.
- \"NetSuite – Production\" vs \"NetSuite – Sandbox\".

Key properties:

- Scoped by `tenantId` + `appId` (a tenant can have many connections per app).
- Tied to an `AuthType` (API key, OAuth2, Basic, custom header).
- Stores **non-secret config** (e.g. accountId, region) separately from **encrypted secrets**.
- Supports **testing** (validate credentials) and **rotation** (update secrets and track versions).

---

## 2. Prisma data model

Defined in `api/prisma/schema.prisma`:

```prisma
model Connection {
  id             String   @id @default(uuid())
  tenantId       String   @map("tenant_id")
  appId          String   @map("app_id")
  appVersionId   String?  @map("app_version_id")
  name           String
  description    String?
  authType       AuthType @map("auth_type")
  config         Json?    @map("config")          // non-secret config (e.g. accountId, region)
  secretCipher   Bytes    @map("secret_cipher")   // encrypted secret blob (KMS/Vault backed)
  secretVersion  Int      @default(1) @map("secret_version")
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  rotatedAt      DateTime? @map("rotated_at")

  tenant     Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  app        App        @relation(fields: [appId], references: [id], onDelete: Cascade)
  appVersion AppVersion @relation(fields: [appVersionId], references: [id], onDelete: SetNull)

  @@index([tenantId, appId])
  @@index([tenantId, appId, isActive])
  @@map("connections")
}
```

### 2.1 CRUD per tenant/app

Checklist item: **“CRUD for `Connection` per tenant/app.”**

- `Connection.tenantId` y `Connection.appId` garantizan que:
  - Todas las conexiones están asociadas a un tenant y a un app concretos.
  - Se pueden listar fácilmente las conexiones de un tenant para un app (`WHERE tenantId = ? AND appId = ?`).
- GraphQL proveerá mutations para:
  - `createConnection(tenantId, appId, appVersionId?, name, authType, config, secret)`  
  - `updateConnection(id, ...)`  
  - `deleteConnection(id)`  
  - `setConnectionActive(id, isActive)`  

---

## 3. Encrypted credential storage

Checklist item: **“Encrypted credential storage (KMS/Vault backed).”**

- `Connection.secretCipher: Bytes` almacena **un blob cifrado** que contiene los secretos reales (API keys, client secrets, refresh tokens, passwords, etc.).
- El cifrado se realiza **en la capa de servicio**, no en Prisma:
  - El backend Node/runner Python serializan un objeto de secretos (JSON) a binario.
  - Lo cifran usando:
    - KMS del proveedor cloud, o
    - Vault transit, o
    - una clave simétrica gestionada (configurable), según el entorno.
  - El resultado cifrado se persiste en `secretCipher`.
- `secretVersion`:
  - Permite llevar un contador de versión del secreto.
  - Útil para rotación (p.ej. incrementarlo cada vez que se guarda un nuevo secreto).

**Importante:** ningún secreto se almacena en texto plano en la base de datos; solo el blob cifrado.

---

## 4. Secret masking en UI y logs

Checklist item: **“Secret masking in UI and logs.”**

- UI (Nuxt + Vuetify):
  - Nunca muestra el contenido de `secretCipher` (no se expone al frontend).
  - Exponer solo flags como:
    - `hasSecret: boolean` (derivado de que `secretCipher` no sea vacío).
    - `lastRotatedAt` (`rotatedAt`).
  - Campos de formulario tipo password/secret muestran sólo marcadores (`******`) si ya hay valor.
- Logs:
  - El backend y el runner **nunca** loguean valores de secreto.
  - Se pueden loguear metadatos como:
    - `connectionId`, `tenantId`, `appId`.
    - Resultado de validación (ok/failed).

---

## 5. Test de credenciales (validation/test connection)

Checklist item: **“Credential validation/test connection operation.”**

Diseño de mutation GraphQL (control plane):

- `testConnection(connectionId) -> { ok, errorCode?, errorMessage? }`

Pasos:

1. Resolver obtiene `Connection` por `id` y verifica que pertenece al `tenant` del usuario.
2. Desencripta `secretCipher` (usando KMS/Vault) para obtener las credenciales en claro en memoria.
3. Usa la metadata del `App`/`AppVersion`:
   - `AuthType` de la AppVersion (`API_KEY`, `OAUTH2`, etc.).
   - Config adicional (`config`) para construir la request de prueba.
4. Realiza una llamada de \"ping\" apropiada al sistema externo (definida por cada App):
   - P.ej. un endpoint de `GET /me` o `GET /account` que requiera auth.
5. Interpreta la respuesta:
   - Si 2xx → `ok: true`.
   - Si 401/403 u otros errores → `ok: false`, `errorCode`, `errorMessage`.
6. No registrar secretos en ningún punto del flujo.

El frontend expondrá un botón \"Test connection\" que llama a esta mutation.

---

## 6. Rotación de credenciales

Checklist item: **“Rotation support (manual first, automated optional later).”**

### 6.1 Rotación manual

- Mutation propuesta:
  - `rotateConnectionSecret(connectionId, newSecret) -> Connection`
- Flujo:
  1. Validar permisos (Owner/Admin sobre el tenant).
  2. Cifrar `newSecret` y actualizar:
     - `secretCipher` con el nuevo blob cifrado.
     - `secretVersion = secretVersion + 1`.
     - `rotatedAt = now()`.
  3. Opcionalmente, ejecutar `testConnection` inmediatamente después para validar.

### 6.2 Rotación automatizada (futuro)

- Se pueden programar jobs que:
  - Detecten secretos cercanos a caducar (dependiendo del proveedor).
  - Llamen a APIs del proveedor para emitir nuevas credenciales (p.ej. refresh tokens) y actualicen la conexión.
  - Esto se construirá sobre el mismo campo `secretCipher` y `secretVersion`.

---

## 7. Cómo esto cumple la sección 2.4

- **CRUD for `Connection` per tenant/app**:  
  - Modelo `Connection` con `tenantId`, `appId`, `appVersionId`, `name`, `isActive`.  
  - Permite múltiples conexiones por app/tenant, con control de activas/inactivas.

- **Encrypted credential storage (KMS/Vault backed)**:  
  - Campo `secretCipher: Bytes` almacena sólo el secreto cifrado.  
  - El cifrado lo hace la capa de servicio usando KMS/Vault/clave simétrica.

- **Secret masking in UI and logs**:  
  - Frontend sólo usa flags (`hasSecret`, `rotatedAt`) y campos enmascarados, nunca valores en claro.  
  - Logs de backend/runner no escriben secretos, sólo metadata.

- **Credential validation/test connection operation**:  
  - Diseñada mutation `testConnection(connectionId)` que ejerce un \"ping\" autenticado a la App usando el `Connection`.

- **Rotation support (manual first, automated optional later)**:  
  - Rotación manual: mutation `rotateConnectionSecret`, incremento de `secretVersion` y `rotatedAt`.  
  - Base para rotación automatizada futura.

Con esto, la sección **2.4 Connections (Credentials)** queda especificada a nivel de modelo de datos y diseño funcional.

