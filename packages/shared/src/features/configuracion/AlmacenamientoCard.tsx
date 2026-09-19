import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Repository, HojaInfo } from '../../data/repository'
import { useRepo } from '../../store/queries'
import { Button, Input, useToast } from '../../ui/components'
import { useI18n } from '../../i18n'

const ROL_CLASS: Record<HojaInfo['rol'], string> = {
  es_dueño: 'bg-green-50 text-green-700',
  no_es_dueño: 'bg-red-50 text-red-700',
  no_verificable: 'bg-amber-50 text-amber-700'
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${className ?? ''}`}>{children}</span>
}

/** Panel "Almacenamiento" (spec hoja-por-año §10 UX): dónde vive cada cosa,
 *  buscador de Drive para cambiar el BASE y lista de archivos por año. */
export function AlmacenamientoCard() {
  const { t } = useI18n()
  const repo = useRepo() as Repository
  const qc = useQueryClient()
  const toast = useToast()

  const estadoQ = useQuery({ queryKey: ['almacenamiento'], queryFn: () => repo.estadoAlmacenamiento() })
  const hojaQ = useQuery({ queryKey: ['hojaActual'], queryFn: () => repo.hojaActual() })
  const inventarioQ = useQuery({ queryKey: ['inventario'], queryFn: () => repo.inventarioHojas() })
  const [verificando, setVerificando] = useState<string | null>(null)

  const [pickerAbierto, setPickerAbierto] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [resultados, setResultados] = useState<{ id: string; name: string }[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [creandoAño, setCreandoAño] = useState(false)

  useEffect(() => {
    if (!pickerAbierto) return
    const id = setTimeout(() => {
      setBuscando(true)
      repo.listarHojasDisponibles(filtro)
        .then(setResultados)
        .catch(e => toast((e as Error).message, 'error'))
        .finally(() => setBuscando(false))
    }, 350)
    return () => clearTimeout(id)
  }, [filtro, pickerAbierto, repo, toast])

  const vincular = async (id: string) => {
    try {
      await repo.conectarHojaPorId(id)
      toast(t('almacen.vinculada'), 'success')
      setTimeout(() => window.location.reload(), 700) // reset de cachés al cambiar BASE
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreEdicion, setNombreEdicion] = useState('')
  const [creandoBase, setCreandoBase] = useState(false)
  const [nombreNuevaBase, setNombreNuevaBase] = useState('')

  // Picker para vincular un spreadsheet de año existente.
  const [pickerAñoAbierto, setPickerAñoAbierto] = useState(false)
  const [filtroAño, setFiltroAño] = useState('')
  const [resultadosAño, setResultadosAño] = useState<{ id: string; name: string }[] | null>(null)
  const [buscandoAño, setBuscandoAño] = useState(false)
  const [añoSeleccionado, setAñoSeleccionado] = useState(() => String(new Date().getFullYear()))
  const [vinculandoAño, setVinculandoAño] = useState<string | null>(null)

  useEffect(() => {
    if (!pickerAñoAbierto) return
    const id = setTimeout(() => {
      setBuscandoAño(true)
      repo.listarHojasDisponibles(filtroAño)
        .then(setResultadosAño)
        .catch(e => toast((e as Error).message, 'error'))
        .finally(() => setBuscandoAño(false))
    }, 350)
    return () => clearTimeout(id)
  }, [filtroAño, pickerAñoAbierto, repo, toast])

  const vincularAño = async (id: string) => {
    setVinculandoAño(id)
    try {
      await repo.conectarAñoPorId(añoSeleccionado, id)
      toast(t('almacen.añoVinculado').replace('{año}', añoSeleccionado), 'success')
      await qc.invalidateQueries({ queryKey: ['almacenamiento'] })
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setVinculandoAño(null)
    }
  }

  const verificar = async (id: string) => {
    setVerificando(id)
    try {
      const r = await repo.verificarOwnership(id)
      toast(`${t('almacen.verificar')}: ${t(`almacen.rol.${r.estado}` as never)}${r.motivo ? ` (${t(`almacen.rol.${r.motivo}` as never)})` : ''}`, 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setVerificando(null)
    }
  }

  const identidad = (h: HojaInfo | undefined) => !h ? null : (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge className={h.tipo === 'base' ? 'bg-blue-50 text-blue-700' : h.tipo === 'eventos' ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'}>
        {h.tipo === 'base' ? t('almacen.tipoBase') : h.tipo === 'eventos' ? t('almacen.tipoEventos') : t('almacen.tipoLegacy')}
      </Badge>
      <Badge className={h.estado === 'reemplazado' ? 'bg-red-50 text-red-600' : h.estado === 'borrado' ? 'bg-gray-200 text-gray-500' : h.estado === 'legacy' ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700'}>
        {h.estado === 'reemplazado' ? t('almacen.reemplazado') : h.estado === 'borrado' ? t('almacen.borrado') : h.estado === 'legacy' ? t('almacen.tipoLegacy') : t('almacen.activo')}
      </Badge>
      <Badge className={ROL_CLASS[h.rol]}>{t(`almacen.rol.${h.rol}` as never)}</Badge>
      {h.dueño && <span className="text-[10px] text-gray-400 truncate max-w-[140px]">{h.dueño}</span>}
    </div>
  )

  const renombrar = async (id: string) => {
    try {
      await repo.renombrarHoja(id, nombreEdicion)
      toast(t('almacen.renombrada'), 'success')
      setEditandoId(null)
      await qc.invalidateQueries({ queryKey: ['hojaActual'] })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const crearBaseVacia = async () => {
    setCreandoBase(true)
    try {
      await repo.crearBaseVacia(nombreNuevaBase || t('almacen.basePorDefecto'))
      toast(t('almacen.vinculada'), 'success')
      setTimeout(() => window.location.reload(), 700)
    } catch (e) {
      toast((e as Error).message, 'error')
      setCreandoBase(false)
    }
  }

  const filaRenombrable = (id: string, texto: string) => editandoId === id ? (
    <form className="flex items-center gap-2 min-w-0 flex-1" onSubmit={e => { e.preventDefault(); void renombrar(id) }}>
      <Input value={nombreEdicion} onChange={e => setNombreEdicion(e.target.value)} className="h-7 text-sm" autoFocus />
      <Button type="submit" size="sm" variant="outline">{t('common.guardar')}</Button>
      <button type="button" className="text-xs text-gray-400" onClick={() => setEditandoId(null)}>{t('cola.descartar')}</button>
    </form>
  ) : (
    <>
      <span className="text-sm truncate">{texto}</span>
      <button title={t('almacen.renombrar')} className="text-[11px] text-gray-400 hover:text-blue-600 shrink-0"
        onClick={() => { setEditandoId(id); setNombreEdicion(texto) }}>✎</button>
    </>
  )
  const eliminarAño = async (año: string) => {
    if (año === est?.anioActivo) { toast(t('almacen.añoActivoNoEliminable'), 'error'); return }
    try {
      await repo.eliminarAño(año)
      toast(t('almacen.añoEliminado'), 'success')
      await qc.invalidateQueries({ queryKey: ['almacenamiento'] })
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setConfirmando(null)
    }
  }

  const crearAñoActual = async () => {
    setCreandoAño(true)
    try {
      const r = await repo.prepararAnioActual(true)
      if (r.ok) toast(t('almacen.añoCreado'), 'success')
      else toast(`${t('almacen.añoError')}: ${r.error ?? ''}`, 'error')
      await qc.invalidateQueries({ queryKey: ['almacenamiento'] })
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setCreandoAño(false)
    }
  }

  const enlace = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`
  const est = estadoQ.data

  const [transferEmail, setTransferEmail] = useState('')
  const [preflight, setPreflight] = useState<Awaited<ReturnType<Repository['preflightTransferencia']>> | null>(null)
  const [preparando, setPreparando] = useState(false)
  const [transfiriendo, setTransfiriendo] = useState(false)

  const prepararTransferencia = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(transferEmail)) { toast(t('almacen.transferEmailInvalido'), 'error'); return }
    setPreparando(true)
    try {
      setPreflight(await repo.preflightTransferencia(transferEmail))
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setPreparando(false)
    }
  }

  const transferir = async () => {
    if (!preflight) return
    setTransfiriendo(true)
    try {
      const r = await repo.transferirSistema(preflight.email)
      toast(t('almacen.transferOk').replace('{email}', r.email), 'success')
      if (r.rechazados > 0) toast(t('almacen.transferRechazado').replace('{n}', String(r.rechazados)), 'error')
      setPreflight(null)
      setTransferEmail('')
      await qc.invalidateQueries({ queryKey: ['almacenamiento'] })
      await qc.invalidateQueries({ queryKey: ['inventario'] })
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setTransfiriendo(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Archivo principal (BASE) */}
      <section>
        <h3 className="text-sm font-semibold">{t('almacen.principalTitulo')}</h3>
        <p className="text-xs text-muted-foreground mb-2">{t('almacen.principalDescripcion')}</p>
        {hojaQ.data ? (
          <div className="rounded-xl border border-gray-100 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                {filaRenombrable(hojaQ.data.id, hojaQ.data.titulo)}
                <div className="text-[11px] text-gray-400 truncate">{hojaQ.data.id}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={hojaQ.data.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">{t('almacen.abrir')}</a>
                <Button variant="outline" size="sm" disabled={verificando === hojaQ.data.id} onClick={() => void verificar(hojaQ.data.id)}>
                  {t('almacen.verificar')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPickerAbierto(a => !a)}>{t('almacen.cambiar')}</Button>
              </div>
            </div>
            {identidad(inventarioQ.data?.base)}
          </div>
        ) : (
          <p className="text-xs text-gray-500">{t('almacen.cargando')}</p>
        )}

        {pickerAbierto && (
          <div className="mt-2 rounded-xl border border-gray-200 p-3 space-y-2">
            <Input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder={t('almacen.buscarPlaceholder')} />
            {buscando && <p className="text-xs text-gray-400">{t('almacen.buscando')}</p>}
            {!buscando && resultados && resultados.length === 0 && <p className="text-xs text-gray-500">{t('almacen.sinResultados')}</p>}
            <div className="pt-1 border-t border-gray-100 space-y-1.5">
              <p className="text-[11px] text-muted-foreground">{t('almacen.nuevaBaseHint')}</p>
              <div className="flex gap-2">
                <Input value={nombreNuevaBase} onChange={e => setNombreNuevaBase(e.target.value)} placeholder={t('almacen.nuevaBasePlaceholder')} className="h-8 text-xs" />
                <Button size="sm" variant="outline" disabled={creandoBase} onClick={() => void crearBaseVacia()}>{t('almacen.nuevaBaseBoton')}</Button>
              </div>
            </div>
            <ul className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
              {(resultados ?? []).map(h => (
                <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm truncate">{h.name}</span>
                  <Button size="sm" variant="outline" onClick={() => void vincular(h.id)} disabled={h.id === hojaQ.data?.id}>
                    {h.id === hojaQ.data?.id ? t('almacen.actual') : t('almacen.vincular')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Años */}
      <section>
        <h3 className="text-sm font-semibold">{t('almacen.añosTitulo')}</h3>
        <p className="text-xs text-muted-foreground mb-2">{t('almacen.añosDescripcion')}</p>
        {!est && <p className="text-xs text-gray-500">{t('almacen.cargando')}</p>}
        {est && (
          <>
            <ul className="divide-y divide-gray-50 rounded-xl border border-gray-100">
              {est.eventos.map(ev => {
                  const infoAño = inventarioQ.data?.años.find(a => a.año === ev.año)?.hoja
                  return (
                    <li key={ev.año} className="px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 min-w-0 flex-1">
                          {filaRenombrable(ev.id, ev.año)}
                          {ev.año === est.anioActivo && <span className="text-[11px] text-green-600 font-medium shrink-0">{t('almacen.activo')}</span>}
                        </span>
                        <div className="flex items-center gap-3">
                          <a href={enlace(ev.id)} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">{t('almacen.abrir')}</a>
                          <button className="text-xs text-gray-500 hover:text-blue-600" disabled={verificando === ev.id} onClick={() => void verificar(ev.id)}>
                            {t('almacen.verificar')}
                          </button>
                          {ev.año !== est.anioActivo && (
                            confirmando === ev.año ? (
                              <button className="text-xs text-red-600 font-medium hover:underline"
                                onClick={() => void eliminarAño(ev.año)}
                                onBlur={() => setConfirmando(null)}>
                                {t('almacen.confirmarEliminar')}
                              </button>
                            ) : (
                              <button className="text-xs text-gray-400 hover:text-red-600"
                                onClick={() => setConfirmando(ev.año)}>
                                {t('almacen.eliminar')}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                      {identidad(infoAño)}
                    </li>
                  )
                })}
              {est.eventos.length === 0 && <li className="px-3 py-2.5 text-xs text-gray-500">{t('almacen.sinAños')}</li>}
            </ul>
            {!est.creadoAñoActual && (
              <Button size="sm" variant="outline" className="mt-2" disabled={creandoAño} onClick={() => void crearAñoActual()}>
                {creandoAño ? t('almacen.creando') : t('almacen.crearAño')}
              </Button>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100">
              <Button size="sm" variant="outline" onClick={() => setPickerAñoAbierto(a => !a)}>
                {t('almacen.vincularAño')}
              </Button>
              {pickerAñoAbierto && (
                <div className="mt-2 rounded-xl border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground shrink-0">{t('almacen.año')}</label>
                    <Input type="number" min={2000} max={2100} value={añoSeleccionado} onChange={e => setAñoSeleccionado(e.target.value)} className="w-24 h-8 text-xs" />
                  </div>
                  <Input value={filtroAño} onChange={e => setFiltroAño(e.target.value)} placeholder={t('almacen.buscarPlaceholder')} className="h-8 text-xs" />
                  {buscandoAño && <p className="text-xs text-gray-400">{t('almacen.buscando')}</p>}
                  {!buscandoAño && resultadosAño && resultadosAño.length === 0 && <p className="text-xs text-gray-500">{t('almacen.sinResultados')}</p>}
                  <ul className="divide-y divide-gray-50 max-h-40 overflow-y-auto">
                    {(resultadosAño ?? []).map(h => {
                      const yaVinculado = est?.eventos.some(ev => ev.id === h.id)
                      return (
                        <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                          <span className="text-sm truncate">{h.name}</span>
                          <Button size="sm" variant="outline" disabled={yaVinculado || vinculandoAño === h.id} onClick={() => void vincularAño(h.id)}>
                            {yaVinculado ? t('almacen.actual') : vinculandoAño === h.id ? t('almacen.creando') : t('almacen.vincular')}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Transferencia de propiedad (spec F7 §10) */}
      <section className="rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2.5">
        <h3 className="text-sm font-semibold">{t('almacen.transferirTitulo')}</h3>
        <p className="text-xs text-muted-foreground mb-2">{t('almacen.transferirDescripcion')}</p>
        <div className="flex gap-2">
          <Input value={transferEmail} onChange={e => setTransferEmail(e.target.value)} placeholder={t('almacen.transferEmailPlaceholder')} className="h-8 text-xs" />
          <Button size="sm" variant="outline" disabled={preparando || transfiriendo} onClick={() => void prepararTransferencia()}>
            {preparando ? t('almacen.transferPreparando') : t('almacen.transferPreparar')}
          </Button>
        </div>
        {preflight && (
          <div className="mt-2 space-y-1.5">
            {preflight.retomables.length > 0 && (
              <p className="text-[11px] text-amber-700">{t('almacen.transferRetomables').replace('{ids}', preflight.retomables.join(', '))}</p>
            )}
            <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100 bg-white px-3 py-1">
              {preflight.hojas.map(h => (
                <li key={h.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-xs truncate">{h.tipo === 'base' ? t('almacen.tipoBase') : `${t('almacen.tipoEventos')} ${h.año}`}</span>
                  <Badge className={ROL_CLASS[h.rol]}>{t(`almacen.rol.${h.rol}` as never)}</Badge>
                </li>
              ))}
            </ul>
            {!preflight.posible && <p className="text-[11px] text-red-600">{t('almacen.transferNoPosible')}</p>}
            <Button size="sm" variant="outline" disabled={transfiriendo || !preflight.posible} onClick={() => void transferir()}>
              {transfiriendo ? t('almacen.transferProgreso') : t('almacen.transferIniciar')}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
