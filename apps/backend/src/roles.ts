import { permsFor, MODULE_KEYS, type Perms, type PermsInfo, type Repository, type Usuario } from '@ft/shared'
import type { SessionClaims } from './auth/codigos'

export async function permsForRequest(repo: Repository, ownerEmail: string, email: string): Promise<Perms> {
  const usuarios = await repo.listUsuarios()
  const e = email.toLowerCase()
  const usuario = usuarios.find(u => u.email.toLowerCase() === e) ?? null
  return permsFor(email, ownerEmail, usuario)
}

export function permsInfo(p: Perms): PermsInfo {
  return {
    isAdmin: p.isAdmin,
    rol: p.rol,
    view: MODULE_KEYS.filter(m => p.canView(m)),
    edit: MODULE_KEYS.filter(m => p.canEdit(m))
  }
}

export function permsFromSession(claims: SessionClaims): Perms {
  const u: Usuario = {
    email: claims.sub,
    rol: claims.rol,
    modulos_ver: claims.modulos_ver,
    modulos_editar: claims.modulos_editar
  }
  return permsFor(claims.sub, claims.owner, u)
}