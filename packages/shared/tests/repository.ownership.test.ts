import { afterEach, describe, expect, it, vi } from 'vitest'
import { SheetsApi } from '../src/sheets/api'
import { createRepository } from '../src/data/repository'
import { KEYS } from '../src/data/storage'
import { vincularOCrearBase } from '../src/sheets/createSpreadsheet'
import { fintaGapi, memoryStorage } from './helpers/finta-gapi'

afterEach(() => {
  vi.unstubAllGlobals()
})

const ID = {
  BASE: '1AbC0dEfGhIjKlMnOpQrStUv00',
  MIA: '1AbC0dEfGhIjKlMnOpQrStUv01',
  AJENA: '1AbC0dEfGhIjKlMnOpQrStUv02',
  SOLO_LECTURA: '1AbC0dEfGhIjKlMnOpQrStUv03',
  ESTAMPADO: '1AbC0dEfGhIjKlMnOpQrStUv04',
  EV: '1AbC0dEfGhIjKlMnOpQrStUv05',
  COMPARTIDA: '1AbC0dEfGhIjKlMnOpQrStUv06',
  SIN_OWNERS: '1AbC0dEfGhIjKlMnOpQrStUv07'
} as const

function sistema(id: string, instancia = 'i'): (string | number)[][] {
  return [['ft_vers', '1'], ['ft_instancia', instancia], ['ft_id', id], ['ft_estado', 'activo']]
}

function baseConfig() {
  return new Map([['Config', []], ['Sistema', []]])
}

function repoBase(opts?: { modo?: 'owner' | 'backend' }) {
  const storage = memoryStorage()
  const api = new SheetsApi(async () => 'T')
  const getSpreadsheetId = async () => (await storage.get(KEYS.spreadsheetId)) ?? ID.BASE
  const repo = createRepository({ api, storage, getSpreadsheetId, modo: opts?.modo })
  return { repo, storage, api }
}

describe('gate de ownership (spec F3 §7)', () => {
  it('verificarOwnership distingue es_dueño / no_es_dueño / no_verificable', async () => {
    const fake = fintaGapi({
      owners: {
        [ID.MIA]: [{ emailAddress: 'yo@x.com', me: true }],
        [ID.AJENA]: [{ emailAddress: 'otro@x.com', me: false }]
      },
      readonly: [ID.SOLO_LECTURA]
    })
    fake.docs.set(ID.MIA, baseConfig())
    fake.docs.set(ID.AJENA, baseConfig())
    fake.docs.set(ID.SOLO_LECTURA, baseConfig())
    const { repo } = repoBase()
    await expect(repo.verificarOwnership(ID.MIA)).resolves.toEqual({ estado: 'es_dueño' })
    await expect(repo.verificarOwnership(ID.AJENA)).resolves.toEqual({ estado: 'no_es_dueño', motivo: 'compartido' })
    await expect(repo.verificarOwnership(ID.SOLO_LECTURA)).resolves.toEqual({ estado: 'no_es_dueño', motivo: 'solo_lectura' })
    // Sin owners visibles o archivo fuera de namespace → no_verificable (fail-open).
    await expect(repo.verificarOwnership(ID.SIN_OWNERS)).resolves.toEqual({ estado: 'no_verificable', motivo: 'no_verificable' })
  })

  it('conectarHojaPorId rechaza hoja ajena (editor no dueño) pero acepta la propia', async () => {
    const fake = fintaGapi({
      owners: { [ID.AJENA]: [{ emailAddress: 'otro@x.com', me: false }], [ID.BASE]: [{ emailAddress: 'yo@x.com', me: true }] }
    })
    fake.docs.set(ID.AJENA, new Map([['Config', []], ['Sistema', sistema(ID.AJENA)]]))
    fake.docs.set(ID.BASE, new Map([['Config', []], ['Sistema', sistema(ID.BASE)]]))
    const { repo } = repoBase()
    await expect(repo.conectarHojaPorId(ID.AJENA)).rejects.toThrow(/no es tuya/)
    await repo.conectarHojaPorId(ID.BASE)
  })

  it('modo backend se salta el gate (service account editor)', async () => {
    const fake = fintaGapi({ owners: { [ID.AJENA]: [{ emailAddress: 'bot@backend.com', me: false }] } })
    fake.docs.set(ID.AJENA, new Map([['Config', []], ['Sistema', sistema(ID.AJENA)]]))
    const { repo } = repoBase({ modo: 'backend' })
    await repo.conectarHojaPorId(ID.AJENA)
  })

  it('vincularOCrearBase salta el candidato compartido y crea BASE nuevo estampado', async () => {
    const fake = fintaGapi({
      appProps: { [ID.COMPARTIDA]: { ft_vers: '1', ft_tipo: 'base', ft_instancia: 'i', ft_id: ID.COMPARTIDA, ft_estado: 'activo' } },
      owners: { [ID.COMPARTIDA]: [{ emailAddress: 'otro@x.com', me: false }] }
    })
    fake.docs.set(ID.COMPARTIDA, baseConfig())
    const api = new SheetsApi(async () => 'T')
    const res = await vincularOCrearBase(api)
    expect(res.creada).toBe(true)
    // El nuevo BASE quedó estampado como base.
    expect([...fake.appProps.entries()].find(([, p]) => p.ft_tipo === 'base' && p.ft_id === res.spreadsheetId)).toBeTruthy()
  })

  it('vincularOCrearBase adopta la hoja propia por huella sin duplicar', async () => {
    const fake = fintaGapi({
      appProps: { [ID.BASE]: { ft_vers: '1', ft_tipo: 'base', ft_instancia: 'i', ft_id: ID.BASE, ft_estado: 'activo' } },
      owners: { [ID.BASE]: [{ emailAddress: 'yo@x.com', me: true }] }
    })
    fake.docs.set(ID.BASE, new Map([['Config', []], ['Sistema', [['ft_instancia', 'i']]]]))
    const api = new SheetsApi(async () => 'T')
    const res = await vincularOCrearBase(api)
    expect(res.creada).toBe(false)
    expect(res.spreadsheetId).toBe(ID.BASE)
    expect([...fake.docs.keys()].length).toBe(1)
  })
})

