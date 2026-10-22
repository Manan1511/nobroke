import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, ShieldCheck, TriangleAlert, Trash2, Search, ArrowUpDown, Pencil } from "lucide-react"
import { toast } from "sonner"
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, flexRender } from "@tanstack/react-table"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { AmountInput, PersonHover, SimpleSelect, SplitModeToggle } from "@/components/form-bits"
import { useStore } from "@/lib/store"
import { apiRpc } from "@/lib/supabase"
import { newRequestId } from "@/lib/api"
import { isPositiveMoney } from "@/lib/money.mjs"
import { isIncomeSplitLocallyBlocked } from "@/lib/income-split-setup.mjs"
import type { Expense, SplitMode } from "@/types"
import type { Column, ColumnDef } from "@tanstack/react-table"
import type { ReactNode } from "react"
import { inr } from "@/lib/utils"

/** Add a new expense, or edit `expense` when given. */
function ExpenseDialog({ expense }: { expense?: Expense }) {
  const { groups, userName, refresh, me, myFinancials } = useStore()
  const [open, setOpen] = useState(false)
  const keepPeople = useRef(false) // set while filling the form from an existing expense
  const [groupId, setGroupId] = useState(groups[0]?.group_id ?? "")
  const [title, setTitle] = useState("")
  const [amount, setAmount] = useState("")
  const [paidBy, setPaidBy] = useState(me)
  const [mode, setMode] = useState<SplitMode>("EQUAL")
  const [people, setPeople] = useState<string[]>([])
  const [exact, setExact] = useState<Record<string, string>>({})
  const [correctionReason, setCorrectionReason] = useState("")
  const [saving, setSaving] = useState(false)
  const requestId = useRef<string | null>(null)

  const group = groups.find((g) => g.group_id === groupId)
  useEffect(() => {
    if (keepPeople.current) { keepPeople.current = false; return }
    setPeople(group?.members ?? []); setExact({})
    if (group && !group.members.includes(paidBy)) setPaidBy(group.members.includes(me) ? me : group.members[0])
  }, [groupId])

  // PostgreSQL validates exact-share totals and calculates every split.
  const incomeBlocked = isIncomeSplitLocallyBlocked(mode, people, me, myFinancials.configured)
  const ownIncomeMissing = people.includes(me) && !myFinancials.configured
  const canSave = title.trim() && isPositiveMoney(amount) && people.length > 0 && !incomeBlocked
  useEffect(() => { requestId.current = null }, [expense?.expense_id, groupId, title, amount, paidBy, mode, people, exact, correctionReason])

  const fill = () => {
    if (!expense) return
    keepPeople.current = expense.group_id !== groupId
    setGroupId(expense.group_id); setTitle(expense.title); setAmount(String(expense.total_amount))
    setPaidBy(expense.paid_by); setMode(expense.split_mode)
    setPeople(expense.participants ?? groups.find((g) => g.group_id === expense.group_id)?.members ?? [])
    setExact(Object.fromEntries(Object.entries(expense.exact_shares ?? {}).map(([k, v]) => [k, String(v)])))
  }
  const save = async () => {
    setSaving(true)
    try {
      requestId.current ??= newRequestId()
      const p_exact_shares = mode === "EXACT" ? Object.fromEntries(people.map((id) => [id, exact[id] ?? "0.00"])) : undefined
      if (expense) {
        if (!correctionReason.trim()) { toast.error("Add a correction reason."); return }
        await apiRpc("replace_expense", {
          p_expense_id: expense.expense_id, p_reason: correctionReason.trim(), p_group_id: groupId,
          p_title: title.trim(), p_total_amount: amount, p_split_mode: mode, p_paid_by: paidBy,
          p_participants: people, p_request_id: requestId.current, p_exact_shares,
        })
      } else {
        await apiRpc("create_expense", {
          p_group_id: groupId, p_title: title.trim(), p_total_amount: amount,
          p_split_mode: mode, p_paid_by: paidBy, p_participants: people,
          p_request_id: requestId.current, p_exact_shares,
        })
      }
      await refresh()
      toast.success(expense ? "Expense corrected" : "Expense added", { description: `${title.trim()} · ${inr(amount)}` })
      setTitle(""); setAmount(""); setMode("EQUAL"); setExact({}); setCorrectionReason(""); setOpen(false)
      requestId.current = null
    } catch (error) {
      const code = error instanceof Error ? error.message : "request_failed"
      toast.error(code === "income_setup_required" ? "Income split needs private setup from every participant." :
        code === "income_split_requires_three_participants" ? "Income splits need at least three participants." :
          code === "expense_correction_forbidden" ? "This expense already has payment or routing history and cannot be corrected." :
            "Could not save this expense. Check the amount and split details.")
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) fill(); setOpen(v) }}>
      <DialogTrigger asChild>{expense
        ? <Button variant="ghost" size="icon" aria-label={`Correct ${expense.title}`}><Pencil /></Button>
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

          {mode === "INCOME_RATIO" && !incomeBlocked ? (
            <Alert className="border-positive/25 bg-positive-soft [&>svg]:text-positive">
              <ShieldCheck />
              <AlertTitle>Incomes stay private</AlertTitle>
              <AlertDescription>PostgreSQL calculates shares from private bands. Nobody sees another person's income or band.</AlertDescription>
            </Alert>
          ) : (
            mode === "INCOME_RATIO" && <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>{people.length < 3 ? "Add at least 3 people" : ownIncomeMissing ? "Set up your private income first" : "Participant setup required"}</AlertTitle>
              <AlertDescription>{people.length < 3 ? "Income splits need at least three people." : ownIncomeMissing ? "Your private income band is needed because you are included in this split." : "Each selected participant needs a private income band. NoBroke will not reveal whose setup is missing."}</AlertDescription>
            </Alert>
          )}

          {expense && <Field><FieldLabel htmlFor="correction-reason">Correction reason</FieldLabel><Input id="correction-reason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Why does this expense need a correction?" /></Field>}

        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!canSave || saving || (expense && !correctionReason.trim())} onClick={() => void save()}>{saving ? <Spinner /> : null}{expense ? "Void and replace" : "Add expense"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteExpense({ expense }: { expense: Expense }) {
  const { refresh } = useStore()
  const [reason, setReason] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const requestId = useRef<string | null>(null)
  useEffect(() => { requestId.current = null }, [expense.expense_id, reason])
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label={`Delete ${expense.title}`}><Trash2 /></Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
        <AlertDialogTitle>Void "{expense.title}"?</AlertDialogTitle>
          <AlertDialogDescription>The expense stays in history. Voiding is blocked after payment or routing activity.</AlertDialogDescription>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for voiding" aria-label="Reason for voiding" />
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction disabled={!reason.trim() || saving} className="bg-destructive text-primary-foreground hover:bg-destructive/90" onClick={(event) => {
            event.preventDefault()
            requestId.current ??= newRequestId()
            setSaving(true)
            void apiRpc("void_expense_request", { p_expense_id: expense.expense_id, p_reason: reason.trim(), p_request_id: requestId.current }).then(async () => {
              await refresh(); toast.success("Expense voided"); setOpen(false); setReason(""); requestId.current = null
            }).catch((error) => toast.error(error instanceof Error && error.message === "idempotency_conflict"
              ? "This retry ID was used with different details. Change the reason and retry."
              : "This expense cannot be voided after payment or routing activity.")).finally(() => setSaving(false))
          }}>Void expense</AlertDialogAction>
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
      cell: ({ getValue }) => <div className="text-right tabular-nums">{inr(getValue<string>())}</div> },
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
