const DECIMAL_MONEY = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/

export function parseMoney(value) {
  const match = DECIMAL_MONEY.exec(String(value ?? "").trim())
  if (!match) return null
  const minor = BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"))
  return match[1] === "-" ? -minor : minor
}

export function compareMoney(left, right) {
  const a = parseMoney(left)
  const b = parseMoney(right)
  if (a === null || b === null) return null
  return a < b ? -1 : a > b ? 1 : 0
}

export function isPositiveMoney(value) {
  const parsed = parseMoney(value)
  return parsed !== null && parsed > 0n
}

export function subtractMoney(left, right) {
  const a = parseMoney(left)
  const b = parseMoney(right)
  return formatMoney(a === null || b === null ? 0n : a - b)
}

export function availableMoney(remaining, reserved) {
  const amount = parseMoney(remaining)
  const held = parseMoney(reserved ?? "0.00")
  const difference = amount === null || held === null ? 0n : amount - held
  return formatMoney(difference > 0n ? difference : 0n)
}

export function moneyRatio(numerator, denominator) {
  const top = parseMoney(numerator)
  const bottom = parseMoney(denominator)
  return top === null || bottom === null || bottom === 0n ? 0 : Number(top) / Number(bottom)
}

export function moneyForDisplay(value) {
  const parsed = parseMoney(value)
  return parsed === null ? 0 : Number(parsed) / 100
}

function formatMoney(minor) {
  const negative = minor < 0n
  const absolute = negative ? -minor : minor
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`
}
