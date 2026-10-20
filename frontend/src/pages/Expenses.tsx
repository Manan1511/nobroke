import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, ShieldCheck, TriangleAlert, Trash2, Search, ArrowUpDown, Pencil } from "lucide-react"
import { toast } from "sonner"
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, flexRender } from "@tanstack/react-table"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { PageHeader, label } from "@/components/shared"
import { AmountInput, DatePicker, PersonHover, SimpleSelect, SplitModeToggle } from "@/components/form-bits"
import { useStore, newId } from "@/lib/store"
import { previewIncomeSplit, type IncomeCheck } from "@/lib/api"
import type { Expense, SplitMode } from "@/types"
import type { Column, ColumnDef } from "@tanstack/react-table"
import type { ReactNode } from "react"
import { inr } from "@/lib/utils"

const today = () => new Date().toISOString().slice(0, 10)

/** Add a new expense, or edit `expense` when given. */
function ExpenseDialog({ expense }: { expense?: Expense }) {
  const { groups, userName, update, me } = useStore()
  const [open, setOpen] = useState(false)
  const keepPeople = useRef(false) // set while filling the form from an existing expense
  const [groupId, setGroupId] = useState(groups[0]?.group_id ?? "")
  const [title, setTitle] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(today())
  const [paidBy, setPaidBy] = useState(me)
  const [mode, setMode] = useState<SplitMode>("EQUAL")
  const [people, setPeople] = useState<string[]>([])
  const [exact, setExact] = useState<Record<string, string>>({})
  const [note, setNote] = useState("")
  const [incomeCheck, setIncomeCheck] = useState<IncomeCheck | null>(null)
  const [checking, setChecking] = useState(false)

  const group = groups.find((g) => g.group_id === groupId)
  useEffect(() => {
    if (keepPeople.current) { keepPeople.current = false; return }
    setPeople(group?.members ?? []); setExact({})
    if (group && !group.members.includes(paidBy)) setPaidBy(group.members.includes(me) ? me : group.members[0])
  }, [groupId])

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

  const fill = () => {
    if (!expense) return
    keepPeople.current = expense.group_id !== groupId
    setGroupId(expense.group_id); setTitle(expense.title); setAmount(String(expense.total_amount)); setDate(expense.created_at)
    setPaidBy(expense.paid_by); setMode(expense.split_mode); setNote(expense.note ?? "")
    setPeople(expense.participants ?? groups.find((g) => g.group_id === expense.group_id)?.members ?? [])
    setExact(Object.fromEntries(Object.entries(expense.exact_shares ?? {}).map(([k, v]) => [k, String(v)])))
  }
  const save = () => {
    if (expense) {
      const changed: Expense = { ...expense, group_id: groupId, paid_by: paidBy, title: title.trim(), total_amount: Number(amount), split_mode: mode, created_at: date, participants: people, exact_shares: mode === "EXACT" ? exact : undefined, note: note.trim() || undefined }
      update("expenses", (list) => list.map((x) => (x.expense_id === expense.expense_id ? changed : x)))
      toast.success("Expense updated", { description: `${title.trim()} · ${inr(amount)}` })
      setOpen(false); return
    }
    update("expenses", (e) => [{ expense_id: newId("e"), group_id: groupId, paid_by: paidBy, title: title.trim(), total_amount: Number(amount), split_mode: mode, created_at: date, participants: people, ...(mode === "EXACT" && { exact_shares: exact }), ...(note.trim() && { note: note.trim() }) }, ...e])
    toast.success("Expense added", { description: `${title.trim()} · ${inr(amount)}` })
    setTitle(""); setAmount(""); setMode("EQUAL"); setNote(""); setExact({}); setDate(today()); setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) fill(); setOpen(v) }}>
      <DialogTrigger asChild>{expense
        ? <Button variant="ghost" size="icon" aria-label={`Edit ${expense.title}`}><Pencil /></Button>
        : <Button><Plus /> Add expense</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>Who paid, how much, and how to split it.</DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="grp">Group</FieldLabel>
              <SimpleSelect id="grp" value={groupId} onValueChange={setGroupId} options={groups.map((g) => ({ value: g.group_id, label: g.group_name }))} />
            </Field>
            <Field>
              <FieldLabel htmlFor="paid">Paid by</FieldLabel>
              <SimpleSelect id="paid" value={paidBy} onValueChange={setPaidBy} options={(group?.members ?? []).map((id) => ({ value: id, label: userName(id) }))} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="title">What was it for?</FieldLabel>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner, cab, groceries…" />
            </Field>
            <Field>
              <FieldLabel htmlFor="amt">Amount</FieldLabel>
              <AmountInput id="amt" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="date">Date</FieldLabel>
              <DatePicker id="date" value={date} onChange={setDate} />
            </Field>
          </div>

          <Field>
            <FieldLabel>Split</FieldLabel>
            <SplitModeToggle value={mode} onValueChange={setMode} />
          </Field>

          <FieldSet>
            <FieldLegend variant="label">Split between</FieldLegend>
            <FieldDescription>{people.length} of {group?.members.length ?? 0} people{mode === "EXACT" && " · type each person's share"}</FieldDescription>
            <div className="grid gap-2">
              {group?.members.map((id) => (
                <div key={id} className="flex min-h-9 items-center gap-3">
                  <Field orientation="horizontal" className="flex-1">
                    <Checkbox id={`p-${id}`} checked={people.includes(id)} onCheckedChange={(v) => setPeople((p) => (v ? [...p, id] : p.filter((x) => x !== id)))} />
                    <FieldLabel htmlFor={`p-${id}`} className="font-normal">{userName(id)}</FieldLabel>
                  </Field>
                  {mode === "EXACT" && people.includes(id) && (
                    <AmountInput className="w-32" aria-label={`Amount for ${userName(id)}`} value={exact[id] ?? ""} onChange={(e) => setExact((x) => ({ ...x, [id]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          </FieldSet>

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
            <Alert className="border-positive/25 bg-positive-soft [&>svg]:text-positive">
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

          <Field>
            <FieldLabel htmlFor="note">Note (optional)</FieldLabel>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!canSave} onClick={save}>{expense ? "Save changes" : "Add expense"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteExpense({ expense }: { expense: Expense }) {
  const { update } = useStore()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label={`Delete ${expense.title}`}><Trash2 /></Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{expense.title}"?</AlertDialogTitle>
          <AlertDialogDescription>Everyone's balances from this expense will be removed. This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" onClick={() => {
            update("expenses", (x) => x.filter((y) => y.expense_id !== expense.expense_id)); toast.success("Expense deleted")
          }}>Delete expense</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const SortHeader = ({ column, children, className }: { column: Column<Expense>; children: ReactNode; className?: string }) => (
  <Button variant="ghost" size="sm" className={`-ml-2 h-8 ${className ?? ""}`} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
    {children} <ArrowUpDown className="opacity-50" />
  </Button>
)

export default function Expenses() {
  const { expenses, groupName } = useStore()
  const [q, setQ] = useState("")
  const [sorting, setSorting] = useState([{ id: "created_at", desc: true }])

  const columns = useMemo<ColumnDef<Expense>[]>(() => [
    { accessorKey: "created_at", header: ({ column }) => <SortHeader column={column}>Date</SortHeader>, cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span> },
    { accessorKey: "title", header: ({ column }) => <SortHeader column={column}>Expense</SortHeader>,
      cell: ({ row }) => <span className="flex items-center gap-2">{row.original.title} {row.original.recurring_template_id && <Badge variant="outline">Recurring</Badge>}</span> },
    { id: "group", accessorFn: (e) => groupName(e.group_id), header: "Group" },
    { accessorKey: "paid_by", header: "Paid by", cell: ({ getValue }) => <PersonHover id={getValue<string>()} /> },
    { accessorKey: "split_mode", header: "Split", cell: ({ getValue }) => label(getValue<string>()) },
    { accessorKey: "total_amount", header: ({ column }) => <div className="text-right"><SortHeader column={column} className="ml-0 -mr-2">Total</SortHeader></div>,
      cell: ({ getValue }) => <div className="text-right tabular-nums">{inr(getValue())}</div> },
    { id: "actions", header: "", cell: ({ row }) => <div className="flex justify-end"><ExpenseDialog expense={row.original} /><DeleteExpense expense={row.original} /></div> },
  ], [groupName])

  const table = useReactTable({
    data: expenses, columns,
    state: { sorting, globalFilter: q },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQ,
    globalFilterFn: (row, _id, value) => row.original.title.toLowerCase().includes(String(value).toLowerCase()),
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  })
  const rows = table.getRowModel().rows
  const pages = table.getPageCount()
  const pageIndex = table.getState().pagination.pageIndex
  const shown = table.getFilteredRowModel().rows.length

  return (
    <>
      <PageHeader title="Expenses" description="Everything that's been paid for and split." action={<ExpenseDialog />} />
      <InputGroup className="max-w-sm">
        <InputGroupAddon><Search /></InputGroupAddon>
        <InputGroupInput placeholder="Search expenses" value={q} onChange={(e) => setQ(e.target.value)} />
      </InputGroup>
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <Empty className="border-0"><EmptyHeader><EmptyTitle>No matching expenses</EmptyTitle><EmptyDescription>Try a different search, or add a new expense.</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>{hg.headers.map((h) => <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}</TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>{r.getVisibleCells().map((c) => <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-muted-foreground">Showing {shown} of {expenses.length} expenses.</p>
        {pages > 1 && (
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); table.previousPage() }} aria-disabled={!table.getCanPreviousPage()} /></PaginationItem>
              {Array.from({ length: pages }, (_, i) => (
                <PaginationItem key={i}><PaginationLink href="#" isActive={i === pageIndex} onClick={(e) => { e.preventDefault(); table.setPageIndex(i) }}>{i + 1}</PaginationLink></PaginationItem>
              ))}
              <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); table.nextPage() }} aria-disabled={!table.getCanNextPage()} /></PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </>
  )
}
