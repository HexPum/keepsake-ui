import { useState } from 'react'
import NetCanvas from '../components/NetCanvas'

type SettingToggle = { label: string; key: string; value: boolean }
type Density = 'dense' | 'roomy'

export default function SettingsScreen({
  density,
  onDensityChange,
}: {
  density: Density
  onDensityChange: (d: Density) => void
}) {
  const [settings, setSettings] = useState<SettingToggle[]>([
    { label: 'Summarise on save', key: 'summarise', value: true },
    { label: 'Watch clipboard for links', key: 'clipboard', value: true },
    { label: 'Swipe actions on rows', key: 'swipe', value: false },
    { label: 'Badge unread count', key: 'badge', value: true },
  ])

  const toggle = (key: string) =>
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value: !s.value } : s)))

  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      {/* Net canvas hero */}
      <div style={{ position: 'relative', height: 180, background: 'var(--bg)', overflow: 'hidden' }}>
        <NetCanvas height={180} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 64, background: 'linear-gradient(to bottom, transparent, var(--bg))' }} />
        <div style={{ position: 'absolute', bottom: 20, left: 20 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 4 }}>// settings</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1 }}>Preferences</h1>
        </div>
      </div>

      <div style={{ padding: '20px 0 0' }}>
        {/* Reading density */}
        <SectionLabel label="reading_density" />
        <div style={{ margin: '0 16px 24px', background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, color: 'var(--text)' }}>Row density</span>
          <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 2, border: '1px solid var(--border2)', gap: 2 }}>
            {(['dense', 'roomy'] as Density[]).map((d) => (
              <button
                key={d}
                onClick={() => onDensityChange(d)}
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

        {/* Toggles */}
        <SectionLabel label="behaviour" />
        <div style={{ margin: '0 16px 24px', background: 'var(--card)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
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
        </div>

        {/* Stats */}
        <SectionLabel label="usage_stats" />
        <div style={{ margin: '0 16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--card)' }}>
          {[
            { value: '24', label: 'items_saved' },
            { value: '1.9s', label: 'avg_save_time' },
            { value: '96%', label: 'summarised' },
            { value: '6', label: 'lists_active' },
          ].map((stat, i) => (
            <div
              key={stat.label}
              style={{
                padding: '18px 18px',
                borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
                borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', lineHeight: 1, marginBottom: 4 }}>{stat.value}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.05em' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Danger zone */}
        <SectionLabel label="data" />
        <div style={{ margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionRow label="Export queue as JSON" icon="↓" />
          <ActionRow label="Clear all archived items" icon="⌫" danger />
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: '0 20px 8px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.08em' }}>
      // {label}
    </div>
  )
}

function ActionRow({ label, icon, danger }: { label: string; icon: string; danger?: boolean }) {
  return (
    <button
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '14px 18px',
        background: 'var(--card)',
        border: `1px solid ${danger ? 'rgba(220,80,60,0.3)' : 'var(--border)'}`,
        borderRadius: 12,
        cursor: 'pointer',
        color: danger ? '#dc503c' : 'var(--text)',
      }}
    >
      <span style={{ fontSize: 15 }}>{label}</span>
      <span style={{ fontSize: 16, opacity: 0.7 }}>{icon}</span>
    </button>
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
