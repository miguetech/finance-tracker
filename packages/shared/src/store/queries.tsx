import React, { createContext, useContext } from 'react'
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Repository } from '../data/repository'
import { useAppStore } from './appStore'
import type { Config, Cliente, Empleado, Factura, FacturaItem, Gasto, Proveedor, CuentaPagar, MetodoPago, Producto, TipoMovimiento, CodigoAcceso, GastoFijo, TasaHistorial } from '../types/entities'
import type { Usuario } from '../roles/roles'
import { DEFAULT_METODOS_PAGO } from '../types/schemas'
import { getCurrency, registerCurrency, parseCustomCurrencies, type Currency } from '../currency'

const RepoCtx = createContext<Repository | null>(null)
export function useRepo(): Repository {
  const repo = useContext(RepoCtx)
  if (!repo) throw new Error('useRepo fuera de AppProvider')
  return repo
}

export function AppProvider({ repo, children }: { repo: Repository; children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient())
  return (
    <RepoCtx.Provider value={repo}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </RepoCtx.Provider>
  )
}

export function useCurrency(): Currency {
  const config = useAppStore(s => s.config)
  return getCurrency(config?.moneda ?? 'USD')
}

export function useConfig() {
  const repo = useRepo()
  const setConfig = useAppStore(s => s.setConfig)
  const q = useQuery({ queryKey: ['config'], queryFn: () => repo.getConfig() })
  React.useEffect(() => {
    if (q.data) {
      setConfig(q.data)
      for (const c of parseCustomCurrencies(q.data.monedas_custom)) registerCurrency(c)
    }
  }, [q.data, setConfig])
  const qc = useQueryClient()
  const saveConfig = useMutation({
    mutationFn: (c: Config) => repo.saveConfig(c),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] })
  })
  return { config: q.data, isLoading: q.isLoading, saveConfig }
}

export function useClientes() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['clientes'], queryFn: () => repo.listClientes() })
  const saveCliente = useMutation({ mutationFn: (c: Cliente) => repo.saveCliente(c), onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }) })
  const deleteCliente = useMutation({ mutationFn: (id: string) => repo.deleteCliente(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }) })
  return { clientes: q.data ?? [], isLoading: q.isLoading, saveCliente, deleteCliente }
}

export function useFacturas(filtro?: { estado?: string; mes?: string }) {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['facturas', filtro], queryFn: () => repo.listFacturas(filtro) })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['facturas'] })
  const create = useMutation({ mutationFn: (i: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number }[]; fecha_emision: string; fecha_vencimiento: string; notas: string; moneda?: string }) => repo.createFactura(i), onSuccess: invalidate })
  const update = useMutation({ mutationFn: (i: { id: string; data: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number }[]; fecha_emision: string; fecha_vencimiento: string; notas: string; moneda?: string } }) => repo.updateFactura(i.id, i.data), onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['factura'] }) } })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteFactura(id), onSuccess: invalidate })
  return { facturas: q.data ?? [], isLoading: q.isLoading, createFactura: create, updateFactura: update, deleteFactura: del }
}

export function useFactura(id: string | null) {
  const repo = useRepo()
  return useQuery({
    queryKey: ['factura', id],
    queryFn: (): Promise<{ factura: Factura; items: FacturaItem[] } | null> => (id ? repo.getFactura(id) : Promise.resolve(null)),
    enabled: !!id
  })
}

export function useGastos(filtro?: { mes?: string; categoria?: string }) {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['gastos', filtro], queryFn: () => repo.listGastos(filtro) })
  const save = useMutation({ mutationFn: (g: Gasto) => repo.saveGasto(g), onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos'] }) })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteGasto(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos'] }) })
  return { gastos: q.data ?? [], isLoading: q.isLoading, saveGasto: save, deleteGasto: del }
}

