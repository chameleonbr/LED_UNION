/** Parse a frame typed by hand: "7E040401", "7e 04 04 01", "0x7E,0x04" all work. */
export function parseHex(text: string): Uint8Array {
  const clean = text.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '')
  if (clean.length === 0 || clean.length % 2 !== 0) {
    throw new Error('Hex inválido — precisa de um número par de dígitos')
  }
  return new Uint8Array(clean.match(/../g)!.map((h) => parseInt(h, 16)))
}

export const toHex = (b: Uint8Array) =>
  [...b].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ')
