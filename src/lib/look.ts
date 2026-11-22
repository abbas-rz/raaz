// How raaz presents itself: as raaz, or disguised as a plain calculator.
// The disguise covers the home-screen name and icon (picked up when the app is
// installed), the page title, the status-bar colour, and the lock screen.
//
// The choice is mirrored in localStorage so the very first frame after launch
// is already the calculator, before IndexedDB has loaded.
export type Look = "raaz" | "calc"

const KEY = "raaz-look"

const LOOKS = {
  raaz: {
    title: "raaz",
    manifest: "/manifest.webmanifest",
    icon: "/icon.svg",
    appleIcon: "/apple-touch-icon.png",
    theme: "#1f1030",
  },
  calc: {
    title: "Calculator",
    manifest: "/manifest-calc.webmanifest",
    icon: "/calc-192.png",
    appleIcon: "/calc-apple-touch-icon.png",
    theme: "#111113",
  },
} as const

export function savedLook(): Look {
  try {
    return localStorage.getItem(KEY) === "calc" ? "calc" : "raaz"
  } catch {
    return "raaz"
  }
}

function setLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement("link")
    el.rel = rel
    document.head.append(el)
  }
  if (el.getAttribute("href") !== href) el.href = href
}

function setMeta(name: string, content: string) {
  const el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (el) el.content = content
}

export function applyLook(look: Look) {
  const l = LOOKS[look]
  try {
    localStorage.setItem(KEY, look)
  } catch {
    /* private mode: the IndexedDB preference still applies after boot */
  }
  document.title = l.title
  setLink("manifest", l.manifest)
  setLink("icon", l.icon)
  setLink("apple-touch-icon", l.appleIcon)
  setMeta("theme-color", l.theme)
  setMeta("apple-mobile-web-app-title", l.title)
  setMeta("application-name", l.title)
  document.documentElement.dataset.look = look
}
