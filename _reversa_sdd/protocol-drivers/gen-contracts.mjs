const m = await import(process.cwd() + '/src/lib/protocol/index.ts')
const e = await import(process.cwd() + '/src/lib/protocol/ffe0.ts')
const b = await import(process.cwd() + '/src/lib/protocol/bledim.ts')
const h = (u) => u ? [...u].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ') : '—'
const { fff0, ffe0, bledim } = m
const out = []
const row = (...c) => out.push('| ' + c.join(' | ') + ' |')
// fff0
out.push('### fff0\n', '| Command | MELK-OC | ELK-BLEDOM | MELK-INTRO1 |', '|---|---|---|---|')
const fn = ['MELK-OC', 'ELK-BLEDOM', 'MELK-INTRO1']
const fx = [
  ['power on', (n) => fff0.power(true, n)], ['power off', (n) => fff0.power(false, n)],
  ['rgb(11,22,33)', (n) => fff0.rgb(0x11, 0x22, 0x33, n)], ['brightness 42', (n) => fff0.brightness(42, n)],
  ['speed 42', (n) => fff0.speed(42, n)], ['white 42', (n) => fff0.white(42, n)], ['cct(42, 58)', (n) => fff0.cct(42, 58, n)],
  ['effect id 5', (n) => fff0.effect({ id: 5, name: 'x' }, n)], ['effect id 5, group Scenes', (n) => fff0.effect({ id: 5, name: 'x', group: 'Scenes' }, n)],
  ['soundEnable on', (n) => fff0.soundEnable(true, n)], ['soundSensitivity 42', (n) => fff0.soundSensitivity(42, n)], ['soundMode 5 (mic)', (n) => fff0.soundMode(5, n, 'mic')],
]
for (const [l, f] of fx) row(l, ...fn.map((n) => '`' + h(f(n)) + '`'))
// ffe0
const names = [['ble', 'LEDBLE-00-1'], ['ble · LEDSTAGE', 'LEDSTAGE-1'], ['ble · LEDBLE-03', 'LEDBLE-03-1'], ['dmx', 'LEDDMX-00-1'], ['dmx · LEDCAR-01', 'LEDCAR-01-1'], ['dmxs', 'LEDDMX-02-1'], ['dmxs · LEDCAR-02', 'LEDCAR-02-1'], ['smart', 'LEDSMART-1'], ['sun', 'LEDSUN-1'], ['like', 'LEDLIKE-1'], ['pho', 'LEDPHO-1']]
const cmds = [
  ['power on', (n, c) => ffe0.power(true, n, c)], ['power off', (n, c) => ffe0.power(false, n, c)],
  ['rgb(11,22,33)', (n, c) => ffe0.rgb(0x11, 0x22, 0x33, n, c)], ['brightness 42', (n, c) => ffe0.brightness(42, n, c)],
  ['speed 42', (n, c) => ffe0.speed(42, n, c)], ['effect id 5', (n, c) => ffe0.effect({ id: 5, name: 'x' }, n, c)],
  ['white 42', (n) => ffe0.white(42, n)], ['cct(42, 58)', (n) => ffe0.cct(42, 58, n)],
  ['soundMode 5 mic', (n, c) => ffe0.soundMode(5, n, 'mic', c)], ['soundMode 5 music', (n, c) => ffe0.soundMode(5, n, 'music', c)],
  ['soundSensitivity 42', (n) => ffe0.soundSensitivity(42, n)],
]
out.push('\n### ffe0, no output channel (`ch` undefined)\n', '| Command | ' + names.map((x) => x[0]).join(' | ') + ' |', '|---|' + names.map(() => '---').join('|') + '|')
for (const [l, f] of cmds) row(l, ...names.map(([, n]) => '`' + h(f(n)) + '`'))
out.push('\n### ffe0, output channel byte 2 (LEDBLE-02 / LEDCAR-02)\n', '| Command | LEDBLE-02-1 (ble) | LEDCAR-02-1 (dmxs) |', '|---|---|---|')
for (const [l, f] of cmds) row(l, '`' + h(f('LEDBLE-02-1', 2)) + '`', '`' + h(f('LEDCAR-02-1', 2)) + '`')
out.push('\n### ffe0, LEDCAR-01 by variant\n', '| Command | variant ble (RGB) | variant dmx (SPI) |', '|---|---|---|')
for (const [l, f] of [['power on', (v) => ffe0.power(true, 'LEDCAR-01-1', undefined, v)], ['rgb(11,22,33)', (v) => ffe0.rgb(0x11, 0x22, 0x33, 'LEDCAR-01-1', undefined, v)], ['brightness 42', (v) => ffe0.brightness(42, 'LEDCAR-01-1', undefined, v)], ['speed 42', (v) => ffe0.speed(42, 'LEDCAR-01-1', undefined, v)], ['effect id 5', (v) => ffe0.effect({ id: 5, name: 'x' }, 'LEDCAR-01-1', undefined, v)]])
  row(l, '`' + h(f('ble')) + '`', '`' + h(f('dmx')) + '`')
