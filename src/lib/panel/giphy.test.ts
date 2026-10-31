import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchUrl, failureFor, hitFrom } from './giphy.ts'

test('search url carries key, query and paging', () => {
  const u = new URL(searchUrl('K', 'cat eyes', 24))
  assert.equal(u.origin + u.pathname, 'https://api.giphy.com/v1/gifs/search')
  assert.equal(u.searchParams.get('api_key'), 'K')
  assert.equal(u.searchParams.get('q'), 'cat eyes')
  assert.equal(u.searchParams.get('offset'), '24')
})

test('http errors map to user messages', () => {
  assert.equal(failureFor(401), 'badKey')
  assert.equal(failureFor(403), 'badKey')
  assert.equal(failureFor(429), 'limit')
  assert.equal(failureFor(500), 'network')
})

test('hit prefers a small original, else downsized', () => {
  const images = {
    original: { url: 'o', size: '5000000' },
    downsized: { url: 'd', size: '900000' },
    fixed_width_small: { url: 't' },
  }
  assert.deepEqual(hitFrom({ id: '1', title: 'x', images }), { id: '1', title: 'x', thumb: 't', gif: 'd' })
  assert.equal(hitFrom({ id: '2', title: '', images: { ...images, original: { url: 'o', size: '10' } } })?.gif, 'o')
  assert.equal(hitFrom({ id: '3', title: '', images: {} }), undefined)
})
