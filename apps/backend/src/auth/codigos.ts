import { SignJWT, jwtVerify } from 'jose'
import { vigente, usosInfinitos, usosRestantes, type Repository, type Usuario, type UserRole } from '@ft/shared'

export interface SessionClaims {
  sub: string
  rol: UserRole
  modulos_ver: string
  modulos_editar: string
  owner: string
}

export async function emitirSessionJwt(secret: string, claims: SessionClaims): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({
    rol: claims.rol,
    modulos_ver: claims.modulos_ver,
    modulos_editar: claims.modulos_editar,
    owner: claims.owner
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(key)
}

export async function verificarSessionJwt(secret: string, token: string): Promise<SessionClaims> {
  if (!token) throw new Error('Sesión requerida')
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key)
    const { sub, rol, owner, modulos_ver, modulos_editar } = payload
    if (typeof sub !== 'string' || typeof rol !== 'string' || typeof owner !== 'string') {
      throw new Error('Sesión inválida')
    }
    return {
      sub,
      rol: rol as UserRole,
      modulos_ver: typeof modulos_ver === 'string' ? modulos_ver : '',
      modulos_editar: typeof modulos_editar === 'string' ? modulos_editar : '',
      owner
    }
  } catch {
    throw new Error('Sesión inválida')
  }
}

export async function intercambiarCodigo(repo: Repository, codigo: string, secret: string, hoy: string, owner: string): Promise<{ token: string }> {
  const codigos = await repo.listCodigos()
  const c = codigos.find(x => x.codigo === codigo)
  if (!c) throw new Error('Código no existe')
  if (!vigente(c, hoy)) throw new Error('Código expirado o inactivo')
  if (usosRestantes(c) <= 0) throw new Error('Código sin usos disponibles')
  if (!usosInfinitos(c)) {
    const usos = Number(c.usos) - 1
    await repo.saveCodigo({ ...c, usos: String(usos) })
  }
  const u: Usuario = {
    email: c.codigo,
    rol: c.rol,
    modulos_ver: c.modulos_ver,
    modulos_editar: c.modulos_editar
  }
  const token = await emitirSessionJwt(secret, {
    sub: c.codigo,
    rol: u.rol,
    modulos_ver: u.modulos_ver,
    modulos_editar: u.modulos_editar,
    owner
  })
  return { token }
}