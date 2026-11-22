// raaz service worker
// - keeps the app shell cached so it opens without signal
// - shows a notification when the other phone sends something
// Pushes carry no data. Nothing about the message ever reaches this file.

const CACHE = "raaz-shell-v1"

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon-192.png"])))
  self.skipWaiting()
})

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return

  if (e.request.mode === "navigate") {
    // Network first so updates land quickly; cached shell when offline.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put("/", copy))
          return res
        })
        .catch(() => caches.match("/")),
    )
    return
  }

  if (url.pathname.startsWith("/assets/") || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    // Hashed build files never change, so cache first.
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(e.request, copy))
            }
            return res
          }),
      ),
    )
  }
})

// Reads the notification style the user picked. Never creates the database.
function readPrefs() {
  return new Promise((resolve) => {
    const req = indexedDB.open("raaz")
    req.onupgradeneeded = () => req.transaction.abort()
    req.onerror = () => resolve({})
    req.onsuccess = () => {
      const d = req.result
      try {
        const get = d.transaction("meta").objectStore("meta").get("prefs")
        get.onsuccess = () => {
          resolve(get.result || {})
          d.close()
        }
        get.onerror = () => {
          resolve({})
          d.close()
        }
      } catch {
        resolve({})
        d.close()
      }
    }
  })
}

const DECOYS = [
  ["Library", "Your issued book is due soon"],
  ["Assignment reminder", "1 submission closes this week"],
  ["Class notes", "New notes were uploaded"],
  ["Placement cell", "New update on the notice board"],
  ["Attendance", "Your attendance report is ready"],
]

self.addEventListener("push", (e) => {
  e.waitUntil(
    (async () => {
      const prefs = await readPrefs()
      let title = "raaz"
      let body = "Something new for you"
      if (prefs.notify === "decoy") {
        ;[title, body] = DECOYS[Math.floor(Math.random() * DECOYS.length)]
      }
      await self.registration.showNotification(title, {
        body,
        tag: "raaz",
        renotify: true,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        silent: false,
      })
    })(),
  )
})

self.addEventListener("notificationclick", (e) => {
  e.notification.close()
  e.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      if (list.length) return list[0].focus()
      return self.clients.openWindow("/")
    })(),
  )
})