export function useEmpleados() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['empleados'], queryFn: () => repo.listEmpleados() })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['empleados'] })
  const save = useMutation({ mutationFn: (e: Empleado) => repo.saveEmpleado(e), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteEmpleado(id), onSuccess: invalidate })
  return { empleados: q.data ?? [], isLoading: q.isLoading, saveEmpleado: save, deleteEmpleado: del }
}

export function useRegisterNomina() {
  const repo = useRepo()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (i: { id_empleado: string; mes: string; monto: number; metodo_pago: MetodoPago; fecha: string; notas: string; moneda?: string }) => repo.registerNomina(i),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gastos'] }); qc.invalidateQueries({ queryKey: ['reportes'] }) }
  })
}

export function useProveedores() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['proveedores'], queryFn: () => repo.listProveedores() })
  const save = useMutation({ mutationFn: (p: Proveedor) => repo.saveProveedor(p), onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }) })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteProveedor(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }) })
  return { proveedores: q.data ?? [], isLoading: q.isLoading, saveProveedor: save, deleteProveedor: del }
}

export function useCxp(filtro?: { estado?: string }) {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['cxp', filtro], queryFn: () => repo.listCxp(filtro) })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['cxp'] }); qc.invalidateQueries({ queryKey: ['pagos'] }) }
  const create = useMutation({ mutationFn: (i: { id_proveedor: string; folio_documento: string; categoria: string; descripcion: string; fecha_emision: string; fecha_vencimiento: string; monto_total: number; notas: string; moneda?: string }) => repo.createCxp(i), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteCxp(id), onSuccess: invalidate })
  return { cxps: q.data ?? [], isLoading: q.isLoading, createCxp: create, deleteCxp: del }
}

export function usePagos(idOrigen?: string) {
  const repo = useRepo()
  return useQuery({ queryKey: ['pagos', idOrigen], queryFn: () => repo.listPagos(idOrigen) })
}

export function useRegisterPago() {
  const repo = useRepo()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { tipo: 'cobro' | 'abono'; id_origen: string; fecha: string; monto: number; metodo_pago: MetodoPago; notas: string }) => repo.registerPago(p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas'] }); qc.invalidateQueries({ queryKey: ['cxp'] }); qc.invalidateQueries({ queryKey: ['pagos'] }) }
  })
}

export function useReportes(mes: string) {
  const repo = useRepo()
  return useQuery({ queryKey: ['reportes', mes], queryFn: () => repo.getReportes(mes) })
}

export function useUsuarios() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['usuarios'], queryFn: () => repo.listUsuarios() })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['usuarios'] })
  const save = useMutation({ mutationFn: (u: Usuario) => repo.saveUsuario(u), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (email: string) => repo.deleteUsuario(email), onSuccess: invalidate })
  return { usuarios: q.data ?? [], isLoading: q.isLoading, saveUsuario: save, deleteUsuario: del }
}

export function useCodigos() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['codigos'], queryFn: () => repo.listCodigos() })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['codigos'] })
  const save = useMutation({ mutationFn: (c: Partial<CodigoAcceso>) => repo.saveCodigo(c), onSuccess: invalidate })
  const renovar = useMutation({ mutationFn: ({ codigo, nuevaExpira }: { codigo: string; nuevaExpira: string }) => repo.renovarCodigo(codigo, nuevaExpira), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (codigo: string) => repo.deleteCodigo(codigo), onSuccess: invalidate })
  return { codigos: q.data ?? [], isLoading: q.isLoading, saveCodigo: save, renovarCodigo: renovar, deleteCodigo: del }
}

export function useDispositivos() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['dispositivos'], queryFn: () => repo.listDispositivos() })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['dispositivos'] })
  const remover = useMutation({ mutationFn: (dispositivo: string) => repo.removerDispositivo(dispositivo), onSuccess: invalidate })
  return { dispositivos: q.data ?? [], isLoading: q.isLoading, removerDispositivo: remover }
}

