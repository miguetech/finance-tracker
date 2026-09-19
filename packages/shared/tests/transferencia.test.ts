import { describe, expect, it, vi } from 'vitest'
import { SheetsApi } from '../src/sheets/api'
import { createRepository } from '../src/data/repository'
import { memoryStorage, fintaGapi } from './helpers/finta-gapi'

const BASE = '1AbCdEfGhIjKlMnOpQrStUvBASE'
const EV2025 = '1AbCdEfGhIjKlMnOpQrStUvEV25'

function baseCompleta() {
  const fake = fintaGapi({
    appProps: {
      [BASE]: { ft_tipo: 'base', ft_instancia: 'instX', ft_id: BASE, ft_estado: 'activo' },
      [EV2025]: { ft_tipo: 'eventos', ft_instancia: 'instX', ft_id: EV2025, ft_estado: 'activo' }
    },
    owners: {
      [BASE]: [{ emailAddress: 'viejo@ft.com', me: true }],
      [EV2025]: [{ emailAddress: 'viejo@ft.com', me: true }]
    }
  })
  fake.docs.set(BASE, new Map([
    ['Config', [['Clave', 'Valor']]],
    ['Clientes', []],
    ['Facturas', []],
    ['Sistema', [['ft_vers', '1'], ['ft_instancia', 'instX'], ['ft_id', BASE], ['ft_estado', 'activo'], ['eventos_2025', EV2025]]]
  ]))
  fake.docs.set(EV2025, new Map([['Facturas', []], ['Factura_Items', []], ['Gastos', []], ['Pagos', []], ['Movimientos_Stock', []], ['Asistencias', []], ['Nomina_Detalles', []], ['Cuentas_Pagar', []], ['Tasas_Historial', []]]))
  return fake
}

/** Intercepta el POST de permissions (transferOwnership) y delega lo demás. */
function conPermisos(atender: (id: string, body: Record<string, unknown>) => Promise<unknown> | unknown) {
  const fake = baseCompleta()
  const prev = fake.fetchMock
  const orden: { id: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const u = url.split('?')[0]
    const m = u.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/]+)\/permissions$/)
    if (m && (init?.method ?? 'GET') === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      orden.push({ id: m[1], body })
      return { ok: true, json: async () => (await atender(m[1], body)) ?? {} }
    }
    return prev(url, init)
  })
  return { fake, orden }
}

function repoDe(fake: ReturnType<typeof baseCompleta>, modo?: 'owner' | 'backend') {
  return createRepository({
    api: new SheetsApi(async () => 'T'),
    storage: memoryStorage(),
    getSpreadsheetId: async () => BASE,
    modo: modo ?? 'owner'
  })
}

describe('transferencia de propiedad (spec F7 §10)', () => {
  it('preflight lista EVENTOS primero y BASE al final; posible cuando todo es del dueño', async () => {
    const { fake } = conPermisos(() => undefined)
    const repo = repoDe(fake)
    const pre = await repo.preflightTransferencia('nuevo@ft.com')
    expect(pre.posible).toBe(true)
    expect(pre.retomables).toEqual([])
    expect(pre.hojas.map(h => h.tipo)).toEqual(['eventos', 'base'])
    expect(pre.hojas[0].año).toBe('2025')
    expect(pre.hojas[1].tipo).toBe('base')
  })

  it('ejecuta: marca rol=owner+transferOwnership en EVENTOS y BASE, anota ft_dueño_email y ft_transferencia', async () => {
    const { fake, orden } = conPermisos(() => {})
    const repo = repoDe(fake)
    const res = await repo.transferirSistema('Nuevo@FT.com')
    expect(res.email).toBe('nuevo@ft.com')
    expect(res.transferidos).toBe(2)
    expect(res.rechazados).toBe(0)
    // ORDEN: primero los EVENTOS, el BASE al ÚLTIMO (spec §10.4)
    expect(orden.map(o => o.id)).toEqual([EV2025, BASE])
    for (const o of orden) {
      expect(o.body.role).toBe('owner')
      expect(o.body.type).toBe('user')
      expect(o.body.emailAddress).toBe('nuevo@ft.com')
      expect(o.body.transferOwnership).toBe(true)
    }
    // ft_dueño_email best-effort antes de transferir
    expect(fake.appProps.get(EV2025)?.ft_dueño_email).toBe('nuevo@ft.com')
    expect(fake.appProps.get(BASE)?.ft_dueño_email).toBe('nuevo@ft.com')
    // Marcador: idempotente (no re-transfiere lo migrado)
    const marker = (fake.docs.get(BASE)!.get('Sistema') ?? []).find(r => String(r[0]) === 'ft_transferencia')?.[1] as string
    expect(marker).toContain('2025|eventos|' + EV2025 + '|hecho')
    expect(marker).toContain('|base|' + BASE + '|hecho')
  })

  it('si Google rechaza el BASE (403) → plan B: EVENTOS queda transferido y BASE en retomables', async () => {
    const { fake, orden } = conPermisos(id => {
      if (id === BASE) throw new Error('Drive API 403: forbidden')
    })
    const repo = repoDe(fake)
    const res = await repo.transferirSistema('nuevo@ft.com')
    expect(orden.map(o => o.id)).toEqual([EV2025, BASE])
    expect(res.resultados[0].estado).toBe('transferido')
    expect(res.resultados[1].estado).toBe('rechazado')
    expect(res.resultados[1].motivo).toContain('plan B')
    // Retomable: preflight lo lista como pendiente
    const pre = await repo.preflightTransferencia('nuevo@ft.com')
    expect(pre.retomables).toContain(BASE)
    // Y la re-ejecución NO vuelve a transferir el EVENTOS ya migrado
    const nuevamente = await repo.transferirSistema('nuevo@ft.com')
    expect(nuevamente.resultados[0].estado).toBe('ya_transferido')
  })

  it('rechaza en modo backend', async () => {
    const { fake } = conPermisos(() => {})
    const repo = repoDe(fake, 'backend')
    await expect(repo.transferirSistema('nuevo@ft.com')).rejects.toThrow(/owner/)
  })

  it('valida el email destino', async () => {
    const { fake } = conPermisos(() => {})
    const repo = repoDe(fake)
    await expect(repo.transferirSistema('no-es-un-email')).rejects.toThrow(/Email destino/)
  })

  it('preflight marca imposible cuando alguna hoja no es dueño', async () => {
    const fake = baseCompleta()
    fake.owners[EV2025] = [{ emailAddress: 'otro@ft.com', me: false }]
    const repo = repoDe(fake)
    const pre = await repo.preflightTransferencia('nuevo@ft.com')
    expect(pre.posible).toBe(false)
    expect(pre.hojas.find(h => h.id === EV2025)?.rol).toBe('no_es_dueño')
  })
})