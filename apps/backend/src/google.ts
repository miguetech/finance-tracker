import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { SheetsApi } from '@ft/shared'
import type { Env } from './env'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'
const GRANT_TTL = 3600
const CACHE_MARGIN = 60
const EMAIL_CACHE_TTL_MS = 60 * 1000

export type JwksResolver = JWTVerifyGetKey

const accessTokenCache = new Map<string, { token: string; exp: number }>()
const emailCache = new Map<string, { email: string; at: number }>()

export async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const cached = accessTokenCache.get(sa.client_email)
  if (cached && now < cached.exp) return cached.token

  const privateKey = await importPKCS8(sa.private_key, 'RS256')
  const assertion = await new SignJWT({ scope: SCOPES })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + GRANT_TTL)
    .sign(privateKey)

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OAuth token: ${res.status} ${text.slice(0, 300)}`)
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error('OAuth token sin access_token')
  accessTokenCache.set(sa.client_email, {
    token: data.access_token,
    exp: now + (data.expires_in ?? GRANT_TTL) - CACHE_MARGIN
  })
  return data.access_token
}

export function createSheetsApi(env: Env): SheetsApi {
  return new SheetsApi(() => getAccessToken(env.SERVICE_ACCOUNT_JSON))
}

const GOOGLE_CERTS = new URL('https://www.googleapis.com/oauth2/v3/certs')
const GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com']

export async function verifyGoogleIdToken(
  clientId: string,
  idToken: string,
  jwks: JwksResolver = createRemoteJWKSet(GOOGLE_CERTS)
): Promise<string> {
  if (!idToken) throw new Error('Sesión requerida')
  const cached = emailCache.get(idToken)
  if (cached && Date.now() - cached.at < EMAIL_CACHE_TTL_MS) return cached.email

  const { payload } = await jwtVerify(idToken, jwks, { issuer: GOOGLE_ISS, audience: clientId })
  if (!payload.email || payload.email_verified !== true) throw new Error('Sesión inválida')
  const email = String(payload.email)
  emailCache.set(idToken, { email, at: Date.now() })
  return email
}