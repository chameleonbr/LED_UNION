# Onboarding — testing 002 ipixel-conteudo on the panel

0. Notes before testing:
   - Share target needs the service worker: test it on the published app or `npm run build && npm run preview` over tailnet https, not `npm run dev`.
   - After a deploy, remove and re-add the app to the home screen so Android picks up `share_target`.
   - If the first window write fails in the log, the chunk size (244) is too big for this link: try 20 (`chunkSize` in `src/lib/protocol/ipixel.ts`).
   - If an image gets ACK `… 00` (rejected), suspect the RGBA PNG; retry the same picture as a one-frame GIF.
1. Open the published app (https) or local dev via `adb reverse tcp:5173 tcp:5173` + `http://localhost:5173` in Chrome Android.
2. Debug → **Clear log**. Devices → connect the iPixel. Card must show **32×32**; log must show `04 00 05 80` and a reply `08 00 05 80 …` (MCU version).
3. Tab **Panel** → **Import file** → pick a small PNG. Preview shows it pixelated at 32×32. Slot field shows a free number you choose (do not reuse a slot holding vendor content you want to keep). Tap **Send to slot N**.
   - Expected log: `… 02 00 00 <size> <crc> 00 <slot> …` window(s), notify `05 00 02 00 01` / `05 00 02 00 03`, then `07 00 08 80 01 00 <slot>`.
4. **Import file** → a GIF (≤ 60 frames). Send. Expected ACKs `05 00 03 00 0x`; panel plays the animation.
5. **New text** → `Nº 123`, scroll left, a colour. Send. Expected ACKs `05 00 00 01 0x`. If glyphs look mirrored or garbled, Debug → flip bit order and resend.
6. **Import URL** with a GIF link. If blocked, the CORS message appears and nothing is sent.
7. Create a free key at developers.giphy.com → paste in Panel → GIPHY settings. Search `cat eyes`, tap a result, send it.
8. In Chrome menu → **Add to home screen**. Open the GIPHY app or tenor.com, pick a GIF → Share → **LED Union**: the editor opens with it.
9. Start a GIF upload and tap **Cancel**: the log has no window after the cancel.
10. Reload the page: items still in the Panel grid; resend one without importing.
11. Debug → **Download log** and send the JSON back for checking.
