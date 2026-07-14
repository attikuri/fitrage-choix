import { useEffect, useRef } from 'react'

/**
 * Reusable bottom sheet.
 * Props:
 *   open      — boolean
 *   onClose   — fn
 *   title     — string
 *   children  — content
 *   maxHeight — CSS value (default '85vh')
 */
export default function BottomSheet({ open, onClose, title, children, maxHeight = '85vh' }) {
  const sheetRef = useRef(null)

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          backgroundColor: 'rgba(0,0,0,0.5)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
          backgroundColor: 'var(--color-surface)',
          borderRadius: '20px 20px 0 0',
          maxHeight,
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
        }}
      >
        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--color-border)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 20px 12px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>{title}</p>
          <button onClick={onClose} style={{
            width: '30px', height: '30px', borderRadius: '50%',
            border: 'none', backgroundColor: 'var(--color-surface-2)',
            cursor: 'pointer', fontSize: '16px', color: 'var(--color-text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px 32px' }}>
          {children}
        </div>
      </div>
    </>
  )
}