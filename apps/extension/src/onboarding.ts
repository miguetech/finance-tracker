import { SheetsApi } from '@ft/shared'
import { createInitialSpreadsheet } from '@ft/shared'
import { chromeStorageAdapter, KEYS } from '@ft/shared'

export async function ensureSheet(clientId: string): Promise<{ spreadsheetId: string; url: string } | null> {
  const existing = await chromeStorageAdapter.get(KEYS.spreadsheetId)
  if (existing) {
    const url = `https://docs.google.com/spreadsheets/d/${existing}/edit`
    return { spreadsheetId: existing, url }
  }
  const token = await new Promise<string>((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (t) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(t as string)
    })
  })
  const api = new SheetsApi(async () => token)
  const created = await createInitialSpreadsheet(api)
  await chromeStorageAdapter.set(KEYS.spreadsheetId, created.spreadsheetId)
  return created
}
