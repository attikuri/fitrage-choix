import { useState } from 'react'
import { DOMAIN_LABELS, DISCLAIMER, TOOL_DISCLAIMER } from '../i18n'
import { getFiliereLabel } from '../i18n/filiereLabels'
import { translateEtablissement } from '../i18n/establishmentLabels'
import BottomSheet from '../components/BottomSheet'

// ── Colour helpers (unchanged) ─────────────────────
function probColor(pct) {
  if (pct >= 75) return { text: 'var(--color-green)',  bg: 'var(--color-green-bg)'  }
  if (pct >= 50) return { text: 'var(--color-amber)',  bg: 'var(--color-amber-bg)'  }
  if (pct >= 25) return { text: 'var(--color-orange)', bg: 'var(--color-orange-bg)' }
  if (pct > 0)   return { text: 'var(--color-red)',    bg: 'var(--color-red-bg)'    }
  return           { text: 'var(--color-text-muted)', bg: 'var(--color-muted-bg)'  }
}

const TIER_COLOR = {
  garanti:   { text: 'var(--color-green)',  bg: 'var(--color-green-bg)'  },
  sur:       { text: 'var(--color-amber)',  bg: 'var(--color-amber-bg)'  },
  optimal:   { text: 'var(--color-orange)', bg: 'var(--color-orange-bg)' },
  ambitieux: { text: 'var(--color-red)',    bg: 'var(--color-red-bg)'    },
}
const TIER_KEY = { ambitieux: 'tierAmbitieux', optimal: 'tierOptimal', sur: 'tierSur', garanti: 'tierGaranti' }
const FORMULA_LABELS = {
  general: 'Moyenne générale', snv: '(Moy×2 + SVT) ÷ 3', sm: '(Moy×2 + (Phys+Maths)÷2) ÷ 3',
  mi: '(Moy×2 + Maths) ÷ 3', lang: '(Moy×2 + Langue) ÷ 3',
  trad: '(Moy×2 + 3 langues) ÷ 3', st_spec: '(Moy×2 + (Spéc+Maths)÷2) ÷ 3',
}

function domainLabel(lang, code, fallback) {
  return DOMAIN_LABELS[lang]?.[code] ?? fallback
}

function TierBadge({ tier, tr }) {
  const c = TIER_COLOR[tier] || { text: 'var(--color-text-muted)', bg: 'var(--color-muted-bg)' }
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px', backgroundColor: c.bg, color: c.text, whiteSpace: 'nowrap', flexShrink: 0, border: `1px solid ${c.text}22` }}>
      {tr(TIER_KEY[tier] || 'tierAmbitieux')}
    </span>
  )
}

function ProbBar({ pct }) {
  const c = probColor(pct)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: c.text, borderRadius: '2px', transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', width: '36px', textAlign: 'end', color: c.text }}>{pct}%</span>
    </div>
  )
}

function ResultCard({ r, isSelected, onClick, tr, lang }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'start', padding: '14px 16px', borderRadius: '12px',
      border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border)'}`,
      backgroundColor: isSelected ? 'var(--color-accent-soft)' : 'var(--color-surface)',
      cursor: 'pointer', transition: 'all 0.15s',
      boxShadow: isSelected ? '0 0 0 2px var(--color-accent)33' : '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {getFiliereLabel(lang, r.code_fil, r.filiere)}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {translateEtablissement(lang, r.etablissement)}
          </p>
        </div>
        <TierBadge tier={r.tier} tr={tr} />
      </div>
      <ProbBar pct={r.prob_pct} />
    </button>
  )
}

