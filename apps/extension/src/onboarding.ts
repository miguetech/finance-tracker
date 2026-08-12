import { SheetsApi } from '@ft/shared'
import { createInitialSpreadsheet } from '@ft/shared'
import { chromeStorageAdapter, KEYS } from '@ft/shared'

export function getChromeToken(interactive: boolean): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        if (!interactive) {
          chrome.identity.getAuthToken({ interactive: true }, (t2) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
            else resolve(t2)
          })
          return
        }
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(token)
      }
    })
  })
}

export async function ensureSheet(clientId: string): Promise<{ spreadsheetId: string; url: string } | null> {
  const existing = await chromeStorageAdapter.get(KEYS.spreadsheetId)
  if (existing) {
    const url = `https://docs.google.com/spreadsheets/d/${existing}/edit`
    return { spreadsheetId: existing, url }
  }
  const token = await getChromeToken(true)
  const api = new SheetsApi(async () => token)
  const created = await createInitialSpreadsheet(api)
  await chromeStorageAdapter.set(KEYS.spreadsheetId, created.spreadsheetId)
  return created
}
