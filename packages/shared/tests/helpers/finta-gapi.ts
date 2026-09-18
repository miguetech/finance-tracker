import { vi } from 'vitest'

export const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets'
export type Grid = Map<string, (string | number)[][]>

export function memoryStorage() {
  const m = new Map<string, string>()
  return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string) => void m.set(k, v), remove: async (k: string) => void m.delete(k) }
}

export interface FakeGapiOpts {
  /** Candidatos que devuelve la búsqueda `ft_tipo=eventos` (años huérfanos). */
  huellaEventos?: { id: string; modifiedTime?: string }[]
  /** appProperties de un archivo (huella), clave por id. */
  appProps?: Record<string, Record<string, string>>
  /** Dueños visibles por archivo; `me:true` = el usuario es dueño. */
  owners?: Record<string, { emailAddress?: string; me?: boolean }[]>
  /** Archivos de solo lectura (capabilities.canEdit=false). */
  readonly?: string[]
}

export interface FakeGapi {
  docs: Map<string, Grid>
  fetchMock: ReturnType<typeof vi.fn>
  appProps: Map<string, Record<string, string>>
  /** Mutable: asigna por id `[{ emailAddress, me }]`. */
  owners: Record<string, { emailAddress?: string; me?: boolean }[]>
}

function filasO(h: (string | number)[][] | undefined): (string | number)[][] {
  return h ?? []
}

/** Fake con semántica de Google REAL contra las URLs exactas de SheetsApi,
 *  con una capa mínima de Drive (huella appProperties + ownership) para el
 *  gate de F3. URLs:
 *  - GET  {BASE}/{id}            → 404 si no existe (throw en SheetsApi)
 *  - POST {BASE}                 → crea spreadsheet con pestaña Config
 *  - POST {BASE}/{id}:batchUpdate→ estructura (addSheet)
 *  - GET  {BASE}/{id}/values:batchGet?ranges=A&ranges=B
 *  - POST {BASE}/{id}/values:batchUpdate | :append | :clear
 *  - GET  drive/v3/files?q=…     → listado por huella
 *  - GET  drive/v3/files/{id}?fields=appProperties / owners…
 *  - PATCH drive/v3/files/{id}   → merge de appProperties
 */
