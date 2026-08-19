import { useState } from 'react'

const lists = [
  { id: 1, name: 'css', count: 8, color: '#f4a26b' },
  { id: 2, name: 'devops', count: 5, color: '#7eb8a4' },
  { id: 3, name: 'typography', count: 3, color: '#a89fd8' },
  { id: 4, name: 'rust', count: 6, color: '#d4846a' },
  { id: 5, name: 'ceramics', count: 2, color: '#b8a87e' },
  { id: 6, name: 'search', count: 4, color: '#7eabd8' },
]

export default function ListsScreen() {
  const [active, setActive] = useState<number | null>(null)

  return (
    <div style={{ padding: '16px 0 0', animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 18px' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em' }}>LISTS</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)' }}>{lists.length} active</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {lists.map((l, i) => (
          <button
            key={l.id}
            onClick={() => setActive(active === l.id ? null : l.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 20px',
              background: active === l.id ? 'var(--card)' : 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              textAlign: 'left',
              animation: `fadeIn 0.2s ease ${i * 0.05}s both`,
              transition: 'background 0.15s',
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text)', flex: 1 }}>{l.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-faint)' }}>{l.count}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.6" style={{ width: 14, height: 14, transform: active === l.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
      </div>

      <div style={{ padding: '24px 20px 0' }}>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 16px',
            background: 'var(--card)',
            border: '1px dashed var(--border2)',
            borderRadius: 12,
            cursor: 'pointer',
            width: '100%',
            color: 'var(--text-muted)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" style={{ width: 16, height: 16 }}>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)' }}>new_list</span>
        </button>
      </div>
    </div>
  )
}
