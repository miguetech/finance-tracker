import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'FinanceTracker',
    version: '0.1.0',
    description: 'Facturación, clientes, gastos y cuentas por pagar con Google Sheets',
    permissions: ['identity', 'storage', 'tabs'],
    host_permissions: ['https://sheets.googleapis.com/*', 'https://www.googleapis.com/*'],
    oauth2: {
      client_id: 'YOUR_EXTENSION_CLIENT_ID',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    },
    action: { default_popup: 'popup.html' }
  }
})
