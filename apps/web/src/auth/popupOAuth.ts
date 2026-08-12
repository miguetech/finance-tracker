import { popupOAuth } from '@ft/shared'

const clientId = import.meta.env.VITE_OAUTH_CLIENT_ID as string
const redirectUri = import.meta.env.VITE_OAUTH_REDIRECT_URI ?? window.location.origin

export const webAuth = popupOAuth({ clientId, redirectUri, prompt: 'none' })
