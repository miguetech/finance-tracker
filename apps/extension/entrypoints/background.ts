import { defineBackground } from 'wxt/utils/define-background'
import { KEYS } from '@ft/shared'

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get([KEYS.spreadsheetId], (res) => {
      if (!res[KEYS.spreadsheetId]) {
        chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') })
      }
    })
  })
})
