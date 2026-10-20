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
import { useStore } from "@/lib/store"
import { inr } from "@/lib/utils"

function ObligationTable({ rows, direction, onNavigate }) {
  const { userName } = useStore()
  if (rows.length === 0) return (
    <Empty><EmptyHeader><EmptyTitle>{direction === "owe" ? "You're all square" : "Nobody owes you"}</EmptyTitle><EmptyDescription>New balances show up here when expenses are added.</EmptyDescription></EmptyHeader></Empty>
  )
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>{direction === "owe" ? "You owe" : "Owes you"}</TableHead><TableHead>For</TableHead><TableHead>Status</TableHead><TableHead className="w-40">Paid so far</TableHead><TableHead className="text-right">Left</TableHead><TableHead /></TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((o) => {
          const other = direction === "owe" ? o.creditor_id : o.debtor_id
          const paidPct = ((o.original_amount - o.remaining_amount) / o.original_amount) * 100
          return (
            <TableRow key={o.obligation_id}>
              <TableCell><div className="flex items-center gap-2"><UserAvatar id={other} />{userName(other)}</div></TableCell>
              <TableCell className="text-muted-foreground">{o.source}</TableCell>
              <TableCell><StatusBadge status={o.status} /></TableCell>
              <TableCell><Progress value={paidPct} aria-label="Paid so far" /></TableCell>
              <TableCell className="text-right tabular-nums">{inr(o.remaining_amount)}</TableCell>
              <TableCell className="text-right">
                {o.status !== "SETTLED" && (direction === "owe" ? (
                  <div className="flex justify-end gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label="Pay automatically when someone pays you" onClick={() => onNavigate("rules")}><Workflow /></Button></TooltipTrigger>
                      <TooltipContent>Pay when someone pays you</TooltipContent>
                    </Tooltip>
                    <Button size="sm" onClick={() => onNavigate("settle")}><ArrowLeftRight /> Settle</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => toast.success(`Reminder sent to ${userName(other)}`)}><Bell /> Remind</Button>
                ))}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default function Balances({ onNavigate }) {
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
