import React, { useEffect, useState } from 'react'
import { useConfig } from '../../store/queries'
import { Card, Button, Input, Select } from '../../ui/components'
import { useToast } from '../../ui/components'
import { CURRENCIES } from '../../currency'
import type { Config } from '../../types/entities'

export function Configuracion() {
  const { config, saveConfig } = useConfig()
  const toast = useToast()
  const [form, setForm] = useState<Config | null>(null)
  useEffect(() => { if (config && !form) setForm(config) }, [config, form])
  if (!config || !form) return <div className="p-8 text-gray-500">Cargando…</div>
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => f && ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    try { await saveConfig.mutateAsync({ ...form, contador_folio: Number(form.contador_folio), iva_porcentaje: Number(form.iva_porcentaje) }); toast('Configuración guardada') }
    catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Configuración</h1>
      <Card title="Datos de la empresa">
        <div className="space-y-3">
          <div><label className="text-xs text-gray-500">Nombre *</label><Input value={form.empresa_nombre} onChange={set('empresa_nombre')} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500">RFC</label><Input value={form.empresa_rfc} onChange={set('empresa_rfc')} /></div>
            <div><label className="text-xs text-gray-500">Teléfono</label><Input value={form.empresa_telefono} onChange={set('empresa_telefono')} /></div>
          </div>
          <div><label className="text-xs text-gray-500">Email</label><Input value={form.empresa_email} onChange={set('empresa_email')} /></div>
          <div><label className="text-xs text-gray-500">Dirección</label><Input value={form.empresa_direccion} onChange={set('empresa_direccion')} /></div>
          <div><label className="text-xs text-gray-500">Logo (URL)</label><Input value={form.empresa_logo} onChange={set('empresa_logo')} /></div>
        </div>
      </Card>
      <Card title="Facturación">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Prefijo folio *</label><Input value={form.prefijo_folio} onChange={set('prefijo_folio')} /></div>
          <div><label className="text-xs text-gray-500">Contador actual</label><Input type="number" value={form.contador_folio} onChange={set('contador_folio')} /></div>
          <div><label className="text-xs text-gray-500">IVA %</label><Input type="number" value={form.iva_porcentaje} onChange={set('iva_porcentaje')} /></div>
          <div><label className="text-xs text-gray-500">Moneda</label>
            <Select value={form.moneda} onChange={v => setForm(f => f && ({ ...f, moneda: v }))} options={CURRENCIES.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
          </div>
        </div>
      </Card>
      <Card title="Categorías">
        <div><label className="text-xs text-gray-500">Gastos (separadas por coma)</label><Input value={form.categorias_gastos} onChange={set('categorias_gastos')} /></div>
        <div className="mt-3"><label className="text-xs text-gray-500">Cuentas por pagar (separadas por coma)</label><Input value={form.categorias_cxp} onChange={set('categorias_cxp')} /></div>
      </Card>
      <Button onClick={submit}>Guardar configuración</Button>
    </div>
  )
}
