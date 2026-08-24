const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export interface ValueRange {
  range: string
  values: (string | number)[][]
}

export class SheetsApi {
  constructor(private tokenGetter: () => Promise<string>) {}

  getToken(): Promise<string> {
    return this.tokenGetter()
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const maxAttempts = 4
    for (let attempt = 0; ; attempt++) {
      const token = await this.tokenGetter()
      // Sin timeout una red que traga paquetes cuelga el modal indefinidamente.
      const ctrl = new AbortController()
      const temporizador = setTimeout(() => ctrl.abort(), 8_000)
      let res: Response
      try {
        res = await fetch(url, {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {})
          },
          signal: init.signal ?? ctrl.signal
        })
      } finally {
        clearTimeout(temporizador)
      }
      if (!res.ok) {
        if (attempt < maxAttempts - 1 && (res.status === 429 || res.status === 500 || res.status === 503)) {
          const delay = 500 * 2 ** attempt + Math.random() * 250
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        const text = await res.text()
        throw new Error(`Sheets API ${res.status}: ${text.slice(0, 300)}`)
      }
      return res.json() as Promise<T>
    }
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

  getSpreadsheet(spreadsheetId: string): Promise<{ sheets: { properties: { title: string; sheetId: number; gridProperties?: { columnCount?: number } } }[] }> {
    return this.request<{ sheets: { properties: { title: string; sheetId: number; gridProperties?: { columnCount?: number } } }[] }>(`${BASE}/${spreadsheetId}`)
  }

  /** batchUpdate a nivel de estructura de la hoja (aumentar columnas, etc.). */
  gridBatchUpdate(spreadsheetId: string, requests: unknown[]): Promise<void> {
    return this.request(`${BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests })
    }).then(() => undefined)
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
    // La API espera el parámetro repetido (ranges=A&ranges=B), no una lista separada por comas.
    for (const r of ranges) params.append('ranges', r)
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
      body: JSON.stringify({ valueInputOption: 'RAW', data: valueRanges })
    })
  }

  async appendValues(spreadsheetId: string, range: string, values: (string | number)[][]): Promise<void> {
    const encoded = encodeURIComponent(range)
    await this.request(`${BASE}/${spreadsheetId}/values/${encoded}:append?valueInputOption=RAW`, {
      method: 'POST',
      body: JSON.stringify({ values })
    })
  }

  async clearRange(spreadsheetId: string, range: string): Promise<void> {
    const encoded = encodeURIComponent(range)
    await this.request(`${BASE}/${spreadsheetId}/values/${encoded}:clear`, {
      method: 'POST',
      body: JSON.stringify({})
    })
  }
}
