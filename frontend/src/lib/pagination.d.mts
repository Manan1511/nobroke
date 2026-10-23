export interface PageCursor {
  idField: string
  idArg?: string
  timestampField?: string
  timestampArg?: string
}

export function listAllPages<T extends object>(
  fetchPage: (args: Record<string, unknown>) => Promise<T[]>,
  args: Record<string, unknown>,
  cursor: PageCursor,
): Promise<T[]>
