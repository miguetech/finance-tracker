import React, { useEffect, useState } from 'react'
import { useConfig, useRepo } from '../../store/queries'
import { useQueryClient } from '@tanstack/react-query'
import { Card, Button, Input, Select, Dialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { IconPlus, IconX } from '../../ui/icons'
import { CURRENCIES } from '../../currency'
import { TIPO_DOC_OPTIONS, getDocLabel } from '../../taxid'
import type { Config } from '../../types/entities'

export function Configuracion() {
  const { config, saveConfig } = useConfig()
  const repo = useRepo()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Config | null>(null)
  useEffect(() => { if (config && !form) setForm(config) }, [config, form])
  if (!config || !form) return <div className="p-8 text-gray-500">Cargando…</div>
  const docLabel = getDocLabel(form.tipo_doc, form.tipo_doc_etiqueta)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => f && ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    try {
      const fresh = await qc.fetchQuery({ queryKey: ['config'], queryFn: () => repo.getConfig() })
      await saveConfig.mutateAsync({
        ...form,
        contador_folio: Math.max(fresh.contador_folio, Number(form.contador_folio)),
        iva_porcentaje: Number(form.iva_porcentaje)
      })
      toast('Configuración guardada')
    } catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Configuración</h1>
      <Card title="Datos de la empresa">
        <div className="space-y-3">
          <div><label className="text-xs text-gray-500">Nombre *</label><Input value={form.empresa_nombre} onChange={set('empresa_nombre')} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Tipo de documento</label>
              <Select value={form.tipo_doc} onChange={v => setForm(f => f && ({ ...f, tipo_doc: v as Config['tipo_doc'] }))} options={TIPO_DOC_OPTIONS} />
            </div>
            <div>
              <label className="text-xs text-gray-500">{docLabel}</label>
              <Input value={form.empresa_rfc} onChange={set('empresa_rfc')} />
            </div>
            {form.tipo_doc === 'Otro' && (
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500">Etiqueta personalizada del documento</label>
                <Input value={form.tipo_doc_etiqueta} onChange={set('tipo_doc_etiqueta')} placeholder="Ej. RUT, DNI, CUIT…" />
              </div>
            )}
            <div><label className="text-xs text-gray-500">Teléfono</label><Input value={form.empresa_telefono} onChange={set('empresa_telefono')} /></div>
          </div>
          <div><label className="text-xs text-gray-500">Email</label><Input value={form.empresa_email} onChange={set('empresa_email')} /></div>
          <div><label className="text-xs text-gray-500">Dirección</label><Input value={form.empresa_direccion} onChange={set('empresa_direccion')} /></div>
          <div><label className="text-xs text-gray-500">Logo (URL)</label><Input value={form.empresa_logo} onChange={set('empresa_logo')} /></div>
        </div>
      </Card>
      <Card title="Facturación">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Prefijo folio *</label><Input value={form.prefijo_folio} onChange={set('prefijo_folio')} /></div>
          <div><label className="text-xs text-gray-500">Contador actual</label><Input type="number" value={form.contador_folio} onChange={set('contador_folio')} /></div>
          <div><label className="text-xs text-gray-500">IVA %</label><Input type="number" value={form.iva_porcentaje} onChange={set('iva_porcentaje')} /></div>
          <div><label className="text-xs text-gray-500">Moneda</label>
            <Select value={form.moneda} onChange={v => setForm(f => f && ({ ...f, moneda: v }))} options={CURRENCIES.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
          </div>
        </div>
      </Card>
      <Card title="Categorías">
        <div className="space-y-5">
          <CategoriasEditor title="Gastos" value={form.categorias_gastos} onChange={v => setForm(f => f && ({ ...f, categorias_gastos: v }))} />
          <CategoriasEditor title="Cuentas por pagar" value={form.categorias_cxp} onChange={v => setForm(f => f && ({ ...f, categorias_cxp: v }))} />
        </div>
      </Card>
      <Button onClick={submit}>Guardar configuración</Button>
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
