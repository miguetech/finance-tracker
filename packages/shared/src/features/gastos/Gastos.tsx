import React, { useState } from 'react'
import { useGastos, useConfig, useCategorias } from '../../store/queries'
import { Table, Button, Select, Input, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { formatMoneyConverted } from '../../currency'
import { useI18n } from '../../i18n'
import { IconPlus, IconEdit, IconTrash } from '../../ui/icons'
import { GastoFormModal } from './GastoFormModal'
import type { Gasto } from '../../types/entities'

export function Gastos() {
  const { t } = useI18n()
  const { gastos, deleteGasto } = useGastos({})
  const { config } = useConfig()
  const { data: categorias = [] } = useCategorias('gastos')
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const [mes, setMes] = useState('')
  const [categoria, setCategoria] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Gasto | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const moneda = config?.moneda ?? 'USD'

  const filtrados = gastos.filter(g => (!mes || g.fecha.slice(0, 7) === mes) && (!categoria || g.categoria === categoria))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('gastos.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('gastos.subtitulo')}</p>
        </div>
        <div className="flex gap-2">
          <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
          <Select value={categoria} onChange={setCategoria} options={categorias.map(c => ({ value: c, label: c }))} placeholder={t('common.categoria')} />
          {canEdit('gastos') && (<Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>{t('gastos.nuevo')}</Button>)}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'fecha', header: t('common.fecha'), render: r => String(r.fecha) },
          { key: 'categoria', header: t('common.categoria'), render: r => String(r.categoria) },
          { key: 'descripcion', header: t('gastos.descripcion'), render: r => String(r.descripcion) },
          { key: 'monto', header: t('common.monto'), render: r => formatMoneyConverted(Number(r.monto), String(r.moneda), moneda, config) },
          { key: 'metodo_pago', header: t('common.metodo'), render: r => String(r.metodo_pago) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              {canEdit('gastos') && (<Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(r as unknown as Gasto); setFormOpen(true) }}>{t('common.editar')}</Button>)}
              {isAdmin && (<Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.id_gasto))}>{t('common.eliminar')}</Button>)}
            </div>
          ) }
        ]} rows={filtrados as unknown as Record<string, unknown>[]} />
        {filtrados.length === 0 && <p className="p-4 text-sm text-gray-500">{t('gastos.sinGastos')}</p>}
      </div>
      <GastoFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando} />
      <ConfirmDialog open={deleteId !== null} title={t('gastos.eliminarTitulo')} message={t('gastos.eliminarMensaje')}
        onConfirm={async () => { if (deleteId) { await deleteGasto.mutateAsync(deleteId); toast(t('gastos.eliminado')) } setDeleteId(null) }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
