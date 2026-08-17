import { SheetsApi } from '@ft/shared'
import { createInitialSpreadsheet, ensureTables } from '@ft/shared'
import { chromeStorageAdapter, KEYS } from '@ft/shared'

export function getChromeToken(interactive: boolean): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        if (!interactive) {
          chrome.identity.getAuthToken({ interactive: true }, (t2) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
            else if (t2) resolve(t2)
            else reject(new Error('Sin token de autorización'))
          })
          return
        }
        reject(new Error(chrome.runtime.lastError.message))
      } else if (token) {
        resolve(token)
      } else {
        reject(new Error('Sin token de autorización'))
      }
    })
  })
}

export async function ensureSheet(): Promise<{ spreadsheetId: string; url: string } | null> {
  const existing = await chromeStorageAdapter.get(KEYS.spreadsheetId)
  if (existing) {
    const token = await getChromeToken(false)
    const api = new SheetsApi(async () => token)
    await ensureTables(api, existing)
    return { spreadsheetId: existing, url: `https://docs.google.com/spreadsheets/d/${existing}/edit` }
  }
  const token = await getChromeToken(true)
  const api = new SheetsApi(async () => token)
  const created = await createInitialSpreadsheet(api)
  await chromeStorageAdapter.set(KEYS.spreadsheetId, created.spreadsheetId)
  return created
}
