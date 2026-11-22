// Renders the SVG icons to the PNG sizes Android and iOS want.
// Usage: node scripts/icons.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { Resvg } from "@resvg/resvg-js"

const jobs = [
  ["public/icon.svg", "public/icon-192.png", 192],
  ["public/icon.svg", "public/icon-512.png", 512],
  ["public/icon-maskable.svg", "public/icon-maskable-512.png", 512],
  ["public/icon-maskable.svg", "public/apple-touch-icon.png", 180],
]
for (const [src, out, size] of jobs) {
  const png = new Resvg(readFileSync(src), { fitTo: { mode: "width", value: size } }).render().asPng()
  writeFileSync(out, png)
  console.log(out, png.length, "bytes")
}
