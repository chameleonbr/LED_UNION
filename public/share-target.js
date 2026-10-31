// Android share sheet → LED Union (manifest `share_target`). Pulled into the generated
// service worker by `workbox.importScripts`, so this listener runs before Workbox's.
// It keeps what was shared for the page to pick up, then opens the app on it.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share')) return
  event.respondWith(
    (async () => {
      const form = await event.request.formData()
      const file = form.get('media')
      const cache = await caches.open('led-union-share')
      const body =
        file instanceof File
          ? new Response(file, {
              headers: { 'content-type': file.type, 'x-name': encodeURIComponent(file.name) },
            })
          : new Response(
              ['url', 'text', 'title'].map((k) => form.get(k)).filter(Boolean).join('\n'),
              { headers: { 'content-type': 'text/plain' } },
            )
      await cache.put('shared', body)
      return Response.redirect(new URL('./?share=1', url).href, 303)
    })(),
  )
})
