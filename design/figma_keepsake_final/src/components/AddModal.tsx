import { useState } from 'react'

export default function AddModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = () => {
    if (!url.trim()) return
    setSaving(true)
    setTimeout(() => { setSaving(false); onClose() }, 900)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 100,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 430,
          background: 'var(--card)',
          borderRadius: '20px 20px 0 0',
          padding: '20px 20px 36px',
          animation: 'slideUp 0.25s ease',
          border: '1px solid var(--border2)',
          borderBottom: 'none',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border2)', margin: '0 auto 20px' }} />

        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.08em', marginBottom: 16 }}>// add_to_queue</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.8" style={{ width: 15, height: 15, flexShrink: 0 }}>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="paste a url…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 13 }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', opacity: 0.6 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)' }}>clipboard: arxiv.org/abs/2411.09009</span>
          <button
            onClick={() => setUrl('https://arxiv.org/abs/2411.09009')}
            style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            use
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={!url.trim() || saving}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 12,
            border: 'none',
            background: url.trim() ? 'var(--accent)' : 'var(--surface)',
            color: url.trim() ? '#1a1a1a' : 'var(--text-faint)',
            fontFamily: 'var(--mono)',
            fontSize: 13,
            fontWeight: 600,
            cursor: url.trim() ? 'pointer' : 'default',
            transition: 'all 0.2s',
            letterSpacing: '0.04em',
          }}
        >
          {saving ? 'saving…' : 'save →'}
        </button>
      </div>
    </div>
  )
}
