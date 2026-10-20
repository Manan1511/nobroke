import { useEffect, useState } from "react"
import { Plus, ShieldCheck, TriangleAlert, Trash2, Search } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { PageHeader, label } from "@/components/shared"
import { useStore, newId } from "@/lib/store"
import { previewIncomeSplit } from "@/lib/api"
import { inr } from "@/lib/utils"

function AddExpenseDialog() {
  const { groups, userName, update, me } = useStore()
  const [open, setOpen] = useState(false)
  const [groupId, setGroupId] = useState(groups[0]?.group_id ?? "")
  const [title, setTitle] = useState("")
  const [amount, setAmount] = useState("")
  const [paidBy, setPaidBy] = useState(me)
  const [mode, setMode] = useState("EQUAL")
  const [people, setPeople] = useState([])
  const [exact, setExact] = useState({})
  const [note, setNote] = useState("")
  const [incomeCheck, setIncomeCheck] = useState(null)
  const [checking, setChecking] = useState(false)

  const group = groups.find((g) => g.group_id === groupId)
  useEffect(() => { setPeople(group?.members ?? []); setExact({}) }, [groupId])

  useEffect(() => {
    if (mode !== "INCOME_RATIO") return setIncomeCheck(null)
    setChecking(true)
    previewIncomeSplit(people).then((r) => { setIncomeCheck(r); setChecking(false) })
  }, [mode, people.join()])

  // Form validation only (not money logic): exact amounts must add up to the total.
  const exactSum = people.reduce((s, id) => s + (Number(exact[id]) || 0), 0)
  const exactMismatch = mode === "EXACT" && Number(amount) > 0 && Math.abs(exactSum - Number(amount)) > 0.001
  const incomeBlocked = mode === "INCOME_RATIO" && (checking || !incomeCheck?.ok)
  const canSave = title.trim() && Number(amount) > 0 && people.length > 0 && !exactMismatch && !incomeBlocked

  const save = () => {
    update("expenses", (e) => [{ expense_id: newId("e"), group_id: groupId, paid_by: paidBy, title: title.trim(), total_amount: Number(amount), split_mode: mode, created_at: new Date().toISOString().slice(0, 10) }, ...e])
    toast.success("Expense added", { description: `${title.trim()} · ${inr(amount)}` })
    setTitle(""); setAmount(""); setMode("EQUAL"); setNote(""); setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Add expense</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>Who paid, how much, and how to split it.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="grp">Group</Label>
            <NativeSelect id="grp" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => <NativeSelectOption key={g.group_id} value={g.group_id}>{g.group_name}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="paid">Paid by</Label>
            <NativeSelect id="paid" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {group?.members.map((id) => <NativeSelectOption key={id} value={id}>{userName(id)}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="title">What was it for?</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner, cab, groceries…" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amt">Amount (₹)</Label>
            <Input id="amt" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="grid gap-3">
          <Label>Split</Label>
          <RadioGroup value={mode} onValueChange={setMode} className="sm:grid-cols-3">
            {["EQUAL", "EXACT", "INCOME_RATIO"].map((m) => (
              <Label key={m} className="rounded-md border p-3 font-normal"><RadioGroupItem value={m} /> {label(m)}</Label>
            ))}
          </RadioGroup>
        </div>

        <div className="grid gap-3">
          <Label>Split between</Label>
          {group?.members.map((id) => (
            <div key={id} className="flex items-center gap-3">
              <Label className="flex-1 font-normal">
                <Checkbox checked={people.includes(id)} onCheckedChange={(v) => setPeople((p) => (v ? [...p, id] : p.filter((x) => x !== id)))} />
                {userName(id)}
              </Label>
              {mode === "EXACT" && people.includes(id) && (
                <Input className="w-28" type="number" min="0" step="0.01" aria-label={`Amount for ${userName(id)}`} value={exact[id] ?? ""} onChange={(e) => setExact((x) => ({ ...x, [id]: e.target.value }))} />
              )}
            </div>
          ))}
        </div>

        {exactMismatch && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Amounts don't add up</AlertTitle>
            <AlertDescription>The shares total {inr(exactSum)}, but the expense is {inr(amount)}.</AlertDescription>
          </Alert>
        )}

        {mode === "INCOME_RATIO" && (checking ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Checking split…</div>
        ) : incomeCheck?.ok ? (
          <Alert>
            <ShieldCheck />
            <AlertTitle>Incomes stay private</AlertTitle>
            <AlertDescription>Each person's share is worked out from income bands on the server. Nobody sees anyone else's income.</AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Add at least 3 people</AlertTitle>
            <AlertDescription>With only 2 people, each could work out the other's income from the split. Pick another split or add someone.</AlertDescription>
          </Alert>
        ))}

        <div className="grid gap-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!canSave} onClick={save}>Add expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Expenses() {
  const { expenses, userName, groupName, update } = useStore()
  const [q, setQ] = useState("")
  const list = expenses.filter((e) => e.title.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <PageHeader title="Expenses" description="Everything that's been paid for and split." action={<AddExpenseDialog />} />
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search expenses" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card>
        <CardContent>
          {list.length === 0 ? (
            <Empty className="border-0"><EmptyHeader><EmptyTitle>No matching expenses</EmptyTitle><EmptyDescription>Try a different search, or add a new expense.</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Date</TableHead><TableHead>Expense</TableHead><TableHead>Group</TableHead><TableHead>Paid by</TableHead><TableHead>Split</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {list.map((e) => (
                  <TableRow key={e.expense_id}>
                    <TableCell className="text-muted-foreground">{e.created_at}</TableCell>
                    <TableCell>{e.title} {e.recurring_template_id && <Badge variant="outline">Recurring</Badge>}</TableCell>
                    <TableCell>{groupName(e.group_id)}</TableCell>
                    <TableCell>{userName(e.paid_by)}</TableCell>
                    <TableCell>{label(e.split_mode)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(e.total_amount)}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label={`Delete ${e.title}`}><Trash2 /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{e.title}"?</AlertDialogTitle>
                            <AlertDialogDescription>Everyone's balances from this expense will be removed. This can't be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => {
                              update("expenses", (x) => x.filter((y) => y.expense_id !== e.expense_id)); toast.success("Expense deleted")
                            }}>Delete expense</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Separator />
      <p className="text-xs text-muted-foreground">Showing {list.length} of {expenses.length} expenses.</p>
    </>
  )
}
