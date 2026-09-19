import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Auto-imports de WXT desactivados: colisionan con identificadores
  // (`storage`) del código compartido, que usa imports explícitos.
  imports: false,
  vite: () => ({
    plugins: [tailwindcss()],
    // Igual que en web: el wasm/worker de sqlite no tolera pre-bundle.
    optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] }
  }),
  manifest: {
    name: 'FinanceTracker',
    version: '0.1.0',
    description: 'Facturación, clientes, gastos y cuentas por pagar con Google Sheets',
    permissions: ['identity', 'storage', 'tabs'],
    host_permissions: ['https://sheets.googleapis.com/*', 'https://www.googleapis.com/*'],
    oauth2: {
      // Client OAuth ÚNICO web+extensión (F0/F2: el namespace drive.file es por
      // client). Es el MISMO de apps/web/.env[.local] VITE_OAUTH_CLIENT_ID.
      // GCP: este client tipo "Web application" debe autorizar también el
      // origen chrome-extension://<ID> para que chrome.identity funcione.
      client_id: '464340901772-g5p0kbdojftnllvkog718gn1ms294d87.apps.googleusercontent.com',
      scopes: [
        'openid',
        'email',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.appdata',
        'https://www.googleapis.com/auth/spreadsheets'
      ]
    },
    action: { default_popup: 'popup.html' }
  }
})
