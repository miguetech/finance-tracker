const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
const PERMISSIONS_URL = 'https://www.googleapis.com/drive/v3/files/{id}/permissions'

export interface DriveUploadInput {
  nombre: string
  mimeType: string
  /** Base64 sin prefijo `data:...` */
  base64: string
  /** ID de carpeta padre en Drive (opcional). Si no se pasa, sube a la raíz. */
  parentFolderId?: string
}

export interface DriveFolderResult {
  id: string
  name: string
}

/** Input de `Repository.uploadImagen`; `modulo` solo se usa en el backend (permisos). */
export type UploadImagenInput = DriveUploadInput & { modulo?: string }

export interface DriveUploadResult {
  id: string
  url: string
}

function stripDataPrefix(base64: string): string {
  const i = base64.indexOf(',')
  return i !== -1 && base64.slice(0, i).includes('base64') ? base64.slice(i + 1) : base64
}

export class DriveApi {
  constructor(private getToken: () => Promise<string>) {}

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const maxAttempts = 4
    for (let attempt = 0; ; attempt++) {
      const token = await this.getToken()
      const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
      if (!res.ok) {
        if (attempt < maxAttempts - 1 && (res.status === 429 || res.status === 500 || res.status === 503)) {
          const delay = 500 * 2 ** attempt + Math.random() * 250
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        const text = await res.text()
        throw new Error(`Drive API ${res.status}: ${text.slice(0, 300)}`)
      }
      if (res.status === 204) return undefined as T
      return res.json() as Promise<T>
    }
  }

  /**
   * Busca la hoja principal existente por nombre para evitar duplicados al
   * iniciar sesión (p. ej. tras limpiar el almacenamiento local).
   */
  async findSpreadsheet(nombre: string): Promise<{ id: string; url?: string } | null> {
    const qs = new URLSearchParams({
      q: `mimeType='application/vnd.google-apps.spreadsheet' and name='${nombre.replace(/'/g, "\\'")}' and trashed=false`,
      orderBy: 'modifiedByMeTime desc',
      pageSize: '5',
      fields: 'files(id,name,webViewLink)'
    })
    try {
      const res = await this.request<{ files?: { id: string; name: string; webViewLink?: string }[] }>(`https://www.googleapis.com/drive/v3/files?${qs}`)
      const first = res.files?.[0]
      return first ? { id: first.id, url: first.webViewLink } : null
    } catch {
      return null
    }
  }

