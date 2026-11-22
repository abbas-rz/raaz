// Renders the store art and the GitHub banner with headless Chrome.
//   node marketing/render.mjs
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p))
if (!chrome) throw new Error("Chrome not found")

const dir = import.meta.dirname
mkdirSync(resolve(dir, "out"), { recursive: true })

const jobs = [
  ["slide-1.html", "play-1.png", 1080, 1920],
  ["slide-2.html", "play-2.png", 1080, 1920],
  ["slide-3.html", "play-3.png", 1080, 1920],
  ["banner.html", "banner.png", 1280, 640],
]

for (const [src, out, w, h] of jobs) {
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--allow-file-access-from-files",
      `--window-size=${w},${h}`,
      "--virtual-time-budget=3000",
      `--screenshot=${resolve(dir, "out", out)}`,
      `file:///${resolve(dir, src).replace(/\\/g, "/")}`,
    ],
    { stdio: "ignore" },
  )
  console.log("rendered", out)
}
