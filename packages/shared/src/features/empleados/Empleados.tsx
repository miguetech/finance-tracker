import React, { useState } from 'react'
import { useEmpleados, useRegisterNomina, useGastos, useConfig } from '../../store/queries'
import { Table, Button, Badge, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { formatMoney } from '../../currency'
import { getDocLabel } from '../../taxid'
import { IconPlus, IconEdit, IconTrash } from '../../ui/icons'
import { EmpleadoFormModal } from './EmpleadoFormModal'
import { NominaModal } from './NominaModal'
import type { Empleado } from '../../types/entities'

export function Empleados() {
  const { empleados, saveEmpleado, deleteEmpleado } = useEmpleados()
  const registerNomina = useRegisterNomina()
  const { gastos } = useGastos({})
  const { config } = useConfig()
  const { isAdmin } = usePerms()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [nominaDe, setNominaDe] = useState<Empleado | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')
  const moneda = config?.moneda ?? 'USD'

  const totalPagado = (nombre: string) =>
    gastos.filter(g => g.categoria === 'Nómina' && g.proveedor === nombre).reduce((s, g) => s + Number(g.monto), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Empleados</h1>
          <p className="text-sm text-muted-foreground">Personas que trabajan contigo. Su salario se registra como gasto de nómina.</p>
        </div>
        {isAdmin && <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>Nuevo empleado</Button>}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'nombre', header: 'Nombre', render: r => String(r.nombre) },
          { key: 'rfc', header: docLabel, render: r => String(r.rfc) },
          { key: 'puesto', header: 'Puesto', render: r => String(r.puesto) },
          { key: 'salario', header: 'Salario', render: r => formatMoney(Number(r.salario), moneda) },
          { key: 'ingreso', header: 'Ingreso', render: r => String(r.fecha_ingreso) },
          { key: 'activo', header: 'Estado', render: r => <Badge tone={String(r.activo) === 'true' ? 'green' : 'gray'}>{String(r.activo) === 'true' ? 'Activo' : 'Inactivo'}</Badge> },
          { key: 'total', header: 'Total pagado', render: r => formatMoney(totalPagado(String(r.nombre)), moneda) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              {isAdmin && <Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(r as unknown as Empleado); setFormOpen(true) }}>Editar</Button>}
              {isAdmin && <Button variant="outline" onClick={() => setNominaDe(r as unknown as Empleado)}>Nómina</Button>}
              {isAdmin && <Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.id_empleado))}>Eliminar</Button>}
            </div>
          ) }
        ]} rows={empleados as unknown as Record<string, unknown>[]} />
        {empleados.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin empleados</p>}
      </div>
      <EmpleadoFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando}
        onSave={async e => { try { await saveEmpleado.mutateAsync(e); toast('Empleado guardado') } catch (err) { toast((err as Error).message, 'error'); throw err } }} />
      {nominaDe && (
        <NominaModal empleado={nominaDe} onClose={() => setNominaDe(null)}
          onSave={async i => {
            try {
              await registerNomina.mutateAsync({ id_empleado: nominaDe.id_empleado, ...i })
              toast('Nómina registrada como gasto')
            } catch (err) { toast((err as Error).message, 'error') }
          }} />
      )}
      <ConfirmDialog open={deleteId !== null} title="Eliminar empleado" message="Bloqueado si tiene nómina registrada. ¿Continuar?"
        onConfirm={async () => { if (deleteId) { try { await deleteEmpleado.mutateAsync(deleteId); toast('Empleado eliminado') } catch (err) { toast((err as Error).message, 'error') } } setDeleteId(null) }}
        onClose={() => setDeleteId(null)} />
    </div>
  )
}
