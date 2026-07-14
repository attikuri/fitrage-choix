import { DOMAIN_LABELS, WILAYA_NAMES } from '../i18n'
import { FILIERE_LABELS } from './filiereLabels'

/**
 * The backend only indexes the raw French CSV text (filiere/etablissement/
 * wilaya), so a query typed in Arabic never matches anything server-side —
 * there's no Arabic text there to match against. This resolves an Arabic
 * query to the French term(s) the backend *does* index, by matching it
 * against our own fr/ar translation dictionaries first.
 */

const ARABIC_RE = /[\u0600-\u06FF]/

function normalizeArabic(s) {
  return (s || '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // tashkeel + tatweel
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
}

// The backend indexes unaccented CSV text. FILIERE_LABELS.frSearch already
// holds the exact raw text for majors, but DOMAIN_LABELS.fr is our own
// hand-written *accented* French — strip accents before using it as a
// search term, or "Médecine" would fail to match "MEDECINE" server-side.
function stripAccents(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe')
}

// Built once, lazily, from the translation dictionaries already in the app.
let INDEX = null
function buildIndex() {
  const seen = new Set()
  const entries = []

  for (const code of Object.keys(FILIERE_LABELS)) {
    const { ar, frSearch } = FILIERE_LABELS[code]
    if (ar && frSearch && !seen.has(frSearch)) {
      seen.add(frSearch)
      entries.push({ fr: frSearch, arNorm: normalizeArabic(ar) })
    }
  }
  for (const code of Object.keys(DOMAIN_LABELS.ar || {})) {
    const ar = DOMAIN_LABELS.ar[code]
    const fr = DOMAIN_LABELS.fr?.[code]
    if (ar && fr && !seen.has(fr)) {
      const frTerm = stripAccents(fr)
      seen.add(fr)
      entries.push({ fr: frTerm, arNorm: normalizeArabic(ar) })
    }
  }
  for (const wilayaKey of Object.keys(WILAYA_NAMES)) {
    const ar = WILAYA_NAMES[wilayaKey]
    if (ar && !seen.has(wilayaKey)) {
      seen.add(wilayaKey)
      entries.push({ fr: wilayaKey, arNorm: normalizeArabic(ar) })
    }
  }

  INDEX = entries
}

const MAX_TERMS = 6

/**
 * Returns the list of French search terms to actually query the backend
 * with. For non-Arabic input this is just [query] (unchanged behaviour).
 * For Arabic input, it's the French terms whose Arabic label contains the
 * query — closest-length matches first — capped to MAX_TERMS. Returns []
 * if the query is Arabic but nothing in our dictionaries matches it (so the
 * caller can skip hitting the API with a query that can't possibly match).
 */
export function resolveSearchTerms(query) {
  const q = query.trim()
  if (!q) return []
  if (!ARABIC_RE.test(q)) return [q]

  if (!INDEX) buildIndex()
  const qNorm = normalizeArabic(q)
  if (!qNorm) return []

  const matches = INDEX.filter((e) => e.arNorm.includes(qNorm))
  matches.sort((a, b) => a.arNorm.length - b.arNorm.length)

  const terms = []
  const termsUpper = new Set()
  for (const m of matches) {
    const key = m.fr.toUpperCase()
    if (!termsUpper.has(key)) {
      termsUpper.add(key)
      terms.push(m.fr)
    }
    if (terms.length >= MAX_TERMS) break
  }
  return terms
}

/**
 * Runs searchEntries (or any (term) => Promise<{results, total}> function)
 * across every resolved term and merges/deduplicates the results.
 */
export async function searchWithArabicSupport(searchFn, query) {
  const terms = resolveSearchTerms(query)
  if (terms.length === 0) return { results: [], total: 0 }
  if (terms.length === 1) return searchFn(terms[0])

  const batches = await Promise.all(terms.map((t) => searchFn(t).catch(() => ({ results: [] }))))
  const merged = new Map()
  for (const batch of batches) {
    for (const r of batch.results || []) {
      const key = `${r.code_fil}-${r.code_etb}-${r.wilaya_cible}`
      if (!merged.has(key)) merged.set(key, r)
    }
  }
  const results = Array.from(merged.values())
  return { results, total: results.length }
}