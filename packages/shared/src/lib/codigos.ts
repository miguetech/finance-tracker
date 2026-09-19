import type { CodigoAcceso } from '../types/entities'

export const CODIGO_ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODIGO_REGEX = /^[A-Z0-9]{3,6}-\d{4}-[A-Z0-9]{4}$/

export const CODIGO_ROLES_SIN_ADMIN = ['asistente', 'solo_lectura', 'ver_facturas', 'ver_reportes', 'ver_gastos', 'ver_empleados', 'ver_cuentas', 'personalizado'] as const

function randomInt(max: number): number {
  const cryptoObj = globalThis.crypto as (Crypto & { getRandomValues?: (arr: Uint32Array) => Uint32Array }) | undefined
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(1)
    cryptoObj.getRandomValues(buf)
    return buf[0] % max
  }
  return Math.floor(Math.random() * max)
}

export function prefijoDesdeNombre(nombre: string): string {
  const limpio = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase()
  if (!limpio) return 'FT'
  return limpio.slice(0, 3).padEnd(3, 'X')
}

export function generarCodigo(prefijo: string, año: number, existentes: string[]): string {
  const set = new Set(existentes)
  const pre = prefijo.toUpperCase()
  for (let i = 0; i < 20; i++) {
    let sufijo = ''
    for (let j = 0; j < 4; j++) sufijo += CODIGO_ALFABETO[randomInt(CODIGO_ALFABETO.length)]
    const candidato = `${pre}-${año}-${sufijo}`
    if (!set.has(candidato)) return candidato
  }
  throw new Error('No se pudo generar un código único')
}

export function randomAlfa(len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += CODIGO_ALFABETO[randomInt(CODIGO_ALFABETO.length)]
  return s
}

export function esCodigoValido(codigo: string): boolean {
  return CODIGO_REGEX.test(codigo)
}

export function usosInfinitos(c: Pick<CodigoAcceso, 'max_uses' | 'usos'>): boolean {
  return c.max_uses === '' || c.max_uses === undefined || c.max_uses === null
}

export function usosRestantes(c: Pick<CodigoAcceso, 'usos'>): number {
  if (c.usos === '' || c.usos === undefined || c.usos === null) return Infinity
  return Number(c.usos)
}

export function expirado(c: Pick<CodigoAcceso, 'expires_at'>, hoy: string): boolean {
  if (!c.expires_at) return false
  return c.expires_at < hoy
}

export function vigente(c: Pick<CodigoAcceso, 'activo' | 'expires_at'>, hoy: string): boolean {
  return c.activo === 'true' && !expirado(c, hoy)
}