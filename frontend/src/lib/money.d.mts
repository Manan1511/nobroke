export function parseMoney(value: string | number | null | undefined): bigint | null
export function compareMoney(left: string | number, right: string | number): -1 | 0 | 1 | null
export function isPositiveMoney(value: string | number | null | undefined): boolean
export function subtractMoney(left: string | number, right: string | number): string
export function availableMoney(remaining: string | number, reserved: string | number | null | undefined): string
export function moneyRatio(numerator: string | number, denominator: string | number): number
export function moneyForDisplay(value: string | number): number
