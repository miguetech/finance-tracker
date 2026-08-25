const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
const PERMISSIONS_URL = 'https://www.googleapis.com/drive/v3/files/{id}/permissions'

export interface DriveUploadInput {
  nombre: string
  mimeType: string
  /** Base64 sin prefijo `data:...` */
  base64: string
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

  /** Sube una imagen, la deja pública por link y devuelve la URL de vista. */
  async uploadBase64(input: DriveUploadInput): Promise<DriveUploadResult> {
    const base64 = stripDataPrefix(input.base64)
    const boundary = `ft_boundary_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
    const metadata = JSON.stringify({ name: input.nombre, mimeType: input.mimeType })
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

    const url = file.webContentLink || `https://drive.google.com/uc?export=view&id=${file.id}`
    return { id: file.id, url }
  }
}