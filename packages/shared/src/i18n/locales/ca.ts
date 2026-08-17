import type { Dict } from './types'

const ca: Partial<Dict> = {
  nav: {
    dashboard: 'Panell', facturas: 'Factures', clientes: 'Clients', empleados: 'Empleats',
    cxc: 'Comptes a Cobrar', cuentas: 'Comptes a Pagar', proveedores: 'Proveïdors',
    inventario: 'Inventari', gastos: 'Despeses', reportes: 'Informes', configuracion: 'Configuració',
    compartir: 'Compartir', facturacionPersonal: 'Facturació personal'
  },
  common: {
    cancelar: 'Cancel·lar', eliminar: 'Eliminar', guardar: 'Desa', guardarPago: 'Desar pagament',
    editar: 'Editar', nuevo: 'Nou', buscar: 'Cercar', cargando: 'Carregant…',
    errorConexion: 'Error de connexió', sinDatos: 'Sense dades', registrar: 'Registrar',
    guardado: 'Desat', creado: 'Creat', eliminado: 'Eliminat', copiar: 'Copiar', cerrar: 'Tancar',
    si: 'Sí', no: 'No', todos: 'Tots', fecha: 'Data', monto: 'Import', metodo: 'Mètode',
    notas: 'Notes', categoria: 'Categoria', nombre: 'Nom', telefono: 'Telèfon', email: 'Correu',
    direccion: 'Adreça', estado: 'Estat', acciones: 'Accions'
  },
  states: {
    pendiente: 'Pendent', parcial: 'Parcial', pagada: 'Pagada', vencida: 'Vençuda',
    pagado: 'Pagat', porVencer: 'Per vèncer', pagadas: 'Pagades', pendientes: 'Pendents', todas: 'Totes'
  },
  dashboard: {
    facturado: 'Facturat', cobrado: 'Cobrat', pendiente: 'Pendent', utilidad: 'Benefici',
    gastosMes: 'Despeses del mes', gastos: 'Despeses', nuevos: 'Nova factura',
    vencidas: 'Vençudes', stockBajo: 'Stock baix', conStockBajo: 'producte(s) per esgotar'
  },
  facturas: {
    title: 'Factures', nueva: 'Nova factura', folio: 'Folio', cliente: 'Client', emision: 'Emissió',
    vencimiento: 'Venciment', subtotal: 'Subtotal', iva: 'IVA', total: 'Total', saldo: 'Saldo',
    concepto: 'Concepte', cantidad: 'Quantitat', precio: 'Preu', ver: 'Veure',
    detalles: 'Detalls de la factura', factura: 'Factura', ventaRapida: 'Venda ràpida',
    registrarPago: 'Registrar pagament', pagar: 'Pagar', descargar: 'Descarregar PDF'
  },
  clientes: { title: 'Clients', nuevo: 'Nou client', rfc: 'NIF / document', documento: 'Document', cliente: 'Client' },
  empleados: {
    title: 'Empleats', nuevo: 'Nou empleat', puesto: 'Càrrec', salario: 'Salari',
    nomina: 'Nòmina', registrarNomina: 'Registrar nòmina', activo: 'Actiu'
  },
  gastos: { title: 'Despeses', nuevo: 'Nova despesa', descripcion: 'Descripció', proveedor: 'Proveïdor' },
  cuentas: {
    title: 'Comptes a Pagar', nueva: 'Nou compte', folioDoc: 'Folio document',
    descripcion: 'Descripció', montoTotal: 'Import total', proveedor: 'Proveïdor'
  },
  cxc: { title: 'Comptes a Cobrar', cobrar: 'Cobrar', cobrado: 'Cobrat', vencidas: 'Vençudes' },
  proveedores: { title: 'Proveïdors', nuevo: 'Nou proveïdor' },
  inventario: {
    title: 'Inventari', nuevo: 'Nou producte', producto: 'Producte', stock: 'Stock',
    stockMinimo: 'Stock mínim', precioCosto: 'Cost', precioVenta: 'Preu venda', unidad: 'Unitat',
    entradaSalida: 'Entrada/Sortida', historial: 'Historial', movimiento: 'Moviment', motivo: 'Motiu'
  },
  reportes: {
    title: 'Informes', facturado: 'Facturat', cobrado: 'Cobrat', pendiente: 'Pendent',
    utilidad: 'Benefici', porCategoria: 'Per categoria', topClientes: 'Top clients'
  },
  configuracion: {
    title: 'Configuració', datosEmpresa: 'Dades de l\'empresa', empresaNombre: 'Nom',
    empresaRfc: 'NIF', prefijoFolio: 'Prefix del folio', contadorFolio: 'Comptador del folio',
    iva: 'IVA (%)', moneda: 'Moneda', categorias: 'Categories', metodosPago: 'Mètodes de pagament',
    idioma: 'Idioma', guardada: 'Configuració desada'
  },
  compartir: {
    title: 'Compartir', generarLink: 'Generar enllaç', copiarLink: 'Copiar enllaç',
    roles: 'Rols', backendUrl: 'URL del backend', usuarios: 'Usuaris',
    codigos: 'Codis d\'accés',
    generarCodigo: 'Genera codi',
    generar: 'Genera',
    expira: 'Expira',
    usos: 'Usos',
    responsable: 'Responsable',
    infinito: '∞',
    copiarCodigo: 'Copia el codi',
    renovar: 'Renova',
    revocar: 'Revoca',
    codigoGenerado: 'Codi generat: {codigo}',
    codigoCopiado: 'Codi copiat',
    codigoRevocado: 'Codi revocat',
    codigoRenovado: 'Codi renovat',
    expiraEn: 'Caducitat (buit = infinit)',
    usosMax: 'Usos màx (buit = infinits)',
    codigoInfo: 'Qui tingui aquest codi entra sense compte de Google amb el rol triat.',
    rol: 'Rol',
    modulosCodigo: 'Mòduls',
    eliminarCodigoTitulo: 'Revoca el codi',
    eliminarCodigoMensaje: 'Aquest codi deixarà de funcionar de seguida. Continuar?',
    dispositivos: 'Dispositius',
    dispositivo: 'Dispositiu',
    ipInfo: 'IP',
    registradoEn: 'Registrat',
    sinDispositivos: 'Sense dispositius registrats',
    removerDispositivo: 'Treure dispositiu',
    removerDispositivoTitulo: 'Treure dispositiu',
    removerDispositivoMensaje: 'Aquest navegador perdrà l\'accés de seguida. Continuar?',
    dispositivoRemovido: 'Dispositiu tret',
    dispositivosInfo: 'Cada fila és un navegador autoritzat amb un codi. Treure\'l tanca aquesta sessió.'
  },
  auth: {
    loginTitle: 'Accés al panell',
    conGoogle: 'Entra amb Google',
    conCodigo: 'Entra amb codi d\'accés',
    codigo: 'Codi d\'accés',
    entrar: 'Entra',
    codigoInvalido: 'Codi invàlid o caducat',
    sinAcceso: 'No tens accés a aquest panell. Demana accés a l\'administrador.',
    conectando: 'Connectant…', conectandoSheets: 'Connectant a Google Sheets…',
    sesionRequerida: 'Sessió obligatòria', sesionInvalida: 'Sessió invàlida',
    verifEnviado: 'Hem enviat un codi de verificació al responsable. Escriu-lo aquí.',
    verifCodigo: 'Codi de verificació',
    verificar: 'Verificar',
    verifInvalido: 'Codi de verificació invàlid o caducat',
    espera: 'Massa intents. Espera {min} min.'
  },
  errors: {
    nombreObligatorio: 'Nom obligatori', cantidadMayor: 'Quantitat > 0', precioMayorIgual: 'Preu >= 0',
    clienteObligatorio: 'Client obligatori', minimoConcepto: 'Mínim 1 concepte',
    descripcionObligatoria: 'Descripció obligatòria', categoriaObligatoria: 'Categoria obligatòria',
    montoMayor: 'Import > 0', montoInvalido: 'Import invàlid', saldoExcede: 'El pagament supera el saldo disponible',
    clienteConFacturas: 'El client té factures associades',
    proveedorConCuentas: 'El proveïdor té comptes a pagar associades',
    empleadoConNomina: 'L\'empleat té nòmina registrada',
    fechaVencimientoObligatoria: 'Data de venciment obligatòria', mesFormato: 'Mes amb format AAAA-MM',
    folioBloqueado: 'Fulla ocupada, torna-ho a provar'
  }
}

export default ca
