import React, { useRef, useState } from 'react'
import { Dialog, Button, Input, useToast } from '../../ui/components'
import { useI18n } from '../../i18n'
import { exportCSV } from '../../export/export'
import { parseCsv, formatearTelefono } from '../../lib/contactos'
import type { Cliente } from '../../types/entities'

const COLUMNAS = ['nombre', 'alias', 'telefono', 'email', 'direccion', 'pais', 'estado', 'cp'] as const

const EJEMPLO = [
  { nombre: 'María Pérez', alias: 'La Bodeguita', telefono: '04141234567', email: 'maria@ejemplo.com', direccion: 'Av. Principal, Local 4', pais: 'Venezuela', estado: 'Distrito Capital', cp: '1010' },
  { nombre: 'Juan Gómez', alias: '', telefono: '', email: 'juan@ejemplo.com', direccion: 'Calle 8 #12', pais: 'Venezuela', estado: 'Zulia', cp: '4001' }
]

/** Descarga la plantilla CSV de ejemplo para carga masiva de clientes. */
export function descargarPlantillaClientes() {
  exportCSV('plantilla_clientes', EJEMPLO, COLUMNAS.map(c => ({ key: c, header: c })))
}

/** Importación masiva de clientes desde CSV (Excel/Google Contacts) con vista previa. */
export function ImportarClientes({ onImportados }: { onImportados: (clientes: Partial<Cliente>[]) => Promise<void> }) {
  const { t } = useI18n()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Partial<Cliente>[]>([])
  const [codigoPais, setCodigoPais] = useState('')
  const [importando, setImportando] = useState(false)

  const leerArchivo = async (file: File | null) => {
    if (!file) return
    try {
      const texto = await file.text()
      const rows = parseCsv(texto)
      const clientes: Partial<Cliente>[] = rows
        .map(r => ({
          nombre: (r.nombre || r.name || '').trim(),
          alias: (r.alias || '').trim(),
          telefono: formatearTelefono(r.telefono || r.phone || '', codigoPais),
          email: (r.email || '').trim(),
          direccion: (r.direccion || '').trim(),
          direccion_pais: (r.pais || '').trim(),
          direccion_estado: (r.estado || '').trim(),
          direccion_cp: (r.cp || '').trim()
        }))
        .filter(c => c.nombre || c.telefono || c.email)
      if (clientes.length === 0) { toast(t('contactos.errorFormato'), 'error'); return }
      setPreview(clientes)
    } catch {
      toast(t('contactos.errorFormato'), 'error')
    }
  }

  const confirmar = async () => {
    setImportando(true)
    try {
      await onImportados(preview)
      setPreview([])
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setImportando(false)
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={e => { void leerArchivo(e.target.files?.[0] ?? null); e.target.value = '' }} />
      <Button variant="outline" onClick={() => inputRef.current?.click()}>{t('contactos.importarCSV')}</Button>
      <Dialog open={preview.length > 0} onClose={() => setPreview([])} title={t('contactos.importar')}
        footer={<>
          <Button variant="outline" onClick={() => setPreview([])} disabled={importando}>{t('common.cancelar')}</Button>
          <Button onClick={confirmar} disabled={importando}>{importando ? t('imagenes.subiendo') : `${t('common.guardar')} (${preview.length})`}</Button>
        </>}>
        <div className="space-y-3">
          <Input placeholder={`${t('contactos.codigoPais')} (ej. 58)`} value={codigoPais}
            onChange={e => setCodigoPais(e.target.value.replace(/\D/g, ''))} />
          <ul className="max-h-56 overflow-auto divide-y divide-gray-50 rounded-xl border border-gray-100 text-sm">
            {preview.map((c, i) => (
              <li key={i} className="px-3 py-1.5 flex justify-between gap-2">
                <span className="truncate">{c.nombre}{c.alias ? ` · ${c.alias}` : ''}</span>
                <span className="text-xs text-muted-foreground shrink-0">{c.telefono || c.email || '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
    </>
  )
}
