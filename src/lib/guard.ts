// The app locks itself when it leaves the screen. Opening the photo picker or
// the share sheet also hides the page, so those flows hold the lock briefly.
let holdUntil = 0

export function holdLock(ms = 60_000) {
  holdUntil = Date.now() + ms
}

export function releaseLock() {
  holdUntil = 0
}

export function lockHeld() {
  return Date.now() < holdUntil
}