out.push('\n### ffe0, custom effect (2 colours 11 22 33, 44 55 66; jump / fade)\n', '| Layout | Frames (jump) | First frame (fade) |', '|---|---|---|')
const spec = (fade) => ({ colors: [{ r: 0x11, g: 0x22, b: 0x33 }, { r: 0x44, g: 0x55, b: 0x66 }], fade })
for (const [l, n] of names) { const j = ffe0.customEffect(spec(false), n); const fa = ffe0.customEffect(spec(true), n); row(l, j.length ? j.map((x) => '`' + h(x) + '`').join('<br>') : '— (unsupported)', fa.length ? '`' + h(fa[0]) + '`' : '—') }
out.push('\n### ffe0, handshake and strip\n', '| Frame | Bytes |', '|---|---|')
row('authFrame, Wed 2026-10-21 14:05', '`' + h(e.authFrame(new Date(2026, 9, 21, 14, 5))) + '`')
row('passwordQueryFrame (dead)', '`' + h(e.passwordQueryFrame()) + '`')
row('spiConfigFrame dmx, 300 px, order 2', '`' + h(e.spiConfigFrame('LEDDMX-00-1', { pixels: 300, order: 2 })) + '`')
row('spiConfigFrame dmxs, 300 px, order 2', '`' + h(e.spiConfigFrame('LEDDMX-02-1', { pixels: 300, order: 2 })) + '`')
row('directionFrame dmx forward / reverse', '`' + h(e.directionFrame('LEDDMX-00-1', true)) + '` / `' + h(e.directionFrame('LEDDMX-00-1', false)) + '`')
row('directionFrame dmxs forward', '`' + h(e.directionFrame('LEDDMX-02-1', true)) + '`')
// bledim (fresh names so memory is at defaults; seq varies so show cmd+payload)
const body = (u) => { const a = [...u]; return { seq: a[2], cmd: a[3].toString(16).toUpperCase(), len: (a[4] << 8) | a[5], p: a.slice(6, -1), sum: a.at(-1) } }
const sh = (u) => { const x = body(u); const nz = x.p.map((v, i) => [i, v]).filter(([, v]) => v); return '`' + x.cmd + '` len ' + x.len + ' · ' + (x.len > 12 ? 'non-zero p[i]: ' + nz.map(([i, v]) => i + '=' + v.toString(16).toUpperCase().padStart(2, '0')).join(', ') : 'payload `' + h(new Uint8Array(x.p)) + '`') }
out.push('\n### bledim (payload view; full frame = `55 AA seq cmd lenHi lenLo payload sum`)\n', '| Command (fresh device memory) | cmd · payload |', '|---|---|')
row('onConnect: serialCodeFrame 14:05:07.300', sh(b.serialCodeFrame(new Date(2026, 9, 21, 14, 5, 7, 300))))
row('power on / off', sh(bledim.power(true, 'D1')) + ' / ' + sh(bledim.power(false, 'D1')))
row('rgb(11,22,33)', sh(bledim.rgb(0x11, 0x22, 0x33, 'D2')))
row('brightness 50 after rgb(200,100,0)', (bledim.rgb(200, 100, 0, 'D3'), sh(bledim.brightness(50, 'D3'))))
row('brightness 42 (no colour)', sh(bledim.brightness(42, 'D4')))
row('speed 42 (no colour)', sh(bledim.speed(42, 'D5')))
row('white 42', sh(bledim.white(42, 'D6')))
row('effect id 5', sh(bledim.effect({ id: 5, name: 'M6' }, 'D7')))
row('customEffect 2 colours, fade', sh(bledim.customEffect(spec(true), 'D8')[0]))
row('soundEnable on', sh(bledim.soundEnable(true, 'D9')))
row('soundSensitivity 42', sh(bledim.soundSensitivity(42, 'D9')))
row('switchChannelsFrame(4)', sh(b.switchChannelsFrame(4)))
row('readInfoFrame() (dead)', sh(b.readInfoFrame()))
const f0 = b.frame(0x80, [1]); out.push('\nFull-frame example: `frame(0x80,[1])` with seq 0 = `' + h(f0).replace(/^55 AA ../, '55 AA 00') + '` (checksum = (55+AA+00+80+00+01+01) & FF = 81 when seq = 0)')
console.log(out.join('\n'))
