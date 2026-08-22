import type { Dict } from './types'

const gl: Partial<Dict> = {
  nav: {
    dashboard: 'Panel', facturas: 'Facturas', clientes: 'Clientes', empleados: 'Empregados',
    cxc: 'Contas a Cobrar', cuentas: 'Contas a Pagar', proveedores: 'Provedores',
    inventario: 'Inventario', gastos: 'Gastos', reportes: 'Informes', configuracion: 'Configuración',
    compartir: 'Compartir', facturacionPersonal: 'Facturación persoal'
  },
  common: {
    cancelar: 'Cancelar', eliminar: 'Eliminar', guardar: 'Gardar', guardarPago: 'Gardar pago',
    editar: 'Editar', nuevo: 'Novo', buscar: 'Buscar', cargando: 'Cargando…',
    errorConexion: 'Erro de conexión', sinDatos: 'Sen datos', registrar: 'Rexistrar',
    guardado: 'Gardado', creado: 'Creado', eliminado: 'Eliminado', copiar: 'Copiar', cerrar: 'Pechar',
    si: 'Si', no: 'Non', todos: 'Todos', fecha: 'Data', monto: 'Importe', metodo: 'Método',
    notas: 'Notas', categoria: 'Categoría', nombre: 'Nome', telefono: 'Teléfono', email: 'Correo',
    direccion: 'Enderezo', estado: 'Estado', acciones: 'Accións'
  },
  states: {
    pendiente: 'Pendente', parcial: 'Parcial', pagada: 'Pagada', vencida: 'Vencida',
    pagado: 'Pagado', porVencer: 'Por vencer', pagadas: 'Pagadas', pendientes: 'Pendentes', todas: 'Todas'
  },
  dashboard: {
    facturado: 'Facturado', cobrado: 'Cobrado', pendiente: 'Pendente', utilidad: 'Utilidade',
    gastosMes: 'Gastos do mes', gastos: 'Gastos', nuevos: 'Nova factura',
    vencidas: 'Vencidas', stockBajo: 'Stock baixo', conStockBajo: 'produto(s) por esgotar'
  },
  facturas: {
    title: 'Facturas', nueva: 'Nova factura', folio: 'Folio', cliente: 'Cliente', emision: 'Emisión',
    vencimiento: 'Vencemento', subtotal: 'Subtotal', iva: 'IVE', total: 'Total', saldo: 'Saldo',
    concepto: 'Concepto', cantidad: 'Cantidade', precio: 'Prezo', ver: 'Ver',
    detalles: 'Detalles da factura', factura: 'Factura', ventaRapida: 'Venda rápida',
    registrarPago: 'Rexistrar pago', pagar: 'Pagar', descargar: 'Descargar PDF'
  },
  clientes: { title: 'Clientes', nuevo: 'Novo cliente', rfc: 'NIF / documento', documento: 'Documento', cliente: 'Cliente' },
  empleados: {
    title: 'Empregados', nuevo: 'Novo empregado', puesto: 'Posto', salario: 'Salario',
    nomina: 'Nómina', registrarNomina: 'Rexistrar nómina', activo: 'Activo'
  },
  gastos: { title: 'Gastos', nuevo: 'Novo gasto', descripcion: 'Descrición', proveedor: 'Provedor' },
  cuentas: {
    title: 'Contas a Pagar', nueva: 'Nova conta', folioDoc: 'Folio documento',
    descripcion: 'Descrición', montoTotal: 'Importe total', proveedor: 'Provedor'
  },
  cxc: { title: 'Contas a Cobrar', cobrar: 'Cobrar', cobrado: 'Cobrado', vencidas: 'Vencidas' },
  proveedores: { title: 'Provedores', nuevo: 'Novo provedor' },
  inventario: {
    title: 'Inventario', nuevo: 'Novo produto', producto: 'Produto', stock: 'Stock',
    stockMinimo: 'Stock mínimo', precioCosto: 'Custo', precioVenta: 'Prezo venda', unidad: 'Unidade',
    entradaSalida: 'Entrada/Saída', historial: 'Historial', movimiento: 'Movemento', motivo: 'Motivo',
    imagen: 'Imaxe'
  },
  imagenes: {
    arrastrarSoltar: 'Arrastra unha imaxe aquí ou preme para subila',
    cambiar: 'Cambiar imaxe', quitar: 'Quitar imaxe',
    errorTipo: 'O arquivo debe ser unha imaxe', errorGrande: 'A imaxe pesa máis de 10 MB',
    subiendo: 'Subindo…'
  },
  reportes: {
    title: 'Informes', facturado: 'Facturado', cobrado: 'Cobrado', pendiente: 'Pendente',
    utilidad: 'Utilidade', porCategoria: 'Por categoría', topClientes: 'Top clientes'
  },
  configuracion: {
    title: 'Configuración', datosEmpresa: 'Datos da empresa', empresaNombre: 'Nome',
    empresaRfc: 'NIF', prefijoFolio: 'Prefixo do folio', contadorFolio: 'Contador do folio',
    iva: 'IVE (%)', moneda: 'Moeda', categorias: 'Categorías', metodosPago: 'Métodos de pagamento',
    idioma: 'Idioma', guardada: 'Configuración gardada',
    logo: 'Logo (URL)', logoUrlOpcional: 'Ou pega a URL do logo'
  },
  compartir: {
    title: 'Compartir', generarLink: 'Xerar ligazón', copiarLink: 'Copiar ligazón',
    roles: 'Roles', backendUrl: 'URL do backend', usuarios: 'Usuarios',
    codigos: 'Códigos de acceso',
    generarCodigo: 'Xerar código',
    generar: 'Xerar',
    expira: 'Expira',
    usos: 'Usos',
    responsable: 'Responsable',
    infinito: '∞',
    copiarCodigo: 'Copiar código',
    renovar: 'Renovar',
    revocar: 'Revogar',
    codigoGenerado: 'Código xerado: {codigo}',
    codigoCopiado: 'Código copiado',
    codigoRevocado: 'Código revogado',
    codigoRenovado: 'Código renovado',
    expiraEn: 'Caducidade (baleiro = infinito)',
    usosMax: 'Usos máx (baleiro = infinitos)',
    codigoInfo: 'Quen teña este código entra sen conta de Google co rol elixido.',
    rol: 'Rol',
    modulosCodigo: 'Módulos',
    eliminarCodigoTitulo: 'Revogar código',
    eliminarCodigoMensaje: 'Este código deixará de funcionar de inmediato. Continuar?',
    dispositivos: 'Dispositivos',
    dispositivo: 'Dispositivo',
    ipInfo: 'IP',
    registradoEn: 'Rexistrado',
    sinDispositivos: 'Sen dispositivos rexistrados',
    removerDispositivo: 'Quitar dispositivo',
    removerDispositivoTitulo: 'Quitar dispositivo',
    removerDispositivoMensaje: 'Este navegador perderá o acceso de inmediato. Continuar?',
    dispositivoRemovido: 'Dispositivo quitado',
    dispositivosInfo: 'Cada fila é un navegador autorizado cun código. Quitalo pecha esa sesión.'
  },
  auth: {
    loginTitle: 'Acceso ao panel',
    conGoogle: 'Entrar con Google',
    conCodigo: 'Entrar con código de acceso',
    codigo: 'Código de acceso',
    entrar: 'Entrar',
    codigoInvalido: 'Código non válido ou caducado',
    sinAcceso: 'Non tes acceso a este panel. Pide acceso ao administrador.',
    conectando: 'Conectando…', conectandoSheets: 'Conectando a Google Sheets…',
    sesionRequerida: 'Sesión obrigatoria', sesionInvalida: 'Sesión inválida',
    verifEnviado: 'Enviamos un código de verificación ao responsable. Escríbeo aquí.',
    verifCodigo: 'Código de verificación',
    verificar: 'Verificar',
    verifInvalido: 'Código de verificación non válido ou caducado',
    espera: 'Demasiados intentos. Agarda {min} min.'
  },
  errors: {
    nombreObligatorio: 'Nome obrigatorio', cantidadMayor: 'Cantidade > 0', precioMayorIgual: 'Prezo >= 0',
    clienteObligatorio: 'Cliente obrigatorio', minimoConcepto: 'Mínimo 1 concepto',
    descripcionObligatoria: 'Descrición obrigatoria', categoriaObligatoria: 'Categoría obrigatoria',
    montoMayor: 'Importe > 0', montoInvalido: 'Importe inválido', saldoExcede: 'O pago excede o saldo dispoñible',
    clienteConFacturas: 'O cliente ten facturas asociadas',
    proveedorConCuentas: 'O provedor ten contas a pagar asociadas',
    empleadoConNomina: 'O empregado ten nómina rexistrada',
    fechaVencimientoObligatoria: 'Data de vencemento obrigatoria', mesFormato: 'Mes con formato AAAA-MM',
    folioBloqueado: 'Folla ocupada, téntao de novo'
  }
}

export default gl
