import { describe, expect, it, vi } from 'vitest'
import { SheetsApi } from '../src/sheets/api'
import { createRepository } from '../src/data/repository'
import { fintaGapi as googleLikeApi, memoryStorage } from './helpers/finta-gapi'

export { googleLikeApi }

export function setupConBase() {
  const fake = googleLikeApi()
  fake.docs.set('BASE', new Map([['Config', []], ['Clientes', []]]))
  const api = new SheetsApi(async () => 'T')
  const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
  return { ...fake, repo }
}


describe('hoja-por-año contra API estilo Google', () => {
  it('arranque crea EVENTOS-{año}, lo registra en Config y el estado lo reporta', async () => {
    const { repo } = setupConBase()
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

  it('eliminarAño marca el año como borrado y NO lo vuelve a crear', async () => {
    const { docs, repo } = setupConBase()
    const año = String(new Date().getFullYear())
    await repo.prepararAnioActual(true)
    const docsIniciales = [...docs.keys()].filter(id => id !== 'BASE' && id.length >= 20).length
    expect(docsIniciales).toBe(1)
    await repo.eliminarAño(año)
    // La hoja del año ya no aparece como registrada (el config dice 'borrado').
    const est = await repo.estadoAlmacenamiento()
    expect(est.eventos.some(e => e.año === año)).toBe(false)
    // Arranque SIN forzar (comportamiento real del boot): NO crea NINGUNA nueva.
    const res = await repo.prepararAnioActual()
    expect(res.ok).toBe(false)
    const docsTrasBoot = [...docs.keys()].filter(id => id !== 'BASE' && id.length >= 20).length
    expect(docsTrasBoot).toBe(docsIniciales) // no se fabricó un residuo
    // Forzado explícito (botón) SÍ puede recrear (crea uno nuevo limpio).
    const res2 = await repo.prepararAnioActual(true)
    expect(res2.ok).toBe(true)
  })

  it('escritura a un año pasado sin hoja cae al BASE (no crea residuo)', async () => {
    const { docs, repo } = setupConBase()
    const cli = await repo.saveCliente({ nombre: 'LEGACY' } as never)
    // Factura de un año PASADO sin spreadsheet registrado → Facturas va al BASE.
    await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'legacy', cantidad: 1, precio_unitario: 1 }],
      fecha_emision: '1995-06-01',
      fecha_vencimiento: '',
      notas: ''
    })
    // Las Facturas del año sin hoja NUNCA fabrican un spreadsheet nuevo:
    // quedan en el BASE (legado monolítico).
    expect((docs.get('BASE')?.get('Facturas') ?? []).length).toBeGreaterThan(0)
    // Factura_Items se rutea por el año del padre (1995). Al no existir hoja
    // 1995 registrada, caen al fragmento legacy del BASE. Se NUNCA fabrica una
    // hoja de año actual para items huérfanos (§8.5).
    const docsEvento = [...docs.keys()].filter(id => id !== 'BASE' && id.length >= 20)
    expect(docsEvento).toEqual([])
    expect((docs.get('BASE')?.get('Factura_Items') ?? []).length).toBeGreaterThan(0)
  })

  it('lee tablas de evento SOLO de los años si el BASE no tiene esas pestañas', async () => {
    const { docs, repo, fetchMock } = setupConBase()
    const año = String(new Date().getFullYear())
    await repo.prepararAnioActual()
    const cli = await repo.saveCliente({ nombre: 'ACME' } as never)
    const f = await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'x', cantidad: 1, precio_unitario: 10 }],
      fecha_emision: `${año}-08-25`,
      fecha_vencimiento: '',
      notas: ''
    })
    fetchMock.mockClear()

    const todas = await repo.listFacturas()
    // El fake devuelve el grid completo (header + datos): filtrar la fila real.
    expect(todas.filter(r => String(r.id_factura) !== 'id_factura').length).toBe(1)
    expect(todas.some(r => r.id_factura === f.id_factura)).toBe(true)

    const añoId = [...docs.keys()].find(id => id !== 'BASE' && id.length >= 20)!
    const batchBase = fetchMock.mock.calls
      .map(([u]) => String(u))
      .filter(s => s.includes(`/spreadsheets/BASE/values:batchGet`))
    // El BASE solo se toca para Config/catálogos, NUNCA para tablas de evento.
    expect(batchBase.every(s => !s.includes('Facturas'))).toBe(true)
    // La leyó el archivo del año.
    const batchAño = fetchMock.mock.calls
      .map(([u]) => String(u))
      .filter(s => s.includes(`/spreadsheets/${añoId}/values:batchGet`) && s.includes('Facturas'))
    expect(batchAño.length).toBeGreaterThanOrEqual(1)
  })

  it('cursor de pull vivo con BASE sin pestañas de evento no las pide al BASE', async () => {
    const { repo, fetchMock } = setupConBase()
    await repo.prepararAnioActual()
    fetchMock.mockClear()

    const res = await repo.leerVariasTablasVivas(['Facturas', 'Tasas_Historial', 'Clientes'])
    expect(Array.isArray(res.filas.Facturas)).toBe(true)
    expect(Array.isArray(res.filas.Clientes)).toBe(true)

    const batchBase = fetchMock.mock.calls
      .map(([u]) => String(u))
      .filter(s => s.includes(`/spreadsheets/BASE/values:batchGet`))
    expect(batchBase.length).toBeGreaterThanOrEqual(1) // Config + Clientes sí
    expect(batchBase.every(s => !s.includes('Facturas') && !s.includes('Tasas_Historial'))).toBe(true)
  })

  it('BASE legacy CON pestaña de evento: su fragmento se une a los años', async () => {
    const { docs, repo } = setupConBase()
    // Usuario pre-refactor: el BASE SÍ tiene la pestaña Facturas (legado).
    // Rango '!A2:P' devuelve SOLO filas de datos (sin header): una por doc.
    const año = String(new Date().getFullYear())
    const header = ['id_factura', 'folio', 'id_cliente', 'nombre_cliente', 'fecha_emision', 'fecha_vencimiento', 'subtotal', 'iva', 'total', 'saldo', 'fecha_pago', 'notas', 'moneda', 'tipo_cambio', 'editada', 'fecha_edicion']
    const f2020 = ['fac_0', 'FAC-000', 'cli_0', 'LEGACY', '2020-06-01', '', 9, 1.44, 10.44, 10.44, '', '', 'USD', 1, '', '']
    const f26 = ['fac_1', 'FAC-001', 'cli_0', 'LEGACY', `${año}-08-25`, '', 9, 1.44, 10.44, 10.44, '', '', 'USD', 1, '', '']
    docs.get('BASE')!.set('Facturas', [header, f2020])
    docs.get('BASE')!.set('Clientes', [['cli_0', 'LEGACY', '', '', '', '', '', '', '', '', '']])
    // El archivo del año (creado en el arranque) trae una factura actual.
    await repo.prepararAnioActual()
    const añoId = [...docs.keys()].find(id => id !== 'BASE' && id.length >= 20)!
    docs.get(añoId)!.set('Facturas', [header, f26])

    const todas = await repo.listFacturas()
    expect(todas.length).toBe(2)
    expect(todas.some(f => f.fecha_emision.startsWith('2020'))).toBe(true)
    expect(todas.some(f => f.fecha_emision.startsWith(año))).toBe(true)
  })

  it('registerPago con BASE sin pestañas de evento: cobro viaja SOLO al archivo del año', async () => {
    const { docs, repo, fetchMock } = setupConBase()
    await repo.prepararAnioActual()
    const cli = await repo.saveCliente({ nombre: 'A' } as never)
    const año = String(new Date().getFullYear())
    const f = await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'a', cantidad: 1, precio_unitario: 100 }],
      fecha_emision: `${año}-08-25`,
      fecha_vencimiento: '',
      notas: ''
    })
    fetchMock.mockClear()
    await repo.registerPago({ tipo: 'cobro', id_origen: f.id_factura, fecha: `${año}-08-26`, monto: 116, metodo_pago: 'Transferencia', notas: '' })
    // Saldo actualizado en la vista unificada (buscar la fila real por id).
    const todos = await repo.listFacturas({})
    expect(todos.find(r => r.id_factura === f.id_factura)?.saldo).toBe(0)
    // El batchUpdate de saldo + pago fue SOLO al documento del año, NUNCA al BASE.
    const añoId = [...docs.keys()].find(id => id !== 'BASE' && id.length >= 20)!
    const updates = fetchMock.mock.calls
      .filter(([u]) => String(u).includes('values:batchUpdate'))
      .map(c => ({ url: String(c[0]), ranges: (JSON.parse(String(c[1]?.body)).data as { range: string }[]).map(d => d.range) }))
      .filter(u => u.ranges.some(r => /Facturas|Pagos|Gastos/.test(r)))
    expect(updates.filter(u => u.url.includes('BASE'))).toHaveLength(0)
    const aAño = updates.filter(u => u.url.includes(añoId))
    expect(aAño).toHaveLength(1)
    expect(aAño[0].ranges.some(r => r.includes('Facturas'))).toBe(true)
    expect(aAño[0].ranges.some(r => r.includes('Pagos'))).toBe(true)
    // El pago quedó en el spreadsheet del año.
    expect((docs.get(añoId)?.get('Pagos') ?? []).length).toBeGreaterThan(0)
    expect((docs.get('BASE')?.get('Pagos') ?? []).length).toBe(0)
  })

  it('registerPago legacy: cobro de factura del BASE reduce saldo en su fragmento', async () => {
    const { docs, repo, fetchMock } = setupConBase()
    await repo.prepararAnioActual()
    // Usuario PRE-refactor: el BASE conserva la pestaña de evento (legado).
    const headerFacturas = ['id_factura', 'folio', 'id_cliente', 'nombre_cliente', 'fecha_emision', 'fecha_vencimiento', 'subtotal', 'iva', 'total', 'saldo', 'fecha_pago', 'notas', 'moneda', 'tipo_cambio', 'editada', 'fecha_edicion']
    docs.get('BASE')!.set('Facturas', [headerFacturas])
    const cli = await repo.saveCliente({ nombre: 'LEGACY' } as never)
    // Año pasado sin hoja registrada → la factura vive en el fragmento del BASE.
    const f = await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'l', cantidad: 1, precio_unitario: 100 }],
      fecha_emision: '1995-06-01',
      fecha_vencimiento: '',
      notas: ''
    })
    fetchMock.mockClear()
    await repo.registerPago({ tipo: 'cobro', id_origen: f.id_factura, fecha: '1995-06-15', monto: 116, metodo_pago: 'Efectivo', notas: '' })
    const todos = await repo.listFacturas({})
    expect(todos.find(r => r.id_factura === f.id_factura)?.saldo).toBe(0)
    // El batchUpdate atómico (saldo + pago) fue al BASE, no inventó año nuevo.
    const atomic = fetchMock.mock.calls
      .filter(([u]) => String(u).includes('values:batchUpdate'))
      .map(c => ({ url: String(c[0]), ranges: (JSON.parse(String(c[1]?.body)).data as { range: string }[]).map(d => d.range) }))
      .filter(u => u.ranges.some(r => r.includes('Facturas')) && u.ranges.some(r => r.includes('Pagos')))
      .find(u => u.url.includes('BASE'))
    expect(atomic).toBeTruthy()
    // Los documentos del año no recibieron la factura legacy ni su cobro.
    const añoIds = [...docs.keys()].filter(id => id !== 'BASE' && id.length >= 20)
    for (const id of añoIds) {
      expect((docs.get(id)!.get('Facturas') ?? []).some(r => String(r[0]) === f.id_factura)).toBe(false)
      expect((docs.get(id)!.get('Pagos') ?? []).filter(r => String(r[0]).startsWith('pag_')).length).toBe(0)
    }
  })

  it('registro eventos_{año} apuntando al BASE no inyecta pestañas de evento y se repara', async () => {
    // Estado corrupto: Sistema dice que el año ES el BASE (id largo realista).
    const fake = googleLikeApi()
    const baseId = `1AbC0dEfGhIjKlMnOpQrStUv${0}`.padEnd(20, '0')
    fake.docs.set(baseId, new Map([['Sistema', [['eventos_2026', baseId], ['anio_activo', '2026']]], ['Config', []], ['Clientes', []]]))
    const api = new SheetsApi(async () => 'T')
    const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => baseId })

    await repo.leerVariasTablasVivas(['Facturas'])

    // El BASE NO ganó pestañas de evento (sin addSheet sobre el principal).
    expect([...fake.docs.get(baseId)!.keys()].sort()).toEqual(['Clientes', 'Config', 'Sistema'])
    // El registro corrupto se reparó con un spreadsheet de año real y registrar.
    const añoId = [...fake.docs.keys()].find(id => id !== baseId && id.length >= 20)
    expect(añoId).toBeTruthy()
    const sistema = (fake.docs.get(baseId)!.get('Sistema') ?? []) as (string | number)[][]
    expect(sistema.find(r => String(r[0]) === 'eventos_2026')![1]).toBe(añoId)
    // Config quedó limpia (sin claves de sistema).
    const cfg = (fake.docs.get(baseId)!.get('Config') ?? []) as (string | number)[][]
    expect(cfg.some(r => String(r[0]).startsWith('eventos_'))).toBe(false)
  })

  it('conectarAñoPorId rechaza el spreadsheet principal como archivo de año', async () => {
    const fake = googleLikeApi()
    const baseId = `1AbC0dEfGhIjKlMnOpQrStUv${1}`.padEnd(20, '0')
    fake.docs.set(baseId, new Map([['Config', []]]))
    const api = new SheetsApi(async () => 'T')
    const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => baseId })
    await expect(repo.conectarAñoPorId('2026', baseId)).rejects.toThrow(/principal/)
    // Y con un id de año real sí valida estructura sin tocar el BASE.
    const añoId = `1AbC0dEfGhIjKlMnOpQrStUv${2}`.padEnd(20, '0')
    fake.docs.set(añoId, new Map())
    await repo.conectarAñoPorId('2026', añoId)
    expect(fake.docs.has(añoId)).toBe(true)
  })

  it('los items viajan al año del PADRE y un update no los mudEia al año en curso', async () => {
    const ev2023 = `1AbC0dEfGhIjKlMnOpQrStUv${4}`.padEnd(20, '0')
    const fake = googleLikeApi()
    fake.docs.set('BASE', new Map([['Config', []], ['Clientes', []], ['Sistema', [['ft_instancia', 'i']]]]))
    fake.docs.set(ev2023, new Map([['Facturas', []], ['Factura_Items', []]]))
    const api = new SheetsApi(async () => 'T')
    const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })

    await repo.conectarAñoPorId('2023', ev2023)
    const cli = await repo.saveCliente({ nombre: 'ACME' } as never)
    const factura = await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'x', cantidad: 1, precio_unitario: 10 }],
      fecha_emision: '2023-05-10',
      fecha_vencimiento: '',
      notas: ''
    })
    // Items creados en la hoja del padre (2023), NO en el BASE ni en el año en curso.
    const itemsEV = (fake.docs.get(ev2023)?.get('Factura_Items') ?? []) as (string | number)[][]
    const itemsBASE = (fake.docs.get('BASE')?.get('Factura_Items') ?? []) as (string | number)[][]
    expect(itemsEV.some(r => String(r[0]) === factura.id_factura)).toBe(true)
    expect(itemsBASE.some(r => String(r[0]) === factura.id_factura)).toBe(false)

    // El fn updateFactura hace replaceTable de TODOS los items: §8 exige que
    // no re-rutee nada al año en curso (desharía un backfill).
    const act = await repo.updateFactura(factura.id_factura, {
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'y', cantidad: 2, precio_unitario: 5 }],
      fecha_emision: '2023-06-01',
      fecha_vencimiento: '',
      notas: 'edit'
    })
    const itemsEV2 = (fake.docs.get(ev2023)?.get('Factura_Items') ?? []) as (string | number)[][]
    expect(itemsEV2.filter(r => String(r[0]) === act.id_factura)).toHaveLength(1)
    const currentYear = String(new Date().getFullYear())
    const evActual = (fake.docs.get('BASE')?.get('Sistema') ?? []) as (string | number)[][]
    const idAnioActual = evActual.find(r => String(r[0]) === `eventos_${currentYear}`)?.[1]
    if (idAnioActual && fake.docs.has(idAnioActual)) {
      const itemsActual = (fake.docs.get(idAnioActual)?.get('Factura_Items') ?? []) as (string | number)[][]
      expect(itemsActual.some(r => String(r[0]) === act.id_factura)).toBe(false)
    }
  })

  it('sin registro adopta el EVENTOS por huella (no por nombre) y NO crea duplicado', async () => {
    const hojaYear = `1AbC0dEfGhIjKlMnOpQrStUv${3}`.padEnd(20, '0')
    const fake = googleLikeApi({ huellaEventos: [{ id: hojaYear, modifiedTime: '2026-08-01T00:00:00Z' }] })
    fake.docs.set('BASE', new Map([['Config', []], ['Clientes', []], ['Sistema', [['ft_instancia', 'inst_x']]]]))
    fake.docs.set(hojaYear, new Map([['Facturas', []]]))
    const api = new SheetsApi(async () => 'T')
    const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })

    const res = await repo.prepararAnioActual()
    expect(res.ok).toBe(true)
    // Se adoptó el huérfano: no se creó ninguna hoja de año nueva.
    const creadas = [...fake.docs.keys()].filter(id => id !== 'BASE' && id !== hojaYear)
    expect(creadas).toEqual([])
    // Y quedó registrado en Sistema como eventos_{año} = id adoptado.
    const sistema = (fake.docs.get('BASE')!.get('Sistema') ?? []) as (string | number)[][]
    const año = String(new Date().getFullYear())
    expect(sistema.find(r => String(r[0]) === `eventos_${año}`)?.[1]).toBe(hojaYear)
  })

  it('crear BASE nuevo estampa la huella en appProperties (ft_tipo/instancia/id/estado)', async () => {
    const patches: string[] = []
    const fake = googleLikeApi()
    fake.docs.set('BASE', new Map([['Config', []], ['Clientes', []], ['Sistema', [['ft_instancia', 'inst_abc']]]]))
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url).split('?')[0]
      if (u.startsWith('https://www.googleapis.com/drive/v3/files/') && (init?.method ?? 'GET') === 'PATCH') {
        patches.push(String(init?.body))
        return { ok: true, json: async () => ({}) }
      }
      return originalFetch(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const api = new SheetsApi(async () => 'T')
      const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
      const { spreadsheetId: nuevoIdV } = await repo.crearBaseVacia('Base nueva')
      expect(patches.length).toBeGreaterThanOrEqual(2)
      const cuerpos = patches.map(p => JSON.parse(p) as { appProperties: Record<string, string> })
      const estampado = cuerpos.find(b => b.appProperties.ft_tipo === 'base' && b.appProperties.ft_estado === 'activo')
      expect(estampado).toBeDefined()
      expect(estampado!.appProperties.ft_instancia.length).toBeGreaterThan(0)
      expect(estampado!.appProperties.ft_id.length).toBeGreaterThan(0)
      expect(estampado!.appProperties.ft_instancia).toBe('inst_abc')
      expect(estampado!.appProperties.ft_id).toBe(nuevoIdV)
      // El BASE viejo queda invalidado (reemplazado), no se borra.
      const reemplazo = cuerpos.find(b => b.appProperties.ft_estado === 'reemplazado')
      expect(reemplazo).toBeDefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('escritura retro en rango plausible auto-crea la hoja del año (modo owner)', async () => {
    const fake = googleLikeApi()
    fake.docs.set('BASE', new Map([['Config', []], ['Clientes', []], ['Sistema', [['ft_instancia', 'i'], ['anio_activo', '2026']]]]))
    const ant = fake.docs.get('BASE')!
    ant.set('Sistema', [['ft_instancia', 'i'], ['anio_activo', '2026']])
    const api = new SheetsApi(async () => 'T')
    const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
    const cli = await repo.saveCliente({ nombre: 'RETRO' } as never)
    const f = await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'r', cantidad: 1, precio_unitario: 10 }],
      fecha_emision: '2024-06-01',
      fecha_vencimiento: '',
      notas: ''
    })
    // Se fabricó 1 spreadsheet de año (y quedó registrado como eventos_2024).
    const idAnio = [...fake.docs.keys()].find(id => id !== 'BASE' && id.length >= 20)
    expect(idAnio).toBeTruthy()
    expect((fake.docs.get(idAnio!)?.get('Facturas') ?? []).some(r => String(r[0]) === f.id_factura)).toBe(true)
    const sistema = (fake.docs.get('BASE')!.get('Sistema') ?? []) as (string | number)[][]
    expect(sistema.find(r => String(r[0]) === 'eventos_2024')?.[1]).toBe(idAnio)
  })

  it('modo backend NUNCA auto-crea años (fragmento legacy del BASE)', async () => {
    const fake = googleLikeApi()
    fake.docs.set('BASE', new Map([['Config', []], ['Clientes', []], ['Sistema', [['ft_instancia', 'i'], ['anio_activo', '2026']]]]))
    const api = new SheetsApi(async () => 'T')
    const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'BASE', modo: 'backend' })
    // El service account escribe el BASE con pestañas de evento (legado).
    fake.docs.get('BASE')!.set('Facturas', [['id_factura', 'folio', 'id_cliente', 'nombre_cliente', 'fecha_emision', 'fecha_vencimiento', 'subtotal', 'iva', 'total', 'saldo', 'fecha_pago', 'notas', 'moneda', 'tipo_cambio', 'editada', 'fecha_edicion']])
    const cli = await repo.saveCliente({ nombre: 'BACK' } as never)
    const f = await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'b', cantidad: 1, precio_unitario: 10 }],
      fecha_emision: '2024-06-01',
      fecha_vencimiento: '',
      notas: ''
    })
    expect([...fake.docs.keys()]).toEqual(['BASE'])
    expect((fake.docs.get('BASE')!.get('Facturas') ?? []).some(r => String(r[0]) === f.id_factura)).toBe(true)
  })

  it('re-homing: items partidos en año equivocado migran al año del padre (una pasada)', async () => {
    const encabezadoEstado = ['id_factura', 'folio', 'id_cliente', 'nombre_cliente', 'fecha_emision', 'fecha_vencimiento', 'subtotal', 'iva', 'total', 'saldo', 'fecha_pago', 'notas', 'moneda', 'tipo_cambio', 'editada', 'fecha_edicion']
    const encabezadoItems = ['id_factura', 'descripcion', 'cantidad', 'precio_unitario']
    const fake = googleLikeApi()
    // ESTADO PRE-migración (bug F5 viejo §8): factura 2024 viva en EVENTOS-2024,
    // pero sus items quedaron partidos entre EVENTOS-2025 y el fragmento legacy del BASE.
    fake.docs.set('BASE', new Map([
      ['Config', []],
      ['Clientes', [['id_cliente', 'cli_1', 'ACME']]],
      ['Sistema', [['ft_instancia', 'i'], ['anio_activo', '2026'], ['eventos_2024', '1AbC0dEfGhIjKlMnOpQrStUv2024'.padEnd(20, '0')], ['eventos_2025', '1AbC0dEfGhIjKlMnOpQrStUv2025'.padEnd(20, '0')]]],
      ['Factura_Items', [encabezadoItems, ['fac_1', 'en base', 1, 10]]],
    ]))
    const sistemaRows = fake.docs.get('BASE')!.get('Sistema')! as (string | number)[][]
    const ev2024 = String(sistemaRows.find(r => String(r[0]) === 'eventos_2024')![1])
    const ev2025 = String(sistemaRows.find(r => String(r[0]) === 'eventos_2025')![1])
    fake.docs.set(ev2024, new Map([
      ['Facturas', [encabezadoEstado, ['fac_1', 'FAC-001', 'cli_1', 'ACME', '2024-06-01', '', 9, 1.44, 10.44, 10.44, '', '', 'MXN', 1, '', '']]],
      ['Factura_Items', [encabezadoItems]],
    ]))
    fake.docs.set(ev2025, new Map([
      ['Facturas', [encabezadoEstado]],
      ['Factura_Items', [encabezadoItems, ['fac_1', 'en mal año', 2, 20]]],
    ]))
    const api = new SheetsApi(async () => 'T')
    const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
    await repo.prepararAnioActual() // dispara el re-homing (una sola pasada)
    // Todos los items de fac_1 → hoja 2024; la 2025 queda sin items; BASE sin legacy.
    const items2024 = (fake.docs.get(ev2024)?.get('Factura_Items') ?? []) as (string | number)[][]
    const items2025 = (fake.docs.get(ev2025)?.get('Factura_Items') ?? []) as (string | number)[][]
    const itemsBase = (fake.docs.get('BASE')?.get('Factura_Items') ?? []) as (string | number)[][]
    expect(items2024.filter(r => String(r[0]) === 'fac_1').length).toBeGreaterThanOrEqual(1)
    expect(items2025.some(r => String(r[0]) === 'fac_1')).toBe(false)
    expect(itemsBase.some(r => String(r[0]) === 'fac_1')).toBe(false)
    // La pasada quedó marcada: un segundo prepararAnioActual no reescribe nada.
    const fer = ((fake.docs.get('BASE')!.get('Sistema') ?? []) as (string | number)[][]).find(r => String(r[0]) === 'ft_rehome_done')
    expect(fer?.[1]).toBe('1')
  })
})
