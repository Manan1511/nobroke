import { useSyncExternalStore } from "react"
import type { Session } from "@supabase/supabase-js"
import type { MyProfile } from "@backend/api-contract"
import { getProfileNameState } from "@/lib/profile-setup.mjs"
import { isLatestProfileRequest, sessionAfterProfileFailure, sessionForAuthEvent } from "@/lib/session-state.mjs"
import { apiRpc, isSupabaseConfigured, supabase } from "@/lib/supabase"

export type ProfileLoadState = "loading" | "ready" | "error"

export interface AppSession {
  userId: string
  name: string
  email: string
  username: string
  nameSetupComplete: boolean
  profileLoadState: ProfileLoadState
}

interface AuthSnapshot { session: AppSession | null; loading: boolean }
let snapshot: AuthSnapshot = { session: null, loading: true }
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }
let profileRequestVersion = 0
let authEventVersion = 0

function publish(next: Partial<AuthSnapshot>) {
  snapshot = { ...snapshot, ...next }
  notify()
}

function basicSession(session: Session | null): AppSession | null {
  if (!session?.user) return null
  const user = session.user
  return {
    userId: user.id,
    email: user.email ?? "",
    name: "You",
    username: "",
    nameSetupComplete: false,
    profileLoadState: "loading",
  }
}

async function enrichProfile(session: Session | null) {
  const requestVersion = ++profileRequestVersion
  const basic = basicSession(session)
  if (!basic) {
    if (requestVersion === profileRequestVersion) publish({ session: null })
    return
  }
  try {
    const profile = await apiRpc<MyProfile>("get_my_profile")
    if (!profile) throw new Error("profile_not_found")
    const profileName = getProfileNameState(profile)
    if (isLatestProfileRequest(requestVersion, profileRequestVersion, snapshot.session?.userId, basic.userId)) {
      const current = snapshot.session?.userId === basic.userId ? snapshot.session : basic
      publish({ session: {
        ...current,
        email: basic.email,
        name: profileName.displayName,
        username: profile.username,
        nameSetupComplete: profileName.setupComplete,
        profileLoadState: "ready",
      } })
    }
  } catch {
    if (isLatestProfileRequest(requestVersion, profileRequestVersion, snapshot.session?.userId, basic.userId)) {
      publish({ session: sessionAfterProfileFailure(snapshot.session, basic) })
    }
  }
}

if (typeof window !== "undefined") {
  if (!isSupabaseConfigured) publish({ loading: false })
  else {
    const initialAuthVersion = authEventVersion
    void supabase.auth.getSession().then(({ data }) => {
      if (authEventVersion !== initialAuthVersion) return
      publish({ session: basicSession(data.session), loading: false })
      void enrichProfile(data.session)
    }).catch(() => {
      if (authEventVersion === initialAuthVersion) publish({ session: null, loading: false })
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      authEventVersion += 1
      const next = basicSession(session)
      publish({ session: sessionForAuthEvent(snapshot.session, next), loading: false })
      // Avoid making Supabase requests inside the auth event callback.
      window.setTimeout(() => { void enrichProfile(session) }, 0)
    })
  }
}

export function useSession() {
  return useSyncExternalStore(subscribe, () => snapshot.session, () => null)
}

export function useAuthLoading() {
  return useSyncExternalStore(subscribe, () => snapshot.loading, () => true)
}

export async function reloadProfile() {
  const { data } = await supabase.auth.getSession()
  await enrichProfile(data.session)
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error("sign_out_failed")
}
