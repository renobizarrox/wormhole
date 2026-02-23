# Part 2.1 – Tenancy, Users, Access (Invitations)

This document extends section **2.1 Tenancy, Users, Access** with the design for **inviting users to a tenant/organization**.

The base models `Tenant`, `User`, `Membership`, and `AuditEvent` are already defined; here we add the **Invitation** model and the invite/accept flows.

---

## 1. Invitation model

Defined in `api/prisma/schema.prisma`:

```prisma
model Invitation {
  id               String   @id @default(uuid())
  tenantId         String   @map("tenant_id")
  email            String
  role             Role     @default(Viewer)
  token            String   @unique
  expiresAt        DateTime @map("expires_at")
  acceptedAt       DateTime? @map("accepted_at")
  createdByUserId  String   @map("created_by_user_id")
  createdAt        DateTime @default(now())

  tenant      Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdBy   User   @relation("InvitationCreatedBy", fields: [createdByUserId], references: [id], onDelete: Cascade)

  @@index([tenantId, email])
  @@index([token])
  @@map("invitations")
}
```

### Purpose

- Representa una invitación pendiente para unir a un usuario (por email) a un `Tenant` con un `Role` concreto.
- Se asocia a:
  - Un `Tenant` (`tenantId`).
  - El `User` que creó la invitación (`createdByUserId`).
- Controla caducidad y aceptación:
  - `expiresAt`: fecha de expiración del token.
  - `acceptedAt`: fecha en que se aceptó (si procede).
  - `token`: identificador único usado en el enlace de invitación.

---

## 2. Flujos de invitación

### 2.1 Invitar usuario a tenant

**GraphQL mutation (diseño):**

- `inviteUserToTenant(tenantId, email, role) -> Invitation`

Pasos de alto nivel:

1. **Autorización**
   - Sólo usuarios con rol `Owner` o `Admin` en el `tenantId` pueden invitar.
2. **Validación**
   - Email válido.
   - `role` ∈ {Owner, Admin, Builder, Viewer} (normalmente restringido a ≤ su propio rol).
3. **Creación de invitación**
   - Generar `token` aleatorio seguro (suficientemente largo).
   - Calcular `expiresAt` (p.ej. ahora + 7 días).
   - Insertar `Invitation`:
     - `tenantId`, `email`, `role`, `token`, `expiresAt`, `createdByUserId`, `createdAt`.
4. **Email (fuera de alcance MVP de código aquí, pero previsto)**
   - Enviar email con enlace del tipo:  
     `https://<frontend>/invite/accept?token=<token>`
   - El frontend usará ese token para el flujo de aceptación.
5. **Auditoría**
   - Registrar `AuditEvent`:
     - `action`: `INVITE_USER`
     - `resource`: `tenant`
     - `resourceId`: `tenantId`
     - `meta`: `{ email, role }`

### 2.2 Aceptar invitación

**GraphQL mutation (diseño):**

- `acceptInvitation(token, password?) -> { user, tenant, role }`

Flujo:

1. **Buscar invitación**
   - `Invitation` por `token`.
   - Validar:
     - Existe.
     - `acceptedAt` es `null`.
     - `expiresAt` > `now()`.
2. **Encontrar o crear usuario**
   - Buscar `User` por `email` de la invitación.
   - Si **no existe**:
     - Crear usuario con:
       - `email` de la invitación.
       - `passwordHash` derivado de `password` (si se recoge en este paso) o flujo alternativo (SSO en el futuro).
   - Si **existe**:
     - Opcional: verificar credenciales (login) antes de aceptar.
3. **Crear Membership**
   - Crear `Membership` (`tenantId`, `userId`, `role` de la invitación) si no existe ya.
4. **Marcar invitación como aceptada**
   - Establecer `acceptedAt = now()`.
5. **Auditoría**
   - `AuditEvent`:
     - `action`: `ACCEPT_INVITATION`
     - `resource`: `tenant`
     - `resourceId`: `tenantId`
     - `meta`: `{ email, role }`

### 2.3 Reglas adicionales

- Una invitación puede:
  - Ser re-enviada (mismo `token` mientras no expire).
  - Ser invalidada manualmente (implementación futura: `cancelInvitation`).
- Usuarios existentes pueden tener múltiples invitaciones para distintos tenants.

---

## 3. Cómo esto cumple \"Invite users to tenant/org.\"

- Hay un modelo explícito `Invitation` con:
  - `tenantId`, `email`, `role`, `token`, `expiresAt`, `acceptedAt`, `createdByUserId`.
- Se define un flujo de:
  - Creación de invitación (por Owner/Admin).
  - Aceptación de invitación (creando o vinculando usuario y membership).
  - Auditoría de ambos pasos.
- El frontend (Nuxt + Vuetify) implementará:
  - Pantalla de administración de usuarios/invitaciones del tenant.
  - Pantalla de aceptación de invitación a partir de `token`.
- La API GraphQL expondrá las mutations `inviteUserToTenant` y `acceptInvitation` utilizando este modelo.

Con esto, el punto **\"Invite users to tenant/org.\"** de la sección **2.1 Tenancy, Users, Access** queda cubierto a nivel de modelo de datos y diseño de flujo.

