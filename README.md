# FinanceTracker

Aplicación de **facturación personal de un solo usuario** que usa **Google Sheets** como base de datos. Permite:

- Crear **facturas** con folio autogenerado y descarga de PDF.
- Registrar **clientes** (con bloqueo de borrado si tienen facturas).
- Controlar **gastos** administrativos.
- Registrar **cuentas por pagar**.
- Generar **reportes mensuales** (facturado, cobrado, pendiente, utilidad).

Se distribuye en dos frentes que comparten el mismo núcleo:

| Frente | Tecnología | Propósito |
|---|---|---|
| Extensión de Chrome | WXT + React | Popup + dashboard de gestión |
| Web app | Vite + React | Acceso desde navegador sin instalar nada |
| Núcleo compartido | TypeScript (`packages/shared`) | Lógica de negocio, acceso a Sheets, store, testing |

## Arquitectura (monorepo)

```
finance-tracker/
├── apps/
│   ├── extension/          # Extensión Chrome (WXT)
│   │   ├── entrypoints/    # background, popup, dashboard
│   │   └── wxt.config.ts   # manifest + oauth2.client_id
│   └── web/                # Web app (Vite)
│       ├── src/auth/       # OAuth popup
│       └── .env.example    # VITE_OAUTH_CLIENT_ID / VITE_OAUTH_REDIRECT_URI
├── packages/
│   └── shared/             # Lógica de negocio + API Google Sheets + store
├── docs/                   # Spec funcional y plan de implementación
└── FUNCIONALIDADES.md      # Especificación funcional (origen)
```

Workspace gestionado con **pnpm** (`pnpm-workspace.yaml`). El núcleo compartido se importa vía `workspace:*` y contiene: modelo de datos (9 hojas), folio atómico (mutex), cálculos (IVA, utilidad), reglas de negocio (zod), acceso a la API de Sheets y testing.

## Requisitos

- **Node 22+**
- **pnpm 11+**
- **Cuenta de Google** (para OAuth y la hoja de cálculo)
- **Proyecto en Google Cloud Platform (GCP)** con Google Sheets API habilitada

## Configuración en GCP

1. **Crear proyecto** en [Google Cloud Console](https://console.cloud.google.com/).
2. **Habilitar la API**: *APIs & Services → Library* → buscar **Google Sheets API** → *Enable*.
3. **OAuth consent screen**: *APIs & Services → OAuth consent screen* → crear pantalla **External** (modo *Testing*), con tu cuenta como test user.
4. **Crear credenciales** en *APIs & Services → Credentials → Create credentials → OAuth client ID*:
   - **Chrome extension**: tipo *Chrome extension* → pegar el **ID de la extensión** (visible al cargarla con "Load unpacked" en `chrome://extensions`). Copiar el client ID a `apps/extension/wxt.config.ts` → `oauth2.client_id`.
   - **Web application**: tipo *Web application* → *Authorized redirect URIs*: `http://localhost:5173` + la URL de producción (Netlify/Vercel). Copiar el client ID a `apps/web/.env` (ver `.env.example`).
5. **Variables de entorno**:

```bash
# apps/web/.env (web app)
VITE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
VITE_OAUTH_REDIRECT_URI=http://localhost:5173
```

```ts
// apps/extension/wxt.config.ts (extensión)
oauth2: {
  client_id: 'xxxx.apps.googleusercontent.com',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
}
```

> Nota: los client IDs son secretos de configuración. En la extensión quedan en el manifest (obligatorio para `chrome.identity`); en web van en variables de entorno, nunca en el repo.

## Comandos

```bash
pnpm install                  # instalar dependencias del monorepo
pnpm dev:extension            # WXT dev (extensión en modo desarrollo)
pnpm dev:web                  # Vite dev server en http://localhost:5173
```

### Extensión (build + load unpacked)

```bash
pnpm -F extension build
```

El resultado queda en `apps/extension/.output/chrome-mv3`. En `chrome://extensions`:

1. Activar *Developer mode*.
2. *Load unpacked* → seleccionar `apps/extension/.output/chrome-mv3`.
3. Copiar el **ID de la extensión** mostrado al *OAuth client* de tipo Chrome extension en GCP (paso 4 anterior).

### Web (build + deploy)

```bash
pnpm -F web build
```

Se genera `apps/web/dist`. Desplegar a **Netlify** o **Vercel** (build: `pnpm -F web build`, publish dir: `dist`). Añadir la URL de producción a los *Authorized redirect URIs* del client Web application en GCP.

## Primer uso

1. **Permisos**: al abrir el popup/dashboard o la web, la app pide acceso a Google (cuenta con acceso al proyecto GCP como test user).
2. **Creación de la hoja**: si no existe un `spreadsheetId` guardado, se crea la hoja `FinanceTracker` con sus 9 hojas iniciales y datos de configuración.
3. **Persistencia**: el `spreadsheetId` se guarda en storage (`chrome.storage` en la extensión, `localStorage` en web) bajo la clave `ft_spreadsheet_id`. En usos siguientes se reutiliza sin volver a crear nada.

## Testing

```bash
pnpm test          # tests de packages/shared (vitest)
pnpm test:e2e      # e2e de la web app (Playwright)
```
