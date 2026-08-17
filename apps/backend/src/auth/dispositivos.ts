import { randomAlfa, hoyISO, type Dispositivo } from '@ft/shared'

export function generarTokenDispositivo(): string {
  return `dev_${randomAlfa(16)}`
}

export function nuevoDispositivo(codigo: string, ipInfo: string, dispositivo?: string): Dispositivo {
  return { codigo, dispositivo: dispositivo ?? generarTokenDispositivo(), ip_info: ipInfo, registrado_en: hoyISO() }
}