/**
 * MD5 своей реализацией: протокол Subsonic требует именно его, а Web Crypto в браузере и в
 * движке Tauri даёт только SHA. Ни для чего, кроме подписи запроса по HTTPS, он здесь не нужен.
 */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296))

const rotateLeft = (value: number, shift: number) => (value << shift) | (value >>> (32 - shift))

export function md5(text: string): string {
  const message = new TextEncoder().encode(text)
  // Дополнение до кратного 64 байтам: единичный бит, нули и длина в битах.
  const withPadding = new Uint8Array((((message.length + 8) >> 6) + 1) * 64)
  withPadding.set(message)
  withPadding[message.length] = 0x80
  const view = new DataView(withPadding.buffer)
  view.setUint32(withPadding.length - 8, (message.length << 3) >>> 0, true)
  view.setUint32(withPadding.length - 4, Math.floor(message.length / 536870912), true)

  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]

  for (let chunk = 0; chunk < withPadding.length; chunk += 64) {
    const words = Array.from({ length: 16 }, (_, i) => view.getUint32(chunk + i * 4, true))
    let [a, b, c, d] = [a0, b0, c0, d0]

    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const temp = d
      d = c
      c = b
      b = (b + rotateLeft((a + f + K[i]! + words[g]!) >>> 0, S[i]!)) >>> 0
      a = temp
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  return [a0, b0, c0, d0]
    .flatMap((word) => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff])
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
