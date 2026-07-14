import { useState, useRef, useEffect } from 'react'
import { searchEntries } from '../api'
import { DISCLAIMER, getWilayaLabel } from '../i18n'
import { computeScoreForDomain, getFormulaType } from '../utils/computeScore'
import { getFiliereLabel } from '../i18n/filiereLabels'
import { translateEtablissement } from '../i18n/establishmentLabels'
import { searchWithArabicSupport } from '../i18n/searchTerms'

const FORMULA_LABELS = {
  general:  { fr: 'Moyenne générale',                 en: 'General average',             ar: 'المعدل العام' },
  snv:      { fr: '(Moy×2 + SVT) ÷ 3',                en: '(Avg×2 + Biology) ÷ 3',       ar: '(م×2 + علوم طبيعة) ÷ 3' },
  sm:       { fr: '(Moy×2 + (Phys+Maths)÷2) ÷ 3',     en: '(Avg×2 + (Phys+Maths)÷2) ÷ 3', ar: '(م×2 + (فيز+رياض)÷2) ÷ 3' },
  mi:       { fr: '(Moy×2 + Maths) ÷ 3',              en: '(Avg×2 + Maths) ÷ 3',         ar: '(م×2 + رياضيات) ÷ 3' },
  lang:     { fr: '(Moy×2 + Note langue) ÷ 3',        en: '(Avg×2 + Language) ÷ 3',      ar: '(م×2 + اللغة) ÷ 3' },
  st_spec:  { fr: '(Moy×2 + (Spéc+Maths)÷2) ÷ 3',     en: '(Avg×2 + (Spec+Maths)÷2) ÷ 3', ar: '(م×2 + (تخصص+رياض)÷2) ÷ 3' },
}

function useDebounce(fn, delay) {
  const timer = useRef(null)
  return (...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }
}

