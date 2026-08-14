import { describe, expect, it } from 'vitest'
import { TABLES } from '../src/sheets/tables'
import { EmpleadoSchema, NominaInputSchema } from '../src/types/schemas'

describe('empleados schema', () => {
  it('TABLES incluye la hoja Empleados con 7 columnas', () => {
    const spec = TABLES.Empleados
    expect(spec.map(c => c.key)).toEqual(['id_empleado', 'nombre', 'rfc', 'puesto', 'salario', 'fecha_ingreso', 'activo'])
  })
  it('EmpleadoSchema requiere nombre y default salario 0', () => {
    const e = EmpleadoSchema.parse({ nombre: 'Ana' })
    expect(e.salario).toBe(0)
    expect(e.activo).toBe('true')
    expect(() => EmpleadoSchema.parse({ nombre: '' })).toThrow()
  })
  it('NominaInputSchema valida mes YYYY-MM', () => {
    expect(() => NominaInputSchema.parse({ id_empleado: 'emp_1', mes: '2026-08', monto: 100 })).not.toThrow()
    expect(() => NominaInputSchema.parse({ id_empleado: 'emp_1', mes: 'ago', monto: 100 })).toThrow()
  })
})
