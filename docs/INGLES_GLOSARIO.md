# Glosario ES → EN (identificadores del código)

Regla: palabras de dominio → inglés. Acrónimos legales MX (rfc, cfdi) intactos.
Felds que espejan columnas de Sheets → snake_case inglés (customer_id). Lo demás camelCase/PascalCase.

## Mapa de palabras
| ES | EN | notas |
|---|---|---|
| cliente / Cliente | customer / Customer | |
| factura / Factura | invoice / Invoice | item → item |
| gasto / Gasto | expense / Expense | |
| proveedor / Proveedor | supplier / Supplier | |
| empleado / Empleado | employee / Employee | |
| asistencia / Asistencia | attendance / Attendance | |
| nomina / Nomina | payroll / Payroll | |
| nómina (string valor) | payroll | |
| cuenta | account | cxp → ap (accounts payable), cxc → ar (receivable) |
| pago / Pago | payment / Payment | |
| producto / Producto | product / Product | |
| movimiento / Movimiento | movement / Movement | |
| stock | stock | |
| usuario / Usuario | user / User | |
| codigo / Codigo | code / Code | acceso → access |
| dispositivo / Dispositivo | device / Device | |
| tasa / Tasa | rate / Rate | historial → history, tipo_cambio → exchange_rate |
| gasto_fijo | fixed_expense | |
| inventario | inventory | |
| reporte / reportes | report / reports | |
| configuracion | settings | modulo 'configuracion' → 'settings' |
| dashboard | dashboard | |
| categoria / categorias | category / categories | |
| moneda / monedas | currency / currencies | |
| metodo / metodos | method / methods | metodos_pago → payment_methods |
| monto | amount | |
| total | total | |
| saldo | balance | |
| subtotal | subtotal | |
| iva | vat | |
| precio | price | precio_costo → cost_price, precio_venta → sale_price |
| cantidad | quantity | línea (items) → line |
| unidad / unidades | unit / units | |
| minimo | minimum | |
| max | max | |
| descripcion | description | |
| fecha / fecha_registro | date / created_at | fecha_emision → issue_date, fecha_vencimiento → due_date, fecha_pago → paid_at, fecha_ingreso → hire_date, fecha_edicion → edited_at |
| nombre | name | nombre_cliente → customer_name, nombre_proveedor → supplier_name, nombre_empleado → employee_name |
| direccion | address | direccion_pais → address_country, direccion_estado → address_state, direccion_cp → address_zip |
| telefono | phone | |
| email | email | |
| notas | notes | |
| tipo | type | |
| estado | status | (campo estado de factura/cxp); address_estado → state (región admin) |
| activo | active | |
| editada | edited | |
| enlace | link | |
| contador | counter | contador_folio → folio_counter |
| prefijo | prefix | |
| porcentaje | percent | iva_porcentaje → vat_percent |
| etiqueta | label | |
| share | share | |
| backend | backend | |
| metas | goals | |
| mensuales | monthly | |
| comisiones | fees | |
| tasa_dia | daily_rate | |
| notif | notifications | notif_gastos_activa → notifications_expense_active, notif_cxc_activa → notifications_ar_active |
| unidades_medida | measure_units | |
| nombre_base | base_name | |
| folio | serial | campo folio → serial (string). Copy 'FAC-…' queda igual |
| espejo | mirror | |
| tabla / tablas | table / tables | |
| hoja | sheet | hojaActual → currentSheet |
| año | year | |
| base | base | |
| evento | events | |
| imagen | image | |
| esqueleto | skeleton | |
| almacenamiento | storage | |
| huella | fingerprint | |

## Entidades (tipos)
| ES | EN |
|---|---|
| Cliente | Customer |
| FacturaItem | InvoiceItem |
| Factura | Invoice |
| Empleado | Employee |
| Asistencia | Attendance |
| GastoFijo | FixedExpense |
| Gasto | Expense |
| Proveedor | Supplier |
| CuentaPagar | AccountsPayable |
| Pago | Payment |
| Producto | Product |
| MovimientoStock | StockMovement |
| Config | Config |
| CodigoAcceso | AccessCode |
| Dispositivo | Device |
| MetodoPago | PaymentMethod |
| TipoPago | PaymentType |
| EstadoFactura | InvoiceStatus |
| TipoMovimiento | MovementType |
| TipoDoc | DocType |
| Kpis (reportes) | Kpis |
| InvoiceTotals | InvoiceTotals |

## Acciones wire (frontend ↔ AMBOS backends)
| ES | EN |
|---|---|
| getPerms | getPermissions |
| getConfig | getConfig |
| uploadImagen | uploadImage |
| saveConfig | saveConfig |
| listClientes | listCustomers |
| saveCliente | saveCustomer |
| deleteCliente | deleteCustomer |
| createFactura | createInvoice |
| updateFactura | updateInvoice |
| listFacturas | listInvoices |
| listFacturasItems | listInvoiceItems |
| getFactura | getInvoice |
| deleteFactura | deleteInvoice |
| listGastos | listExpenses |
| saveGasto | saveExpense |
| deleteGasto | deleteExpense |
| listGastosFijos | listFixedExpenses |
| saveGastoFijo | saveFixedExpense |
| deleteGastoFijo | deleteFixedExpense |
| listProveedores | listSuppliers |
| saveProveedor | saveSupplier |
| deleteProveedor | deleteSupplier |
| listEmpleados | listEmployees |
| saveEmpleado | saveEmployee |
| deleteEmpleado | deleteEmployee |
| registerNomina | registerPayroll |
| registerNominaAvanzada | registerAdvancedPayroll |
| listNominaDetalles | listPayrollDetails |
| listAsistencias | listAttendance |
| saveAsistencia | saveAttendance |
| deleteAsistencia | deleteAttendance |
| createCxp | createPayable |
| listCxp | listPayables |
| deleteCxp | deletePayable |
| registerPago | registerPayment |
| listPagos | listPayments |
| getReportes | getReports |
| getReporteFinanciero | getFinancialReport |
| getReportesInventario | getInventoryReports |
| getVentasProducto | getProductSales |
| getMetasVsLogros | getGoalsVsAchievements |
| getCategorias | getCategories |
| listProductos | listProducts |
| saveProducto | saveProduct |
| deleteProducto | deleteProduct |
| registrarMovimiento | registerMovement |
| listMovimientos | listMovements |
| listTasasHistorial | listRatesHistory |
| registrarTasa | registerRate |
| listUsuarios | listUsers |
| saveUsuario | saveUser |
| deleteUsuario | deleteUser |
| listCodigos | listCodes |
| saveCodigo | saveCode |
| renovarCodigo | renewCode |
| deleteCodigo | deleteCode |
| listDispositivos | listDevices |
| registrarDispositivo | registerDevice |
| removerDispositivo | removeDevice |

