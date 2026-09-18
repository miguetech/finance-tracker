import { describe, expect, it } from 'vitest'
import { SheetsApi } from '../src/sheets/api'
import { createRepository } from '../src/data/repository'
import { fintaGapi as googleLikeApi, memoryStorage } from './helpers/finta-gapi'

describe('inventario de hojas (spec F4 §5-§6)', () => {
  it('infoHoja del BASE propio: tipo base, estado activo, dueño y rol es_dueño', async () => {
    const fake = googleLikeApi({ owners: { BASE: [{ emailAddress: 'yo@empresa.com', me: true }] } })
    fake.docs.set('BASE', new Map([['Config', []], ['Clientes', []]]))
    fake.appProps.set('BASE', { ft_tipo: 'base', ft_instancia: 'inst_base', ft_estado: 'activo' })
    const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
    const info = await repo.infoHoja('BASE')
    expect(info.tipo).toBe('base')
    expect(info.estado).toBe('activo')
    expect(info.rol).toBe('es_dueño')
    expect(info.dueño).toBe('yo@empresa.com')
    expect(info.url).toContain('BASE/edit')
  })

  it('infoHoja de un EVENTOS con huella: tipo eventos e instancia', async () => {
    const fake = googleLikeApi({ appProps: { EV: { ft_tipo: 'eventos', ft_instancia: 'inst_x', ft_estado: 'activo' } } })
    fake.docs.set('EV', new Map([['Facturas', []], ['Gastos', []]]))
    const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
    const info = await repo.infoHoja('EV')
    expect(info.tipo).toBe('eventos')
    expect(info.instancia).toBe('inst_x')
    expect(info.estado).toBe('activo')
    expect(info.titulo).toBe('Sin título')
  })

  it('infoHoja compartida (owners sin me): rol no_es_dueño', async () => {
    const fake = googleLikeApi({ owners: { OTRA: [{ emailAddress: 'otro@x.com', me: false }] } })
    fake.docs.set('OTRA', new Map([['Config', []]]))
    fake.appProps.set('OTRA', { ft_tipo: 'base', ft_estado: 'activo' })
    const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
    const info = await repo.infoHoja('OTRA')
    expect(info.rol).toBe('no_es_dueño')
    expect(info.dueño).toBe('otro@x.com')
  })

  it('infoHoja de solo-lectura: rol no_es_dueño y editable false', async () => {
    const fake = googleLikeApi({ owners: { LEC: [{ emailAddress: 'yo@x.com', me: true }] }, readonly: ['LEC'] })
    fake.docs.set('LEC', new Map([['Config', []]]))
    fake.appProps.set('LEC', { ft_tipo: 'base', ft_estado: 'activo' })
    const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
    const info = await repo.infoHoja('LEC')
    expect(info.rol).toBe('no_es_dueño')
    expect(info.editable).toBe(false)
  })

  it('legacy sin huella: tipo desconocido y estado legacy; inalcanzable (404) → no_verificable', async () => {
    const fake = googleLikeApi({ owners: { LEG: [{ emailAddress: 'yo@x.com', me: true }] } })
    fake.docs.set('LEG', new Map([['Config', []], ['Productos', []]]))
    const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
    const leg = await repo.infoHoja('LEG')
    expect(leg.tipo).toBe('desconocido')
    expect(leg.estado).toBe('legacy')
    // Fuera del namespace/404: sin juicio de dueño, título por defecto.
    const nF = await repo.infoHoja('noExiste')
    expect(nF.rol).toBe('no_verificable')
    expect(nF.titulo).toBe('Sin título')
  })

  it('inventarioHojas: excluye el BASE de candidatas y agrupa años con identidad', async () => {
    const año = String(new Date().getFullYear())
    const añosAnteriores = String(Number(año) - 1)
    const fake = googleLikeApi({ owners: { BASE: [{ emailAddress: 'yo@x.com', me: true }], OTRABASE: [{ emailAddress: 'yo@x.com', me: true }] } })
    fake.docs.set('BASE', new Map([['Config', []], ['Clientes', []]]))
    fake.docs.set('OTRABASE', new Map([['Config', []], ['Clientes', []]]))
    fake.appProps.set('BASE', { ft_tipo: 'base', ft_instancia: 'inst_base', ft_estado: 'activo' })
    fake.appProps.set('OTRABASE', { ft_tipo: 'base', ft_instancia: 'inst_otra', ft_estado: 'activo' })
    const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
    await repo.prepararAnioActual(true)
    // Factura del año anterior → auto-creación plausible (F5) de EVENTOS-{año-1}.
    const cli = await repo.saveCliente({ nombre: 'ACME' } as never)
    await repo.createFactura({
      customer_id: cli.customer_id,
      items: [{ descripcion: 'x', cantidad: 1, unit_price: 10 }],
      issue_date: `${añosAnteriores}-03-10`,
      due_date: '',
      notas: ''
    })

    const inv = await repo.inventarioHojas()
    expect(inv.base.tipo).toBe('base')
    // El BASE NO aparece como candidata; solo la otra base con huella.
    expect(inv.candidatas.map(c => c.id)).toEqual(['OTRABASE'])
    expect(inv.candidatas[0].rol).toBe('es_dueño')
    // Los años registrados traen su identidad de huella.
    const añoInfo = inv.años.find(a => a.año === año)
    expect(añoInfo).toBeDefined()
    expect(añoInfo!.hoja.tipo).toBe('eventos')
    expect(añoInfo!.hoja.instancia).toBeTruthy()
    const pasado = inv.años.find(a => a.año === añosAnteriores)
    expect(pasado).toBeDefined()
    expect(pasado!.hoja.estado).toBe('activo')
  })

  it('modo backend: toda hoja se reporta es_dueño (service account)', async () => {
    const fake = googleLikeApi({ owners: { BASE: [{ emailAddress: 'a@x.com', me: false }] } })
    fake.docs.set('BASE', new Map([['Config', []], ['Clientes', []]]))
    const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: memoryStorage(), getSpreadsheetId: async () => 'BASE', modo: 'backend' })
    const info = await repo.infoHoja('BASE')
    expect(info.rol).toBe('es_dueño')
  })
})