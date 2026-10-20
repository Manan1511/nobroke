// Demo sign-in state, kept in this browser's localStorage until the backend has real accounts.
// Nothing secret is stored: only the name and email typed into the form, never the password.
// A first-time visitor counts as already signed in (as the demo user), so the landing page shows "Enter".
import { useSyncExternalStore } from "react"

const KEY = "nobroke-session"
const SIGNED_OUT = "signed-out"
export const DEMO_USER = { name: "You", email: "you@example.com" }

let memory // used when the browser blocks storage
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return memory === undefined ? JSON.stringify(DEMO_USER) : memory
    return raw
  } catch {
    return memory === undefined ? JSON.stringify(DEMO_USER) : memory
  }
}
function write(value) {
  memory = value
  try { localStorage.setItem(KEY, value) } catch { /* storage blocked: kept in memory for this visit */ }
  notify()
}

// The raw string is the snapshot, so React only re-renders when it really changes.
const snapshot = () => read()
const subscribe = (fn) => {
  listeners.add(fn)
  const onStorage = (e) => { if (e.key === KEY) fn() }
  window.addEventListener("storage", onStorage)
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage) }
}

const parse = (raw) => {
  if (raw === SIGNED_OUT) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function getSession() { return parse(read()) }
export function useSession() { return parse(useSyncExternalStore(subscribe, snapshot)) }
export function signIn({ name, email }) { write(JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() })) }
export function signOut() { write(SIGNED_OUT) }
