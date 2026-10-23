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
  const [saving, setSaving] = useState(false)

  useEffect(() => setDisplayName(""), [session?.userId])

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
    if (!session || !session.username || !displayName.trim()) return

    setSaving(true)
    try {
      await apiRpc("update_my_profile", {
        p_username: session.username,
        p_display_name: displayName.trim(),
      })
      clearDismissedPrompt(session.userId)
      await reloadProfile()
      setOpen(false)
      toast.success(`Nice to meet you, ${displayName.trim()}.`)
    } catch {
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
            This is the name shown in your greetings and to people in your groups. You can change it anytime in Profile &amp; privacy.
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={skipForNow} disabled={saving}>
              Maybe later
            </Button>
            <Button type="submit" disabled={saving || !displayName.trim() || !session?.username}>
              {saving ? "Saving…" : "Save and continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
