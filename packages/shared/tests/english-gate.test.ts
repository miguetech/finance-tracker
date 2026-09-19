import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

const REPO = '/home/miguetech/Desktop/Proyectos/finance-tracker'
const SHARED = `${REPO}/packages/shared`

function rgResidual(patterns: string[], roots: string[]): string[] {
  try {
    const out = execSync(
      `rg -n -i "${patterns.join('|')}" ${roots.join(' ')} --hidden -g '*.ts' -g '*.tsx' -g '!**/dist/**' -g '!**/.wxt/**' -g '!**/.output/**' -g '!**/.vercel/**' -g '!**/node_modules/**' 2>/dev/null`,
      { encoding: 'utf8' },
    )
    return out.split('\n').filter(Boolean).filter(l => !/GLOSARIO|INGLES_GLOSARIO/i.test(l))
  } catch {
    return []
  }
}

describe('Gate: unification to English — lockstep identifiers + strings (TDD, no skipping)', () => {
  it('no residual Spanish wire identifiers in source (lockstep)', () => {
    const residual = rgResidual(
      ['saveCliente', 'saveGasto', 'saveFactura', 'saveProveedor', 'saveEmpleado',
       'saveProducto', 'registerNomina', 'registerAsistencia',
       'listClientes', 'listFacturas', 'listGastos', 'listProveedores',
       'listEmpleados', 'listProductos', 'canView', 'canEdit', 'ft_config_cache'],
      [`${SHARED}/src`],
    )
    expect(residual).toEqual([])
  })

  it('no residual Spanish i18n keys colaSync lockstep (regression fix)', () => {
    const residual = rgResidual(
      ['cola.metodos.saveCliente', 'cola.metodos.saveGasto', 'cola.metodos.saveFactura',
       'cola.metodos.registerNomina', 'cola.metodos.registerAsistencia'],
      [`${SHARED}/src/i18n`, `${SHARED}/src/ui`],
    )
    expect(residual).toEqual([])
  })
})
