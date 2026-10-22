const ORIGIN = "https://nobroke.invalid"

export function safePostLoginPath(value: string | null): string {
  if (!value) return "/app"
  try {
    const destination = new URL(value, ORIGIN)
    if (destination.origin !== ORIGIN) return "/app"
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

export function inviteLoginHref(token: string): string {
  const invitePath = `/invite/${encodeURIComponent(token)}`
  return `/?auth=login&next=${encodeURIComponent(invitePath)}`
}
