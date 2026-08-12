const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export interface ValueRange {
  range: string
  values: (string | number)[][]
}

export class SheetsApi {
  constructor(private getToken: () => Promise<string>) {}

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getToken()
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Sheets API ${res.status}: ${text.slice(0, 300)}`)
    }
    return res.json() as Promise<T>
  }

  createSpreadsheet(title: string): Promise<{ spreadsheetId: string; url: string }> {
    return this.request<{ spreadsheetId: string; spreadsheetUrl: string }>(`${BASE}`, {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: [{ properties: { title: 'Config', gridProperties: { rowCount: 200, columnCount: 2 } } }]
      })
    }).then(r => ({ spreadsheetId: r.spreadsheetId, url: r.spreadsheetUrl }))
  }

  addSheets(spreadsheetId: string, titles: string[]): Promise<void> {
    return this.request(`${BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: titles.map(title => ({ addSheet: { properties: { title } } }))
      })
    }).then(() => undefined)
  }

  async batchGet(spreadsheetId: string, ranges: string[]): Promise<Record<string, (string | number)[][]>> {
    const params = new URLSearchParams()
    params.set('ranges', ranges.join(','))
    params.set('majorDimension', 'ROWS')
    params.set('valueRenderOption', 'UNFORMATTED_VALUE')
    const url = `${BASE}/${spreadsheetId}/values:batchGet?${params.toString()}`
    const res = await this.request<{ valueRanges: { values?: (string | number)[][] }[] }>(url)
    const out: Record<string, (string | number)[][]> = {}
    res.valueRanges.forEach((vr, i) => {
      out[ranges[i]] = vr.values ?? []
    })
    return out
  }

  async batchUpdate(spreadsheetId: string, valueRanges: ValueRange[]): Promise<void> {
    await this.request(`${BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: valueRanges })
    })
  }
}
