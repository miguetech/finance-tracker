export interface ServiceAccountJson {
  client_email: string
  private_key: string
}

export interface Env {
  OAUTH_CLIENT_ID: string
  SERVICE_ACCOUNT_JSON: ServiceAccountJson
  /** Usado en fases posteriores (códigos de acceso). Opcional en fase 1. */
  SECRET_JWT?: string
  SPREADSHEET_ID: string
  OWNER_EMAIL: string
}

const REQUIRED = ['OAUTH_CLIENT_ID', 'SERVICE_ACCOUNT_JSON', 'SPREADSHEET_ID', 'OWNER_EMAIL'] as const

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const missing = REQUIRED.filter(k => !source[k])
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(', ')}`)
  }
  let saJson: ServiceAccountJson
  try {
    saJson = JSON.parse(source.SERVICE_ACCOUNT_JSON!)
  } catch {
    throw new Error('SERVICE_ACCOUNT_JSON no es JSON válido')
  }
  if (!saJson.client_email || !saJson.private_key) {
    throw new Error('SERVICE_ACCOUNT_JSON debe incluir client_email y private_key')
  }
  return {
    OAUTH_CLIENT_ID: source.OAUTH_CLIENT_ID!,
    SERVICE_ACCOUNT_JSON: saJson,
    SECRET_JWT: source.SECRET_JWT,
    SPREADSHEET_ID: source.SPREADSHEET_ID!,
    OWNER_EMAIL: source.OWNER_EMAIL!
  }
}