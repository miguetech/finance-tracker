import type { StorageAdapter } from '../data/storage'

/** Cifrado opcional del volcado del espejo (spec §9.4): clave AES-GCM 256
 *  derivada del PIN local con PBKDF2. El volcado cifrado vive en IndexedDB;
 *  la clave nunca se persiste, solo se deriva en memoria al desbloquear. */

const ITERACIONES_CIFRADO = 210_000

export interface VolcadoCifrado {
  v: 1
  salt: string
  iv: string
  datos: string
}

async function derivarClave(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERACIONES_CIFRADO },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function aB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function deB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

export async function cifrarVolcado(pin: string, bytes: Uint8Array): Promise<VolcadoCifrado> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const clave = await derivarClave(pin, salt)
  const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, clave, bytes as BufferSource)
  return { v: 1, salt: aB64(salt), iv: aB64(iv), datos: aB64(new Uint8Array(datos)) }
}

export async function descifrarVolcado(pin: string, volcado: VolcadoCifrado): Promise<Uint8Array> {
  const clave = await derivarClave(pin, deB64(volcado.salt))
  const plano = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deB64(volcado.iv) as BufferSource },
    clave,
    deB64(volcado.datos) as BufferSource
  )
  return new Uint8Array(plano)
}

/** Persistencia binaria simple sobre un StorageAdapter (IndexedDB en pro-
 *  ducción vía adaptador; en tests, mapa en memoria). */
export interface PersistorEspejo {
  cargar(): Promise<VolcadoCifrado | null>
  guardar(v: VolcadoCifrado): Promise<void>
  borrar(): Promise<void>
}

export function crearPersistorStorage(almacen: StorageAdapter, claveKv = 'ft_espejo_volcado'): PersistorEspejo {
  return {
    async cargar() {
      const raw = await almacen.get(claveKv)
      if (!raw) return null
      try { return JSON.parse(raw) as VolcadoCifrado } catch { return null }
    },
    async guardar(v) { await almacen.set(claveKv, JSON.stringify(v)) },
    async borrar() { await almacen.remove(claveKv) }
  }
}

interface IdbMinimal {
  open(nombre: string): {
    onupgradeneeded: ((e: { target: { result: { objectStoreNames: { contains(n: string): boolean }; createObjectStore(n: string): void } } }) => void) | null
    onsuccess: ((e: { target: { result: IDBDatabaseLike } }) => void) | null
    onerror: ((e: unknown) => void) | null
  }
}

interface IDBDatabaseLike {
  transaction(store: string, modo?: string): {
    objectStore(s: string): { get(k: string): { result: unknown }; put(v: unknown, k: string): void }
    oncomplete: (() => void) | null
    onerror: (() => void) | null
  }
  close(): void
}

/** Persistor sobre IndexedDB nativo (web/extensión); null si no disponible. */
export function crearPersistorIdb(nombre = 'ft-espejo'): PersistorEspejo | null {
  const idbApi = (globalThis as unknown as { indexedDB?: IdbMinimal }).indexedDB
  if (!idbApi) return null
  const idb = idbApi
  function abrir(): Promise<IDBDatabaseLike> {
    return new Promise((resolve, reject) => {
      const req = idb.open(nombre)
      req.onupgradeneeded = e => {
        const db = e.target.result
        if (!db.objectStoreNames.contains('volcado')) db.createObjectStore('volcado')
      }
      req.onsuccess = e => resolve(e.target.result)
      req.onerror = reject
    })
  }
  return {
    async cargar() {
      const db = await abrir()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('volcado', 'readonly')
        const req = tx.objectStore('volcado').get('blob')
        tx.oncomplete = () => resolve((req.result as VolcadoCifrado | undefined) ?? null)
        tx.onerror = () => reject(new Error('IndexedDB leer falló'))
      })
    },
    async guardar(v) {
      const db = await abrir()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('volcado', 'readwrite')
        tx.objectStore('volcado').put(v, 'blob')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(new Error('IndexedDB escribir falló'))
      })
    },
    async borrar() {
      const db = await abrir()
      return new Promise(resolve => {
        const tx = db.transaction('volcado', 'readwrite')
        tx.objectStore('volcado').put(null, 'blob') // deleteObjectStore excede lo mínimo; sobreescribir basta
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      })
    }
  }
}
