import React, { useState } from 'react'
import { useClientes, useConfig } from '../../store/queries'
import { Table, Button, Input, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { getDocLabel } from '../../taxid'
import { useI18n } from '../../i18n'
import { IconPlus, IconEdit, IconTrash } from '../../ui/icons'
import { ClienteFormModal } from './ClienteFormModal'
import { ImportarClientes, descargarPlantillaClientes } from './ImportarClientes'
import { uid } from '../../lib/uid'
import { todayLocal } from '../../lib/date'
import type { Cliente } from '../../types/entities'

export function Clientes() {
  const { t } = useI18n()
  const { clientes, saveCliente, deleteCliente } = useClientes()
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')

  const filtrados = clientes.filter(c => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return c.nombre.toLowerCase().includes(q)
      || (c.alias || '').toLowerCase().includes(q)
      || c.rfc.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">{t('clientes.title')}</h1>
        <div className="flex gap-2 flex-wrap">
          <Input placeholder={`${t('common.buscar')} ${t('clientes.nombre')}, ${t('clientes.alias').toLowerCase()} ${t('clientes.o')} ${docLabel}…`} value={busqueda} onChange={e => setBusqueda(e.target.value)} className="sm:w-64" />
          {canEdit('clientes') && (
            <>
              <Button variant="outline" onClick={descargarPlantillaClientes}>{t('contactos.descargarPlantilla')}</Button>
              <ImportarClientes onImportados={async cs => {
                let n = 0
                for (const c of cs) {
                  const existe = clientes.some(x => x.nombre.trim().toLowerCase() === String(c.nombre).trim().toLowerCase())
                  if (existe) continue
                  await saveCliente.mutateAsync({ ...c, id_cliente: uid('cli_'), nombre: String(c.nombre), rfc: '', fecha_registro: todayLocal() } as Cliente)
                  n++
                }
                toast(t('contactos.importados', { n }))
              }} />
              <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>{t('clientes.nuevo')}</Button>
            </>
          )}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table
          columns={[
            { key: 'nombre', header: t('common.nombre'), render: c => String(c.nombre) },
            { key: 'rfc', header: docLabel, render: c => String(c.rfc) },
            { key: 'email', header: t('common.email'), render: c => String(c.email) },
            { key: 'telefono', header: t('common.telefono'), render: c => String(c.telefono) },
            { key: 'acciones', header: '', render: c => (
              <div className="flex gap-2">
                {canEdit('clientes') && (<Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(c as unknown as Cliente); setFormOpen(true) }}>{t('common.editar')}</Button>)}
                {isAdmin && (<Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId((c as unknown as Cliente).id_cliente)}>{t('common.eliminar')}</Button>)}
              </div>
            ) }
          ]}
          rows={filtrados as unknown as Record<string, unknown>[]}
        />
        {filtrados.length === 0 && <p className="p-4 text-sm text-gray-500">{t('clientes.sinClientes')}</p>}
      </div>
      <ClienteFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando}
        onSave={async c => {
          try { await saveCliente.mutateAsync(c); toast(t('clientes.guardado')) } catch (e) { toast((e as Error).message, 'error'); throw e }
        }} />
      <ConfirmDialog open={deleteId !== null} title={t('clientes.eliminarTitulo')} message={t('clientes.eliminarMensaje')}
        onConfirm={async () => {
          if (!deleteId) return
          try { await deleteCliente.mutateAsync(deleteId); toast(t('clientes.eliminado')) } catch (e) { toast((e as Error).message, 'error') }
          setDeleteId(null)
        }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
