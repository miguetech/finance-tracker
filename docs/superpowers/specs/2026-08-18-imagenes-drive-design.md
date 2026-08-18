# Diseño: imágenes en Google Drive (productos y logo de factura)

Fecha: 2026-08-18
Estado: aprobado por el usuario

---

## 1. Objetivo

Permitir subir imágenes a Google Drive desde la app, para:

- **Productos**: una foto por producto (`Producto.imagen`).
- **Configuración**: el logo de la empresa (`empresa_logo`, campo ya existente) con un uploader de archivo (antes solo URL pegada).

Lo suben tanto el **dueño** como los **invitados** (modo Compartir) con permiso de edición. La imagen se **optimiza en el cliente** para pesar lo mínimo posible sin perder calidad visible.

## 2. Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Almacenamiento | Google Drive (archivo por imagen) | El usuario lo pidió; base64 en Sheets llenaría las celdas |
| Visibilidad | Público por link (`anyone` lector) | Para poder mostrarla en `<img>` y en el PDF sin autenticación |
| Upload dueño | Directo a Drive con su token OAuth (scope `drive.file` ya pedido) | Cero latencia extra, archivos en su propio Drive |
| Upload invitado | A través del backend (service account) / Apps Script (`DriveApp`) | El invitado no tiene acceso a la hoja ni a Drive del dueño |
| Optimización | Canvas en cliente: resize máx 900px, WebP (fallback JPEG) q≈0.82 | Base64 pequeño para el POST, buena calidad |
| Transporte | `uploadImagen` en el Repository; los remotos usan **POST** | El payload (base64) no cabe en la query string del GET |

## 3. Arquitectura

```
ProductoFormModal / Configuracion
        │  archivo (File)
        ▼
lib/image.ts  optimizeImage() → { base64, mimeType }
        │
        ▼
Repository.uploadImagen({ nombre, base64, mimeType, modulo })
        │
   ├── dueño: createRepository → DriveApi (token del usuario)
   └── invitado: createRemoteRepository → POST / → backend → DriveApi (service account)
        │
        ▼
DriveApi.uploadBase64()  (multipart a Drive API)
   │  1. crea archivo
   │  2. permiso anyone/lector
   ▼
webContentLink (URL pública) → se guarda en la fila (Producto.imagen / empresa_logo)
```

## 4. Cambios por capa

### 4.1 `packages/shared/src/drive/api.ts` (nuevo)
- `DriveApi` con `uploadBase64({ nombre, mimeType, base64 })`:
  - `POST /upload/drive/v3/files?uploadType=multipart` (body multipart/related con metadata + media).
  - `POST /drive/v3/files/{id}/permissions` con `{ role: 'reader', type: 'anyone' }`.
  - Devuelve `{ id, url }` donde `url = webContentLink`.

### 4.2 `packages/shared/src/sheets/api.ts`
- Exponer `getToken()` público (reutiliza el getter interno) para que `createRepository` pueda construir el `DriveApi` con el mismo token.

### 4.3 `packages/shared/src/data/repository.ts`
- `RepoContext` recibe `api: SheetsApi`; dentro se construye `drive = new DriveApi(() => api.getToken())`.
- Nuevo método `uploadImagen(input): Promise<string>` que delega en `drive`.

### 4.4 `packages/shared/src/data/remoteRepository.ts`
- Nuevo `uploadImagen` que hace **POST** a la API con `{ action: 'uploadImagen', payload, token | id_token }`.

### 4.5 `apps/backend`
- `src/google.ts`: añadir `https://www.googleapis.com/auth/drive.file` al `SCOPES` de la service account.
- `src/actions.ts`: case `uploadImagen` con guard por módulo:
  - `modulo === 'configuracion'` → `p.isAdmin`
  - `modulo === 'inventario'` → `p.canEdit('inventario')`
  - otro → denegado.
- `src/index.ts` (`makeRepo`): ya no cambia; `createRepository` construye el `DriveApi` desde el token de la service account.

### 4.6 `apps/script/src/backend.ts` (Apps Script)
- Nuevo `backendUploadImagen({ nombre, base64, mimeType })`:
  - `Utilities.base64Decode` → blob → `DriveApp.createFile`.
  - `file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)`.
  - Devuelve `file.getUrl()`.
- Case `uploadImagen` en `route()` con los mismos guards.
- Declarar `DriveApp` y `Utilities`.

### 4.7 Datos
- `Producto.imagen: string` en `types/entities.ts`.
- Columna `imagen` al final de `TABLES.Productos` (migración automática por `ensureColumns`).
- `imagen: z.string().default('')` en `ProductoSchema`.
- `Config` no cambia (usa `empresa_logo`).

### 4.8 UI
- `packages/shared/src/ui/ImageUploader.tsx` (nuevo): drag & drop + selector de archivo + preview + botón quitar. Recibe `value` (URL) y `onChange(File | null)`.
- `ProductoFormModal`: integrar `ImageUploader`; al guardar, si hay archivo → `optimizeImage` → `uploadImagen({ modulo: 'inventario' })` → guardar `imagen`.
- `Inventario`: miniatura (`<img>`) en la columna de producto.
- `Configuracion`: reemplazar el input de logo por `ImageUploader` + mantener campo URL manual (avanzado).

### 4.9 i18n
- Strings nuevos en `messages.ts` (es) y `locales/{en,pt,gl,ca}.ts`:
  - `imagenes.arrastrarSoltar` / `imagenes.seleccionar` / `imagenes.quitar` / `imagenes.errorArchivo` / `imagenes.optimizando` / `imagenes.subiendo`.

## 5. Manejo de errores

- Archivo no imagen o demasiado grande → toast con error.
- Fallo de upload (red/permisos) → no guarda la fila, muestra el error.
- Quitar imagen → se limpia el campo (no se borra el archivo en Drive; así no se rompen URLs ya compartidas).

## 6. Tests

- `DriveApi`: multipart se arma bien, permiso se aplica, devuelve URL (con `fetch` mockeado).
- `actions`: `uploadImagen` denegado sin permiso; permitido para admin/inventario.
- `repository`: `uploadImagen` delega en DriveApi y `saveProducto` persiste `imagen`.
- `lib/image`: resize respeta límite, mantiene proporción, exporta base64.

## 7. Fuera de alcance

- Borrar el archivo de Drive al quitar la imagen.
- Álbumes/carpetas organizadas en Drive (se sube a la raíz del Drive de la app).
- Cámara integrada.