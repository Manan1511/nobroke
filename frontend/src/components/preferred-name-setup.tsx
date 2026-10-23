import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { reloadProfile, useSession } from "@/lib/session"
import { apiRpc } from "@/lib/supabase"
import { getUsernameSetupValue, isValidUsername, normalizeUsername } from "@/lib/profile-setup.mjs"

function dismissedKey(userId: string) {
  return `nobroke-name-prompt-dismissed:${userId}`
}

function hasDismissedPrompt(userId: string) {
  try {
    return localStorage.getItem(dismissedKey(userId)) === "true"
  } catch {
    return false
  }
}

function dismissPrompt(userId: string) {
  try {
    localStorage.setItem(dismissedKey(userId), "true")
  } catch {
    // The prompt still closes when browser storage is unavailable.
  }
}

function clearDismissedPrompt(userId: string) {
  try {
    localStorage.removeItem(dismissedKey(userId))
  } catch {
    // The saved profile remains authoritative when browser storage is unavailable.
  }
}

export function PreferredNameSetup() {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [usernameCheck, setUsernameCheck] = useState<"idle" | "invalid" | "checking" | "available" | "taken" | "error">("idle")
  const [checkedUsername, setCheckedUsername] = useState("")
  const [saving, setSaving] = useState(false)
  const normalizedUsername = normalizeUsername(username)
  const usernameValid = isValidUsername(normalizedUsername)

  useEffect(() => {
    setDisplayName("")
    setUsername(getUsernameSetupValue(session?.username))
  }, [session?.userId, session?.username])

  useEffect(() => {
    if (!open || !session || !username.trim()) {
      setUsernameCheck("idle")
      setCheckedUsername("")
      return
    }
    if (!usernameValid) {
      setUsernameCheck("invalid")
      setCheckedUsername("")
      return
    }

    let cancelled = false
    setUsernameCheck("checking")
    setCheckedUsername("")
    const timeout = window.setTimeout(() => {
      void apiRpc<boolean>("check_username_availability", {
        p_username: normalizedUsername,
      }).then((available) => {
        if (!cancelled) {
          setCheckedUsername(normalizedUsername)
          setUsernameCheck(available ? "available" : "taken")
        }
      }).catch(() => {
        if (!cancelled) {
          setCheckedUsername(normalizedUsername)
          setUsernameCheck("error")
        }
      })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [open, session?.userId, normalizedUsername, username, usernameValid])

  useEffect(() => {
    if (!session || session.profileLoadState !== "ready" || session.nameSetupComplete) {
      setOpen(false)
      return
    }
    setOpen(!hasDismissedPrompt(session.userId))
  }, [session?.userId, session?.profileLoadState, session?.nameSetupComplete])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && session) dismissPrompt(session.userId)
    setOpen(nextOpen)
  }

  const savePreferredName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session || !displayName.trim() || !usernameValid || usernameCheck !== "available" || checkedUsername !== normalizedUsername) return

    setSaving(true)
    try {
      await apiRpc("update_my_profile", {
        p_username: normalizedUsername,
        p_display_name: displayName.trim(),
      })
      clearDismissedPrompt(session.userId)
      await reloadProfile()
      setOpen(false)
      toast.success(`Nice to meet you, ${displayName.trim()}.`)
    } catch (error) {
      if (error instanceof Error && error.message === "username_unavailable") {
        setCheckedUsername(normalizedUsername)
        setUsernameCheck("taken")
        toast.error("That username was just taken. Choose another one.")
        return
      }
      toast.error("We couldn't save your name. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  const skipForNow = () => {
    if (session) dismissPrompt(session.userId)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What would you like us to call you?</DialogTitle>
          <DialogDescription>
            Choose a display name and a username friends can use to find you. You can change both later in Profile &amp; privacy.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={(event) => void savePreferredName(event)}>
          <div className="grid gap-2">
            <Label htmlFor="preferred-name">Your name</Label>
            <Input
              id="preferred-name"
              autoFocus
              autoComplete="nickname"
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              placeholder="For example, Ananya"
              disabled={saving}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="preferred-username">Username</Label>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
              <Input
                id="preferred-username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={40}
                value={username}
                onChange={(event) => setUsername(event.currentTarget.value)}
                placeholder="ananya.rao"
                aria-describedby="preferred-username-help preferred-username-status"
                aria-invalid={username.trim().length > 0 && !usernameValid}
                className="pl-7"
                disabled={saving}
              />
            </div>
            <p id="preferred-username-help" className="text-xs text-muted-foreground">
              Use 2 to 40 letters, numbers, dots, underscores or hyphens. Friends can search for this exact username.
            </p>
            <p
              id="preferred-username-status"
              aria-live="polite"
              className={`min-h-4 text-xs ${usernameCheck === "available" ? "text-positive" : usernameCheck === "taken" || usernameCheck === "invalid" ? "text-destructive" : "text-muted-foreground"}`}
            >
              {usernameCheck === "idle" && "Choose a username to check availability."}
              {usernameCheck === "invalid" && "Start with a letter or number and use only the characters listed above."}
              {usernameCheck === "checking" && "Checking availability…"}
              {usernameCheck === "available" && checkedUsername === normalizedUsername && "Username is available."}
              {usernameCheck === "taken" && checkedUsername === normalizedUsername && "That username is taken. Try another."}
              {usernameCheck === "error" && checkedUsername === normalizedUsername && "Could not check availability. Try again."}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={skipForNow} disabled={saving}>
              Maybe later
            </Button>
            <Button type="submit" disabled={saving || !displayName.trim() || !usernameValid || usernameCheck !== "available" || checkedUsername !== normalizedUsername}>
              {saving ? "Saving…" : "Save and continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
