import { describe, expect, it, vi } from 'vitest'
import { SheetsApi } from '../src/sheets/api'
import { createRepository } from '../src/data/repository'
import type { StorageAdapter } from '../src/data/storage'

function memoryStorage(): StorageAdapter {
  const m = new Map<string, string>()
  return { get: async k => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), remove: async k => void m.delete(k) }
}

const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets'
type Grid = Map<string, (string | number)[][]>

/** Fake con semántica de Google REAL contra las URLs exactas de SheetsApi:
 *  - GET  {BASE}/{id}            → 404 si no existe (throw en SheetsApi)
 *  - POST {BASE}                 → crea spreadsheet con pestaña Config
 *  - POST {BASE}/{id}:batchUpdate→ estructura (addSheet)
 *  - GET  {BASE}/{id}/values:batchGet?ranges=A&ranges=B
 *  - POST {BASE}/{id}/values:batchUpdate | :append | :clear        */
function googleLikeApi() {
  const docs = new Map<string, Grid>()
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
      const valueRanges = ranges.map(r => ({
        range: r,
        values: grid(id).get(r.split('!')[0].replace(/'/g, '')) ?? []
      }))
      return { ok: true, json: async () => ({ valueRanges }) }
    }

    // Append: {id}/values/{rango}:append
    const mAppend = u.match(new RegExp(`^${BASE_URL}/([^/]+)/values/(.+):append$`))
    if (mAppend) {
      const id = mAppend[1]
      const hoja = decodeURIComponent(mAppend[2]).split('!')[0].replace(/'/g, '')
      const body = JSON.parse(String(init!.body)) as { values: (string | number)[][] }
      const actuales = grid(id).get(hoja) ?? []
      const primeraVacia = actuales.findIndex(f => !f || f.every(c => c === '' || c === undefined))
      const destino = primeraVacia === -1 ? actuales.length : primeraVacia
      body.values.forEach((v, i) => { actuales[destino + i] = v })
      grid(id).set(hoja, actuales)
      return { ok: true, json: async () => ({}) }
    }

    // Clear: {id}/values/{rango}:clear
    const mClear = u.match(new RegExp(`^${BASE_URL}/([^/]+)/values/(.+):clear$`))
    if (mClear) {
      const id = mClear[1]
      const hoja = decodeURIComponent(mClear[2]).split('!')[0].replace(/'/g, '')
      escribir(id, hoja, [], 1)
      return { ok: true, json: async () => ({}) }
    }

    return { ok: false, status: 404, text: async () => `ruta no simulada: ${u}`, json: async () => ({}) }
  })

  vi.stubGlobal('fetch', fetchMock)
  return { docs }
}

function setupConBase() {
  const fake = googleLikeApi()
  fake.docs.set('BASE', new Map([['Config', []], ['Clientes', []]]))
  const api = new SheetsApi(async () => 'T')
  const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
  return { ...fake, repo }
}

describe('hoja-por-año contra API estilo Google', () => {
  it('arranque crea EVENTOS-{año}, lo registra en Config y el estado lo reporta', async () => {
    const { docs, repo } = setupConBase()
    const res = await repo.prepararAnioActual()
    expect(res.ok).toBe(true)
    expect(res.modo).toBe('año')
    const est = await repo.estadoAlmacenamiento()
    expect(est.creadoAñoActual).toBe(true)
    expect(est.eventos.every(e => e.id.length >= 20)).toBe(true)
  })

  it('factura nueva cae en el spreadsheet del año, NO en el BASE', async () => {
    const { docs, repo } = setupConBase()
    await repo.prepararAnioActual()
    const cli = await repo.saveCliente({ nombre: 'ACME' } as never)
    const año = String(new Date().getFullYear())
    await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'x', cantidad: 1, precio_unitario: 10 }],
      fecha_emision: `${año}-08-25`,
      fecha_vencimiento: '',
      notas: ''
    })
    const evento = [...docs.entries()].find(([id]) => id !== 'BASE' && id.length >= 20)
    expect(evento).toBeDefined()
    // Composición exacta: solo pestañas de evento (sin Config ni catálogos).
    expect([...evento![1].keys()].sort()).toEqual([
      'Asistencias', 'Cuentas_Pagar', 'Factura_Items', 'Facturas', 'Gastos',
      'Movimientos_Stock', 'Nomina_Detalles', 'Pagos', 'Tasas_Historial'
    ])
    expect((evento![1].get('Facturas') ?? []).length).toBeGreaterThan(0)
    // El archivo del año NUEVO contiene la factura; el BASE nunca la recibió.
    expect((docs.get('BASE')?.get('Facturas') ?? []).length).toBe(0)
  })

  it('lectura de facturas une sin lanzar (legacy vacío + años registrados)', async () => {
    const { repo } = setupConBase()
    await repo.prepararAnioActual()
    const todas = await repo.listFacturas()
    expect(Array.isArray(todas)).toBe(true)
  })

  it('sin posibilidad de crear (API sin estructura) degrada a monolítico avisando', async () => {
    const fake = googleLikeApi()
    fake.docs.set('BASE', new Map([['Config', []]]))
    // Sin registrar NINGÚN doc adicional, la creación devuelve id pero
    // ensureTables fallará al leer metadatos si el fake lo impide… simulamos
    // fallo quitando la respuesta de creación: usamos API que responde 200
    // sin sheets para la sonda (fake plano).
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (/spreadsheets\/[^/?]+$/.test(u.split('?')[0]) && !u.includes('values') && !u.includes(':batch'))
        return { ok: true, json: async () => ({}) } // fake plano SIN sheets[]
      return { ok: true, json: async () => ({ spreadsheetId: 'X', spreadsheetUrl: 'x' }) }
    }))
    const api = new SheetsApi(async () => 'T')
    const repo2 = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
    const res = await repo2.prepararAnioActual()
    expect(res.ok).toBe(false)
    expect(res.modo).toBe('monolítico')
    expect(res.error).toBeTruthy()
  })
})
