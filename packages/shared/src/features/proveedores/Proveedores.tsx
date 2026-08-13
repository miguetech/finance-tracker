import React, { useState } from 'react'
import { useProveedores, useConfig } from '../../store/queries'
import { Table, Button, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { getDocLabel } from '../../taxid'
import { ProveedorFormModal } from './ProveedorFormModal'
import type { Proveedor } from '../../types/entities'

export function Proveedores() {
  const { proveedores, saveProveedor, deleteProveedor } = useProveedores()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Proveedores</h1>
        <Button onClick={() => { setEditando(null); setFormOpen(true) }}>+ Nuevo proveedor</Button>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <Table columns={[
          { key: 'nombre', header: 'Nombre', render: r => String(r.nombre) },
          { key: 'rfc', header: docLabel, render: r => String(r.rfc) },
          { key: 'email', header: 'Email', render: r => String(r.email) },
          { key: 'telefono', header: 'Teléfono', render: r => String(r.telefono) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setEditando(r as unknown as Proveedor); setFormOpen(true) }}>Editar</Button>
              <Button variant="danger" onClick={() => setDeleteId(String(r.id_proveedor))}>Eliminar</Button>
            </div>
          ) }
        ]} rows={proveedores as unknown as Record<string, unknown>[]} />
        {proveedores.length === 0 && <p className="p-4 text-sm text-gray-500">Sin proveedores</p>}
      </div>
      <ProveedorFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando}
        onSave={async p => { try { await saveProveedor.mutateAsync(p); toast('Proveedor guardado') } catch (e) { toast((e as Error).message, 'error') } }} />
      <ConfirmDialog open={deleteId !== null} title="Eliminar proveedor" message="Bloqueado si tiene cuentas por pagar. ¿Continuar?"
        onConfirm={async () => { if (deleteId) { try { await deleteProveedor.mutateAsync(deleteId); toast('Proveedor eliminado') } catch (e) { toast((e as Error).message, 'error') } } setDeleteId(null) }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
