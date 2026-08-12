import { defineBackground } from 'wxt/utils/define-background'

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['ft_spreadsheet_id'], (res) => {
      if (!res.ft_spreadsheet_id) {
        chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') })
      }
    })
  })
})
