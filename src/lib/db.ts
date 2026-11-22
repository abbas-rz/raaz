import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from "idb"
import type { VaultRecord } from "@/core/crypto"

// What lives on the phone:
//   meta    plain: device id, wrapped vault, mailbox address, preferences
//   secure  sealed with the vault key: the message key, partner name, settings
//   msgs    sealed with the vault key: chat history, one record per message
//   inbox   sealed with the message key: arrived while locked, not yet opened
//   outbox  sealed with the message key: written while offline, not yet sent

export interface Prefs {
  notify: "discreet" | "decoy"
  lockStyle: "pin" | "calc"
  push: boolean
}

export interface RoomRef {
  roomId: string
  auth: string
}

export const DEFAULT_PREFS: Prefs = { notify: "discreet", lockStyle: "pin", push: false }

interface MetaValues {
  device: string
  vault: VaultRecord
  room: RoomRef
  prefs: Prefs
}

interface Schema extends DBSchema {
  meta: { key: keyof MetaValues; value: MetaValues[keyof MetaValues] }
  secure: { key: string; value: string }
  msgs: { key: string; value: { id: string; blob: string } }
  inbox: { key: number; value: { seq: number; body: string } }
  outbox: { key: string; value: { cid: string; body: string; ts: number } }
}

const NAME = "raaz"
let dbp: Promise<IDBPDatabase<Schema>> | null = null

export function db() {
  dbp ??= openDB<Schema>(NAME, 1, {
    upgrade(d) {
      d.createObjectStore("meta")
      d.createObjectStore("secure")
      d.createObjectStore("msgs", { keyPath: "id" })
      d.createObjectStore("inbox", { keyPath: "seq" })
      d.createObjectStore("outbox", { keyPath: "cid" })
    },
  })
  return dbp
}

export async function getMeta<K extends keyof MetaValues>(k: K): Promise<MetaValues[K] | undefined> {
  return (await (await db()).get("meta", k)) as MetaValues[K] | undefined
}

export async function setMeta<K extends keyof MetaValues>(k: K, v: MetaValues[K]) {
  await (await db()).put("meta", v, k)
}

export async function delMeta(k: keyof MetaValues) {
  await (await db()).delete("meta", k)
}

// Removes everything tied to the current partner but keeps the passcode.
export async function clearRoomData() {
  const d = await db()
  const tx = d.transaction(["meta", "secure", "msgs", "inbox", "outbox"], "readwrite")
  await Promise.all([
    tx.objectStore("meta").delete("room"),
    tx.objectStore("secure").clear(),
    tx.objectStore("msgs").clear(),
    tx.objectStore("inbox").clear(),
    tx.objectStore("outbox").clear(),
    tx.done,
  ])
}

export async function wipeAll() {
  if (dbp) (await dbp).close()
  dbp = null
  await deleteDB(NAME)
}
