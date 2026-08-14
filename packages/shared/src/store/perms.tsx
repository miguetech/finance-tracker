import React, { createContext, useContext } from 'react'
import type { ModuleKey } from '../roles/roles'

export interface PermsCtx {
  isAdmin: boolean
  canView(m: ModuleKey): boolean
  canEdit(m: ModuleKey): boolean
}

export function adminPerms(): PermsCtx {
  return { isAdmin: true, canView: () => true, canEdit: () => true }
}

const Ctx = createContext<PermsCtx>(adminPerms())

export function PermsProvider({ perms, children }: { perms: PermsCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={perms}>{children}</Ctx.Provider>
}

export function usePerms(): PermsCtx {
  return useContext(Ctx)
}
