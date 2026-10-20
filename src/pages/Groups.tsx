import { useState } from "react"
import { Plus, Users, MoreHorizontal, LogOut, Pencil, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { PageHeader, AvatarStack, UserAvatar, label } from "@/components/shared"
import { PeoplePicker, PersonHover } from "@/components/form-bits"
import { useStore, newId } from "@/lib/store"
import { inr } from "@/lib/utils"
import type { Group } from "@/types"

function CreateGroupDialog() {
  const { users, friendships, update, me } = useStore()
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

function GroupDetail({ group, onBack }: { group: Group; onBack: () => void }) {
  const { expenses, userName } = useStore()
  const list = expenses.filter((e) => e.group_id === group.group_id)
  return (
    <>
      <Button variant="ghost" className="w-fit" onClick={onBack}><ArrowLeft /> All groups</Button>
      <PageHeader title={group.group_name} description={`${group.members.length} members`} />
      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses">
          <Card><CardContent>
            {list.length === 0 ? <p className="text-sm text-muted-foreground">No expenses in this group yet.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Expense</TableHead><TableHead>Paid by</TableHead><TableHead>Split</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>{list.map((e) => (
                  <TableRow key={e.expense_id}><TableCell>{e.title}</TableCell><TableCell>{userName(e.paid_by)}</TableCell><TableCell>{label(e.split_mode)}</TableCell><TableCell className="text-right tabular-nums">{inr(e.total_amount)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="members">
          <Card><CardContent className="grid gap-3">
            {group.members.map((id) => <div key={id} className="flex items-center gap-3"><UserAvatar id={id} /><PersonHover id={id} /></div>)}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </>
  )
}

export default function Groups() {
  const { groups, update } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<Group | null>(null)
  const open = groups.find((g) => g.group_id === openId)
  if (open) return <GroupDetail group={open} onBack={() => setOpenId(null)} />

  return (
    <>
      <PageHeader title="Groups" description="Flats, trips, lunches: every shared tab in one place." action={<CreateGroupDialog />} />
      {groups.length === 0 ? (
        <Empty>
          <EmptyHeader><EmptyMedia><Users /></EmptyMedia><EmptyTitle>No groups yet</EmptyTitle><EmptyDescription>Create a group to start splitting expenses with friends.</EmptyDescription></EmptyHeader>
          <EmptyContent><CreateGroupDialog /></EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.group_id}>
              <CardHeader>
                <CardTitle>{g.group_name}</CardTitle>
                <CardDescription>{g.members.length} members</CardDescription>
                <CardAction>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Group options"><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => toast("Rename coming soon")}><Pencil /> Rename</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setLeaving(g)}><LogOut /> Leave group</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              </CardHeader>
              <CardContent><AvatarStack ids={g.members} /></CardContent>
              <CardFooter><Button variant="outline" className="w-full" onClick={() => setOpenId(g.group_id)}>Open group</Button></CardFooter>
            </Card>
          ))}
        </div>
      )}
      <AlertDialog open={!!leaving} onOpenChange={(v) => !v && setLeaving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {leaving?.group_name}?</AlertDialogTitle>
            <AlertDialogDescription>Your open balances in this group stay until they're settled. You'll stop seeing new expenses.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" onClick={() => {
              update("groups", (gs) => gs.filter((x) => x.group_id !== leaving?.group_id)); toast.success(`Left ${leaving?.group_name}`)
            }}>Leave group</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
