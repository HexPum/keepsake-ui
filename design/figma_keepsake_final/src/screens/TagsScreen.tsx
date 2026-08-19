const tags = [
  { name: 'css', count: 8 },
  { name: 'typography', count: 3 },
  { name: 'devops', count: 5 },
  { name: 'rust', count: 6 },
  { name: 'postgres', count: 4 },
  { name: 'ceramics', count: 2 },
  { name: 'search', count: 4 },
  { name: 'design-systems', count: 3 },
  { name: 'performance', count: 2 },
  { name: 'cli', count: 3 },
]

export default function TagsScreen() {
  return (
    <div style={{ padding: '16px 0 0', animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 18px' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em' }}>TAGS</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)' }}>{tags.length} tags</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 20px' }}>
        {tags.map((t, i) => (
          <button
            key={t.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: 'var(--card)',
              border: '1px solid var(--border2)',
              borderRadius: 10,
              cursor: 'pointer',
              animation: `fadeIn 0.2s ease ${i * 0.04}s both`,
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border2)' }}
          >
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)' }}>{t.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-glow)', padding: '1px 6px', borderRadius: 4 }}>{t.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
