// One-command deploy to Cloudflare's free tier.
//   npm run ship
// First run opens a browser to log in to Cloudflare (free account is enough).
import { execSync, spawnSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts })
const npx = process.platform === "win32" ? "npx.cmd" : "npx"

const who = spawnSync(npx, ["wrangler", "whoami"], { encoding: "utf8", shell: true })
if (!/associated with the email|You are logged in/i.test(who.stdout + who.stderr)) {
  console.log("\nLogging in to Cloudflare. A browser window will open: click Allow.\n")
  run("npx wrangler login")
}

run("npm run build")
run("npx wrangler deploy")

// Push keys live only in .dev.vars locally and as Cloudflare secrets, never in the repo.
if (!existsSync(".dev.vars")) throw new Error(".dev.vars is missing. Run npm run keys first.")
const vars = readFileSync(".dev.vars", "utf8")
for (const name of ["VAPID_PUBLIC", "VAPID_PRIVATE"]) {
  const value = vars.match(new RegExp(`^${name}=(.+)// One-command deploy to Cloudflare's free tier.
//   npm run ship
// First run opens a browser to log in to Cloudflare (free account is enough).
import { execSync, spawnSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts })
const npx = process.platform === "win32" ? "npx.cmd" : "npx"

const who = spawnSync(npx, ["wrangler", "whoami"], { encoding: "utf8", shell: true })
if (!/associated with the email|You are logged in/i.test(who.stdout + who.stderr)) {
  console.log("\nLogging in to Cloudflare. A browser window will open: click Allow.\n")
  run("npx wrangler login")
}

run("npm run build")
run("npx wrangler deploy")

, "m"))?.[1]?.trim()
  if (!value) throw new Error(`${name} not found in .dev.vars. Run npm run keys first.`)
  execSync(`npx wrangler secret put ${name}`, { input: value, stdio: ["pipe", "inherit", "inherit"] })
}

console.log("\nDone. Open the https://raaz.<your-subdomain>.workers.dev URL above on both phones.")