Otras funciones del Repository (interfaz `data/repository.ts`): leerVariasTablas → readSheets, leerVariasTablasVivas → readLiveSheets, hojaActual → currentSheet, conectarHojaPorNombre → connectSheetByName, conectarHojaPorId → connectSheetById, listarHojasDisponibles → listAvailableSheets, crearBaseVacia → createEmptyBase, resetCompleto → fullReset, resetNuclear → nuclearReset, verificarOwnership → verifyOwnership, esLegacyBase → isLegacyBase, adoptarLegacyBase → adoptLegacyBase, adoptarAñoLegacy → adoptLegacyYear, infoHoja → sheetInfo, inventarioHojas → sheetInventory, preflightTransferencia → preflightTransfer, transferirSistema → transferSystem, migrarImagenesADrive → migrateImagesToDrive, prepararAnioActual → prepareCurrentYear, estadoAlmacenamiento → storageStatus, renombrarHoja → renameSheet.

funciones readCache (…Espejo): listClientesEspejo → listCustomersFromMirror, listFacturasEspejo → listInvoicesFromMirror, getFacturaEspejo → getInvoiceFromMirror, listGastosEspejo → listExpensesFromMirror, listProductosEspejo → listProductsFromMirror, listProveedoresEspejo → listSuppliersFromMirror, listEmpleadosEspejo → listEmployeesFromMirror, listAsistenciasEspejo → listAttendanceFromMirror, listCxpEspejo → listPayablesFromMirror, listMovimientosEspejo → listMovementsFromMirror, listPagosEspejo → listPaymentsFromMirror.

## Tablas / hojas de Sheets (tables.ts + createSpreadsheet)
| ES | EN |
|---|---|
| Config | Config |
| Clientes | Customers |
| Empleados | Employees |
| Facturas | Invoices |
| Factura_Items | Invoice_Items |
| Gastos | Expenses |
| Proveedores | Suppliers |
| Cuentas_Pagar | Accounts_Payable |
| Pagos | Payments |
| Usuarios | Users |
| Productos | Products |
| Movimientos_Stock | Stock_Movements |
| Codigos_Acceso | Access_Codes |
| Dispositivos | Devices |
| Gastos_Fijos | Fixed_Expenses |
| Tasas_Historial | Rates_History |
| Nomina_Detalles | Payroll_Details |
| Asistencias | Attendance |

## Módulos / permisos (valores persistidos en modulos_ver + JWT + canView('...'))
clientes→customers, facturas→invoices, gastos→expenses, proveedores→suppliers, empleados→employees, cuentas→payables, inventario→inventory, reportes→reports, dashboard→dashboard, configuracion→settings.
Categorias kind: 'cxp'→'ap', 'gastos'→'expenses'. uploadImagen modulo: 'configuracion'→'settings', 'inventario'→'inventory'.

## Enumerados controlados (valores que viven en Sheets)
- TipoPago: cobro→payment, abono→partial
- EstadoFactura: pendiente→pending, parcial→partial, pagada→paid
- TipoMovimiento: entrada→in, salida→out, ajuste→adjustment
- Empleado.esquema_pago: semanal→weekly, quincenal→biweekly, mensual→monthly
- Roles (users/codigos): admin→admin, asistente→assistant, solo_lectura→read_only, ver_facturas→view_invoices, ver_reportes→view_reports, ver_gastos→view_expenses, ver_empleados→view_employees, ver_cuentas→view_payables, personalizado→custom

## Storage keys (localStorage/chrome.storage/sessionStorage)
ft_spreadsheet_id → ft_spreadsheet_id (queda), ft_config_cache → ft_config_cache (queda), ft_cola_escrituras → ft_write_queue, ft_sesion_local → ft_local_session, ft_offline_desbloqueada → ft_offline_unlocked, ft_web_oauth_nonce → ft_web_oauth_nonce (queda), ft_code_session → ft_code_session (queda), KEY_COLA var → ft_write_queue. Sistema.ft_id / appProperties ft_* → se conservan (marca de identidad, ya homogénea).

## Claims JWT (backend/src/auth/codigos.ts + roles.ts)
rol→role, modulos_ver→permissions_view, modulos_editar→permissions_edit, owner→owner, dev→dev, sub→sub.

## Fuera de alcance (no renombrar)
Copy de UI (mensajes i18n de texto), valores de categorías de usuario (Renta, Internet…), IDs de Google, client IDs OAuth, marcador `ft_`, acrónimos `rfc`/`cfdi`, `DEFAULT_CONFIG` público de config (DEFAULT_CURRENCY).