/**
 * Ask the BLEDIM app to build a scene buffer with its own code, and print it.
 *
 * The 72-byte scene payload is memcpy'd into the packet, so the static extractor can
 * only pin the header. This closes that gap by running the real builder.
 *
 * Usage: frida -H 127.0.0.1:27042 -p <pid> -l bledim_scene.js
 */
'use strict'

function hex(bytes) {
  return Array.prototype.map
    .call(bytes, (b) => ((b & 0xff) + 0x100).toString(16).slice(1))
    .join(' ')
}

Java.perform(function () {
  const ScenePara = Java.use('com.forwell.bledim.ScenePara')

  function dump(label, mutate) {
    try {
      const sp = ScenePara.$new()
      if (mutate) mutate(sp)
      sp.EnPackToDb()
      const buf = sp.pDbBuf.value
      send({ label: label, len: buf.length, hex: hex(buf) })
    } catch (e) {
      send({ label: label, error: String(e) })
    }
  }

  // Defaults straight from the constructor: this is the baseline every scene starts from.
  dump('default')

  // One built-in effect with the chase bit, matching what our driver emits.
  dump('effect0_chase', function (sp) {
    sp.bSubFunction.value = 0x80
    sp.bClrQty.value = 1
  })

  dump('effect4_chase', function (sp) {
    sp.bSubFunction.value = 0x84
    sp.bClrQty.value = 1
  })

  // A plain static colour: the sentinel says "no built-in effect".
  dump('static_color', function (sp) {
    sp.bSubFunction.value = 0xff
    sp.bClrQty.value = 1
  })

  send({ label: '__done__' })
})
