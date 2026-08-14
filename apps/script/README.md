# Backend FinanceTracker (Apps Script)

Backend desplegado como Google Apps Script web app. Ejecuta como el dueño (`USER_DEPLOYING`), acceso `ANYONE_ANONYMOUS`. Toda la autorización es a nivel de app vía `id_token` de Google.

## Despliegue (dueño, 1 vez)

1. Abrir el spreadsheet → Extensions → Apps Script.
2. Borrar `Code.gs` y pegar el contenido de `dist/Code.js` (generado con `pnpm build:script`).
3. Deploy → New deployment → **Web app** → "Execute as: **Me**" → "Who has access: **Anyone**".
4. Copiar la URL del deployment y pegarla en la app → sección **Compartir**.

## Protocolo

- POST con `Content-Type: text/plain` y body JSON:
  `{ "id_token": "<google id token>", "action": "<action>", "payload": {...} }`
- Respuesta: `{ "ok": true, "data": ... }` | `{ "ok": false, "error": "..." }`.
- Acciones de lectura: `getPerms`, `getConfig`, `listClientes`, `listFacturas`,
  `getFactura`, `listGastos`, `listEmpleados`, `listProveedores`, `listCxp`,
  `listPagos`, `getReportes`, `getCategorias`.
- Acciones de escritura (asistentes): `saveCliente`, `saveGasto`, `createFactura`.
