# Hoja-por-año: arquitectura de almacenamiento escalable

- Fecha: 2026-08-25
- Rama base: `feature/plan-ejecucion`
- Estado: aprobado para implementación
- Predecesor: `2026-08-23-espejo-sqlite-lectura-design.md` (espejo SQLite lectura)

## 1. Objetivo

Eliminar el crecimiento O(filas) del pull de tablas calientes y el riesgo de
límites de Google Sheets (10M celdas/spreadsheet compartidas, 50k chars/celda),
particionando los datos que varían en **un spreadsheet por año** y dejando los
catálogos/configuración en un spreadsheet BASE estable.

### No-objetivos

- Migrar fuera de Google Sheets (se conserva todo el stack actual).
- Backend de control/freemium, backup remoto e integraciones (VeriFactu):
  specs futuros. Solo se reserva la costura: reporte genérico de eventos.
- Multi-empresa centralizada: cada empresa mantiene SUS spreadsheets en SU
  correo (modelo ya soportado por binding `spreadsheetId`).

## 2. Estructura física

```
EMPRESA
├── Spreadsheet BASE ("FinanceTracker-{Empresa}")        ← estable
│     Config, Clientes, Proveedores, Productos, Empleados,
│     Usuarios, Gastos_Fijos, Tasas_Historial, Nomina_Detalles*
│
└── Spreadsheet EVENTOS-{año} ("FinanceTracker-{Empresa}-{año}")
      Facturas_{año}, Factura_Items_{año}, Pagos_{año},
      Gastos_{año}, Cuentas_Pagar_{año}
```

\* `Nomina_Detalles` es evento mensual pero de bajo volumen; permanece en BASE
en fase 1. Migrarla a EVENTOS si su volumen lo justifica.

Presupuesto: cada spreadsheet anual nace con 10M celdas frescos → la capacidad
deja de ser preocupación (peor caso medido ≈1% del presupuesto anual).

## 3. Mapa en Config

Claves nuevas en la tabla `Config` del BASE:

| clave | valor |
|---|---|
| `anio_activo` | `2026` |
| `eventos_2025` | `<spreadsheetId>` |
| `eventos_2026` | `<spreadsheetId>` |

Regla de resolución canónica:

> **El destino lo decide la fecha del documento (`fecha_emision`/`fecha`),
> nunca el reloj del dispositivo.**

## 4. Contrato de resolución de destino

```ts
type Destino = { idHoja: string; pestaña: string }

// Tablas evento: año extraído de la fecha del registro.
function resolverDestino(t: TableName, fila: {fecha?: string; fecha_emision?: string}): Destino
// Tablas catálogo: siempre BASE.
function resolverBase(t: TableName): Destino
```

- Tablas EVENTO (rutean por año): `Facturas`, `Factura_Items`, `Pagos`,
  `Gastos`, `Cuentas_Pagar`.
- Tablas BASE (fijas): el resto, incluida `Config`.
- Año sin spreadsheet referenciado → crearlo (rollover, §8) antes de escribir.

## 5. Escritura

1. INSERT: destino por fecha del documento (§4).
2. UPDATE de fila existente: destino = año de NACIMIENTO de la fila (su propia
   `fecha_emision`). La fila nunca migra de spreadsheet.
3. Operación lógica que toca dos años (ejemplo: pagar en 2027 una CxP de 2026)
   produce dos escrituras en dos spreadsheets:
   - `Pagos_2027` INSERT (fecha del pago)
   - `Cuentas_Pagar_2026` UPDATE de `saldo`/`estado`
4. **`fecha_emision` es inmutable** tras la creación (evita mover filas entre
   años). Montos/notas/categorías: editables libremente.
5. Offline: la cola guarda ops con sus fechas; al vaciarse cada op resuelve SU
   año aunque el año haya rotado entre medio.

## 6. Lectura

Política de pull:

| Conjunto | Alcance | TTL |
|---|---|---|
| Calientes vivas | año activo completo (+ `Factura_Items`) | 60 s (actual) |
| Arrastre | año anterior completo de `Facturas` y `Cuentas_Pagar` | igual al vivo |
| Catálogos BASE | todas las tablas fijas | 24 h |
| Histórico ≥2 años | solo bajo demanda (reporte con rango que lo incluye) | 24 h tras carga |

Justificación del arrastre: Facturas/Cuentas_Pagar son las únicas tablas con
saldo abierto que cruza años; sin año anterior en el pull, las deudas vencidas
desaparecerían de la UI cada 1 de enero (bug silencioso grave).

Los reportes con rango multi-año disparan un batchGet por spreadsheet
involucrado y unen resultados en memoria antes de calcular.

## 7. Espejo

