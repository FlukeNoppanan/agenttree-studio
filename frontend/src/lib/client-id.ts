/** UUID-shaped IDs for unsaved browser drafts; persisted IDs remain backend-owned. */
export function generateClientId(): string {
  const browserCrypto = globalThis.crypto
  if (typeof browserCrypto?.randomUUID === "function") return browserCrypto.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof browserCrypto?.getRandomValues === "function") {
    browserCrypto.getRandomValues(bytes)
  } else {
    // Last-resort draft-only fallback for browsers without Web Crypto.
    // Multiple independent draws and wall-clock entropy avoid counter IDs.
    let clock = Date.now()
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256) ^ (clock & 0xff)
      clock = Math.floor(clock / 256) || Date.now()
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