  /** Lista spreadsheets de la cuenta cuyo nombre contenga el filtro
   *  (buscador del panel Almacenamiento). Excluye papelera. */
  async listarHojas(filtro: string): Promise<{ id: string; name: string }[]> {
    const termino = filtro.trim().replace(/'/g, "\\'")
    const clausulaNombre = termino ? ` and name contains '${termino}'` : ''
    const qs = new URLSearchParams({
      q: `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false${clausulaNombre}`,
      orderBy: 'modifiedByMeTime desc',
      pageSize: '25',
      fields: 'files(id,name)'
    })
    const res = await this.request<{ files?: { id: string; name: string }[] }>(`https://www.googleapis.com/drive/v3/files?${qs}`)
    return res.files ?? []
  }

  /** Renombra un archivo de Drive. */
  async renombrar(id: string, nombre: string): Promise<void> {
    await this.request(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nombre })
    })
  }

  // ── Huella de identidad (spec F2 §3) ──────────────────────────────────────
  /** Lee las `appProperties` de un archivo. Null si no tiene. */
  async getAppProperties(id: string): Promise<Record<string, string> | null> {
    try {
      const res = await this.request<{ appProperties?: Record<string, string> }>(
        `https://www.googleapis.com/drive/v3/files/${id}?fields=appProperties`
      )
      return res.appProperties ?? null
    } catch (e) {
      // Fuera de namespace drive.file (hoja ajena / service account): 404.
      if ((e as Error).message.includes('404')) return null
      throw e
    }
  }

  /** Aplica un delta de `appProperties`. Un valor `null` destruye la clave. */
  async setAppProperties(id: string, delta: Record<string, string | null>): Promise<void> {
    await this.request(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties: delta })
    })
  }

  /** Metadata del archivo para el gate de ownership (spec F3 §7): quién es
   *  dueño y si se puede editar. Fuera del namespace drive.file → null
   *  (sin datos verificables). */
  async getFileInfo(id: string): Promise<{
    owners?: { emailAddress?: string; me?: boolean }[]
    capabilities?: { canEdit?: boolean }
    trashed?: boolean
  } | null> {
    try {
      return await this.request(`https://www.googleapis.com/drive/v3/files/${id}?fields=owners(emailAddress,me),capabilities(canEdit),trashed`)
    } catch (e) {
      if ((e as Error).message.includes('404')) return null
      throw e
    }
  }

  /** Lista spreadsheets por huella (`appProperties has {key,value}`). */
  private async listarPorHuella(clausulas: string[], pageSize = 25): Promise<{ id: string; name: string; webViewLink?: string; modifiedTime?: string }[]> {
    const qs = new URLSearchParams({
      q: [`mimeType='application/vnd.google-apps.spreadsheet'`, 'trashed=false', ...clausulas].join(' and '),
      orderBy: 'modifiedTime desc',
      pageSize: String(pageSize),
      fields: 'files(id,name,webViewLink,modifiedTime)'
    })
    const res = await this.request<{ files?: { id: string; name: string; webViewLink?: string; modifiedTime?: string }[] }>(
      `https://www.googleapis.com/drive/v3/files?${qs}`
    )
    return res.files ?? []
  }

  /** Busca todos los BASE ACTIVOS por huella (`ft_tipo=base`, no reemplazado).
   *  Reemplaza la búsqueda por nombre del boot (spec §5/§6): nunca se decide
   *  identidad por nombre. */
  async findBases(): Promise<{ id: string; name: string; webViewLink?: string; modifiedTime?: string }[]> {
    return this.listarPorHuella([
      `appProperties has { key='ft_tipo' and value='base' }`,
      `not (appProperties has { key='ft_estado' and value='reemplazado' })`
    ])
  }

  /** Hojas EVENTOS vinculadas a una instancia por huella (no por nombre). */
  async findEventos(instancia: string): Promise<{ id: string; name: string; webViewLink?: string; modifiedTime?: string }[]> {
    return this.listarPorHuella([
      `appProperties has { key='ft_tipo' and value='eventos' }`,
      `appProperties has { key='ft_instancia' and value='${instancia}' }`
    ], 50)
  }

  /** Envía un archivo a la papelera de Drive (borrado reversible). */
  async enviarAPapelera(id: string): Promise<void> {
    await this.request(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    })
  }

  /** Transferencia de propiedad (spec F7 §10): `role=owner` con
   *  `transferOwnership` para el email destino. Google rechaza (403/400) cuando
   *  el scope no alcanza, es Workspace entre dominios o excede cuotas → lanza
   *  un Error con el código HTTP para que el flujo ofrezca el plan B. */
  async transferirOwnership(id: string, email: string): Promise<void> {
    await this.request(PERMISSIONS_URL.replace('{id}', id), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'owner', type: 'user', emailAddress: email, transferOwnership: true, sendNotificationEmail: false })
    })
  }

  /** Busca o crea una carpeta por nombre en la raíz o dentro de otra carpeta. */
  async findOrCreateFolder(nombre: string, parentId?: string): Promise<DriveFolderResult> {
    const qParts = [`mimeType='application/vnd.google-apps.folder'`, `name='${nombre.replace(/'/g, "\\'")}'`, 'trashed=false']
    if (parentId) qParts.push(`'${parentId}' in parents`)
    else qParts.push("'root' in parents")
    const qs = new URLSearchParams({
      q: qParts.join(' and '),
      fields: 'files(id,name)',
      pageSize: '5'
    })
    const res = await this.request<{ files?: { id: string; name: string }[] }>(`https://www.googleapis.com/drive/v3/files?${qs}`)
    if (res.files?.[0]) return { id: res.files[0].id, name: res.files[0].name }

    const metadata = JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined })
    const boundary = `ft_boundary_${Date.now().toString(36)}`
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}--`,
      ''
    ].join('\r\n')
    const folder = await this.request<{ id: string; name: string }>(UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    })
    return { id: folder.id, name: folder.name }
  }

  /** Obtiene/crea la estructura de carpetas de la app: Finance Tracker > submódulo. */
  async getAppFolder(modulo: string): Promise<string> {
    const root = await this.findOrCreateFolder('Finance Tracker')
    const subNombre = modulo === 'configuracion' ? 'Logos' : modulo.charAt(0).toUpperCase() + modulo.slice(1)
    const sub = await this.findOrCreateFolder(subNombre, root.id)
    return sub.id
  }

  /** Localiza el ft_config.json actual (el más recientemente modificado). */
  private async buscarFtConfig(): Promise<{ id: string } | null> {
    const qs = new URLSearchParams({
      q: "name='ft_config.json' and 'appDataFolder' in parents and trashed=false",
      fields: 'files(id)',
      spaces: 'appDataFolder',
      orderBy: 'modifiedTime desc',
      pageSize: '1'
    })
    const res = await this.request<{ files?: { id: string }[] }>(
      `https://www.googleapis.com/drive/v3/files?${qs}`
    )
    return res.files?.[0] ?? null
  }

  /** Guarda ft_config.json en la carpeta oculta appDataFolder del usuario.
   *  PATCH del archivo existente (spec §13): no acumular copias. */
  async saveAppConfig(config: { spreadsheetId: string }): Promise<void> {
    const metadata = JSON.stringify({ name: 'ft_config.json', mimeType: 'application/json', parents: ['appDataFolder'] })
    const boundary = `ft_boundary_${Date.now().toString(36)}`
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(config),
      `--${boundary}--`,
      ''
    ].join('\r\n')

    const previo = await this.buscarFtConfig().catch(() => null)
    if (previo) {
      // Update: `parents` no es escribible en PATCH (Drive 403). El archivo ya
      // vive en appDataFolder; solo refresca nombre/metadato y contenido.
      const metadataActualizado = JSON.stringify({ name: 'ft_config.json', mimeType: 'application/json' })
      const bodyActualizado = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        metadataActualizado,
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(config),
        `--${boundary}--`,
        ''
      ].join('\r\n')
      await this.request(`https://www.googleapis.com/upload/drive/v3/files/${previo.id}?uploadType=multipart`, {
        method: 'PATCH',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: bodyActualizado
      })
      return
    }
    await this.request(UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    })
  }

  /** Lee ft_config.json desde appDataFolder. Null si no existe.
   *  Elige el más reciente por modifiedTime (no uno arbitrario). */
  async loadAppConfig(): Promise<{ spreadsheetId: string } | null> {
    const file = await this.buscarFtConfig()
    if (!file) return null

    try {
      const content = await this.request<{ spreadsheetId: string }>(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
      )
      return content
    } catch (e) {
      if ((e as Error).message.includes('404')) return null
      throw e
    }
  }

  /** Elimina `ft_config.json` de appDataFolder (escape del boot: desvincular
   *  la hoja guardada para que el arranque vuelva a elegir por huella). */
  async borrarAppConfig(): Promise<void> {
    const previo = await this.buscarFtConfig().catch(() => null)
    if (!previo) return
    await this.request(`https://www.googleapis.com/drive/v3/files/${previo.id}`, { method: 'DELETE' })
  }

  /** Sube una imagen, la deja pública por link y devuelve la URL de vista. */
  async uploadBase64(input: DriveUploadInput): Promise<DriveUploadResult> {
    const base64 = stripDataPrefix(input.base64)
    const boundary = `ft_boundary_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
    const metadata = JSON.stringify({ name: input.nombre, mimeType: input.mimeType, parents: input.parentFolderId ? [input.parentFolderId] : undefined })
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      `Content-Type: ${input.mimeType}`,
      'Content-Transfer-Encoding: base64',
      '',
      base64,
      `--${boundary}--`,
      ''
    ].join('\r\n')

    const file = await this.request<{ id: string; webContentLink?: string; mimeType?: string }>(UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    })
    if (!file.id) throw new Error('Drive: no se obtuvo id del archivo')

    await this.request(PERMISSIONS_URL.replace('{id}', file.id), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    })

    const url = `https://lh3.googleusercontent.com/d/${file.id}`
    return { id: file.id, url }
  }
}