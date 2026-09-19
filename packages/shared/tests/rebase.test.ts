import { describe, expect, it } from 'vitest'
import { SheetsApi } from '../src/sheets/api'
import { createRepository } from '../src/data/repository'
import { fintaGapi as googleLikeApi, memoryStorage } from './helpers/finta-gapi'
import { KEYS } from '../src/data/storage'
import { SISTEMA_RANGO } from '../src/sheets/sistema'

function baseCompleta() {
  const fake = googleLikeApi({ owners: { BASE: [{ emailAddress: 'yo@x.com', me: true }] } })
  fake.docs.set('BASE', new Map([
    ['Config', []], ['Clientes', []], ['Productos', []], ['Proveedores', []],
    ['Empleados', []], ['Usuarios', []], ['Codigos_Acceso', []], ['Gastos_Fijos', []],
    ['Dispositivos', []], ['Sistema', []]
  ]))
  fake.appProps.set('BASE', { ft_tipo: 'base', ft_instancia: 'inst_X', ft_estado: 'activo' })
  return fake
}

describe('re-sync al cambiar BASE (spec F6 §11)', () => {
  it('crea BASE nuevo con misma instancia, copia Config/Sistema/catálogos e invalida el viejo', async () => {
    const fake = baseCompleta()
    const api = new SheetsApi(async () => 'T')
    const storage = memoryStorage()
    let current = 'BASE'
    const repo = createRepository({ api, storage, getSpreadsheetId: async () => current })

    // Semillas: Config de negocio, Sistema y catálogos.
    await api.batchUpdate('BASE', [
      { range: "'Config'!A1:B3", values: [['Clave', 'Valor'], ['moneda', 'USD'], ['empresa_nombre', 'Mi Empresa']] },
      { range: SISTEMA_RANGO, values: [
        ['ft_vers', '1'], ['ft_instancia', 'inst_X'], ['ft_id', 'BASE'], ['ft_estado', 'activo'],
        ['anio_activo', '2026'], ['eventos_2025', '1AbC0dEfGhIjKlMnOpQrStUv2025']
      ] }
    ])
    const _cli = await repo.saveCliente({ nombre: 'ACME' } as never)
    await repo.saveProducto({ nombre: 'Cafe', existencia_minima: '2' } as never)

    const { spreadsheetId: nuevo } = await repo.crearBaseVacia('Mi Empresa (nuevo)')
    expect(nuevo).toBeTruthy()
    expect(nuevo).not.toBe('BASE')
    current = nuevo

    // Vincular local: storage apuntado al nuevo BASE + hojaActual resuelve ahí.
    expect(await storage.get(KEYS.spreadsheetId)).toBe(nuevo)
    expect((await repo.hojaActual()).id).toBe(nuevo)

    // Identidad: nueva instancia conservada, ft_id ajustado, estado activo.
    const infoNuevo = await repo.infoHoja(nuevo)
    expect(infoNuevo.tipo).toBe('base')
    expect(infoNuevo.estado).toBe('activo')
    const rowsNuevo = (fake.docs.get(nuevo)!.get('Sistema') ?? []) as (string | number)[][]
    const mapaNuevo = Object.fromEntries(rowsNuevo.map(r => [String(r[0]), String(r[1] ?? '')]))
    expect(mapaNuevo.ft_instancia).toBe('inst_X')
    expect(mapaNuevo.ft_id).toBe(nuevo)
    expect(mapaNuevo.ft_estado).toBe('activo')
    expect(mapaNuevo.eventos_2025).toBe('1AbC0dEfGhIjKlMnOpQrStUv2025')

    // Config copiada (no los defaults del archivo nuevo).
    const configNuevo = Object.fromEntries(
      ((fake.docs.get(nuevo)!.get('Config') ?? []) as (string | number)[][]).map(r => [String(r[0]), String(r[1] ?? '')])
    )
    expect(configNuevo.moneda).toBe('USD')
    expect(configNuevo.empresa_nombre).toBe('Mi Empresa')

    // Catálogos re-sincronizados.
    const clientesNuevo = (fake.docs.get(nuevo)!.get('Clientes') ?? []) as (string | number)[][]
    const productosNuevo = (fake.docs.get(nuevo)!.get('Productos') ?? []) as (string | number)[][]
    expect(clientesNuevo.some(r => String(r[1] ?? '') === 'ACME')).toBe(true)
    expect(productosNuevo.some(r => String(r[1] ?? '') === 'Cafe')).toBe(true)

    // BASE viejo invalidado tanto en appProperties como en la pestaña Sistema.
    expect(fake.appProps.get('BASE')?.ft_estado).toBe('reemplazado')
    const rowsViejo = (fake.docs.get('BASE')!.get('Sistema') ?? []) as (string | number)[][]
    const mapaViejo = Object.fromEntries(rowsViejo.map(r => [String(r[0]), String(r[1] ?? '')]))
    expect(mapaViejo.ft_estado).toBe('reemplazado')

    // El viejo ya no aparece como candidata activa del inventario.
    const inv = await repo.inventarioHojas()
    expect(inv.candidatas.map(c => c.id)).not.toContain('BASE')
  })

  it('rechaza en modo backend (service account nunca cambia de BASE)', async () => {
    const _fake = baseCompleta()
    const repo = createRepository({
      api: new SheetsApi(async () => 'T'),
      storage: memoryStorage(),
      getSpreadsheetId: async () => 'BASE',
      modo: 'backend'
    })
    await expect(repo.crearBaseVacia('Nuevo')).rejects.toThrow('modo backend')
  })

  it('rechaza si el BASE de origen es de solo lectura (gate de ownership)', async () => {
    const fake = baseCompleta()
    fake.owners.BASE = [{ emailAddress: 'otro@x.com', me: false }]
    const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: memoryStorage(), getSpreadsheetId: async () => 'BASE' })
    await expect(repo.crearBaseVacia('Nuevo')).rejects.toThrow(/no es tuya|solo lectura|No disponible|dueño/i)
  })
})