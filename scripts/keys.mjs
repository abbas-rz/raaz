// Creates the Web Push (VAPID) key pair in .dev.vars, once.
//   npm run keys
import { generateKeyPairSync } from "node:crypto"
import { existsSync, readFileSync, appendFileSync } from "node:fs"

const existing = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf8") : ""
if (/^VAPID_PRIVATE=/m.test(existing)) {
  console.log(".dev.vars already has push keys. Nothing to do.")
} else {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-65).toString("base64url")
  const priv = privateKey.export({ format: "jwk" }).d
  appendFileSync(".dev.vars", `VAPID_PUBLIC=${pub}\nVAPID_PRIVATE=${priv}\n`)
  console.log("Push keys written to .dev.vars (git-ignored).")
}
