import { cn } from "@/lib/utils"
function NativeSelect({ className, ...props }) {
  return <select className={cn("h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)} {...props} />
}
const NativeSelectOption = (p) => <option {...p} />
export { NativeSelect, NativeSelectOption }
