import { b64 } from "@/core/bytes"

// Photos are re-drawn on a canvas and re-encoded. That strips EXIF data
// (including GPS) and keeps snaps small enough for the mailbox.
const MAX_EDGE = 1440
const TARGET_BYTES = 420_000

type Source = CanvasImageSource & { width?: number; height?: number }

export async function encodeImage(
  source: Source,
  sw: number,
  sh: number,
  mirror = false,
): Promise<{ data: string; mime: string; url: string }> {
  let edge = MAX_EDGE
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, edge / Math.max(sw, sh))
    const w = Math.round(sw * scale)
    const h = Math.round(sh * scale)
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")!
    if (mirror) {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(source, 0, 0, w, h)
    for (const q of [0.82, 0.72, 0.6]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q))
      if (blob && blob.size <= TARGET_BYTES) {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        return { data: b64(bytes), mime: "image/jpeg", url: URL.createObjectURL(blob) }
      }
    }
    edge = Math.round(edge * 0.75)
  }
  throw new Error("image too large")
}

export async function encodeFile(file: File) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" })
  try {
    return await encodeImage(bmp, bmp.width, bmp.height)
  } finally {
    bmp.close()
  }
}

export function dataUrl(mime: string, data: string) {
  return `data:${mime};base64,${data}`
}

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 60_000,
    }),
  )
}

// Straight-line distance in metres.
export function distance(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371e3
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m apart`
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km apart`
}