function CutoffRow({ year, min1, min2, min3, score }) {
  const cutoff = min1 ?? min2 ?? min3
  const cleared = cutoff != null && score != null && score >= cutoff
  const barColor = score != null
    ? (cleared ? 'var(--color-green)' : 'var(--color-red)')
    : 'var(--color-border)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', width: '36px', flexShrink: 0 }}>{year}</span>
      <div style={{ flex: 1, height: '3px', backgroundColor: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
        {cutoff && (
          <div style={{
            height: '100%', borderRadius: '2px', backgroundColor: barColor,
            width: score != null ? `${Math.min((score / cutoff) * 100, 100)}%` : '100%',
          }} />
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        {[min1, min2, min3].map((m, i) => m != null ? (
          <span key={i} style={{ fontSize: '11px', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)' }}>
            {['P1','P2','P3'][i]}: <strong style={{ color: score != null && score >= m ? 'var(--color-green)' : 'var(--color-text)' }}>{m.toFixed(2)}</strong>
          </span>
        ) : null)}
      </div>
    </div>
  )
}

// Extracted so it can render either as a side panel (desktop) or inline
// right under the clicked row, accordion-style (mobile).
function DomainDetail({ item, lang, displayScore, isWeighted, formulaLabel, generalLabel, weightedLabel, variant }) {
  const isInline = variant === 'inline'

  return (
    <div style={{
      backgroundColor: isInline ? 'var(--color-surface-2)' : 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: isInline ? '0 0 12px 12px' : '14px',
      borderTop: isInline ? 'none' : '1px solid var(--color-border)',
      padding: '18px',
      boxShadow: isInline ? 'none' : '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ marginBottom: '16px' }}>
        <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px', direction: lang === 'ar' ? 'rtl' : 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }}>{getFiliereLabel(lang, item.code_fil, item.filiere)}</p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-sec)', direction: lang === 'ar' ? 'rtl' : 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }}>{translateEtablissement(lang, item.etablissement)}</p>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px', direction: lang === 'ar' ? 'rtl' : 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }}>{getWilayaLabel(lang, item.wilaya)}</p>
      </div>

      {/* Effective score display for this domain */}
      {displayScore != null && (
        <div style={{ textAlign: 'center', padding: '14px', backgroundColor: 'var(--color-accent-soft)', borderRadius: '12px', marginBottom: '16px' }}>
          <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>
            {isWeighted ? weightedLabel : generalLabel}
          </p>
          <p style={{ fontSize: '36px', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)', lineHeight: 1 }}>
            {displayScore.toFixed(2)}
          </p>
          {isWeighted && formulaLabel && (
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', fontStyle: 'italic' }}>{formulaLabel}</p>
          )}
        </div>
      )}

      {/* Cutoffs */}
      <div style={{ marginBottom: '16px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
          {{ fr: 'Seuils d\'admission', en: 'Admission cutoffs', ar: 'حدود القبول' }[lang]}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {item.years.map((year, i) => (
            <CutoffRow key={year} year={year} min1={item.min1s[i]} min2={item.min2s[i]} min3={item.min3s[i]} score={displayScore} />
          ))}
        </div>
        <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
          {{ fr: 'P1: Priorité 1 · P2: Priorité 2 · P3: Priorité 3', en: 'P1: Priority 1 · P2: Priority 2 · P3: Priority 3', ar: 'P1: الأولوية 1 · P2: الأولوية 2 · P3: الأولوية 3' }[lang]}
        </p>
      </div>

      {/* Metadata tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
        {[
          item.domaine_code,
          item.type_etablissement,
          item.type_inscription === 'national'
            ? { fr: 'National', en: 'National', ar: 'وطني' }[lang]
            : { fr: 'Local', en: 'Local', ar: 'محلي' }[lang],
        ].map((tag, idx) => (
          <span key={idx} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function SearchPanel({ lang, tr, profile, isMobile }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [manualScore, setManualScore] = useState('')
  const [autoScore, setAutoScore]     = useState(null)

  // Auto-compute weighted score when a result is selected
  useEffect(() => {
    if (!selected || !profile?.moyenne) { setAutoScore(null); return }
    const computed = computeScoreForDomain(selected.domaine_code, profile.moyenne, profile.grades || {})
    setAutoScore(computed)
  }, [selected, profile])

  // displayScore: manual override first, then auto weighted, then raw moyenne
  const displayScore = manualScore !== ''
    ? Number(manualScore)
    : autoScore ?? (profile?.moyenne ? Number(profile.moyenne) : null)

  const formulaType  = selected ? getFormulaType(selected.domaine_code) : null
  const formulaLabel = formulaType ? (FORMULA_LABELS[formulaType]?.[lang] || FORMULA_LABELS[formulaType]?.fr) : null
  const isWeighted   = autoScore != null && profile?.moyenne && autoScore !== Number(profile.moyenne)

  const doSearch = useDebounce(async (q) => {
    if (q.length < 2) { setResults(null); return }
    setLoading(true)
    try {
      const data = await searchWithArabicSupport(searchEntries, q)
      setResults(data)
    } catch { setResults({ results: [], total: 0 }) }
    setLoading(false)
  }, 350)

  const handleInput = (v) => { setQuery(v); doSearch(v) }

  const generalLabel      = { fr: 'Moyenne générale', en: 'General average', ar: 'المعدل العام' }[lang]
  const weightedLabel     = { fr: 'Score pondéré',    en: 'Weighted score',  ar: 'المعدل الموزون' }[lang]
  const resetLabel        = { fr: 'réinitialiser',    en: 'reset',           ar: 'إعادة' }[lang]

  return (
    <div>
      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <input
          type="text" value={query} onChange={e => handleInput(e.target.value)}
          placeholder={{ fr: 'Rechercher un domaine ou une université…', en: 'Search for a major or university…', ar: 'ابحث عن تخصص أو جامعة…' }[lang]}
          style={{
            width: '100%', padding: '12px 16px 12px 44px',
            border: '1px solid var(--color-border)', borderRadius: '12px',
            backgroundColor: 'var(--color-surface)', color: 'var(--color-text)',
            fontSize: '14px', outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
        />
        {loading && <span style={{ position: 'absolute', insetInlineEnd: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '12px' }}>…</span>}
      </div>

      {/* Score row — shows auto-computed weighted score + manual override */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px',
        padding: '10px 14px', backgroundColor: 'var(--color-surface-2)',
        borderRadius: '10px', border: '1px solid var(--color-border)', flexWrap: 'wrap',
      }}>
        {/* Auto scores from profile */}
        {profile?.moyenne && (
          <div style={{ display: 'flex', gap: '16px', flex: 1, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{generalLabel}</p>
              <p style={{ fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Number(profile.moyenne).toFixed(2)}</p>
            </div>
            {isWeighted && (
              <div>
                <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                  {weightedLabel} {formulaLabel && <span style={{ fontStyle: 'italic', textTransform: 'none' }}>({formulaLabel})</span>}
                </p>
                <p style={{ fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)' }}>{autoScore.toFixed(2)}</p>
              </div>
            )}
          </div>
        )}

        {/* Manual override input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>

          {manualScore !== '' && (
            <button onClick={() => setManualScore('')}
              style={{ fontSize: '11px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              {resetLabel}
            </button>
          )}
        </div>
      </div>

      {/* Results list + detail panel */}
      {results && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: '12px' }} className="search-grid">

          {/* List */}
          <div>
            {results.results.length === 0 && (
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                {{ fr: 'Aucun résultat.', en: 'No results.', ar: 'لا نتائج.' }[lang]}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
              {results.results.map((r, i) => {
                const isSel = selected?.code_fil === r.code_fil && selected?.code_etb === r.code_etb && selected?.wilaya_cible === r.wilaya_cible
                return (
                  <div key={i}>
                    <button onClick={() => setSelected(isSel ? null : r)}
                      style={{
                        width: '100%',
                        textAlign: 'start', padding: '10px 14px',
                        borderRadius: isMobile && isSel ? '10px 10px 0 0' : '10px',
                        border: `1px solid ${isSel ? 'var(--color-accent)' : 'var(--color-border)'}`,
                        borderBottom: isMobile && isSel ? 'none' : undefined,
                        backgroundColor: isSel ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                        cursor: 'pointer', transition: 'all 0.12s',
                      }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr', textAlign: 'left' }}>
                        {getFiliereLabel(lang, r.code_fil, r.filiere)}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr', textAlign: 'left' }}>
                        {translateEtablissement(lang, r.etablissement)} · {getWilayaLabel(lang, r.wilaya)}
                      </p>
                    </button>

                    {/* Mobile: detail appears right below the clicked row */}
                    {isMobile && isSel && (
                      <div style={{ animation: 'searchDetailSlideDown 0.18s ease' }}>
                        <DomainDetail
                          item={r}
                          lang={lang}
                          displayScore={displayScore}
                          isWeighted={isWeighted}
                          formulaLabel={formulaLabel}
                          generalLabel={generalLabel}
                          weightedLabel={weightedLabel}
                          variant="inline"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {results.total > 50 && (
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                {results.total} {{ fr: 'résultats — affinez la recherche', en: 'results — refine your search', ar: 'نتيجة — أضف كلمات للتضييق' }[lang]}
              </p>
            )}
          </div>

          {/* Detail panel — desktop only (side-by-side); mobile renders inline above */}
          {!isMobile && selected && (
            <DomainDetail
              item={selected}
              lang={lang}
              displayScore={displayScore}
              isWeighted={isWeighted}
              formulaLabel={formulaLabel}
              generalLabel={generalLabel}
              weightedLabel={weightedLabel}
              variant="panel"
            />
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ marginTop: '24px', padding: '12px 16px', backgroundColor: 'var(--color-surface-2)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          ⚠️ {DISCLAIMER[lang] || DISCLAIMER.fr}
        </p>
      </div>

      <style>{`
        @media (min-width: 760px) {
          .search-grid { grid-template-columns: minmax(0,1fr) minmax(0,340px) !important; }
        }
        @keyframes searchDetailSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}