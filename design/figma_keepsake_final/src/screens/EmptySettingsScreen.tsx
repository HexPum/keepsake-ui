import { useState } from 'react'
import NetCanvas from '../components/NetCanvas'

type SettingToggle = { label: string; key: string; value: boolean }

export default function EmptySettingsScreen({ onToggleEmpty }: { onToggleEmpty: () => void }) {
  const [density, setDensity] = useState<'dense' | 'roomy'>('dense')
  const [settings, setSettings] = useState<SettingToggle[]>([
    { label: 'Summarise on save', key: 'summarise', value: true },
    { label: 'Watch clipboard for links', key: 'clipboard', value: true },
    { label: 'Swipe actions on rows', key: 'swipe', value: false },
  ])

  const toggle = (key: string) =>
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value: !s.value } : s)))

  return (
    <div style={{ animation: 'fadeIn 0.25s ease' }}>
      {/* Hero with net */}
      <div style={{ position: 'relative', height: 260, background: 'var(--bg)', overflow: 'hidden' }}>
        <NetCanvas height={260} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(to bottom, transparent, var(--bg))' }} />
        <div style={{ position: 'absolute', bottom: 28, left: 20, right: 20 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 8 }}>
            // queue_empty
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>Nothing left to read.</h2>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Share a link from any app, or tap <strong style={{ color: 'var(--text)' }}>+</strong> — the sheet closes the moment you save.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', margin: '0 0 6px' }}>
        {[
          { value: '24', label: 'items_saved' },
          { value: '1.9s', label: 'avg_save_time' },
          { value: '96%', label: 'summarised' },
          { value: '6', label: 'lists_active' },
        ].map((stat, i) => (
          <div
            key={stat.label}
            style={{
              padding: '18px 20px',
              borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
              borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--mono)', lineHeight: 1, marginBottom: 4 }}>{stat.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.05em' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Settings */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 14 }}>// settings</div>

        <div style={{ background: 'var(--card)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {settings.map((s, i) => (
            <div
              key={s.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 18px',
                borderBottom: i < settings.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span style={{ fontSize: 15, color: 'var(--text)' }}>{s.label}</span>
              <Toggle value={s.value} onChange={() => toggle(s.key)} />
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 15, color: 'var(--text)' }}>Density</span>
            <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 2, border: '1px solid var(--border2)' }}>
              {(['dense', 'roomy'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: density === d ? 'var(--accent)' : 'transparent',
                    color: density === d ? '#1a1a1a' : 'var(--text-muted)',
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: density === d ? 600 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={onToggleEmpty}
          style={{
            marginTop: 20,
            width: '100%',
            padding: '13px',
            borderRadius: 12,
            border: '1px solid var(--accent)',
            background: 'var(--accent-glow)',
            color: 'var(--accent)',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          populate_queue →
        </button>
      </div>

      <div style={{ height: 20 }} />
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 50,
        height: 28,
        borderRadius: 14,
        background: value ? 'var(--accent)' : 'var(--surface)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: value ? 25 : 3,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: value ? '#1a1a1a' : 'var(--text-faint)',
          transition: 'left 0.2s',
        }}
      />
    </button>
  )
}
