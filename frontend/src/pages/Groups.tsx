import { useEffect, useState } from "react"
import { Plus, Users, MoreHorizontal, LogOut, Pencil, ArrowLeft, UserMinus, Copy, Crown, History, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { PageHeader, AvatarStack, UserAvatar, label } from "@/components/shared"
import { PersonHover, SimpleSelect } from "@/components/form-bits"
import { Money, Reveal, Spotlight } from "@/components/motion"
import { useStore } from "@/lib/store"
import { groupBalances } from "@/lib/api"
import { apiRpc } from "@/lib/supabase"
import { canManageGroupFriendAdds, getAddableGroupFriends } from "@/lib/group-membership.mjs"
import { cn, inr } from "@/lib/utils"
import type { Group } from "@/types"

type GroupInvite = { invite_id: string; created_at: string; expires_at: string }

function CreateGroupDialog() {
  const { refresh } = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await apiRpc("create_group", { p_name: name.trim() })
      await refresh()
      toast.success(`Group "${name.trim()}" created. Invite friends from the group page.`)
      setName(""); setOpen(false)
    } catch { toast.error("Could not create this group. Check the name and try again.") }
    finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Create group</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>Create a group, then share a reusable invite link or add friends directly.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="gname">Group name</FieldLabel>
            <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hostel room 214" />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name.trim() || saving} onClick={() => void save()}>{saving ? "Creating…" : "Create group"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RenameGroupDialog({ group, open, onOpenChange }: { group: Group | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { refresh } = useStore()
  const [name, setName] = useState("")
  const change = (v: boolean) => { if (v && group) setName(group.group_name); onOpenChange(v) }
  const save = async () => {
    if (!group) return
    try {
      await apiRpc("rename_group", { p_group_id: group.group_id, p_name: name.trim() })
      await refresh()
      toast.success(`Renamed to "${name.trim()}"`); onOpenChange(false)
    } catch { toast.error("Could not rename this group.") }
  }
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename group</DialogTitle><DialogDescription>Everyone in the group sees the new name.</DialogDescription></DialogHeader>
        <Field><FieldLabel htmlFor="rename">Group name</FieldLabel><Input id="rename" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || name.trim() === group?.group_name} onClick={() => void save()}>Save name</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransferOwnershipDialog({ group, open, onOpenChange }: { group: Group; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { me, userName, refresh } = useStore()
  const candidates = group.members.filter((id) => id !== me)
  const [newOwner, setNewOwner] = useState(candidates[0] ?? "")
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setNewOwner(candidates[0] ?? "") }, [open, group.group_id])
  const transfer = async () => {
    setSaving(true)
    try {
      await apiRpc("transfer_group_ownership", { p_group_id: group.group_id, p_new_owner_id: newOwner })
      await refresh(); toast.success(`${userName(newOwner)} now owns this group`); onOpenChange(false)
    } catch { toast.error("Only the current owner can transfer ownership to an active member.") }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent><DialogHeader><DialogTitle>Transfer group ownership</DialogTitle><DialogDescription>The new owner can manage members and invites. You remain a member.</DialogDescription></DialogHeader>
      <Field><FieldLabel htmlFor="new-owner">New owner</FieldLabel><SimpleSelect id="new-owner" value={newOwner} onValueChange={setNewOwner} options={candidates.map((id) => ({ value: id, label: userName(id) }))} /></Field>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!newOwner || saving} onClick={() => void transfer()}>{saving ? "Transferring…" : "Transfer ownership"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function GroupDetail({ group, onBack, onRename }: { group: Group; onBack: () => void; onRename: () => void }) {
  const { expenses, userName, refresh, me, friendships } = useStore()
  const list = expenses.filter((e) => e.group_id === group.group_id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const [balances, setBalances] = useState<Array<{ user_id: string; net_amount: string }>>([])
  const [balancesLoading, setBalancesLoading] = useState(true)
  const [inviteLink, setInviteLink] = useState("")
  const [inviteId, setInviteId] = useState("")
  const [activeInvites, setActiveInvites] = useState<GroupInvite[]>([])
  const [invitesLoading, setInvitesLoading] = useState(false)
  const [invitesFailed, setInvitesFailed] = useState(false)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [friendToAdd, setFriendToAdd] = useState("")
  const [addingFriend, setAddingFriend] = useState(false)
  const [savingMemberInvites, setSavingMemberInvites] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [membershipHistory, setMembershipHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const isOwner = group.owner_id === me
  const canAddFriends = canManageGroupFriendAdds(group, me)
  const addableFriends = getAddableGroupFriends(friendships, group.members)

  useEffect(() => {
    let active = true
    setBalancesLoading(true)
    groupBalances(group.group_id).then((rows) => {
      if (active) setBalances(rows.map((row) => ({ user_id: row.user_id, net_amount: row.net_amount })))
    }).catch(() => { if (active) setBalances([]) }).finally(() => { if (active) setBalancesLoading(false) })
    return () => { active = false }
  }, [group.group_id])

  useEffect(() => {
    let active = true
    setHistoryLoading(true)
    apiRpc<any[]>("list_group_membership_history", { p_group_id: group.group_id, p_after_id: null, p_limit: 100 })
      .then((rows) => { if (active) setMembershipHistory(rows) })
      .catch(() => { if (active) setMembershipHistory([]) })
      .finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [group.group_id])

  useEffect(() => {
    if (!isOwner) {
      setActiveInvites([])
      setInvitesFailed(false)
      return
    }
    let active = true
    setInvitesLoading(true)
    setInvitesFailed(false)
    apiRpc<GroupInvite[]>("list_group_invites", { p_group_id: group.group_id })
      .then((rows) => { if (active) setActiveInvites(rows) })
      .catch(() => { if (active) setInvitesFailed(true) })
      .finally(() => { if (active) setInvitesLoading(false) })
    return () => { active = false }
  }, [group.group_id, isOwner])

  const createInvite = async () => {
    setInviting(true)
    try {
      const invite = await apiRpc<{ invite_id: string; token: string }>("create_group_invite", { p_group_id: group.group_id })
      const link = `${window.location.origin}/invite/${invite.token}`
      setInviteId(invite.invite_id)
      setInviteLink(link)
      await navigator.clipboard?.writeText(link)
      toast.success("Invite link copied. Share it with as many people as needed for the next seven days.")
      void apiRpc<GroupInvite[]>("list_group_invites", { p_group_id: group.group_id })
        .then(setActiveInvites)
        .catch(() => setInvitesFailed(true))
    } catch { toast.error("Could not create an invite. Group owners can create invite links.") }
    finally { setInviting(false) }
  }

  const revokeInvite = async (targetInviteId: string) => {
    setRevokingInviteId(targetInviteId)
    try {
      await apiRpc("revoke_group_invite", { p_invite_id: targetInviteId })
      setActiveInvites((invites) => invites.filter((invite) => invite.invite_id !== targetInviteId))
      if (targetInviteId === inviteId) { setInviteId(""); setInviteLink("") }
      toast.success("Invite revoked")
    } catch { toast.error("Could not revoke this invite.") }
    finally { setRevokingInviteId(null) }
  }

  const addFriend = async () => {
    if (!friendToAdd) return
    setAddingFriend(true)
    try {
      const result = await apiRpc<{ added: boolean }>("add_group_friend", {
        p_group_id: group.group_id, p_friend_id: friendToAdd,
      })
      await refresh()
      toast.success(result.added ? `${userName(friendToAdd)} added to ${group.group_name}` : `${userName(friendToAdd)} is already in this group`)
      setFriendToAdd("")
    } catch {
      toast.error("Could not add this friend. Confirm you are active friends and member invites are enabled if needed.")
    } finally { setAddingFriend(false) }
  }

  const setMemberInvitePermission = async (enabled: boolean) => {
    setSavingMemberInvites(true)
    try {
      await apiRpc("set_group_member_invites", { p_group_id: group.group_id, p_enabled: enabled })
      await refresh()
      toast.success(enabled ? "Members can now add their friends" : "Only you can add friends to this group")
    } catch { toast.error("Only the group owner can change this setting.") }
    finally { setSavingMemberInvites(false) }
  }

  const removeMember = async () => {
    if (!removing) return
    try {
      await apiRpc("remove_group_member", { p_group_id: group.group_id, p_user_id: removing })
      await refresh()
      toast.success(`${userName(removing)} removed`)
    } catch { toast.error("Member cannot leave while group balances or recurring bills remain.") }
    finally { setRemoving(null) }
  }

  return (
    <>
      <Button variant="ghost" className="w-fit" onClick={onBack}><ArrowLeft /> All groups</Button>
      <PageHeader title={group.group_name} description={`${group.members.length} members · balances from posted expenses`}
        action={<div className="flex gap-2"><Button variant="outline" onClick={onRename}><Pencil /> Rename</Button>
                  {isOwner && group.members.length > 1 && <Button variant="outline" onClick={() => setTransferring(true)}><Crown /> Transfer owner</Button>}</div>} />
      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({list.length})</TabsTrigger>
          <TabsTrigger value="members">Members ({group.members.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="balances">
          <Card>
            <CardHeader><CardTitle>Who's up, who's down</CardTitle><CardDescription>Balances calculated by NoBroke from this group's obligation ledger.</CardDescription></CardHeader>
            <CardContent>
              {balancesLoading ? <p className="text-sm text-muted-foreground" aria-busy="true">Loading balances…</p> : <Reveal className="grid gap-3" stagger={0.06}>
                {balances.map((balance) => {
                  const net = Number(balance.net_amount)
                  return (
                  <div key={balance.user_id} className="flex items-center gap-3">
                    <UserAvatar id={balance.user_id} className="size-8" />
                    <span className="flex-1 text-sm">{balance.user_id === me ? "You" : <PersonHover id={balance.user_id} />}</span>
                    <span className={cn("text-sm font-medium", net > 0 ? "text-positive" : net < 0 ? "text-negative" : "text-muted-foreground")}>
                      {net === 0 ? "Square" : <>{net > 0 ? "+" : ""}<Money value={net} /></>}
                    </span>
                  </div>
                )})}
              </Reveal>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card><CardContent>
            {list.length === 0 ? <p className="text-sm text-muted-foreground">No expenses in this group yet.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Expense</TableHead><TableHead>Paid by</TableHead><TableHead>Split</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>{list.map((e) => (
                  <TableRow key={e.expense_id}>
                    <TableCell className="text-muted-foreground">{e.created_at}</TableCell><TableCell>{e.title}</TableCell>
                    <TableCell><PersonHover id={e.paid_by} /></TableCell><TableCell>{label(e.split_mode)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(e.total_amount)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardContent className="grid gap-4">
              <Reveal className="grid gap-3" stagger={0.05}>
                {group.members.map((id) => (
                  <div key={id} className="flex items-center gap-3">
                    <UserAvatar id={id} /><span className="flex-1 text-sm">{id === me ? "You" : <PersonHover id={id} />}</span>
                    {id === group.owner_id && <Badge variant="secondary">Owner</Badge>}
                    {id !== me && group.owner_id === me && <Button variant="ghost" size="icon" aria-label={`Remove ${userName(id)}`} onClick={() => setRemoving(id)}><UserMinus /></Button>}
                  </div>
                ))}
              </Reveal>
              {isOwner && <section className="flex items-center justify-between gap-4 border-t pt-4">
                <div className="grid gap-1">
                  <FieldLabel htmlFor={`member-invites-${group.group_id}`}>Let members add their friends</FieldLabel>
                  <p className="text-xs text-muted-foreground">Members can add only their active friends. You can always add your own friends.</p>
                </div>
                <Switch id={`member-invites-${group.group_id}`} checked={group.members_can_invite_friends}
                  disabled={savingMemberInvites} onCheckedChange={(enabled) => void setMemberInvitePermission(enabled)}
                  aria-label="Allow group members to add their friends" />
              </section>}
              {!isOwner && <p className="border-t pt-4 text-sm text-muted-foreground">
                {group.members_can_invite_friends ? "Members can add their active friends." : "Only the owner can add friends to this group."}
              </p>}
              {canAddFriends && <section className="grid gap-3 border-t pt-4">
                <div className="grid gap-1"><FieldLabel htmlFor={`add-friend-${group.group_id}`}>Add a friend</FieldLabel>
                  <p className="text-xs text-muted-foreground">Choose someone you are already friends with in NoBroke.</p></div>
                {addableFriends.length > 0 ? <div className="flex flex-col gap-2 sm:flex-row">
                  <SimpleSelect id={`add-friend-${group.group_id}`} value={friendToAdd} onValueChange={setFriendToAdd}
                    options={addableFriends.map((friendship) => ({ value: friendship.friend_id, label: userName(friendship.friend_id) }))}
                    placeholder="Choose a friend" />
                  <Button className="shrink-0" disabled={!friendToAdd || addingFriend} onClick={() => void addFriend()}>
                    <UserPlus /> {addingFriend ? "Adding…" : "Add friend"}
                  </Button>
                </div> : <p className="text-sm text-muted-foreground">No active friends are available outside this group.</p>}
              </section>}
              {isOwner && <div className="grid gap-2 border-t pt-4">
                <FieldLabel>Share a group invite link</FieldLabel>
                <Button className="w-fit" variant="outline" disabled={inviting} onClick={() => void createInvite()}>
                  <Copy /> {inviting ? "Creating link…" : "Create reusable invite link"}
                </Button>
                {inviteLink && <Input readOnly value={inviteLink} aria-label="Group invite link" onFocus={(event) => event.currentTarget.select()} />}
                <p className="text-xs text-muted-foreground">Anyone with this link can join for seven days. You can revoke it at any time. They must sign in first.</p>
                <div className="grid gap-2">
                  <FieldLabel>Active invite links</FieldLabel>
                  {invitesLoading && <p className="text-sm text-muted-foreground" aria-busy="true">Loading invite links…</p>}
                  {invitesFailed && <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>Could not load active links.</span>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setInvitesLoading(true); setInvitesFailed(false)
                      void apiRpc<GroupInvite[]>("list_group_invites", { p_group_id: group.group_id })
                        .then(setActiveInvites).catch(() => setInvitesFailed(true))
                        .finally(() => setInvitesLoading(false))
                    }}>Retry</Button>
                  </div>}
                  {!invitesLoading && !invitesFailed && activeInvites.length === 0 &&
                    <p className="text-sm text-muted-foreground">No active invite links.</p>}
                  {activeInvites.map((invite) => <div key={invite.invite_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <span className="text-sm text-muted-foreground">Expires {new Date(invite.expires_at).toLocaleString()}</span>
                    <Button variant="ghost" size="sm" disabled={revokingInviteId === invite.invite_id}
                      onClick={() => void revokeInvite(invite.invite_id)}>
                      {revokingInviteId === invite.invite_id ? "Revoking…" : "Revoke"}
                    </Button>
                  </div>)}
                </div>
              </div>}
              <section className="grid gap-3 border-t pt-4">
                <h3 className="flex items-center gap-2 text-sm font-medium"><History className="size-4" /> Membership history</h3>
                {historyLoading && <p className="text-sm text-muted-foreground">Loading membership history…</p>}
                {!historyLoading && membershipHistory.map((membership) => <div key={membership.membership_id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex-1">{membership.display_name} · joined {new Date(membership.joined_at).toLocaleDateString()}</span>
                  {membership.removed_at ? <Badge variant="outline">Left {new Date(membership.removed_at).toLocaleDateString()}</Badge> : <Badge variant="secondary">Active</Badge>}
                  {membership.role === "OWNER" && <Badge variant="secondary">Owner</Badge>}
                </div>)}
              </section>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TransferOwnershipDialog group={group} open={transferring} onOpenChange={setTransferring} />

      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing ? userName(removing) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>Open debts, receivables, or active recurring billing roles must be cleared first. Their financial history stays in {group.group_name}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" onClick={() => void removeMember()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function Groups() {
  const { groups, refresh, me } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<Group | null>(null)
  const [renaming, setRenaming] = useState<Group | null>(null)
  const mine = groups.filter((g) => g.members.includes(me))
  const open = mine.find((g) => g.group_id === openId)

  return (
    <>
      {open ? <GroupDetail group={open} onBack={() => setOpenId(null)} onRename={() => setRenaming(open)} /> : <>
        <PageHeader title="Groups" description="Flats, trips, lunches: every shared tab in one place." action={<CreateGroupDialog />} />
        {mine.length === 0 ? (
          <Empty>
            <EmptyHeader><EmptyMedia><Users /></EmptyMedia><EmptyTitle>No groups yet</EmptyTitle><EmptyDescription>Create a group to start splitting expenses with friends.</EmptyDescription></EmptyHeader>
            <EmptyContent><CreateGroupDialog /></EmptyContent>
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((g) => (
              <Spotlight key={g.group_id}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>{g.group_name}</CardTitle>
                    <CardDescription>{g.members.length} members</CardDescription>
                    <CardAction>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Group options"><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setRenaming(g)}><Pencil /> Rename</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => setLeaving(g)}><LogOut /> Leave group</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardAction>
                  </CardHeader>
                  <CardContent><AvatarStack ids={g.members} /></CardContent>
                  <CardFooter className="mt-auto"><Button variant="outline" className="w-full" onClick={() => setOpenId(g.group_id)}>Open group</Button></CardFooter>
                </Card>
              </Spotlight>
            ))}
          </div>
        )}
      </>}

      <RenameGroupDialog group={renaming} open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)} />
      <AlertDialog open={!!leaving} onOpenChange={(v) => !v && setLeaving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {leaving?.group_name}?</AlertDialogTitle>
            <AlertDialogDescription>Transfer ownership and clear your open debts, receivables, and active recurring billing roles before leaving. Your financial history stays in this group.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" onClick={() => {
              if (!leaving) return
              void apiRpc("leave_group", { p_group_id: leaving.group_id }).then(async () => {
                await refresh(); toast.success(`Left ${leaving.group_name}`)
              }).catch(() => toast.error("Transfer group ownership and clear your open balances before leaving."))
            }}>Leave group</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
