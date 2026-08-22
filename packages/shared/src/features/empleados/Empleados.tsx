import React, { useState } from 'react'
import { useEmpleados, useNominaDetalles, useGastos, useConfig } from '../../store/queries'
import { Table, Button, Badge, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { formatMoney } from '../../currency'
import { getDocLabel } from '../../taxid'
import { IconPlus, IconEdit, IconTrash } from '../../ui/icons'
import { useI18n } from '../../i18n'
import { EmpleadoFormModal } from './EmpleadoFormModal'
import { NominaModal } from './NominaModal'
import type { Empleado } from '../../types/entities'

export function Empleados() {
  const { t } = useI18n()
  const { empleados, saveEmpleado, deleteEmpleado } = useEmpleados()
  const { registerNominaAvanzada } = useNominaDetalles()
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
          <h1 className="text-xl font-bold">{t('empleados.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('empleados.subtitulo')}</p>
        </div>
        {isAdmin && <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>{t('empleados.nuevo')}</Button>}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'nombre', header: t('common.nombre'), render: r => String(r.nombre) },
          { key: 'rfc', header: docLabel, render: r => String(r.rfc) },
          { key: 'puesto', header: t('empleados.puesto'), render: r => String(r.puesto) },
          { key: 'salario', header: t('empleados.salario'), render: r => formatMoney(Number(r.salario), String(r.salario_moneda) || moneda) },
          { key: 'ingreso', header: t('empleados.ingreso'), render: r => String(r.fecha_ingreso) },
          { key: 'activo', header: t('common.estado'), render: r => <Badge tone={String(r.activo) === 'true' ? 'green' : 'gray'}>{String(r.activo) === 'true' ? t('empleados.activo') : t('empleados.inactivo')}</Badge> },
          { key: 'total', header: t('empleados.totalPagado'), render: r => formatMoney(totalPagado(String(r.nombre)), moneda) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              {isAdmin && <Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(r as unknown as Empleado); setFormOpen(true) }}>{t('common.editar')}</Button>}
              {isAdmin && <Button variant="outline" onClick={() => setNominaDe(r as unknown as Empleado)}>{t('empleados.nomina')}</Button>}
              {isAdmin && <Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.id_empleado))}>{t('common.eliminar')}</Button>}
            </div>
          ) }
        ]} rows={empleados as unknown as Record<string, unknown>[]} />
        {empleados.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t('empleados.sinEmpleados')}</p>}
      </div>
      <EmpleadoFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando}
        onSave={async e => { try { await saveEmpleado.mutateAsync(e); toast(t('empleados.guardado')) } catch (err) { toast((err as Error).message, 'error'); throw err } }} />
      {nominaDe && (
        <NominaModal empleado={nominaDe} onClose={() => setNominaDe(null)}
          onSave={async i => {
            try {
              await registerNominaAvanzada.mutateAsync({ id_empleado: nominaDe.id_empleado, ...i })
              toast(t('empleados.nominaRegistrada'))
            } catch (err) { toast((err as Error).message, 'error') }
          }} />
      )}
      <ConfirmDialog open={deleteId !== null} title={t('empleados.eliminarTitulo')} message={t('empleados.eliminarMensaje')}
        onConfirm={async () => { if (deleteId) { try { await deleteEmpleado.mutateAsync(deleteId); toast(t('empleados.eliminado')) } catch (err) { toast((err as Error).message, 'error') } } setDeleteId(null) }}
        onClose={() => setDeleteId(null)} />
    </div>
  )
}
