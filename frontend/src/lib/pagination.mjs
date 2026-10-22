export async function listAllPages(fetchPage, args, cursor) {
  const pageSize = 100
  const rows = []
  let afterId = null
  let afterTimestamp = null

  while (true) {
    const page = await fetchPage({
      ...args,
      [cursor.idArg ?? "p_after_id"]: afterId,
      ...(cursor.timestampArg ? { [cursor.timestampArg]: afterTimestamp } : {}),
      p_limit: pageSize,
    })
    if (page?.length) rows.push(...page)
    if (!page || page.length < pageSize) return rows

    const last = page[page.length - 1]
    const nextId = last?.[cursor.idField]
    const nextTimestamp = cursor.timestampField ? last?.[cursor.timestampField] : null
    if (typeof nextId !== "string" || nextId === afterId
      || (cursor.timestampField && typeof nextTimestamp !== "string")) {
      throw new Error("pagination_cursor_invalid")
    }
    afterId = nextId
    if (cursor.timestampField) afterTimestamp = nextTimestamp
  }
}
