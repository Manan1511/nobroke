import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesheet = await readFile(new URL("../src/index.css", import.meta.url), "utf8");

test("page text cannot be selected while editable text fields remain selectable", () => {
  assert.match(stylesheet, /\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*user-select\s*:\s*none\s*;/s);
  assert.match(stylesheet, /(?:input|textarea)[^{}]*\{[^}]*user-select\s*:\s*text\s*;/s);
  assert.match(stylesheet, /\[contenteditable[^\]]*\][^{}]*\{[^}]*user-select\s*:\s*text\s*;/s);
});
