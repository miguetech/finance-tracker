import React, { useEffect, useState } from 'react'
import { useConfig, useRepo } from '../../store/queries'
import { useQueryClient } from '@tanstack/react-query'
import { Card, Button, Input, Select, Dialog, Tooltip, useToast } from '../../ui/components'
import { IconPlus, IconX, IconAlert } from '../../ui/icons'
import { CURRENCIES } from '../../currency'
import { TIPO_DOC_OPTIONS, getDocLabel } from '../../taxid'
import { FOLIO_TOKENS, expandFolioTemplate, invalidFolioTokens } from '../../calc/folio'
import { InvoicePrint } from '../../ui/print/InvoicePrint'
import { printInvoice } from '../facturas/FacturaDetail'
import type { Config, Factura, FacturaItem } from '../../types/entities'

export function Configuracion() {
  const { config, saveConfig } = useConfig()
  const repo = useRepo()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Config | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [ayudaFolio, setAyudaFolio] = useState(false)
  useEffect(() => { if (config && !form) setForm(config) }, [config, form])
  if (!config || !form) return <div className="p-8 text-muted-foreground">Cargando…</div>
  const docLabel = getDocLabel(form.tipo_doc, form.tipo_doc_etiqueta)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => f && ({ ...f, [k]: e.target.value }))
  const hoy = new Date().toISOString().slice(0, 10)
  const folioPreview = expandFolioTemplate(String(form.prefijo_folio), hoy) + String(Math.max(1, Number(form.contador_folio) || 1)).padStart(3, '0')
  const tokensInvalidos = invalidFolioTokens(String(form.prefijo_folio))
  const numIva = Number(form.iva_porcentaje)
  const numContador = Number(form.contador_folio)
  const errors: Record<string, string> = {}
  if (!form.empresa_nombre.trim()) errors.nombre = 'Nombre obligatorio'
  if (!String(form.prefijo_folio).trim()) errors.prefijo = 'Prefijo obligatorio'
  if (String(form.iva_porcentaje).trim() === '' || isNaN(numIva) || numIva < 0 || numIva > 100) errors.iva = 'IVA debe ser un número entre 0 y 100'
  if (String(form.contador_folio).trim() === '' || !Number.isInteger(numContador) || numContador < 0) errors.contador = 'Contador debe ser un entero ≥ 0'

  const sampleFactura = (): { factura: Factura; items: FacturaItem[] } => {
    const items = [{ descripcion: 'Concepto de ejemplo', cantidad: 1, precio_unitario: 100, importe: 100 }]
    const subtotal = 100
    const iva = Math.round(subtotal * (numIva || 0)) / 100
    return {
      factura: {
        id_factura: 'preview', folio: folioPreview, id_cliente: '', nombre_cliente: 'Cliente de ejemplo',
        fecha_emision: hoy, fecha_vencimiento: '', subtotal, iva, total: subtotal + iva,
        saldo: subtotal + iva, fecha_pago: '', notas: 'Factura de ejemplo'
      },
      items
    }
  }

  const submit = async () => {
    if (Object.keys(errors).length > 0) { toast('Revisa los campos marcados', 'error'); return }
    try {
      const fresh = await qc.fetchQuery({ queryKey: ['config'], queryFn: () => repo.getConfig() })
      await saveConfig.mutateAsync({
        ...form,
        contador_folio: Math.max(fresh.contador_folio, numContador),
        iva_porcentaje: numIva
      })
      toast('Configuración guardada')
    } catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Configuración</h1>
      <Card title="Datos de la empresa">
        <div className="space-y-3">
          <div><label className="text-xs text-muted-foreground">Nombre *</label><Input value={form.empresa_nombre} onChange={set('empresa_nombre')} error={errors.nombre} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Tipo de documento</label>
              <Select value={form.tipo_doc} onChange={v => setForm(f => f && ({ ...f, tipo_doc: v as Config['tipo_doc'] }))} options={TIPO_DOC_OPTIONS} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{docLabel}</label>
              <Input value={form.empresa_rfc} onChange={set('empresa_rfc')} />
            </div>
            {form.tipo_doc === 'Otro' && (
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Etiqueta personalizada del documento</label>
                <Input value={form.tipo_doc_etiqueta} onChange={set('tipo_doc_etiqueta')} placeholder="Ej. RUT, DNI, CUIT…" />
              </div>
            )}
            <div><label className="text-xs text-muted-foreground">Teléfono</label><Input value={form.empresa_telefono} onChange={set('empresa_telefono')} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">Email</label><Input value={form.empresa_email} onChange={set('empresa_email')} /></div>
          <div><label className="text-xs text-muted-foreground">Dirección</label><Input value={form.empresa_direccion} onChange={set('empresa_direccion')} /></div>
          <div><label className="text-xs text-muted-foreground">Logo (URL)</label><Input value={form.empresa_logo} onChange={set('empresa_logo')} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">Código postal</label><Input value={form.empresa_cp} onChange={set('empresa_cp')} /></div>
            <div><label className="text-xs text-muted-foreground">Ciudad</label><Input value={form.empresa_ciudad} onChange={set('empresa_ciudad')} /></div>
            <div><label className="text-xs text-muted-foreground">País</label><Input value={form.empresa_pais} onChange={set('empresa_pais')} /></div>
          </div>
          {form.empresa_logo && (
            <img src={form.empresa_logo} alt="Logo" className="h-12 mt-1 rounded-lg border border-gray-200 object-contain bg-white"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
        </div>
      </Card>
      <Card title="Facturación">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">Prefijo folio *</label>
                <Tooltip text={'Tokens: ' + FOLIO_TOKENS.map(t => t.token).join(' ') + '. Ej: FAC-{YYYY}-{MM}- → FAC-2026-08-001.'}>
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
                <button type="button" onClick={() => setAyudaFolio(a => !a)} className="text-xs text-primary underline decoration-dotted underline-offset-2 hover:text-primary-hover">¿Cómo configurar?</button>
              </div>
              <Input value={form.prefijo_folio} onChange={set('prefijo_folio')} error={errors.prefijo} />
              {ayudaFolio && (
                <div className="mt-2 rounded-lg border border-gray-100 bg-muted/50 p-3 text-xs text-muted-foreground space-y-1.5">
                  {FOLIO_TOKENS.map(t => (
                    <div key={t.token} className="flex justify-between gap-3"><span className="font-mono text-gray-700">{t.token}</span><span>{t.descripcion} — ej. {t.ejemplo}</span></div>
                  ))}
                  <div className="pt-1.5 border-t border-gray-100 text-muted-foreground">
                    Ejemplos: <code className="font-mono">FAC-</code> → FAC-001 · <code className="font-mono">FAC-{'{YYYY}'}-</code> → FAC-2026-001 · <code className="font-mono">FAC-{'{YYYY}'}-{'{MM}'}-</code> → FAC-2026-08-001
                  </div>
                </div>
              )}
              {tokensInvalidos.length > 0 && <p className="mt-1 text-xs text-amber-600">Token no válido: {tokensInvalidos.join(', ')}</p>}
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">Contador actual</label>
                <Tooltip text="Número del próximo folio. Se incrementa automáticamente al crear una factura.">
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <Input type="number" min={0} value={form.contador_folio} onChange={set('contador_folio')} error={errors.contador} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">IVA %</label>
                <Tooltip text="Porcentaje de impuesto aplicado al subtotal de cada factura.">
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <Input type="number" min={0} max={100} step="any" value={form.iva_porcentaje} onChange={set('iva_porcentaje')} error={errors.iva} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">Moneda</label>
                <Tooltip text="Moneda usada para mostrar montos en toda la app.">
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <Select value={form.moneda} onChange={v => setForm(f => f && ({ ...f, moneda: v }))} options={CURRENCIES.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
            </div>
          </div>
          <div className="text-sm text-muted-foreground">Próxima factura: <b className="text-primary font-mono">{folioPreview}</b></div>
          <Button variant="outline" icon={<IconAlert className="w-4 h-4" />} onClick={() => setPreviewOpen(true)}>Vista previa PDF</Button>
        </div>
      </Card>
      <Card title="Categorías">
        <div className="space-y-5">
          <CategoriasEditor title="Gastos" value={form.categorias_gastos} onChange={v => setForm(f => f && ({ ...f, categorias_gastos: v }))} />
          <CategoriasEditor title="Cuentas por pagar" value={form.categorias_cxp} onChange={v => setForm(f => f && ({ ...f, categorias_cxp: v }))} />
        </div>
      </Card>
      <Button onClick={submit}>Guardar configuración</Button>
      {previewOpen && (
        <Dialog open onClose={() => setPreviewOpen(false)} title="Vista previa PDF"
          footer={<>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Cerrar</Button>
            <Button onClick={() => printInvoice('Factura ' + folioPreview)}>Imprimir / Descargar PDF</Button>
          </>}>
          <InvoicePrint factura={sampleFactura().factura} items={sampleFactura().items} config={form} />
        </Dialog>
      )}
    </div>
  )
}

function CategoriasEditor({ title, value, onChange }: { title: string; value: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState('')
  const items = value.split(',').map(s => s.trim()).filter(Boolean)

  const add = () => {
    const v = nueva.trim()
    if (!v) { setError('Escribe una categoría'); return }
    if (items.some(i => i.toLowerCase() === v.toLowerCase())) { setError('Ya existe esa categoría'); return }
    onChange([...items, v].join(','))
    setNueva(''); setError(''); setOpen(false)
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map(c => (
          <span key={c} className="inline-flex items-center gap-1.5 bg-primary-soft text-primary rounded-full pl-3 pr-1.5 py-1 text-sm font-medium">
            {c}
            <button type="button" onClick={() => onChange(items.filter(x => x !== c).join(','))}
              className="p-0.5 rounded-full hover:bg-primary/15 text-primary" aria-label={`Quitar ${c}`}>
              <IconX className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <Button variant="outline" size="sm" icon={<IconPlus className="w-4 h-4" />} onClick={() => setOpen(true)}>Agregar</Button>
      </div>
      <Dialog open={open} onClose={() => { setOpen(false); setError(''); setNueva('') }} title={`Agregar categoría (${title})`}
        footer={<>
          <Button variant="outline" onClick={() => { setOpen(false); setError(''); setNueva('') }}>Cancelar</Button>
          <Button onClick={add}>Agregar</Button>
        </>}>
        <Input value={nueva} onChange={e => { setNueva(e.target.value); setError('') }} placeholder="Nueva categoría…" error={error || undefined} autoFocus />
      </Dialog>
    </div>
  )
}