- El espejo NO sabe de años: mantiene tablas lógicas (`Facturas`,
  `Cuentas_Pagar`…) en SQLite. Los batchGets de varios años insertan en la
  misma tabla lógica → la UI jamás cambia.
- Frescura por `(tabla, año)` en lugar de por tabla:

```ts
fechasPorAñoTabla(): Record<"Facturas|2027" | "Cuentas_Pagar|2026" | ..., number>
```

- `useOrigenLectura` agrega las fechas de TODOS los fragmentos cargados de la
  sección (el año vivo domina la versión granular).
- Ids globales (`uid()` prefijados) garantizan unicidad entre años; `hashTabla`
  evita reescrituras por fragmento.

## 8. Rollover anual

Detección (comparación `año_reloj ≠ anio_activo`) en tres puntos:

1. Arranque de app
2. Antes de cada pull
3. Antes de cada escritura evento

Acción al detectar: crear spreadsheet `EVENTOS-{nuevo}` vía `ensureTables`
(misma función del onboarding), registrar `eventos_{año}` en Config,
`anio_activo = nuevo`. Nada se copia ni mueve: archivar = dejar de escribir ahí.

Permisos: creación requiere rol con permiso de estructura; trabajadores
limitados reciben error claro y el dueño resuelve (o el backend futuro).

## 9. Casos límite cubiertos

| Caso | Comportamiento |
|---|---|
| Pago en 2027 de CxP 2026 | INSERT en Pagos_2027 + UPDATE saldo en Cxp_2026 |
| Factura 2026 sigue pendiente en 2027 | visible por política de arrastre (§6) |
| Offline cruzando la medianoche | cola enruta por fecha del documento |
| Editar gasto de 2025 | UPDATE va a Gastos_2025 (año de nacimiento) |
| Cambiar `fecha_emision` | prohibido tras creación (§5.4) |
| App abierta durante el cambio de año | chequeo pre-pull/pre-escritura lo captura |

## 10. Multi-empresa

- Cada empresa: par BASE + EVENTOS propios, en el correo del cliente.
- Selector de empresa: cambia `idHoja` activo, invalida queries, y monta el
  volcado de espejo correspondiente (`ft_espejo_{empresa}`).
- El mapa de años vive en EL BASE de cada empresa (aislamiento total).

## 11. Imágenes → Google Drive (inventario y configuración)

Problema actual: `Productos.imagen` y logo de configuración viajan como
base64/data-URI dentro de celdas → riesgo duro de 50,000 chars/celda y peso
extra en cada pull (Productos es caliente).

Contrato nuevo:

1. Subida: la app sube el binario a Drive del CLIENTE (carpeta raíz de la app
   o carpeta dedicada `FinanceTracker-Media/{empresa}`), scope mínimo
   `drive.file` (solo archivos creados por la app).
2. La celda guarda referencia corta: URL `https://drive.google.com/uc?id=…` o
   `drive:{fileId}` (decidir formato único; propuesta: URL directa por ser ya
   renderizable).
3. Render: `<img src={url}>` funciona con archivos compartidos "cualquiera con
   enlace"; fallback a thumbnail API si pesa.
4. Borrado de producto → opcional borrar archivo Drive (best-effort).
5. Migración de filas existentes con base64: script one-shot que detecta
   `data:image` en la celda, sube a Drive y reemplaza por URL.
6. Logo de configuración: mismo camino (Config clave `logo_url`).

Resultado: celdas livianas (~60 chars), fin del riesgo 50k, pulls más ligeros.

## 12. Fases de implementación

| # | Entregable | Notas |
|---|---|---|
| F1 | Imágenes a Drive (subida + render + migración) | independiente, alto valor inmediato |
| F2 | Resolución de destino + mapa Config + escrituras ruteadas | núcleo |
| F3 | Pull año vivo + arrastre + catálogos TTL largo | espejo por `(tabla,año)` |
| F4 | Rollover automático + creación de Eventos-{año} | incluye test de frontera |
| F5 | Reportes multi-año bajo demanda | batchGet por spreadsheet |
| F6 | Selector multi-empresa + espejo por empresa | cierra el modelo |

Orden recomendado: **F1 primero** (no depende del resto y elimina el único
fallo duro vigente), luego F2→F6 secuencial.

## 13. Fuera de alcance (specs futuros)

- Backend de control: entitlements, uso/mes, cobro premium (patrón check +
  reporte optimista; costura reservada: `POST /empresas/{id}/eventos`).
- Backup remoto opt-in (scopes Drive propios del backend, restore probado).
- Integraciones fiscales (VeriFactu): cadena de hash firmada por el backend
  al reconectar, eventos en orden de la cola.
- Modo quiosco (llave AES-GCM no extraíble persistida en IndexedDB).
