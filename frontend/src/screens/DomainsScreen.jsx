import { useState, useEffect } from 'react'
import { fetchDomains, fetchRecommendations } from '../api'
import { DOMAIN_LABELS } from '../i18n'
import SearchPanel from '../components/SearchPanel'

const LITERARY_STREAMS = ['LL', 'LAL', 'ART', 'GE']

// ── Domain groups ──────────────────────────────────
const GROUPS = [
  { key: 'all',    labelFr: 'Tous',                  labelEn: 'All',               labelAr: 'الكل',               prefixes: null },
  { key: 'tech',   labelFr: 'Sciences & Tech',       labelEn: 'Science & Tech',    labelAr: 'علوم وتقنية',         prefixes: ['A'] },
  { key: 'mi',     labelFr: 'Maths & Info',          labelEn: 'Maths & CS',        labelAr: 'رياضيات وإعلام آلي', prefixes: ['B','C'] },
  { key: 'bio',    labelFr: 'Nature & Vie',          labelEn: 'Life Sciences',     labelAr: 'علوم الطبيعة',        prefixes: ['D','E'] },
  { key: 'med',    labelFr: 'Médecine & Santé',      labelEn: 'Medicine & Health', labelAr: 'طب وصحة',            prefixes: ['P','W','X'] },
  { key: 'law',    labelFr: 'Droit & Sciences Po',   labelEn: 'Law & Politics',    labelAr: 'حقوق وعلوم سياسية', prefixes: ['G'] },
  { key: 'eco',    labelFr: 'Économie & Gestion',    labelEn: 'Economics',         labelAr: 'اقتصاد وتسيير',      prefixes: ['F'] },
  { key: 'lang',   labelFr: 'Langues',               labelEn: 'Languages',         labelAr: 'لغات',               prefixes: ['H'] },
  { key: 'shs',    labelFr: 'Sciences Humaines',     labelEn: 'Humanities',        labelAr: 'علوم إنسانية',       prefixes: ['I'] },
  { key: 'arch',   labelFr: 'Architecture',          labelEn: 'Architecture',      labelAr: 'هندسة معمارية',      prefixes: ['N'] },
  { key: 'arts',   labelFr: 'Arts & Lettres',        labelEn: 'Arts & Literature', labelAr: 'فنون وآداب',         prefixes: ['K','L','M'] },
  { key: 'sport',  labelFr: 'Sport',                 labelEn: 'Sport',             labelAr: 'رياضة',              prefixes: ['J'] },
]

function groupLabel(g, lang) {
  if (lang === 'ar') return g.labelAr
  if (lang === 'en') return g.labelEn
  return g.labelFr
}

function matchesGroup(code, group) {
  if (!group.prefixes) return true
  return group.prefixes.some(p => code.startsWith(p))
}

