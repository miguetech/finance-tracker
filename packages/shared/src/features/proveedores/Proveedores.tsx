import React, { useState } from 'react'
import { useProveedores, useConfig } from '../../store/queries'
import { Table, Button, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { getDocLabel } from '../../taxid'
import { IconPlus, IconEdit, IconTrash } from '../../ui/icons'
import { useI18n } from '../../i18n'
import { ProveedorFormModal } from './ProveedorFormModal'
import type { Proveedor } from '../../types/entities'

export function Proveedores() {
  const { t } = useI18n()
  const { proveedores, saveProveedor, deleteProveedor } = useProveedores()
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('proveedores.title')}</h1>
        {canEdit('proveedores') && (<Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>{t('proveedores.nuevo')}</Button>)}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'nombre', header: t('common.nombre'), render: r => String(r.nombre) },
          { key: 'rfc', header: docLabel, render: r => String(r.rfc) },
          { key: 'email', header: t('common.email'), render: r => String(r.email) },
          { key: 'telefono', header: t('common.telefono'), render: r => String(r.telefono) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              {canEdit('proveedores') && (<Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(r as unknown as Proveedor); setFormOpen(true) }}>{t('common.editar')}</Button>)}
              {isAdmin && (<Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.id_proveedor))}>{t('common.eliminar')}</Button>)}
            </div>
          ) }
        ]} rows={proveedores as unknown as Record<string, unknown>[]} />
        {proveedores.length === 0 && <p className="p-4 text-sm text-gray-500">{t('proveedores.sinProveedores')}</p>}
      </div>
      <ProveedorFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando}
        onSave={async p => { try { await saveProveedor.mutateAsync(p); toast(t('proveedores.guardado')) } catch (e) { toast((e as Error).message, 'error'); throw e } }} />
      <ConfirmDialog open={deleteId !== null} title={t('proveedores.eliminarTitulo')} message={t('proveedores.eliminarMensaje')}
        onConfirm={async () => { if (deleteId) { try { await deleteProveedor.mutateAsync(deleteId); toast(t('proveedores.eliminado')) } catch (e) { toast((e as Error).message, 'error') } } setDeleteId(null) }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
