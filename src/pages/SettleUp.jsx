import { useState } from "react"
import { ArrowRight, Route, TriangleAlert, CircleCheck } from "lucide-react"
import { toast } from "sonner"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { PageHeader, UserAvatar, label } from "@/components/shared"
import { useStore, newId } from "@/lib/store"
import { findRoute } from "@/lib/api"
import { inr } from "@/lib/utils"

function RoutePath({ path }) {
  const { userName } = useStore()
  return (
    <div className="flex flex-wrap items-center gap-2">
      {path.map((id, i) => (
        <span key={id} className="flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm"><UserAvatar id={id} className="size-6" />{userName(id)}</span>
          {i < path.length - 1 && <ArrowRight className="size-4 text-muted-foreground" />}
        </span>
      ))}
    </div>
  )
}

export default function SettleUp() {
  const { obligations, batches, userName, update, me } = useStore()
  const mine = obligations.filter((o) => o.debtor_id === me && o.status !== "SETTLED")
  const [selected, setSelected] = useState(mine[0]?.obligation_id ?? "")
  const [route, setRoute] = useState(null)
  const [loading, setLoading] = useState(false)
  const ob = obligations.find((o) => o.obligation_id === selected)

  const search = async () => { setLoading(true); setRoute(await findRoute(ob)); setLoading(false) }

  const confirm = () => {
    // Mock only: the backend does the real settlement and returns the updated balances.
    update("obligations", (os) => os.map((o) => (o.obligation_id === ob.obligation_id ? { ...o, remaining_amount: 0, status: "SETTLED" } : o)))
    update("batches", (bs) => [{ batch_id: newId("b"), settlement_type: route.type, total_cleared: route.amount, executed_at: new Date().toISOString().slice(0, 10),
      legs: route.path.slice(0, -1).map((from, i) => ({ step_order: i + 1, from_user: from, to_user: route.path[i + 1], amount: route.amount })) }, ...bs])
    toast.success("Settled", { description: `${inr(route.amount)} to ${userName(ob.creditor_id)} is cleared.` })
    setRoute(null); setSelected(mine.find((o) => o.obligation_id !== ob.obligation_id)?.obligation_id ?? "")
  }

  return (
    <>
      <PageHeader title="Settle up" description="Pay back what you owe, through friends if you don't know the person well." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Choose a debt</CardTitle>
            <CardDescription>We'll find the simplest way to clear it.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {mine.length === 0 ? <p className="text-sm text-muted-foreground">You don't owe anyone right now.</p> : (
              <div className="grid gap-2">
                <Label htmlFor="ob">Debt</Label>
                <NativeSelect id="ob" value={selected} onChange={(e) => { setSelected(e.target.value); setRoute(null) }}>
                  {mine.map((o) => <NativeSelectOption key={o.obligation_id} value={o.obligation_id}>{userName(o.creditor_id)} · {inr(o.remaining_amount)} · {o.source}</NativeSelectOption>)}
                </NativeSelect>
              </div>
            )}
            {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Finding a route…</div>}
            {route && (
              <div className="grid gap-3">
                <div className="flex items-center gap-2"><Badge variant="secondary">{label(route.type)}</Badge><span className="text-sm text-muted-foreground">{inr(route.amount)}</span></div>
                <RoutePath path={route.path} />
                {route.ok ? (
                  <Alert>
                    <CircleCheck />
                    <AlertTitle>{route.type === "MULTI_HOP" ? "Route found through a friend" : "You can pay directly"}</AlertTitle>
                    <AlertDescription>{route.type === "MULTI_HOP" ? `You pay ${userName(route.path[1])}. Their debt to ${userName(route.path.at(-1))} goes down by the same amount.` : "Pay them as usual and mark it settled."}</AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>This route goes over a trust limit</AlertTitle>
                    <AlertDescription>{route.reason} Pay {userName(route.path.at(-1))} directly, or ask a friend to raise their limit.</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="outline" disabled={!ob || loading} onClick={search}><Route /> Find route</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button disabled={!route?.ok}>Settle {route ? inr(route.amount) : ""}</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm settlement</AlertDialogTitle>
                  <AlertDialogDescription>
                    {route && route.path.slice(0, -1).map((id, i) => `${userName(id)} → ${userName(route.path[i + 1])}`).join(", ")} for {route && inr(route.amount)}. Everyone's balances update together.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Go back</AlertDialogCancel>
                  <AlertDialogAction onClick={confirm}>Settle</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader><CardTitle>How settling works</CardTitle></CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              <AccordionItem value="hop"><AccordionTrigger>Why pay a friend instead of the person I owe?</AccordionTrigger><AccordionContent>If a friend owes that person money, you can pay your friend and their debt goes down instead. You only pay people you know.</AccordionContent></AccordionItem>
              <AccordionItem value="trust"><AccordionTrigger>What's a trust limit?</AccordionTrigger><AccordionContent>The most a friend is willing to have routed through them. Routes never go over it. You can set yours on the Friends page.</AccordionContent></AccordionItem>
              <AccordionItem value="loop"><AccordionTrigger>What's a cleared loop?</AccordionTrigger><AccordionContent>When debts go round in a circle (you owe A, A owes B, B owes you), the shared amount is cancelled without anyone paying.</AccordionContent></AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Settlement history</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Steps</TableHead><TableHead className="text-right">Cleared</TableHead></TableRow></TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.batch_id}>
                  <TableCell className="text-muted-foreground">{b.executed_at}</TableCell>
                  <TableCell><Badge variant="outline">{label(b.settlement_type)}</Badge></TableCell>
                  <TableCell className="whitespace-normal">{b.legs.map((l) => `${userName(l.from_user)} → ${userName(l.to_user)}`).join(", ")}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(b.total_cleared)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