export default function DomainsScreen({ lang, tr, profile, isMobile, onBack, onNext }) {
  const [mode, setMode]               = useState('browse') // 'browse' | 'search'
  const [domains, setDomains]         = useState([])
  const [selected, setSelected]       = useState([])
  const [activeGroup, setActiveGroup] = useState('all')
  const [includeTeaching, setTeaching]= useState(false)
  const [loading, setLoading]         = useState(true)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState(null)

  useEffect(() => {
    fetchDomains(profile.bac_stream)
      .then(d => { setDomains(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [profile.bac_stream])

  const toggle = code => setSelected(p => p.includes(code) ? p.filter(c => c !== code) : [...p, code])
  const remove = code => setSelected(p => p.filter(c => c !== code))

  const currentGroup = GROUPS.find(g => g.key === activeGroup) || GROUPS[0]
  const visibleDomains = domains.filter(d => matchesGroup(d.domaine_code, currentGroup))

  // Only show groups that have at least 1 domain available for this stream
  const availableGroups = GROUPS.filter(g =>
    g.key === 'all' || domains.some(d => matchesGroup(d.domaine_code, g))
  )

  const handleSubmit = async () => {
    if (!selected.length) return
    setSubmitting(true); setError(null)
    try {
      const data = await fetchRecommendations({ ...profile, domain_codes: selected, include_teaching: includeTeaching })
      onNext(data)
    } catch (e) { setError(e.message); setSubmitting(false) }
  }

  const showHint = LITERARY_STREAMS.includes(profile.bac_stream) && selected.length < 4

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>

      {/* Heading */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 500, marginBottom: '6px' }}>{tr('domainsTitle')}</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-sec)', lineHeight: 1.6 }}>{tr('domainsSub', profile.bac_stream)}</p>
        </div>
        <button onClick={onBack} style={{ fontSize: '13px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', background: 'none', border: 'none', cursor: 'pointer' }}>
          {tr('backDomains')}
        </button>
      </div>

      {/* Mode switcher */}
      <div style={{ display: 'flex', gap: '4px', padding: '4px', borderRadius: '12px', backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', marginBottom: '24px', width: 'fit-content' }}>
        {[
          { key: 'browse', labelFr: 'Choisir mes domaines', labelEn: 'Choose my fields',    labelAr: 'اختيار الميادين' },
          { key: 'search', labelFr: 'Recherche libre',      labelEn: 'Free search',          labelAr: 'بحث حر' },
        ].map(m => (
          <button key={m.key} onClick={() => setMode(m.key)}
            style={{
              padding: '7px 16px', borderRadius: '9px', border: 'none',
              fontSize: '13px', fontWeight: mode === m.key ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.15s',
              backgroundColor: mode === m.key ? 'var(--color-accent)' : 'transparent',
              color: mode === m.key ? '#fff' : 'var(--color-text-sec)',
            }}>
            {lang === 'ar' ? m.labelAr : lang === 'en' ? m.labelEn : m.labelFr}
          </button>
        ))}
      </div>

      {/* Search mode */}
      {mode === 'search' && <SearchPanel lang={lang} tr={tr} profile={profile} isMobile={isMobile} />}

      {/* Browse mode */}
      {mode === 'browse' && loading && <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Chargement…</p>}
      {mode === 'browse' && error && <p style={{ color: 'var(--color-red)', fontSize: '14px' }}>{error}</p>}

      {mode === 'browse' && !loading && (
        <>
          {/* Hint */}
          {showHint && (
            <div style={{ backgroundColor: 'var(--color-amber-bg)', border: '1px solid var(--color-amber)', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--color-amber)', lineHeight: 1.5 }}>💡 {tr('hintLiterary')}</p>
            </div>
          )}

          {/* Selected chips */}
          {selected.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {tr('selected', selected.length)}
                </span>
                {selected.map(code => {
                  const d = domains.find(x => x.domaine_code === code)
                  const label = DOMAIN_LABELS[lang]?.[code] ?? d?.domaine_label ?? code
                  // Truncate label to ~18 chars for chips
                  const short = label.length > 18 ? label.slice(0, 17) + '…' : label
                  return (
                    <button key={code} onClick={() => remove(code)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '3px 10px', borderRadius: '20px', border: 'none',
                        backgroundColor: 'var(--color-accent)', color: '#fff',
                        fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                        transition: 'opacity 0.15s',
                      }}>
                      {short} <span style={{ opacity: 0.7, fontSize: '13px', lineHeight: 1 }}>×</span>
                    </button>
                  )
                })}
                <button onClick={() => setSelected([])}
                  style={{ fontSize: '11px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px', marginInlineStart: '4px' }}>
                  {tr('selectNone')}
                </button>
              </div>
            </div>
          )}

          {/* Category tabs */}
          <div style={{
  display: 'flex', gap: '6px',
  flexWrap: isMobile ? 'nowrap' : 'wrap',
  overflowX: isMobile ? 'auto' : 'visible',
  marginBottom: '16px', paddingBottom: '16px',
  borderBottom: '1px solid var(--color-border)',
  scrollbarWidth: 'none',
  WebkitOverflowScrolling: 'touch',
}}>
            {availableGroups.map(g => {
              const isActive = activeGroup === g.key
              const groupSelected = g.key === 'all'
                ? selected.length
                : domains.filter(d => matchesGroup(d.domaine_code, g) && selected.includes(d.domaine_code)).length
              return (
                <button key={g.key} onClick={() => setActiveGroup(g.key)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', border: 'none',
                    fontSize: '12px', fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                    backgroundColor: isActive ? 'var(--color-accent)' : 'var(--color-surface-2)',
                    color: isActive ? '#fff' : 'var(--color-text-sec)',
                    position: 'relative',
                    flexShrink: 0,
whiteSpace: 'nowrap',
                  }}>
                  {groupLabel(g, lang)}
                  {groupSelected > 0 && !isActive && (
                    <span style={{
                      position: 'absolute', top: '-4px', insetInlineEnd: '-4px',
                      width: '16px', height: '16px', borderRadius: '50%',
                      backgroundColor: 'var(--color-accent)', color: '#fff',
                      fontSize: '9px', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {groupSelected}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Domain grid — only current group */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '8px', marginBottom: '20px',
          }}>
            {visibleDomains.length === 0 && (
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', gridColumn: '1/-1' }}>
                Aucun domaine dans cette catégorie pour votre filière.
              </p>
            )}
            {visibleDomains.map(d => {
              const isOn = selected.includes(d.domaine_code)
              const label = DOMAIN_LABELS[lang]?.[d.domaine_code] ?? d.domaine_label
              return (
                <button key={d.domaine_code} onClick={() => toggle(d.domaine_code)}
                  style={{
                    textAlign: 'start', padding: '14px 16px', borderRadius: '12px',
                    border: `2px solid ${isOn ? 'var(--color-accent)' : 'transparent'}`,
                    backgroundColor: isOn ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                    color: 'var(--color-text)',
                    cursor: 'pointer', transition: 'all 0.15s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px', marginBottom: '4px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.3, color: 'var(--color-text)' }}>{label}</p>
                    {isOn && <span style={{ color: 'var(--color-accent)', fontSize: '14px', flexShrink: 0 }}>✓</span>}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {d.domaine_code}{d.priority ? ` · ${tr('priorityLabel', d.priority)}` : ''}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Teaching toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: '12px', padding: '14px 16px', marginBottom: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 500 }}>{tr('teachingToggle')}</p>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{tr('teachingToggleSub')}</p>
            </div>
            <button onClick={() => setTeaching(p => !p)} style={{
              width: '44px', height: '24px', borderRadius: '12px', border: 'none',
              backgroundColor: includeTeaching ? 'var(--color-accent)' : 'var(--color-border)',
              cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background-color 0.2s',
            }}>
              <span style={{
                position: 'absolute', top: '3px', width: '18px', height: '18px',
                backgroundColor: '#fff', borderRadius: '50%',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                insetInlineStart: includeTeaching ? '23px' : '3px',
                transition: 'inset-inline-start 0.2s',
              }} />
            </button>
          </div>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!selected.length || submitting}
            style={{
              width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
              backgroundColor: selected.length && !submitting ? 'var(--color-accent)' : 'var(--color-border)',
              color: selected.length && !submitting ? '#fff' : 'var(--color-text-muted)',
              fontSize: '14px', fontWeight: 500,
              cursor: selected.length && !submitting ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.15s',
            }}>
            {submitting ? tr('generating') : `${tr('btnGenerate')} →`}
          </button>
        </>
      )}
      <style>{`.tabs-no-scroll::-webkit-scrollbar { display: none; }`}</style>
    </div>
  )
}