function DetailContent({ r, tr, lang, onClose }) {
  if (!r) return null
  const c = probColor(r.prob_pct)
  const pairs = r.years.map((y, i) => ({ year: y, cutoff: r.cutoffs[i] }))
  return (
    <div>
      {/* Title (filiere / etablissement) */}
      <div style={{ marginBottom: '16px' }}>
        <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{getFiliereLabel(lang, r.code_fil, r.filiere)}</p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-sec)' }}>{translateEtablissement(lang, r.etablissement)}</p>
      </div>

      {/* Big probability */}
      <div style={{ textAlign: 'center', padding: '20px', backgroundColor: c.bg, borderRadius: '14px', marginBottom: '20px' }}>
        <p style={{ fontSize: '56px', fontWeight: 400, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: c.text }}>
          {r.prob_pct}<span style={{ fontSize: '24px', color: c.text + '99' }}>%</span>
        </p>
        <p style={{ fontSize: '11px', color: c.text + 'BB', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{tr('chances')}</p>
        <p style={{ fontSize: '13px', color: c.text, marginTop: '4px', fontWeight: 500 }}>{r.prob_label}</p>
      </div>

      {/* Score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', padding: '10px 14px', backgroundColor: 'var(--color-surface-2)', borderRadius: '10px' }}>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{tr('yourScore')}</span>
        <span style={{ fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)' }}>{r.score.toFixed(2)}</span>
      </div>

      {/* Cutoffs */}
      <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>{tr('cutoffsTitle')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {pairs.map(({ year, cutoff }) => {
          const cleared = cutoff != null && r.score >= cutoff
          return (
            <div key={year} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', width: '36px', flexShrink: 0 }}>{year}</span>
              <div style={{ flex: 1, height: '3px', backgroundColor: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
                {cutoff && <div style={{ height: '100%', borderRadius: '2px', backgroundColor: cleared ? 'var(--color-green)' : 'var(--color-red)', width: `${Math.min((r.score / cutoff) * 100, 100)}%` }} />}
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', width: '38px', textAlign: 'end', flexShrink: 0, color: cutoff ? (cleared ? 'var(--color-green)' : 'var(--color-red)') : 'var(--color-border)' }}>
                {cutoff ? cutoff.toFixed(2) : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
        {[
          [tr('domain'), `${domainLabel(lang, r.domaine_code, r.domaine_label)} (${r.domaine_code})`],
          [tr('inscription'), r.type_inscription === 'national' ? tr('national') : tr('local')],
          [tr('priority'), r.priority],
          [tr('level'), <TierBadge tier={r.tier} tr={tr} />],
        ].map(([lbl, val]) => (
          <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{lbl}</span>
            <span style={{ color: 'var(--color-text-sec)', textAlign: 'end' }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WishCardContent({ card, tr, lang }) {
  const [copied, setCopied] = useState(false)
  const text = card.map((r, i) => `${i + 1}. ${translateEtablissement(lang, r.etablissement)} — ${getFiliereLabel(lang, r.code_fil, r.filiere)}`).join('\n')
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button onClick={copy} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--color-accent)', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
          {copied ? tr('copied') : tr('copy')}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {card.map((r, i) => {
          const c = probColor(r.prob_pct)
          return (
            <div key={`${r.code_etb}-${r.code_fil}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0', borderBottom: i < card.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
              <span style={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)', width: '20px', flexShrink: 0, paddingTop: '1px' }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{getFiliereLabel(lang, r.code_fil, r.filiere)}</p>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{translateEtablissement(lang, r.etablissement)}</p>
              </div>
              <div style={{ textAlign: 'end', flexShrink: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.text }}>{r.prob_pct}%</p>
                <TierBadge tier={r.tier} tr={tr} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScorePanel({ scores, tr, lang }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(null)
  const entries = Object.entries(scores)
  const activeInfo = active ? scores[active] : null
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => { setOpen(p => !p); setActive(null) }}
          style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {tr('scoreFor')} {open ? '▴' : '▾'}
        </button>
        {entries.map(([code, info]) => {
          const isActive = active === code
          return (
            <button key={code} onClick={() => { setOpen(true); setActive(isActive ? null : code) }}
              style={{ fontSize: '12px', fontWeight: 500, padding: '4px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', backgroundColor: isActive ? 'var(--color-accent)' : 'var(--color-surface-2)', color: isActive ? '#fff' : 'var(--color-text-sec)' }}>
              {code} · {info.score.toFixed(2)}
            </button>
          )
        })}
      </div>
      {open && (
        <div style={{ marginTop: '10px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {!activeInfo ? (
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center' }}>{tr('selectToDetail')}</p>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{domainLabel(lang, active, activeInfo.label)}</p>
              <p style={{ fontSize: '44px', fontWeight: 400, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)' }}>
                {activeInfo.score.toFixed(2)}<span style={{ fontSize: '18px', color: 'var(--color-text-muted)' }}> / 20</span>
              </p>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px', fontStyle: 'italic' }}>{FORMULA_LABELS[activeInfo.formula_type] || activeInfo.formula_type}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ResultsScreen({ lang, tr, results, profile, isMobile, onBack, onReset }) {
  const [selected, setSelected]       = useState(null)
  const [detailOpen, setDetailOpen]   = useState(false)
  const [wishOpen, setWishOpen]       = useState(false)
  const { all_results, wish_card, meta, warnings } = results

  const handleCardClick = (r) => {
    const isSame = selected?.code_fil === r.code_fil && selected?.code_etb === r.code_etb
    if (isSame && !isMobile) {
      setSelected(null)
    } else {
      setSelected(isSame ? null : r)
      if (isMobile) setDetailOpen(true)
    }
  }

  return (
    <div style={{ maxWidth: '100%', overflowX: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 500, marginBottom: '4px' }}>{tr('resultsTitle')}</h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-sec)' }}>{tr('resultsSub', meta.total_results)}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onBack} style={{ fontSize: '13px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>{tr('backDomains')}</button>
          <button onClick={onReset} style={{ fontSize: '13px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>{tr('restart')}</button>
        </div>
      </div>

      {/* Tool disclaimer */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 14px', marginBottom: '16px', backgroundColor: 'var(--color-amber-bg)', border: '1px solid var(--color-amber)', borderRadius: '12px' }}>
        <span style={{ fontSize: '16px', flexShrink: 0 }}>💡</span>
        <p style={{ fontSize: '12px', color: 'var(--color-amber)', lineHeight: 1.6 }}>{TOOL_DISCLAIMER[lang] || TOOL_DISCLAIMER.fr}</p>
      </div>

      {/* Warnings */}
      {warnings?.length > 0 && (
        <div style={{ backgroundColor: 'var(--color-amber-bg)', border: '1px solid var(--color-amber)', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px' }}>
          {warnings.map((w, i) => <p key={i} style={{ fontSize: '13px', color: 'var(--color-amber)' }}>{w}</p>)}
        </div>
      )}

      <ScorePanel scores={meta.effective_scores} tr={tr} lang={lang} />

      {isMobile ? (
        // ── MOBILE: full-width card list only ────────────────
        <>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>{tr('allOptions')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {all_results.map(r => (
              <ResultCard
                key={`${r.code_etb}-${r.code_fil}-${r.wilaya_cible}`}
                r={r} tr={tr} lang={lang}
                isSelected={selected?.code_fil === r.code_fil && selected?.code_etb === r.code_etb}
                onClick={() => handleCardClick(r)}
              />
            ))}
          </div>

          {/* Data disclaimer */}
          <div style={{ marginTop: '24px', padding: '12px 14px', backgroundColor: 'var(--color-surface-2)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>⚠️ {DISCLAIMER[lang] || DISCLAIMER.fr}</p>
          </div>

          {/* Sticky bottom bar */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'center',
            backgroundColor: 'var(--color-surface)',
            borderTop: '1px solid var(--color-border)',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
          }}>
            {/* Detail button — only when a card is selected */}
            {selected && (
              <button onClick={() => setDetailOpen(true)} style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: `1px solid var(--color-accent)`,
                backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>
                {lang === 'ar' ? 'التفاصيل' : lang === 'en' ? 'Details' : 'Détail'} · {selected.prob_pct}%
              </button>
            )}

            {/* Wish card button */}
            <button onClick={() => setWishOpen(true)} style={{
              flex: selected ? 1 : 'auto',
              width: selected ? 'auto' : '100%',
              padding: '12px 20px', borderRadius: '10px', border: 'none',
              backgroundColor: 'var(--color-accent)', color: '#fff',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}>
              {lang === 'ar' ? `قائمة الرغبات · ${wish_card.length}` : lang === 'en' ? `My list · ${wish_card.length}` : `Ma liste · ${wish_card.length}`}
            </button>
          </div>

          {/* Detail bottom sheet */}
          <BottomSheet
            open={detailOpen}
            onClose={() => setDetailOpen(false)}
            title={selected ? getFiliereLabel(lang, selected.code_fil, selected.filiere) : ''}
          >
            <DetailContent r={selected} tr={tr} lang={lang} />
          </BottomSheet>

          {/* Wish card bottom sheet */}
          <BottomSheet
            open={wishOpen}
            onClose={() => setWishOpen(false)}
            title={tr('wishCard')}
          >
            <WishCardContent card={wish_card} tr={tr} lang={lang} />
          </BottomSheet>
        </>
      ) : (
        // ── DESKTOP: side-by-side grid ────────────────────────
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px' }} className="results-grid">
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '12px' }}>{tr('allOptions')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {all_results.map(r => (
                  <ResultCard
                    key={`${r.code_etb}-${r.code_fil}-${r.wilaya_cible}`}
                    r={r} tr={tr} lang={lang}
                    isSelected={selected?.code_fil === r.code_fil && selected?.code_etb === r.code_etb}
                    onClick={() => handleCardClick(r)}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Desktop detail panel */}
              <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                {selected
                  ? <DetailContent r={selected} tr={tr} lang={lang} onClose={() => setSelected(null)} />
                  : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--color-text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>{tr('selectToDetail')}</div>
                }
              </div>

              {/* Desktop wish card */}
              <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 600 }}>{tr('wishCard')}</p>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{tr('wishCardSub', wish_card.length)}</p>
                  </div>
                </div>
                <div style={{ padding: '4px 16px 8px' }}>
                  <WishCardContent card={wish_card} tr={tr} lang={lang} />
                </div>
              </div>
            </div>
          </div>

          {/* Data disclaimer */}
          <div style={{ marginTop: '32px', padding: '12px 16px', backgroundColor: 'var(--color-surface-2)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>⚠️ {DISCLAIMER[lang] || DISCLAIMER.fr}</p>
          </div>
        </>
      )}

      <style>{`
        @media (min-width: 900px) {
          .results-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 360px) !important; }
        }
      `}</style>
    </div>
  )
}