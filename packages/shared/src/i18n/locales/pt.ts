
import type { Dict } from './types'

const pt: Partial<Dict> = {
  nav: {
    dashboard: 'Painel', facturas: 'Faturas', clientes: 'Clientes', empleados: 'Funcionários',
    cxc: 'Contas a Receber', cuentas: 'Contas a Pagar', proveedores: 'Fornecedores',
    inventario: 'Inventário', gastos: 'Despesas', reportes: 'Relatórios', configuracion: 'Configuração',
    compartir: 'Compartilhar', facturacionPersonal: 'Faturamento pessoal'
  },
  common: {
    cancelar: 'Cancelar', eliminar: 'Excluir', guardar: 'Salvar', guardarPago: 'Salvar pagamento',
    editar: 'Editar', nuevo: 'Novo', buscar: 'Buscar', cargando: 'Carregando…',
    errorConexion: 'Erro de conexão', sinDatos: 'Sem dados', registrar: 'Registrar',
    guardado: 'Salvo', creado: 'Criado', eliminado: 'Excluído', copiar: 'Copiar', cerrar: 'Fechar',
    si: 'Sim', no: 'Não', todos: 'Todos', fecha: 'Data', monto: 'Valor', metodo: 'Método',
    notas: 'Notas', categoria: 'Categoria', nombre: 'Nome', telefono: 'Telefone', email: 'E-mail',
    direccion: 'Endereço', estado: 'Status', acciones: 'Ações'
  },
  states: {
    pendiente: 'Pendente', parcial: 'Parcial', pagada: 'Paga', vencida: 'Vencida',
    pagado: 'Pago', porVencer: 'A vencer', pagadas: 'Pagas', pendientes: 'Pendentes', todas: 'Todas'
  },
  dashboard: {
    facturado: 'Faturado', cobrado: 'Recebido', pendiente: 'Pendente', utilidad: 'Lucro',
    gastosMes: 'Despesas do mês', gastos: 'Despesas', nuevos: 'Nova fatura',
    vencidas: 'Vencidas', stockBajo: 'Estoque baixo', conStockBajo: 'produto(s) a esgotar'
  },
  facturas: {
    title: 'Faturas', nueva: 'Nova fatura', folio: 'Folio', cliente: 'Cliente', emision: 'Emissão',
    vencimiento: 'Vencimento', subtotal: 'Subtotal', iva: 'IVA', total: 'Total', saldo: 'Saldo',
    concepto: 'Conceito', cantidad: 'Quantidade', precio: 'Preço', ver: 'Ver',
    detalles: 'Detalhes da fatura', factura: 'Fatura', ventaRapida: 'Venda rápida',
    registrarPago: 'Registrar pagamento', pagar: 'Pagar', descargar: 'Baixar PDF'
  },
  clientes: { title: 'Clientes', nuevo: 'Novo cliente', rfc: 'RFC / documento', documento: 'Documento', cliente: 'Cliente' },
  empleados: {
    title: 'Funcionários', nuevo: 'Novo funcionário', puesto: 'Cargo', salario: 'Salário',
    nomina: 'Folha de pagamento', registrarNomina: 'Registrar folha', activo: 'Ativo'
  },
  gastos: { title: 'Despesas', nuevo: 'Nova despesa', descripcion: 'Descrição', proveedor: 'Fornecedor' },
  cuentas: {
    title: 'Contas a Pagar', nueva: 'Nova conta', folioDoc: 'Folio documento',
    descripcion: 'Descrição', montoTotal: 'Valor total', proveedor: 'Fornecedor'
  },
  cxc: { title: 'Contas a Receber', cobrar: 'Receber', cobrado: 'Recebido', vencidas: 'Vencidas' },
  proveedores: { title: 'Fornecedores', nuevo: 'Novo fornecedor' },
  inventario: {
    title: 'Inventário', nuevo: 'Novo produto', producto: 'Produto', stock: 'Estoque',
    stockMinimo: 'Estoque mínimo', precioCosto: 'Custo', precioVenta: 'Preço venda', unidad: 'Unidade',
    entradaSalida: 'Entrada/Saída', historial: 'Histórico', movimiento: 'Movimento', motivo: 'Motivo',
    imagen: 'Imagem'
  },
  imagenes: {
    arrastrarSoltar: 'Arraste uma imagem aqui ou clique para enviar',
    cambiar: 'Trocar imagem', quitar: 'Remover imagem',
    errorTipo: 'O arquivo deve ser uma imagem', errorGrande: 'A imagem pesa mais de 10 MB',
    subiendo: 'Enviando…'
  },
  reportes: {
    title: 'Relatórios', facturado: 'Faturado', cobrado: 'Recebido', pendiente: 'Pendente',
    utilidad: 'Lucro', porCategoria: 'Por categoria', topClientes: 'Top clientes'
  },
  configuracion: {
    title: 'Configuração', datosEmpresa: 'Dados da empresa', empresaNombre: 'Nome',
    empresaRfc: 'RFC', prefijoFolio: 'Prefixo do folio', contadorFolio: 'Contador do folio',
    iva: 'IVA (%)', moneda: 'Moeda', categorias: 'Categorias', metodosPago: 'Métodos de pagamento',
    idioma: 'Idioma', guardada: 'Configuração salva',
    logo: 'Logo (URL)', logoUrlOpcional: 'Ou cole a URL do logo'
  },
  compartir: {
    title: 'Compartilhar', generarLink: 'Gerar link', copiarLink: 'Copiar link',
    roles: 'Perfis', backendUrl: 'URL do backend', usuarios: 'Usuários',
    codigos: 'Códigos de acesso',
    generarCodigo: 'Gerar código',
    generar: 'Gerar',
    expira: 'Expira',
    usos: 'Usos',
    responsable: 'Responsável',
    infinito: '∞',
    copiarCodigo: 'Copiar código',
    renovar: 'Renovar',
    revocar: 'Revogar',
    codigoGenerado: 'Código gerado: {codigo}',
    codigoCopiado: 'Código copiado',
    codigoRevocado: 'Código revogado',
    codigoRenovado: 'Código renovado',
    expiraEn: 'Expiração (vazio = infinito)',
    usosMax: 'Usos máx (vazio = infinitos)',
    codigoInfo: 'Quem tiver este código entra sem conta Google com o papel escolhido.',
    rol: 'Papel',
    modulosCodigo: 'Módulos',
    eliminarCodigoTitulo: 'Revogar código',
    eliminarCodigoMensaje: 'Este código deixará de funcionar imediatamente. Continuar?',
    dispositivos: 'Dispositivos',
    dispositivo: 'Dispositivo',
    ipInfo: 'IP',
    registradoEn: 'Registrado',
    sinDispositivos: 'Nenhum dispositivo registrado',
    removerDispositivo: 'Remover dispositivo',
    removerDispositivoTitulo: 'Remover dispositivo',
    removerDispositivoMensaje: 'Este navegador perderá o acesso imediatamente. Continuar?',
    dispositivoRemovido: 'Dispositivo removido',
    dispositivosInfo: 'Cada linha é um navegador autorizado com um código. Removê-lo encerra essa sessão.'
  },
  auth: {
    loginTitle: 'Acesso ao painel',
    conGoogle: 'Entrar com o Google',
    conCodigo: 'Entrar com código de acesso',
    codigo: 'Código de acesso',
    entrar: 'Entrar',
    codigoInvalido: 'Código inválido ou expirado',
    sinAcceso: 'Você não tem acesso a este painel. Peça acesso ao administrador.',
    conectando: 'Conectando…', conectandoSheets: 'Conectando ao Google Sheets…',
    sesionRequerida: 'Sessão obrigatória', sesionInvalida: 'Sessão inválida',
    verifEnviado: 'Enviamos um código de verificação ao responsável. Digite aqui.',
    verifCodigo: 'Código de verificação',
    verificar: 'Verificar',
    verifInvalido: 'Código de verificação inválido ou expirado',
    espera: 'Muitas tentativas. Aguarde {min} min.'
  },
  errors: {
    nombreObligatorio: 'Nome obrigatório', cantidadMayor: 'Quantidade > 0', precioMayorIgual: 'Preço >= 0',
    clienteObligatorio: 'Cliente obrigatório', minimoConcepto: 'Mínimo 1 item',
    descripcionObligatoria: 'Descrição obrigatória', categoriaObligatoria: 'Categoria obrigatória',
    montoMayor: 'Valor > 0', montoInvalido: 'Valor inválido', saldoExcede: 'Pagamento excede saldo disponível',
    clienteConFacturas: 'Cliente tem faturas associadas',
    proveedorConCuentas: 'Fornecedor tem contas a pagar associadas',
    empleadoConNomina: 'Funcionário tem folha registrada',
    fechaVencimientoObligatoria: 'Data de vencimento obrigatória', mesFormato: 'Mês no formato AAAA-MM',
    folioBloqueado: 'Planilha ocupada, tente novamente'
  }
}

export default pt
