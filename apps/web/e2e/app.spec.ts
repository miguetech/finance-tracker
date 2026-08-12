import { test, expect } from '@playwright/test'

test('carga la app y muestra estado de conexión', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/conectando/i)).toBeVisible({ timeout: 15000 })
})
