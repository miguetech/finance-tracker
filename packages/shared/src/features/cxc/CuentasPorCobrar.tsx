import React, { useState } from 'react'
import { todayLocal } from '../../lib/date'
import { useFacturas, useClientes, useConfig } from '../../store/queries'
import { Table, Button, Select, StatCard, Badge, Input } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { formatMoneyConverted } from '../../currency'
import { IconPhone, IconSearch, IconCoins } from '../../ui/icons'
import { useI18n } from '../../i18n'
import { estadoCxc } from '../../ui/estados'
import { FacturaDetail } from '../facturas/FacturaDetail'
import { PagoModal } from '../facturas/PagoModal'
import type { Factura } from '../../types/entities'

export function CuentasPorCobrar() {
  const { t } = useI18n()
  const { facturas } = useFacturas()
  const { clientes } = useClientes()
  const { config } = useConfig()
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const [estado, setEstado] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [cobroDe, setCobroDe] = useState<Factura | null>(null)
  const moneda = config?.moneda ?? 'USD'
  const hoy = todayLocal()

  const activas = facturas.filter(f => f.saldo > 0)
  const filtradas = activas.filter(f => {
    const st = estadoCxc(f, hoy)
    if (estado && t(st.key) !== estado) return false
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase()
      if (!String(f.folio).toLowerCase().includes(q) && !f.nombre_cliente.toLowerCase().includes(q)) return false
    }
    return true
  })

  const sumaBase = (fs: Factura[]) => fs.reduce((s, f) => s + (Number(f.saldo) || 0) / (Number(f.tipo_cambio) || 1), 0)
  const totalPorCobrar = sumaBase(activas)
  const vencidas = activas.filter(f => f.fecha_vencimiento && f.fecha_vencimiento < hoy)
  const porVencer = activas.filter(f => !f.fecha_vencimiento || f.fecha_vencimiento >= hoy)

  const copiarTel = (idCliente: string) => {
    const c = clientes.find(x => x.id_cliente === idCliente)
    const tel = (c?.telefono ?? '').replace(/\s+/g, '')
    if (!tel) { toast(t('cxc.clienteSinTelefono'), 'error'); return }
    if (navigator.clipboard) navigator.clipboard.writeText(tel)
    toast(t('cxc.telefonoCon', { telefono: c?.telefono ?? '' }))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('cxc.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('cxc.subtitulo')}</p>
        </div>
        <div className="flex gap-2">
          <Select value={estado} onChange={setEstado} options={[{ value: t('states.pendiente'), label: t('states.pendiente') }, { value: t('states.parcial'), label: t('states.parcial') }, { value: t('states.vencida'), label: t('states.vencida') }]} placeholder={t('common.estado')} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t('cxc.totalPorCobrar')} value={formatMoneyConverted(totalPorCobrar, moneda, moneda, config)} />
        <StatCard label={t('cxc.vencidas')} value={formatMoneyConverted(sumaBase(vencidas), moneda, moneda, config)} tone="negative" />
        <StatCard label={t('states.porVencer')} value={formatMoneyConverted(sumaBase(porVencer), moneda, moneda, config)} />
      </div>

      <div className="relative max-w-sm">
        <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={t('cxc.buscarPlaceholder')} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><IconSearch className="w-4 h-4" /></span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'folio', header: t('facturas.folio'), render: r => String(r.folio) },
          { key: 'cliente', header: t('facturas.cliente'), render: r => (
            <div className="flex items-center gap-2">
              <span>{String(r.nombre_cliente)}</span>
              {clientes.find(c => c.id_cliente === String(r.id_cliente))?.telefono && (
                <button onClick={() => copiarTel(String(r.id_cliente))} title={t('cxc.copiarTelefono')} aria-label={t('cxc.copiarTelefono')}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary-soft">
                  <IconPhone className="w-4 h-4" />
                </button>
              )}
            </div>
          ) },
          { key: 'emision', header: t('facturas.emision'), render: r => String(r.fecha_emision) },
          { key: 'venc', header: t('cuentas.vence'), render: r => <span className={String(r.fecha_vencimiento) < hoy && Number(r.saldo) > 0 ? 'text-red-600 font-medium' : ''}>{String(r.fecha_vencimiento) || '—'}</span> },
          { key: 'total', header: t('facturas.total'), render: r => formatMoneyConverted(Number(r.total), String(r.moneda), moneda, config) },
          { key: 'saldo', header: t('facturas.saldo'), render: r => formatMoneyConverted(Number(r.saldo), String(r.moneda), moneda, config) },
          { key: 'estado', header: t('common.estado'), render: r => { const e = estadoCxc(r as unknown as Factura, hoy); return <Badge tone={e.tone}>{t(e.key)}</Badge> } },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-1">
              {isAdmin && <Button variant="success" size="sm" icon={<IconCoins className="w-4 h-4" />} onClick={() => setCobroDe(r as unknown as Factura)}>{t('cxc.cobrar')}</Button>}
              <Button variant="ghost" size="sm" onClick={() => setDetalleId(String(r.id_factura))}>{t('facturas.ver')}</Button>
            </div>
          ) }
        ]} rows={filtradas as unknown as Record<string, unknown>[]} />
        {filtradas.length === 0 && <p className="p-4 text-sm text-gray-500">{activas.length === 0 ? t('cxc.nadaPorCobrar') : t('common.sinResultados')}</p>}
      </div>

      {detalleId && <FacturaDetail id={detalleId} onClose={() => setDetalleId(null)} />}
      {cobroDe && (
        <PagoModal origen={{ id: cobroDe.id_factura, tipo: 'cobro', saldo: cobroDe.saldo, moneda: cobroDe.moneda }}
          onClose={() => setCobroDe(null)} />
      )}
      {!canEdit('facturas') && <p className="text-xs text-muted-foreground">{t('cxc.soloLectura')}</p>}
    </div>
  )
}
