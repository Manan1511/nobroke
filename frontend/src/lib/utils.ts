import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { moneyForDisplay } from "@/lib/money.mjs"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export const inr = (n: string | number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(moneyForDisplay(n))
