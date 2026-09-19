import { describe, expect, it, beforeAll } from 'vitest'
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, type CryptoKey } from 'jose'
import { verifyGoogleIdToken, type JwksResolver } from '../src/google'

const CLIENT_ID = 'client-123'

describe('verifyGoogleIdToken', () => {
  let privateKey: CryptoKey
  let jwks: JwksResolver

  beforeAll(async () => {
    const { publicKey, privateKey: priv } = await generateKeyPair('RS256')
    privateKey = priv
    const jwk = await exportJWK(publicKey)
    jwks = createLocalJWKSet({ keys: [jwk] })
  })

  async function sign(payload: Record<string, unknown>, opts: { iss?: string; aud?: string } = {}) {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setJti(crypto.randomUUID())
      .setIssuer(opts.iss ?? 'accounts.google.com')
      .setAudience(opts.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey)
  }

  it('token válido devuelve el email', async () => {
    const token = await sign({ email: 'user@ft.com', email_verified: true })
    const email = await verifyGoogleIdToken(CLIENT_ID, token, jwks)
    expect(email).toBe('user@ft.com')
  })

  it('aud incorrecto → rechaza', async () => {
    const token = await sign({ email: 'user@ft.com', email_verified: true }, { aud: 'otro-client' })
    await expect(verifyGoogleIdToken(CLIENT_ID, token, jwks)).rejects.toThrow()
  })

  it('email_verified false → rechaza', async () => {
    const token = await sign({ email: 'user@ft.com', email_verified: false })
    await expect(verifyGoogleIdToken(CLIENT_ID, token, jwks)).rejects.toThrow('Sesión inválida')
  })

  it('iss no Google → rechaza', async () => {
    const token = await sign({ email: 'user@ft.com', email_verified: true }, { iss: 'https://evil.com' })
    await expect(verifyGoogleIdToken(CLIENT_ID, token, jwks)).rejects.toThrow()
  })

  it('token sin email → rechaza', async () => {
    const token = await sign({ email_verified: true })
    await expect(verifyGoogleIdToken(CLIENT_ID, token, jwks)).rejects.toThrow('Sesión inválida')
  })
})