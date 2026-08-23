import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Auto-imports de WXT desactivados: colisionan con identificadores
  // (`storage`) del código compartido, que usa imports explícitos.
  imports: false,
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'FinanceTracker',
    version: '0.1.0',
    description: 'Facturación, clientes, gastos y cuentas por pagar con Google Sheets',
    permissions: ['identity', 'storage', 'tabs'],
    host_permissions: ['https://sheets.googleapis.com/*', 'https://www.googleapis.com/*'],
    oauth2: {
      client_id: '464340901772-r2jnia93ppf2k631jh0ugvqm8au09r3l.apps.googleusercontent.com',
      scopes: ['https://www.googleapis.com/auth/drive.file']
    },
    action: { default_popup: 'popup.html' }
  }
})
