const BASE = '/api'

export async function fetchWilayas() {
  const res = await fetch(`${BASE}/wilayas/`)
  if (!res.ok) throw new Error('Impossible de charger les wilayas')
  return res.json()
}

export async function fetchDomains(bacStream) {
  const res = await fetch(`${BASE}/domains/?bac_stream=${bacStream}`)
  if (!res.ok) throw new Error('Impossible de charger les domaines')
  return res.json()
}

export async function fetchRecommendations(payload) {
  const res = await fetch(`${BASE}/recommend/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(JSON.stringify(err))
  }
  return res.json()
}

export async function searchEntries(query) {
  const res = await fetch(`${BASE}/search/?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('Search failed')
  return res.json()
}