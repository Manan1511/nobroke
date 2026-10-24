const SAFE_PATH_ORIGIN = "https://nobroke.invalid"
export const PUBLIC_SITE_URL = "https://nobroke.netlify.app"

export function safePostLoginPath(value: string | null): string {
  if (!value) return "/app"
  try {
    const destination = new URL(value, SAFE_PATH_ORIGIN)
    if (destination.origin !== SAFE_PATH_ORIGIN) return "/app"
    const allowed = destination.pathname === "/app"
      || destination.pathname.startsWith("/app/")
      || (destination.pathname.startsWith("/invite/") && destination.pathname.length > "/invite/".length)
    return allowed ? `${destination.pathname}${destination.search}${destination.hash}` : "/app"
  } catch {
    return "/app"
  }
}

export function authCallbackPath(next: string | null): string {
  return `/auth/callback?next=${encodeURIComponent(safePostLoginPath(next))}`
}

export function authCallbackUrl(next: string | null): string {
  return new URL(authCallbackPath(next), `${PUBLIC_SITE_URL}/`).toString()
}

export function authResetUrl(): string {
  return new URL("/auth/reset", `${PUBLIC_SITE_URL}/`).toString()
}

export function inviteLoginHref(token: string): string {
  const invitePath = `/invite/${encodeURIComponent(token)}`
  return `/?auth=login&next=${encodeURIComponent(invitePath)}`
}
