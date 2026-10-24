import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { authCallbackUrl, authResetUrl } from "../src/lib/auth-navigation.ts"

const PUBLIC_ORIGIN = "https://nobroke.netlify.app"

test("email verification and password reset links always return to the deployed site", () => {
  assert.equal(
    authCallbackUrl("/invite/abc"),
    `${PUBLIC_ORIGIN}/auth/callback?next=%2Finvite%2Fabc`,
  )
  assert.equal(authResetUrl(), `${PUBLIC_ORIGIN}/auth/reset`)
})

test("social share metadata points to the hosted NoBroke logo card", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8")
  const image = html.match(/<meta property="og:image" content="([^"]+)"\s*\/>/)
  const imageAlt = html.match(/<meta property="og:image:alt" content="([^"]+)"\s*\/>/)
  const card = html.match(/<meta name="twitter:card" content="([^"]+)"\s*\/>/)

  assert.ok(image, "Open Graph image should be declared for link previews")
  assert.equal(new URL(image[1]).href, `${PUBLIC_ORIGIN}/nobroke-social.png`)
  assert.ok(imageAlt?.[1].includes("NoBroke"), "preview image needs useful alt text")
  assert.equal(card?.[1], "summary_large_image")

  const png = await readFile(new URL("../public/nobroke-social.png", import.meta.url))
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.equal(png.readUInt32BE(16), 1200)
  assert.equal(png.readUInt32BE(20), 630)
})
