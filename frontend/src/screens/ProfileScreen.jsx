import { useState, useEffect } from 'react'
import { fetchWilayas } from '../api'
import { WILAYA_NAMES, TR_SPEC_LABELS } from '../i18n'

const BAC_STREAMS = (tr) => [
  { value: 'SM',  label: tr('streamM')  },
  { value: 'SE',  label: tr('streamSE')  },
  { value: 'TR',  label: tr('streamTM')  },
  { value: 'GE',  label: tr('streamGE')  },
  { value: 'LL',  label: tr('streamLL')  },
  { value: 'LAL', label: tr('streamLAL') },
  { value: 'ART', label: tr('streamART') },
]

const TR_SPECIALITES = (lang) => {
  const labels = TR_SPEC_LABELS[lang] || TR_SPEC_LABELS.fr
  return [
    { value: 'genie_civil',        label: labels.genie_civil        },
    { value: 'genie_procedes',     label: labels.genie_procedes     },
    { value: 'genie_mecanique',    label: labels.genie_mecanique    },
    { value: 'genie_electronique', label: labels.genie_electronique },
  ]
}

const GRADE_FIELDS = {
  SM:  [
    { key: 'maths',    labelKey: 'gradeMaths'    },
    { key: 'physique', labelKey: 'gradePhysique' },
    { key: 'svt',      labelKey: 'gradeSVT'      },
  ],
  SE:  [
    { key: 'svt',      labelKey: 'gradeSVT'      },
    { key: 'physique', labelKey: 'gradePhysique' },
    { key: 'maths',    labelKey: 'gradeMaths'     },
  ],
  TR:  [
    { key: 'specialite', labelKey: 'gradeSpec'     },
    { key: 'maths',      labelKey: 'gradeMaths'    },
    { key: 'physique',   labelKey: 'gradePhysique' },
  ],
  LL:  [{ key: 'langue', labelKey: 'gradeLangue' }],
  GE:  [],
  LAL: [], // we need arabic language here, i guess?
  ART: [],
}


function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-sec)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function StyledInput({ value, onChange, placeholder, min, max, step, inputStyle }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min} max={max} step={step}
      style={{ ...inputStyle, borderColor: focused ? 'var(--color-accent)' : 'var(--color-border)' }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}

function StyledSelect({ value, onChange, options, placeholder, inputStyle }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer', borderColor: focused ? 'var(--color-accent)' : 'var(--color-border)' }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span style={{ position: 'absolute', insetInlineEnd: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-muted)', fontSize: '11px' }}>▾</span>
    </div>
  )
}


export default function ProfileScreen({ lang, tr, isMobile, onNext }) {
  const [wilayas, setWilayas] = useState([])
  const [loading, setLoading] = useState(true)
  const [stream, setStream]   = useState('')
  const [wilaya, setWilaya]   = useState('')
  const [moyenne, setMoyenne] = useState('')
  const [grades, setGrades]   = useState({})

  const inputStyle = {
    width: '100%',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    padding: isMobile ? '13px 14px' : '10px 14px',
    fontSize: isMobile ? '16px' : '14px',   // 16px prevents iOS zoom on focus
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    outline: 'none',
    transition: 'border-color 0.15s',
    appearance: 'none',
    WebkitAppearance: 'none',
  }

  useEffect(() => {
    fetchWilayas().then(d => { setWilayas(d); setLoading(false) })
  }, [])

  const setGrade = (key, val) => setGrades(p => ({ ...p, [key]: val }))
  const gradeFields = GRADE_FIELDS[stream] || []
  const isValid = stream && wilaya && moyenne && Number(moyenne) >= 0 && Number(moyenne) <= 20

  const handleSubmit = () => {
    if (!isValid) return
    const gradesClean = {}
    gradeFields.forEach(({ key }) => {
      gradesClean[key] = grades[key] ? Number(grades[key]) : null
    })
    onNext({ bac_stream: stream, wilaya, moyenne: Number(moyenne), grades: gradesClean })
  }



  return (
    <div style={{ maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 500, marginBottom: '6px' }}>{tr('profileTitle')}</h1>
        <p style={{ fontSize: '14px', color: 'var(--color-text-sec)', lineHeight: 1.6 }}>{tr('profileSub')}</p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Chargement…</p>
      ) : (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '16px', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {/* Stream */}
          <Field label={tr('fieldStream')}>
            <StyledSelect
              inputStyle={inputStyle}
              value={stream}
              onChange={v => { setStream(v); setGrades({}) }}
              options={BAC_STREAMS(tr)}
              placeholder={tr('placeholderStream')}
            />
          </Field>

          {/* TR specialité */}
          {stream === 'TR' && (
            <Field label={tr('fieldSpec')}>
              <StyledSelect
                inputStyle={inputStyle}
                value={grades.specialite_track || ''}
                onChange={v => setGrade('specialite_track', v)}
                options={TR_SPECIALITES(lang)}
                placeholder={tr('placeholderSpec')}
              />
            </Field>
          )}

          {/* Wilaya */}
          <Field label={tr('fieldWilaya')}>
            <StyledSelect
              inputStyle={inputStyle}
              value={wilaya}
              onChange={setWilaya}
              options={wilayas.map(w => ({ value: w, label: lang === 'ar' ? (WILAYA_NAMES[w] || w) : w }))}
              placeholder={tr('placeholderWilaya')}
            />
          </Field>

          {/* Moyenne */}
          <Field label={tr('fieldMoyenne')}>
            <StyledInput
              inputStyle={inputStyle}
              value={moyenne}
              onChange={setMoyenne}
              min={0} max={20} step={0.01}
              placeholder={tr('placeholderMoy')}
            />
          </Field>

          {/* Grade fields — shown for SM, SE, TR, LL */}
          {gradeFields.length > 0 && (
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '14px' }}>
                {tr('fieldGrades')} — {tr('fieldGradesSub')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {gradeFields.map(({ key, labelKey }) => (
                  <Field key={key} label={tr(labelKey)}>
                    <StyledInput
                      inputStyle={inputStyle}
                      value={grades[key] || ''}
                      onChange={v => setGrade(key, v)}
                      min={0} max={20} step={0.25}
                      placeholder={tr('placeholderGrade')}
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
              backgroundColor: isValid ? 'var(--color-accent)' : 'var(--color-border)',
              color: isValid ? '#fff' : 'var(--color-text-muted)',
              fontSize: '14px', fontWeight: 500,
              cursor: isValid ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.15s', marginTop: '4px',
            }}
          >
            {tr('btnNext')} →
          </button>
        </div>
      )}
    </div>
  )
}