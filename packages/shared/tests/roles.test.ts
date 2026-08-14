import { describe, it, expect } from 'vitest'
import { parseModules, viewModulesOf, editModulesOf, permsFor, MODULE_KEYS, ROLE_PRESETS } from '../src/roles/roles'
import type { Usuario } from '../src/roles/roles'

const u = (rol: Usuario['rol'], ver = '', editar = ''): Usuario => ({ email: 'a@b.c', rol, modulos_ver: ver, modulos_editar: editar })

describe('parseModules', () => {
  it('filtra solo keys válidas', () => {
    expect(parseModules('facturas,reportes,noexiste')).toEqual(['facturas', 'reportes'])
    expect(parseModules('')).toEqual([])
  })
})

describe('presets', () => {
  it('solo_lectura ve todos los módulos', () => {
    expect(ROLE_PRESETS.solo_lectura).toEqual([...MODULE_KEYS])
  })
  it('ver_facturas ve dashboard, facturas y clientes', () => {
    expect(ROLE_PRESETS.ver_facturas).toEqual(['dashboard', 'facturas', 'clientes'])
  })
})

describe('viewModulesOf', () => {
  it('personalizado usa modulos_ver', () => {
    expect(viewModulesOf(u('personalizado', 'gastos,reportes'))).toEqual(['gastos', 'reportes'])
  })
  it('asistente ve editar ∪ ver', () => {
    expect(viewModulesOf(u('asistente', 'reportes', 'gastos,facturas'))).toEqual(['reportes', 'gastos', 'facturas'])
  })
  it('preset usa su mapa', () => {
    expect(viewModulesOf(u('ver_reportes'))).toEqual(['dashboard', 'reportes'])
  })
})

describe('editModulesOf', () => {
  it('solo asistente edita sus módulos', () => {
    expect(editModulesOf(u('asistente', '', 'clientes'))).toEqual(['clientes'])
    expect(editModulesOf(u('solo_lectura'))).toEqual([])
    expect(editModulesOf(u('personalizado'))).toEqual([])
  })
})

describe('permsFor', () => {
  it('dueño es admin', () => {
    const p = permsFor('d@e.f', 'd@e.f', null)
    expect(p.isAdmin).toBe(true)
    expect(p.canView('facturas')).toBe(true)
    expect(p.canEdit('gastos')).toBe(true)
  })
  it('email no registrado → sin acceso', () => {
    const p = permsFor('x@y.z', 'd@e.f', null)
    expect(p.isAdmin).toBe(false)
    expect(p.canView('facturas')).toBe(false)
  })
  it('asistente puede editar solo sus módulos', () => {
    const p = permsFor('a@b.c', 'd@e.f', u('asistente', '', 'gastos'))
    expect(p.canEdit('gastos')).toBe(true)
    expect(p.canEdit('facturas')).toBe(false)
    expect(p.canView('gastos')).toBe(true)
  })
  it('ignora mayúsculas en email', () => {
    const p = permsFor('A@B.C', 'd@e.f', u('ver_gastos'))
    expect(p.canView('gastos')).toBe(true)
  })
})