export function fintaGapi(opts: FakeGapiOpts = {}): FakeGapi {
  const docs = new Map<string, Grid>()
  const appProps = new Map<string, Record<string, string>>()
  for (const [id, props] of Object.entries(opts.appProps ?? {})) appProps.set(id, props)
  const owners = opts.owners ?? {}
  const readonly = new Set(opts.readonly ?? [])
  let seq = 0

  function grid(id: string): Grid {
    if (!docs.has(id)) docs.set(id, new Map())
    return docs.get(id)!
  }

  function escribir(id: string, hoja: string, filas: (string | number)[][], desdeFila: number) {
    const g = grid(id)
    const actuales = g.get(hoja) ?? []
    filas.forEach((v, i) => { actuales[desdeFila - 1 + i] = v })
    g.set(hoja, actuales)
  }

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = url.split('?')[0]
    const method = init?.method ?? 'GET'

    // ── Drive ───────────────────────────────────────────────────────────────
    if (u.startsWith('https://www.googleapis.com/drive/v3/files')) {
      // GET de UN archivo con fields
      const mFile = u.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/]+)$/)
      if (mFile && method === 'GET') {
        const id = mFile[1]
        if (!docs.has(id)) return { ok: false, status: 404, text: async () => 'not found', json: async () => ({}) }
        const fields = new URL(url).searchParams.get('fields') ?? ''
        if (fields.includes('appProperties') && !fields.includes('owners(')) {
          return { ok: true, json: async () => ({ appProperties: appProps.get(id) ?? {} }) }
        }
        return {
          ok: true,
          json: async () => ({
            owners: owners[id] ?? [],
            capabilities: { canEdit: !readonly.has(id) },
            trashed: false
          })
        }
      }
      // PATCH de UN archivo: merge de appProperties
      if (mFile && method === 'PATCH') {
        const id = mFile[1]
        const body = JSON.parse(String(init?.body ?? '{}')) as { appProperties?: Record<string, string | null> }
        const actual = { ...(appProps.get(id) ?? {}) }
        for (const [k, v] of Object.entries(body.appProperties ?? {})) {
          if (v === null) delete actual[k]
          else actual[k] = v
        }
        appProps.set(id, actual)
        return { ok: true, json: async () => ({}) }
      }
      // Listado por huella
      if (u === 'https://www.googleapis.com/drive/v3/files' && method === 'GET') {
        const q = new URL(url).searchParams.get('q') ?? ''
        if (q.includes("ft_tipo' and value='eventos'")) {
          return { ok: true, json: async () => ({ files: opts.huellaEventos ?? [] }) }
        }
        if (q.includes("ft_tipo' and value='base'")) {
          const files = [...appProps.entries()]
            .filter(([, p]) => p.ft_tipo === 'base' && p.ft_estado !== 'reemplazado')
            .map(([id, p]) => ({ id, name: p.ft_instancia ? `base-${p.ft_instancia}` : id, modifiedTime: '2026-01-01T00:00:00Z' }))
          return { ok: true, json: async () => ({ files }) }
        }
        return { ok: true, json: async () => ({ files: [] }) }
      }
    }

    // ── Sheets ───────────────────────────────────────────────────────────────
    // Crear spreadsheet
    if (u === BASE_URL && method === 'POST') {
      const id = `1AbC${seq}dEfGhIjKlMnOpQrStUv` // formato Google: ≥20 chars con guiones posibles
      const cuerpo = JSON.parse(String(init!.body)) as { sheets?: { properties: { title: string } }[] }
      for (const sh of cuerpo.sheets ?? [{ properties: { title: 'Config' } }]) grid(id).set(sh.properties.title, [])
      return { ok: true, json: async () => ({ spreadsheetId: id, spreadsheetUrl: `x/${id}` }) }
    }

    // Estructura: {id}:batchUpdate (addSheet / autoResize etc.)
    const mEstructura = u.match(new RegExp(`^${BASE_URL}/([^/:]+):batchUpdate$`))
    if (mEstructura) {
      const id = mEstructura[1]
      if (!docs.has(id)) return { ok: false, status: 404, text: async () => 'not found', json: async () => ({}) }
      const body = JSON.parse(String(init!.body)) as { requests?: { addSheet?: { properties?: { title?: string } } }[] }
      for (const r of body.requests ?? []) {
        const t = r.addSheet?.properties?.title
        if (t && !grid(id).has(t)) grid(id).set(t, [])
      }
      return { ok: true, json: async () => ({}) }
    }

    // Metadatos: {id}
    const mMeta = u.match(new RegExp(`^${BASE_URL}/([^/?]+)$`))
    if (mMeta) {
      const id = mMeta[1]
      if (!docs.has(id)) return { ok: false, status: 404, text: async () => 'not found', json: async () => ({}) }
      const sheets = [...grid(id).keys()].map(t => ({ properties: { title: t, sheetId: 0 } }))
      return { ok: true, json: async () => ({ sheets }) }
    }

    // Escritura de valores: {id}/values:batchUpdate
    const mValores = u.match(new RegExp(`^${BASE_URL}/([^/]+)/values:batchUpdate$`))
    if (mValores) {
      const id = mValores[1]
      const body = JSON.parse(String(init!.body)) as { data: { range: string; values: (string | number)[][] }[] }
      for (const d of body.data) {
        const hoja = d.range.split('!')[0].replace(/'/g, '')
        const desdeFila = Number(d.range.split('!')[1].split(':')[0].replace(/[A-Z]/g, '')) || 1
        escribir(id, hoja, d.values, desdeFila)
      }
      return { ok: true, json: async () => ({}) }
    }

    // Lectura múltiple: {id}/values:batchGet?ranges=...
    const mLectura = u.match(new RegExp(`^${BASE_URL}/([^/]+)/values:batchGet$`))
    if (mLectura) {
      const id = mLectura[1]
      if (!docs.has(id)) return { ok: false, status: 404, text: async () => 'not found', json: async () => ({}) }
      const qs = new URL(url)
      const ranges = qs.searchParams.getAll('ranges')
      const valueRanges = ranges.map(r => {
        // Sheets real recorta al A1 del rango: 'Facturas'!A2:P excluye el header
        // (fila 1); 'Config'!A1:B500 empieza en A1.
        const hoja = r.split('!')[0].replace(/'/g, '')
        const inicio = Number((r.split('!')[1].split(':')[0]).replace(/[A-Za-z]/g, '')) || 1
        const rows = filasO(grid(id).get(hoja))
        return { range: r, values: rows.slice(inicio - 1) }
      })
      return { ok: true, json: async () => ({ valueRanges }) }
    }

    // Append: {id}/values/{rango}:append
    const mAppend = u.match(new RegExp(`^${BASE_URL}/([^/]+)/values/(.+):append$`))
    if (mAppend) {
      const id = mAppend[1]
      const rango = decodeURIComponent(mAppend[2])
      const hoja = rango.split('!')[0].replace(/'/g, '')
      // Sheets real escribe desde el A1 del rango hacia abajo (A2 → tras el header).
      const inicio = (Number(rango.split('!')[1].split(':')[0].replace(/[A-Za-z]/g, '')) || 1) - 1
      const body = JSON.parse(String(init!.body)) as { values: (string | number)[][] }
      const actuales = grid(id).get(hoja) ?? []
      let i = inicio
      while (i < actuales.length && actuales[i] && actuales[i].some(c => c !== '' && c !== undefined)) i++
      body.values.forEach((v, j) => { actuales[i + j] = v })
      grid(id).set(hoja, actuales)
      return { ok: true, json: async () => ({}) }
    }

    // Clear: {id}/values/{rango}:clear
    const mClear = u.match(new RegExp(`^${BASE_URL}/([^/]+)/values/(.+):clear$`))
    if (mClear) {
      const id = mClear[1]
      const rango = decodeURIComponent(mClear[2])
      const hoja = rango.split('!')[0].replace(/'/g, '')
      // Sheets real limpia desde la fila inicial del rango hasta el final.
      const inicio = Number(rango.split('!')[1].split(':')[0].replace(/[A-Za-z]/g, '')) || 1
      const actuales = grid(id).get(hoja) ?? []
      actuales.length = Math.max(0, inicio - 1)
      grid(id).set(hoja, actuales)
      return { ok: true, json: async () => ({}) }
    }

    return { ok: false, status: 404, text: async () => `ruta no simulada: ${u}`, json: async () => ({}) }
  })

  vi.stubGlobal('fetch', fetchMock)
  return { docs, fetchMock, appProps, owners }
}