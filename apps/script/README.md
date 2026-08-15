# Backend FinanceTracker (Apps Script)

Backend desplegado como Google Apps Script web app. Ejecuta como el dueño (`USER_DEPLOYING`), acceso `ANYONE_ANONYMOUS`. Toda la autorización es a nivel de app vía `id_token` de Google.

## Despliegue (dueño, 1 vez)

1. Abrir el spreadsheet → Extensions → Apps Script.
2. Borrar `Code.gs` y pegar el contenido de `dist/Code.js` (generado con `pnpm build:script`).
3. Deploy → New deployment → **Web app** → "Execute as: **Me**" → "Who has access: **Anyone**".
4. Copiar la URL del deployment y pegarla en la app → sección **Compartir**.

## Protocolo

- **GET** con query params (Apps Script no envía CORS en POST; el GET sí):
  `https://<url>/exec?action=<accion>&id_token=<google id token>&payload=<json>`
- `payload` es el JSON serializado de los argumentos (para `getReportes` es un string con el mes).
- Respuesta: `{ "ok": true, "data": ... }` | `{ "ok": false, "error": "..." }`.
- Acciones de lectura: `getPerms`, `getConfig`, `listClientes`, `listFacturas`,
  `getFactura`, `listGastos`, `listEmpleados`, `listProveedores`, `listCxp`,
  `listPagos`, `getReportes`, `getCategorias`.
- Acciones de escritura (asistentes): `saveCliente`, `saveGasto`, `createFactura`.

## Actualizar el código desplegado (misma URL)

1. Pegar el nuevo contenido de `dist/Code.js` en `Code.gs`.
2. **Deploy → Manage deployments** → editar (lápiz) el web app → **Version: New version** → **Deploy**.
3. La URL del web app **no cambia**; los invitados no necesitan el link nuevo.
