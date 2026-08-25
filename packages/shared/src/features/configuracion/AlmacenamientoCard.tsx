import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Repository } from '../../data/repository'
import { useRepo } from '../../store/queries'
import { Button, Input, useToast } from '../../ui/components'
import { useI18n } from '../../i18n'

/** Panel "Almacenamiento" (spec hoja-por-año §10 UX): dónde vive cada cosa,
 *  buscador de Drive para cambiar el BASE y lista de archivos por año. */
export function AlmacenamientoCard() {
  const { t } = useI18n()
  const repo = useRepo() as Repository
  const qc = useQueryClient()
  const toast = useToast()

  const estadoQ = useQuery({ queryKey: ['almacenamiento'], queryFn: () => repo.estadoAlmacenamiento() })
  const hojaQ = useQuery({ queryKey: ['hojaActual'], queryFn: () => repo.hojaActual() })

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
      const r = await repo.prepararAnioActual()
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

  return (
    <div className="space-y-4">
      {/* Archivo principal (BASE) */}
      <section>
        <h3 className="text-sm font-semibold">{t('almacen.principalTitulo')}</h3>
        <p className="text-xs text-muted-foreground mb-2">{t('almacen.principalDescripcion')}</p>
        {hojaQ.data ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{hojaQ.data.titulo}</div>
              <div className="text-[11px] text-gray-400 truncate">{hojaQ.data.id}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a href={hojaQ.data.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">{t('almacen.abrir')}</a>
              <Button variant="outline" size="sm" onClick={() => setPickerAbierto(a => !a)}>{t('almacen.cambiar')}</Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500">{t('almacen.cargando')}</p>
        )}

        {pickerAbierto && (
          <div className="mt-2 rounded-xl border border-gray-200 p-3 space-y-2">
            <Input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder={t('almacen.buscarPlaceholder')} />
            {buscando && <p className="text-xs text-gray-400">{t('almacen.buscando')}</p>}
            {!buscando && resultados && resultados.length === 0 && <p className="text-xs text-gray-500">{t('almacen.sinResultados')}</p>}
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
              {est.eventos.map(ev => (
                <li key={ev.año} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-sm">
                    {ev.año}
                    {ev.año === est.anioActivo && <span className="ml-2 text-[11px] text-green-600 font-medium">{t('almacen.activo')}</span>}
                  </span>
                  <div className="flex items-center gap-3">
                    <a href={enlace(ev.id)} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">{t('almacen.abrir')}</a>
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
                </li>
              ))}
              {est.eventos.length === 0 && <li className="px-3 py-2.5 text-xs text-gray-500">{t('almacen.sinAños')}</li>}
            </ul>
            {!est.creadoAñoActual && (
              <Button size="sm" variant="outline" className="mt-2" disabled={creandoAño} onClick={() => void crearAñoActual()}>
                {creandoAño ? t('almacen.creando') : t('almacen.crearAño')}
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  )
}
