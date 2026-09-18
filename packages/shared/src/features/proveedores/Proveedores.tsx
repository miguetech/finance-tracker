import React, { useRef, useState } from 'react'
import { useProveedores, useConfig } from '../../store/queries'
import { Table, Button, ConfirmDialog, Dialog, Input } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { getDocLabel } from '../../taxid'
import { IconPlus, IconEdit, IconTrash } from '../../ui/icons'
import { useI18n } from '../../i18n'
import { whatsappUrl, mailtoUrl, contactosDesdeCsv } from '../../lib/contactos'
import { todayLocal } from '../../lib/date'
import { uid } from '../../lib/uid'
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
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.doc_type_label ?? '')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">{t('proveedores.title')}</h1>
        <div className="flex gap-2">
          {canEdit('proveedores') && <ImportarContactos onImportados={async (nuevos) => {
            for (const c of nuevos) {
              await saveProveedor.mutateAsync({ supplier_id: uid('prov_'), nombre: c.nombre, rfc: '', email: c.email, telefono: c.telefono, direccion: '', created_at: todayLocal() })
            }
          }} />}
          {canEdit('proveedores') && (<Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>{t('proveedores.nuevo')}</Button>)}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'nombre', header: t('common.nombre'), render: r => String(r.nombre) },
          { key: 'rfc', header: docLabel, render: r => String(r.rfc) },
          { key: 'email', header: t('common.email'), render: r => String(r.email) },
          { key: 'telefono', header: t('common.telefono'), render: r => String(r.telefono) },
          { key: 'acciones', header: '', render: r => {
            const prov = r as unknown as Proveedor
            return (
              <div className="flex gap-1.5 items-center flex-wrap">
                <a href={whatsappUrl(prov.telefono, `Hola ${prov.nombre}, `)} target="_blank" rel="noreferrer"
                  title={prov.telefono ? t('whatsapp.abrirWhatsApp') : t('whatsapp.sinTelefono')}>
                  <Button size="sm" variant="success" disabled={!prov.telefono}>{t('whatsapp.abrirWhatsApp')}</Button>
                </a>
                <a href={mailtoUrl(prov.email, '')} title={t('whatsapp.abrirEmail')}>
                  <Button size="sm" variant="outline" disabled={!prov.email}>{'✉'}</Button>
                </a>
                {canEdit('proveedores') && (<Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(prov); setFormOpen(true) }}>{t('common.editar')}</Button>)}
                {isAdmin && (<Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.supplier_id))}>{t('common.eliminar')}</Button>)}
              </div>
            )
          } }
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

/** Importación de contactos desde archivo CSV (formato Google Contacts o genérico). */
export function ImportarContactos({ onImportados }: { onImportados: (contactos: ReturnType<typeof contactosDesdeCsv>) => Promise<void> }) {
  const { t } = useI18n()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ReturnType<typeof contactosDesdeCsv>>([])
  const [codigoPais, setCodigoPais] = useState('')
  const [importando, setImportando] = useState(false)

  const leerArchivo = async (file: File | null) => {
    if (!file) return
    try {
      const texto = await file.text()
      const cs = contactosDesdeCsv(texto, codigoPais, 'csv')
      if (cs.length === 0) { toast(t('contactos.errorFormato'), 'error'); return }
      setPreview(cs)
    } catch {
      toast(t('contactos.errorFormato'), 'error')
    }
  }

  const confirmar = async () => {
    setImportando(true)
    try {
      await onImportados(preview)
      toast(t('contactos.importados', { n: preview.length }))
      setPreview([])
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setImportando(false)
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { void leerArchivo(e.target.files?.[0] ?? null); e.target.value = '' }} />
      <Button variant="outline" onClick={() => inputRef.current?.click()}>{t('contactos.importarCSV')}</Button>
      <Dialog open={preview.length > 0} onClose={() => setPreview([])} title={t('contactos.importar')}
        footer={<>
          <Button variant="outline" onClick={() => setPreview([])} disabled={importando}>{t('common.cancelar')}</Button>
          <Button onClick={confirmar} disabled={importando}>{importando ? t('imagenes.subiendo') : t('common.guardar')}</Button>
        </>}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('contactos.formatoAuto')}</p>
          <Input placeholder={`${t('contactos.codigoPais')} (ej. 58)`} value={codigoPais}
            onChange={e => setCodigoPais(e.target.value.replace(/\D/g, ''))} />
          <div className="text-xs text-muted-foreground">{t('contactos.vistaPrevia', { n: preview.length })}</div>
          <ul className="max-h-56 overflow-auto divide-y divide-gray-50 rounded-xl border border-gray-100 text-sm">
            {preview.map((c, i) => (
              <li key={i} className="px-3 py-1.5 flex justify-between gap-2">
                <span className="truncate">{c.nombre || '—'}</span>
                <span className="text-xs text-muted-foreground shrink-0">{c.telefono || c.email || ''} · {t('contactos.origenEtiqueta', { origen: 'CSV' })}</span>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
    </>
  )
}