export function useCategorias(kind: 'gastos' | 'cxp') {
  const repo = useRepo()
  return useQuery({ queryKey: ['categorias', kind], queryFn: () => repo.getCategorias(kind) })
}

export function useMetodosPago(): string[] {
  const config = useAppStore(s => s.config)
  const raw = config?.metodos_pago ?? DEFAULT_METODOS_PAGO
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export function useCxpById(id: string | null) {
  const repo = useRepo()
  return useQuery({
    queryKey: ['cxpById', id],
    queryFn: async (): Promise<CuentaPagar | null> => {
      if (!id) return null
      const all = await repo.listCxp({})
      return all.find(c => c.id_cxp === id) ?? null
    },
    enabled: !!id
  })
}

export function useProductos() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['productos'], queryFn: () => repo.listProductos() })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['productos'] })
  const save = useMutation({ mutationFn: (p: Producto) => repo.saveProducto(p), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteProducto(id), onSuccess: invalidate })
  return { productos: q.data ?? [], isLoading: q.isLoading, saveProducto: save, deleteProducto: del }
}

export function useMovimientos(idProducto?: string) {
  const repo = useRepo()
  return useQuery({ queryKey: ['movimientos', idProducto], queryFn: () => repo.listMovimientos(idProducto) })
}

export function useRegistrarMovimiento() {
  const repo = useRepo()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (m: { id_producto: string; tipo: TipoMovimiento; cantidad: number; motivo: string; id_proveedor: string; fecha: string }) => repo.registrarMovimiento(m),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); qc.invalidateQueries({ queryKey: ['movimientos'] }) }
  })
}

export function useGastosFijos() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['gastosFijos'], queryFn: () => repo.listGastosFijos() })
  const save = useMutation({ mutationFn: (g: GastoFijo) => repo.saveGastoFijo(g), onSuccess: () => qc.invalidateQueries({ queryKey: ['gastosFijos'] }) })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteGastoFijo(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['gastosFijos'] }) })
  return { gastosFijos: q.data ?? [], isLoading: q.isLoading, saveGastoFijo: save, deleteGastoFijo: del }
}

export function useTasasHistorial() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['tasasHistorial'], queryFn: () => repo.listTasasHistorial() })
  const registrar = useMutation({ mutationFn: (t: Omit<TasaHistorial, 'id_tasa'>) => repo.registrarTasa(t), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasasHistorial'] }) })
  return { tasas: (q.data ?? []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))), isLoading: q.isLoading, registrarTasa: registrar }
}

export function useNominaDetalles() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['nominaDetalles'], queryFn: () => repo.listNominaDetalles() })
  const registrar = useMutation({
    mutationFn: (i: Parameters<Repository['registerNominaAvanzada']>[0]) => repo.registerNominaAvanzada(i),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nominaDetalles'] }); qc.invalidateQueries({ queryKey: ['gastos'] }); qc.invalidateQueries({ queryKey: ['reportes'] }) }
  })
  return { detalles: q.data ?? [], isLoading: q.isLoading, registerNominaAvanzada: registrar }
}

export function useReporteFinanciero(desde: string, hasta: string) {
  const repo = useRepo()
  return useQuery({ queryKey: ['reporteFinanciero', desde, hasta], queryFn: () => repo.getReporteFinanciero({ desde, hasta }), enabled: !!desde || !!hasta })
}

export function useReportesInventario(desde: string, hasta: string, ids?: string[]) {
  const repo = useRepo()
  return useQuery({ queryKey: ['reportesInventario', desde, hasta, ids?.join(',') ?? ''], queryFn: () => repo.getReportesInventario({ desde, hasta }, ids) })
}

export function useMetasVsLogros(meses: string[]) {
  const repo = useRepo()
  return useQuery({ queryKey: ['metasVsLogros', meses.join(',')], queryFn: () => repo.getMetasVsLogros(meses), enabled: meses.length > 0 })
}
