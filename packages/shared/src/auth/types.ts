export interface AuthProvider {
  getToken(interactive: boolean): Promise<string>
  getSignedInUser(): Promise<{ email: string } | null>
  signOut(): Promise<void>
}
