import { useSyncExternalStore } from "react"
import type { Session } from "@supabase/supabase-js"
import { apiRpc, isSupabaseConfigured, supabase } from "@/lib/supabase"

export interface AppSession {
  userId: string
  name: string
  email: string
}

interface AuthSnapshot { session: AppSession | null; loading: boolean }
let snapshot: AuthSnapshot = { session: null, loading: true }
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }

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
    name: String(user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "NoBroke member"),
  }
}

async function enrichProfile(session: Session | null) {
  const basic = basicSession(session)
  if (!basic) { publish({ session: null }); return }
  try {
    const profile = await apiRpc<{ username: string; display_name: string }>("get_my_profile")
    if (snapshot.session?.userId === basic.userId) {
      publish({ session: { ...basic, name: profile.display_name || profile.username } })
    }
  } catch {
    // Keep the Auth display name if profile retrieval is temporarily unavailable.
  }
}

if (typeof window !== "undefined") {
  if (!isSupabaseConfigured) publish({ loading: false })
  else {
    void supabase.auth.getSession().then(({ data }) => {
      publish({ session: basicSession(data.session), loading: false })
      void enrichProfile(data.session)
    }).catch(() => publish({ session: null, loading: false }))

    supabase.auth.onAuthStateChange((_event, session) => {
      publish({ session: basicSession(session), loading: false })
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
