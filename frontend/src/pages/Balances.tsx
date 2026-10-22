import { useState } from "react"
import { ArrowLeftRight, Workflow, Bell } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { PageHeader, StatusBadge, UserAvatar } from "@/components/shared"
import { PersonHover } from "@/components/form-bits"
import { useStore } from "@/lib/store"
import { apiRpc } from "@/lib/supabase"
import { cn, inr } from "@/lib/utils"
import { isPositiveMoney } from "@/lib/money.mjs"
import type { Obligation } from "@/types"

function ObligationTable({ rows, direction, onNavigate }: { rows: Obligation[]; direction: "owe" | "owed"; onNavigate: (id: string) => void }) {
  const { userName, refresh } = useStore()
  const [reminding, setReminding] = useState("")
  const remind = async (obligation: Obligation, name: string) => {
    setReminding(obligation.obligation_id)
    try { await apiRpc("remind_debtor", { p_obligation_id: obligation.obligation_id }); await refresh(); toast.success(`Reminder sent to ${name}`) }
    catch (error) { toast.error(error instanceof Error && error.message === "reminder_cooldown_active" ? "A reminder was already sent in the last 24 hours." : "Could not send this reminder.") }
    finally { setReminding("") }
  }
  if (rows.length === 0) return (
    <Empty><EmptyHeader><EmptyTitle>{direction === "owe" ? "You're all square" : "Nobody owes you"}</EmptyTitle><EmptyDescription>New balances show up here when expenses are added.</EmptyDescription></EmptyHeader></Empty>
  )
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>{direction === "owe" ? "You owe" : "Owes you"}</TableHead><TableHead>For</TableHead><TableHead>Status</TableHead><TableHead className="w-40">Cleared so far</TableHead><TableHead className="text-right">Left</TableHead><TableHead /></TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((o) => {
          const other = direction === "owe" ? o.creditor_id : o.debtor_id
          return (
            <TableRow key={o.obligation_id}>
              <TableCell><div className="flex items-center gap-2"><UserAvatar id={other} /><PersonHover id={other} /></div></TableCell>
              <TableCell className="text-muted-foreground">{o.source}</TableCell>
              <TableCell><StatusBadge status={o.status} /></TableCell>
              <TableCell><Progress value={o.cleared_percent ?? 0} aria-label="Amount cleared" />{isPositiveMoney(o.reserved_amount ?? "0.00") && <span className="mt-1 block text-xs text-muted-foreground">{inr(o.reserved_amount ?? "0.00")} awaiting confirmation</span>}</TableCell>
              <TableCell className={cn("text-right font-medium tabular-nums", o.status === "SETTLED" ? "text-muted-foreground" : direction === "owe" ? "text-negative" : "text-positive")}>{inr(o.remaining_amount)}</TableCell>
              <TableCell className="text-right">
                {o.status !== "SETTLED" && (direction === "owe" ? (
                  <div className="flex justify-end gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label="Create a pay-when-paid rule" onClick={() => onNavigate("rules")}><Workflow /></Button></TooltipTrigger>
                      <TooltipContent>Create a forwarding task rule</TooltipContent>
                    </Tooltip>
                    <Button size="sm" onClick={() => onNavigate("settle")}><ArrowLeftRight /> Settle</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" disabled={reminding === o.obligation_id} onClick={() => void remind(o, userName(other))}><Bell /> {reminding === o.obligation_id ? "Sending…" : "Remind"}</Button>
                ))}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default function Balances({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { obligations, me } = useStore()
  const owe = obligations.filter((o) => o.debtor_id === me)
  const owed = obligations.filter((o) => o.creditor_id === me)
  return (
    <>
      <PageHeader title="Balances" description="Every debt across all your groups, combined." />
      <Tabs defaultValue="owe">
        <TabsList>
          <TabsTrigger value="owe">You owe ({owe.filter((o) => o.status !== "SETTLED").length})</TabsTrigger>
          <TabsTrigger value="owed">Owed to you ({owed.filter((o) => o.status !== "SETTLED").length})</TabsTrigger>
        </TabsList>
        <TabsContent value="owe"><Card><CardContent><ObligationTable rows={owe} direction="owe" onNavigate={onNavigate} /></CardContent></Card></TabsContent>
        <TabsContent value="owed"><Card><CardContent><ObligationTable rows={owed} direction="owed" onNavigate={onNavigate} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  )
}
