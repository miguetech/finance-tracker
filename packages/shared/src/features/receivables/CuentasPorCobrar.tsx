import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { useFacturas, useClientes, useConfig } from '../../store/queries'
import { Table, Button, Select, StatCard, Badge, Input } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { formatMoneyConverted } from '../../currency'
import { IconPhone, IconSearch, IconCoins, IconBell } from '../../ui/icons'
import { useNotificaciones } from '../../ui/hooks'
import { useI18n } from '../../i18n'
import { whatsappUrl } from '../../lib/contactos'
import { estadoCxc } from '../../ui/estados'
import { FacturaDetail } from '../invoices/FacturaDetail'
import { PagoModal } from '../invoices/PagoModal'
import type { Factura } from '../../types/entities'

export function CuentasPorCobrar() {
  const { t } = useI18n()
  const { facturas } = useFacturas()
  const { customers } = useClientes()
  const { config, saveConfig } = useConfig()
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const [status, setEstado] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [cobroDe, setCobroDe] = useState<Factura | null>(null)
  const currency = config?.currency ?? 'USD'
  const hoy = todayLocal()

  const activas = facturas.filter(f => f.balance > 0)
  const filtradas = activas.filter(f => {
    const st = estadoCxc(f, hoy)
    if (status && t(st.key) !== status) return false
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase()
      if (!String(f.serial).toLowerCase().includes(q) && !f.customer_name.toLowerCase().includes(q)) return false
    }
    return true
  })

  const sumaBase = (fs: Factura[]) => fs.reduce((s, f) => s + (Number(f.balance) || 0) / (Number(f.exchange_rate) || 1), 0)
  const totalPorCobrar = sumaBase(activas)
  const vencidas = activas.filter(f => f.due_date && f.due_date < hoy)
  const porVencer = activas.filter(f => !f.due_date || f.due_date >= hoy)

  // Vencimientos próximos (≤ 3 días) para recordatorios.
  const en3Dias = new Date(`${hoy}T00:00:00`)
  en3Dias.setDate(en3Dias.getDate() + 3)
  const limite = en3Dias.toISOString().slice(0, 10)
  const proximas = activas.filter(f => f.due_date && f.due_date >= hoy && f.due_date <= limite)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))

  // Alertas flotantes del navegador para vencimientos de cobro.
  const notif = useNotificaciones()
  useEffect(() => {
    if (config?.notifications_ar_active !== 'true' || !notif.soportadas || Notification.permission !== 'granted') return
    if (vencidas.length === 0 && proximas.length === 0) return
    const cuerpo = vencidas.length > 0
      ? `${vencidas.length} ${t('cxc.vencidas').toLowerCase()} — ${vencidas[0].serial}: ${formatMoneyConverted(Number(vencidas[0].balance), vencidas[0].currency, currency, config)}`
      : `${proximas[0].serial} (${proximas[0].due_date})`
    notif.notificar(t('cxc.recordatorioTitulo'), cuerpo)
  }, [config?.notifications_ar_active, vencidas.length, proximas.length])

  const toggleNotifCxc = async () => {
    if (!config) return
    if (config.notifications_ar_active === 'true') {
      await saveConfig.mutateAsync({ ...config, notifications_ar_active: 'false' })
      toast(t('common.guardado'))
      return
    }
    await notif.activar()
    if (Notification.permission === 'granted') {
      await saveConfig.mutateAsync({ ...config, notifications_ar_active: 'true' })
      toast(t('cxc.notifActivada'))
    } else {
      toast(t('cxc.notifPermisoDenegado'), 'error')
    }
  }

  const copiarTel = (idCliente: string) => {
    const c = customers.find(x => x.customer_id === idCliente)
    const tel = (c?.phone ?? '').replace(/\s+/g, '')
    if (!tel) { toast(t('cxc.clienteSinTelefono'), 'error'); return }
    if (navigator.clipboard) navigator.clipboard.writeText(tel)
    toast(t('cxc.telefonoCon', { phone: c?.phone ?? '' }))
  }

  /** Mensaje de payment automático redirigido a WhatsApp Web/Móvil. */
  const cobroWhatsApp = (f: Factura) => {
    const c = customers.find(x => x.customer_id === String(f.customer_id))
    const tel = (c?.phone ?? '').replace(/\s+/g, '')
    if (!tel) { toast(t('whatsapp.sinTelefono'), 'error'); return }
    const mensaje = t('whatsapp.mensajeDefault', {
      name: f.customer_name,
      empresa: config?.company_name ?? '',
      serial: f.serial,
      amount: formatMoneyConverted(f.balance, f.currency, currency, config)
    })
    window.open(whatsappUrl(tel, mensaje), '_blank')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('cxc.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('cxc.subtitulo')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant={config?.notifications_ar_active === 'true' ? 'primary' : 'outline'} icon={<IconBell className="w-4 h-4" />}
            onClick={toggleNotifCxc} title={t('cxc.recordatorioTitulo')}>
            {config?.notifications_ar_active === 'true' ? t('cxc.notifOn') : t('cxc.notifOff')}
          </Button>
          <Select value={status} onChange={setEstado} options={[{ value: t('states.pendiente'), label: t('states.pendiente') }, { value: t('states.parcial'), label: t('states.parcial') }, { value: t('states.vencida'), label: t('states.vencida') }]} placeholder={t('common.estado')} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t('cxc.totalPorCobrar')} value={formatMoneyConverted(totalPorCobrar, currency, currency, config)} />
        <StatCard label={t('cxc.vencidas')} value={formatMoneyConverted(sumaBase(vencidas), currency, currency, config)} tone="negative" />
        <StatCard label={t('states.porVencer')} value={formatMoneyConverted(sumaBase(porVencer), currency, currency, config)} />
      </div>

      <div className="relative max-w-sm">
        <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={t('cxc.buscarPlaceholder')} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><IconSearch className="w-4 h-4" /></span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'folio', header: t('facturas.folio'), render: r => String(r.serial) },
          { key: 'cliente', header: t('facturas.cliente'), render: r => (
            <div className="flex items-center gap-2">
              <span>{String(r.customer_name)}</span>
              {customers.find(c => c.customer_id === String(r.customer_id))?.phone && (
                <button onClick={() => copiarTel(String(r.customer_id))} title={t('cxc.copiarTelefono')} aria-label={t('cxc.copiarTelefono')}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary-soft">
                  <IconPhone className="w-4 h-4" />
                </button>
              )}
            </div>
          ) },
          { key: 'emision', header: t('facturas.emision'), render: r => String(r.issue_date) },
          { key: 'venc', header: t('cuentas.vence'), render: r => <span className={String(r.due_date) < hoy && Number(r.balance) > 0 ? 'text-red-600 font-medium' : ''}>{String(r.due_date) || '—'}</span> },
          { key: 'total', header: t('facturas.total'), render: r => formatMoneyConverted(Number(r.total), String(r.currency), currency, config) },
          { key: 'saldo', header: t('facturas.saldo'), render: r => formatMoneyConverted(Number(r.balance), String(r.currency), currency, config) },
          { key: 'estado', header: t('common.estado'), render: r => { const e = estadoCxc(r as unknown as Factura, hoy); return <Badge tone={e.tone}>{t(e.key)}</Badge> } },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-1">
              {isAdmin && <Button variant="success" size="sm" icon={<IconCoins className="w-4 h-4" />} onClick={() => setCobroDe(r as unknown as Factura)}>{t('cxc.cobrar')}</Button>}
              {customers.find(c => c.customer_id === String(r.customer_id))?.phone && (
                <Button variant="outline" size="sm" onClick={() => cobroWhatsApp(r as unknown as Factura)} title={t('whatsapp.cobroTitulo')}>{t('whatsapp.abrirWhatsApp')}</Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setDetalleId(String(r.invoice_id))}>{t('facturas.ver')}</Button>
            </div>
          ) }
        ]} rows={filtradas as unknown as Record<string, unknown>[]} />
        {filtradas.length === 0 && <p className="p-4 text-sm text-gray-500">{activas.length === 0 ? t('cxc.nadaPorCobrar') : t('common.sinResultados')}</p>}
      </div>

      {detalleId && <FacturaDetail id={detalleId} onClose={() => setDetalleId(null)} />}
      {cobroDe && (
        <PagoModal origen={{ id: cobroDe.invoice_id, type: 'payment', balance: cobroDe.balance, currency: cobroDe.currency }}
          onClose={() => setCobroDe(null)} />
      )}
      {!canEdit('invoices') && <p className="text-xs text-muted-foreground">{t('cxc.soloLectura')}</p>}
    </div>
  )
}