describe('adopción legacy (spec §14)', () => {
  function baseLegacy(fake: ReturnType<typeof fintaGapi>, id: string, owners: { emailAddress?: string; me?: boolean }[]) {
    fake.owners[id] = owners
    fake.docs.set(id, new Map([['Config', []], ['Clientes', []], ['Sistema', []]]))
  }

  it('esLegacyBase reconoce Config+sistema sin huella y rechaza ya estampado', async () => {
    const fake = fintaGapi()
    fake.docs.set(ID.MIA, new Map([['Config', []], ['Clientes', []]]))
    fake.docs.set(ID.ESTAMPADO, new Map([['Config', []], ['Clientes', []]]))
    fake.appProps.set(ID.ESTAMPADO, { ft_tipo: 'base' })
    const { repo } = repoBase()
    await expect(repo.esLegacyBase(ID.MIA)).resolves.toBe(true)
    await expect(repo.esLegacyBase(ID.ESTAMPADO)).resolves.toBe(false)
  })

  it('adoptarLegacyBase exige confirmación, gate de owner, estampa huella y vincula', async () => {
    const fake = fintaGapi()
    baseLegacy(fake, ID.MIA, [{ emailAddress: 'yo@x.com', me: true }])
    const { repo, storage } = repoBase()
    await expect(repo.adoptarLegacyBase(ID.MIA, false)).rejects.toThrow(/confirmar/)
    const res = await repo.adoptarLegacyBase(ID.MIA, true)
    expect(res.spreadsheetId).toBe(ID.MIA)
    expect(fake.appProps.get(ID.MIA)?.ft_tipo).toBe('base')
    expect(fake.appProps.get(ID.MIA)?.ft_estado).toBe('activo')
    expect(await storage.get(KEYS.spreadsheetId)).toBe(ID.MIA)
  })

  it('rechaza adoptar legacy del que no se es dueño', async () => {
    const fake = fintaGapi()
    baseLegacy(fake, ID.AJENA, [{ emailAddress: 'otro@x.com', me: false }])
    const { repo } = repoBase()
    await expect(repo.adoptarLegacyBase(ID.AJENA, true)).rejects.toThrow(/no es tuya/)
  })

  it('adoptarAñoLegacy estampa eventos y registra eventos_{año}', async () => {
    const fake = fintaGapi({ owners: { [ID.EV]: [{ emailAddress: 'yo@x.com', me: true }] } })
    fake.docs.set(ID.EV, new Map([['Facturas', []], ['Pagos', []]]))
    fake.docs.set(ID.BASE, new Map([['Config', []], ['Sistema', [['ft_instancia', 'inst_x']]]]))
    const { repo } = repoBase()
    await expect(repo.adoptarAñoLegacy('2024', ID.EV, false)).rejects.toThrow(/confirmar/)
    await repo.adoptarAñoLegacy('2024', ID.EV, true)
    expect(fake.appProps.get(ID.EV)?.ft_tipo).toBe('eventos')
    expect(fake.appProps.get(ID.EV)?.ft_instancia).toBe('inst_x')
    const sistema = (fake.docs.get(ID.BASE)?.get('Sistema') ?? []) as (string | number)[][]
    expect(sistema.find(r => String(r[0]) === 'eventos_2024')?.[1]).toBe(ID.EV)
  })
})