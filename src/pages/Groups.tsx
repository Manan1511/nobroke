import { useState } from "react"
import { Plus, Users, MoreHorizontal, LogOut, Pencil, ArrowLeft, ArrowRight, UserMinus, Sparkles } from "lucide-react"
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
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { PageHeader, AvatarStack, UserAvatar, label } from "@/components/shared"
import { PeoplePicker, PersonHover } from "@/components/form-bits"
import { Money, Reveal, Spotlight } from "@/components/motion"
import { useStore, newId } from "@/lib/store"
import { groupBalances } from "@/lib/api"
import { cn, inr } from "@/lib/utils"
import type { Group } from "@/types"

function CreateGroupDialog() {
  const { friendships, update, me } = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [members, setMembers] = useState<string[]>([])
  const friends = friendships.filter((f) => f.status === "ACTIVE").map((f) => f.friend_id)
  const save = () => {
    update("groups", (g) => [...g, { group_id: newId("g"), group_name: name.trim(), created_by: me, members: [me, ...members] }])
    toast.success(`Group "${name.trim()}" created`)
    setName(""); setMembers([]); setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Create group</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>Add friends now or invite more later.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="gname">Group name</FieldLabel>
            <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hostel room 214" />
          </Field>
          <Field>
            <FieldLabel>Members</FieldLabel>
            <PeoplePicker options={friends} value={members} onChange={setMembers} placeholder="Add friends" />
            <FieldDescription>You're added automatically. Only accepted friends are listed.</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name.trim()} onClick={save}>Create group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RenameGroupDialog({ group, open, onOpenChange }: { group: Group | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { update } = useStore()
  const [name, setName] = useState("")
  const change = (v: boolean) => { if (v && group) setName(group.group_name); onOpenChange(v) }
  const save = () => {
    if (!group) return
    update("groups", (gs) => gs.map((g) => (g.group_id === group.group_id ? { ...g, group_name: name.trim() } : g)))
    toast.success(`Renamed to "${name.trim()}"`); onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename group</DialogTitle><DialogDescription>Everyone in the group sees the new name.</DialogDescription></DialogHeader>
        <Field><FieldLabel htmlFor="rename">Group name</FieldLabel><Input id="rename" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || name.trim() === group?.group_name} onClick={save}>Save name</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupDetail({ group, onBack, onRename }: { group: Group; onBack: () => void; onRename: () => void }) {
  const { expenses, friendships, userName, update, me } = useStore()
  const list = expenses.filter((e) => e.group_id === group.group_id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const { balances, transfers } = groupBalances(group, expenses)
  const [adding, setAdding] = useState<string[]>([])
  const [removing, setRemoving] = useState<string | null>(null)
  const addable = friendships.filter((f) => f.status === "ACTIVE" && !group.members.includes(f.friend_id)).map((f) => f.friend_id)
  const setMembers = (fn: (m: string[]) => string[]) => update("groups", (gs) => gs.map((g) => (g.group_id === group.group_id ? { ...g, members: fn(g.members) } : g)))
  const total = list.reduce((s, e) => s + e.total_amount, 0)

  return (
    <>
      <Button variant="ghost" className="w-fit" onClick={onBack}><ArrowLeft /> All groups</Button>
      <PageHeader title={group.group_name} description={`${group.members.length} members · ${inr(total)} spent together`}
        action={<Button variant="outline" onClick={onRename}><Pencil /> Rename</Button>} />
      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({list.length})</TabsTrigger>
          <TabsTrigger value="members">Members ({group.members.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Who's up, who's down</CardTitle><CardDescription>Each member's position across this group's expenses.</CardDescription></CardHeader>
            <CardContent>
              <Reveal className="grid gap-3" stagger={0.06}>
                {balances.map((b) => (
                  <div key={b.user_id} className="flex items-center gap-3">
                    <UserAvatar id={b.user_id} className="size-8" />
                    <span className="flex-1 text-sm">{b.user_id === me ? "You" : <PersonHover id={b.user_id} />}</span>
                    <span className={cn("text-sm font-medium", b.net > 0 ? "text-positive" : b.net < 0 ? "text-negative" : "text-muted-foreground")}>
                      {b.net === 0 ? "Square" : <>{b.net > 0 ? "+" : ""}<Money value={b.net} /></>}
                    </span>
                  </div>
                ))}
              </Reveal>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-brand" /> Simplified debts</CardTitle>
              <CardDescription>The fewest payments that settle everyone in this group.</CardDescription>
            </CardHeader>
            <CardContent>
              {transfers.length === 0 ? <p className="text-sm text-muted-foreground">Everyone is square here.</p> : (
                <Reveal className="grid gap-2" stagger={0.08}>
                  {transfers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-2xl border bg-background/40 p-3 text-sm">
                      <UserAvatar id={t.from} className="size-7" /><span className="truncate">{userName(t.from)}</span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      <UserAvatar id={t.to} className="size-7" /><span className="truncate">{userName(t.to)}</span>
                      <span className="ml-auto font-medium tabular-nums">{inr(t.amount)}</span>
                    </div>
                  ))}
                </Reveal>
              )}
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
                    {id === group.created_by && <Badge variant="secondary">Created the group</Badge>}
                    {id !== me && <Button variant="ghost" size="icon" aria-label={`Remove ${userName(id)}`} onClick={() => setRemoving(id)}><UserMinus /></Button>}
                  </div>
                ))}
              </Reveal>
              <Field>
                <FieldLabel>Add members</FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="flex-1"><PeoplePicker options={addable} value={adding} onChange={setAdding} placeholder={addable.length ? "Choose friends" : "All your friends are in this group"} /></div>
                  <Button disabled={!adding.length} onClick={() => { setMembers((m) => [...m, ...adding]); toast.success(`Added ${adding.map(userName).join(", ")}`); setAdding([]) }}><Plus /> Add</Button>
                </div>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing ? userName(removing) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>They stop seeing new expenses in {group.group_name}. Balances they already have stay until settled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" onClick={() => {
              if (removing) { setMembers((m) => m.filter((x) => x !== removing)); toast.success(`${userName(removing)} removed`) }
            }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function Groups() {
  const { groups, update, me } = useStore()
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
            <AlertDialogDescription>Your open balances in this group stay until they're settled. You'll stop seeing new expenses.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" onClick={() => {
              if (!leaving) return
              update("groups", (gs) => gs.map((x) => (x.group_id === leaving.group_id ? { ...x, members: x.members.filter((m) => m !== me) } : x)))
              toast.success(`Left ${leaving.group_name}`)
            }}>Leave group</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
