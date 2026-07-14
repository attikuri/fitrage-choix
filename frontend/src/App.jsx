import { useState, useEffect } from 'react'
import ProfileScreen from './screens/ProfileScreen'
import DomainsScreen from './screens/DomainsScreen'
import ResultsScreen from './screens/ResultsScreen'
import { LANGS, t } from './i18n'
import { useIsMobile } from './hooks/useIsMobile'

const STEPS = ['stepProfile', 'stepDomains', 'stepResults']

export default function App() {
  const [step, setStep]       = useState(0)
  const [profile, setProfile] = useState(null)
  const [results, setResults] = useState(null)
  const [lang, setLang]       = useState('fr')
  const [dark, setDark]       = useState(false)
  const isMobile              = useIsMobile()

  useEffect(() => {
    document.documentElement.dir  = LANGS[lang].dir
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  const tr = (key, ...args) => t(lang, key, ...args)

  // Cycle through languages on mobile (single button)
  const langCodes = Object.keys(LANGS)
  const cycleLang = () => {
    const next = langCodes[(langCodes.indexOf(lang) + 1) % langCodes.length]
    setLang(next)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-surface)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: '900px', margin: '0 auto',
          padding: isMobile ? '0 16px' : '0 20px',
          height: isMobile ? '52px' : '56px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: isMobile ? '15px' : '16px', letterSpacing: '-0.02em' }}>
              filtrage<span style={{ color: 'var(--color-accent)' }}>·</span>choix
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
            {/* Step dots */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{
                  height: '5px', borderRadius: '3px',
                  width: i === step ? '18px' : '5px',
                  backgroundColor: i <= step ? 'var(--color-accent)' : 'var(--color-border)',
                  transition: 'all 0.3s ease',
                }} />
              ))}
            </div>

            {/* Dark mode */}
            <button onClick={() => setDark(p => !p)} style={{
              width: isMobile ? '30px' : '32px',
              height: isMobile ? '30px' : '32px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-2)',
              cursor: 'pointer', fontSize: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {dark ? '☀️' : '🌙'}
            </button>

            {/* Language — single cycle button on mobile, full switcher on desktop */}
            {isMobile ? (
              <button onClick={cycleLang} style={{
                padding: '5px 12px', borderRadius: '8px', border: 'none',
                backgroundColor: 'var(--color-accent)', color: '#fff',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>
                {LANGS[lang].label}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '2px', padding: '3px', borderRadius: '10px', backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                {Object.entries(LANGS).map(([code, meta]) => (
                  <button key={code} onClick={() => setLang(code)} style={{
                    padding: '4px 10px', borderRadius: '7px',
                    fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer',
                    transition: 'all 0.15s',
                    backgroundColor: lang === code ? 'var(--color-accent)' : 'transparent',
                    color: lang === code ? '#fff' : 'var(--color-text-muted)',
                  }}>
                    {meta.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{
        maxWidth: '900px', margin: '0 auto',
        padding: isMobile ? '24px 16px 80px' : '40px 20px', // bottom padding for sticky bar
      }}>
        {step === 0 && <ProfileScreen lang={lang} tr={tr} isMobile={isMobile} onNext={(d) => { setProfile(d); setStep(1) }} />}
        {step === 1 && <DomainsScreen lang={lang} tr={tr} profile={profile} isMobile={isMobile} onBack={() => setStep(0)} onNext={(d) => { setResults(d); setStep(2) }} />}
        {step === 2 && <ResultsScreen lang={lang} tr={tr} results={results} profile={profile} isMobile={isMobile} onBack={() => setStep(1)} onReset={() => { setStep(0); setProfile(null); setResults(null) }} />}
      </main>
    </div>
  )
}