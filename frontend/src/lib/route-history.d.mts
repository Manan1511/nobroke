export interface RouteHistoryLeg {
  step_order: number
  from_user: string
  to_user: string
  amount: string
}

export function routeHistoryLegs(path: readonly string[] | null | undefined, amount: string): RouteHistoryLeg[]
