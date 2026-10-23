export interface SessionSnapshot {
  userId: string
  email: string
  name: string
  username: string
  nameSetupComplete: boolean
  profileLoadState: "loading" | "ready" | "error"
}

export function sessionForAuthEvent(current: SessionSnapshot | null, next: SessionSnapshot | null): SessionSnapshot | null
export function sessionAfterProfileFailure(current: SessionSnapshot | null, basic: SessionSnapshot): SessionSnapshot
export function isLatestProfileRequest(requestId: number, latestRequestId: number, currentUserId: string | null | undefined, requestedUserId: string): boolean
