import { useState } from 'react'
import { articles } from '../data/articles'

type StatusFilter = 'all' | 'archived' | 'favourites'

const MAX_VISIBLE_TAGS = 2

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const [showClipboard, setShowClipboard] = useState(true)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [activeTags, setActiveTags] = useState<string[]>([])

  const allTags = Array.from(new Set(articles.flatMap((a) => a.tags)))

  const toggleTag = (tag: string) =>
    setActiveTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])

  const filtered = articles.filter((a) => {
    const matchesQuery =
      !query ||
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.excerpt.toLowerCase().includes(query.toLowerCase()) ||
      a.domain.toLowerCase().includes(query.toLowerCase())

    const matchesStatus =
      status === 'all' ||
      (status === 'archived' && a.status === 'read') ||
      (status === 'favourites' && a.favourited)

    const matchesTags =
      activeTags.length === 0 || activeTags.some((t) => a.tags.includes(t))

    return matchesQuery && matchesStatus && matchesTags
  })

  const visibleTags = allTags.slice(0, MAX_VISIBLE_TAGS)
  const overflowCount = allTags.length - MAX_VISIBLE_TAGS

  const statusFilters: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'archived', label: 'Archived' },
    { id: 'favourites', label: 'Favourites' },
  ]

  return (
    <div style={{ padding: '10px 0 0', animation: 'fadeIn 0.2s ease' }}>

      {/* ── Search bar ── */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--card)', border: '1px solid var(--border2)',
          borderRadius: 14, padding: '11px 14px',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.8" style={{ width: 16, height: 16, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, summaries, tags"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 14 }}
          />
          {/* Sort / filter icon — three lines decreasing */}
          <button
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flexShrink: 0 }}
            title="Filter"
          >
            <span style={{ display: 'block', width: 16, height: 1.5, background: 'var(--text-muted)', borderRadius: 1 }} />
            <span style={{ display: 'block', width: 12, height: 1.5, background: 'var(--text-muted)', borderRadius: 1 }} />
            <span style={{ display: 'block', width: 8,  height: 1.5, background: 'var(--text-muted)', borderRadius: 1 }} />
          </button>
        </div>
      </div>

      {/* ── Clipboard chip ── */}
      {showClipboard && !query && (
        <div style={{ margin: '0 14px 12px', padding: '11px 14px', background: 'var(--accent-glow)', border: '1px solid var(--accent)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, animation: 'slideUp 0.2s ease' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" style={{ width: 14, height: 14 }}>
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 2 }}>ON YOUR CLIPBOARD</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>arxiv.org/abs/2411.09009</div>
          </div>
          <button
            onClick={() => setShowClipboard(false)}
            style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#1a1a1a', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            Save
          </button>
        </div>
      )}

      {/* ── Filter chip bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>

        {/* Status chips */}
        {statusFilters.map(({ id, label }) => {
          const active = status === id
          return (
            <button
              key={id}
              onClick={() => setStatus(id)}
              style={{
                padding: '5px 13px',
                borderRadius: 999,
                border: active ? 'none' : '1px solid var(--border2)',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#1a1a1a' : 'var(--text-muted)',
                fontFamily: 'var(--sans)',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          )
        })}

        {/* // separator */}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-faint)', flexShrink: 0, margin: '0 2px' }}>//</span>

        {/* Tag group label */}
        <button
          onClick={() => setActiveTags([])}
          style={{
            padding: '5px 11px',
            borderRadius: 999,
            border: 'none',
            background: 'var(--accent)',
            color: '#1a1a1a',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          tags
        </button>

        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-faint)', flexShrink: 0 }}>:</span>

        {/* Visible tag chips */}
        {visibleTags.map((tag) => {
          const active = activeTags.includes(tag)
          return (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              style={{
                padding: '5px 11px',
                borderRadius: 999,
                border: active ? 'none' : '1px solid var(--border2)',
                background: active ? 'var(--accent)' : 'rgba(244,162,107,0.12)',
                color: active ? '#1a1a1a' : 'var(--accent)',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              {tag}
            </button>
          )
        })}

        {/* Overflow chip */}
        {overflowCount > 0 && (
          <button
            style={{
              padding: '5px 11px',
              borderRadius: 999,
              border: 'none',
              background: 'rgba(244,162,107,0.12)',
              color: 'var(--accent)',
              fontFamily: 'var(--mono)',
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            +{overflowCount}
          </button>
        )}
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: 'var(--border)', marginBottom: 4 }} />

      {/* ── Results ── */}
      <div style={{ padding: '0 16px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-faint)' }}>// no_results</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((a, i) => (
              <div
                key={a.id}
                style={{
                  padding: '14px 0',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  animation: `fadeIn 0.2s ease ${i * 0.04}s both`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, margin: '0 0 6px', color: 'var(--text)', flex: 1 }}>{a.title}</h3>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingTop: 1 }}>
                    <button style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" style={{ width: 15, height: 15 }}>
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <button style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                      <svg viewBox="0 0 24 24" fill={a.favourited ? 'var(--accent)' : 'none'} stroke={a.favourited ? 'var(--accent)' : 'var(--text-faint)'} strokeWidth="1.6" style={{ width: 15, height: 15 }}>
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)', alignSelf: 'center' }}>{a.age}</span>
                  </div>
                </div>

                {a.status === 'summarising' ? (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-dot 1.4s ease infinite' }} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.06em' }}>SUMMARISING</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'var(--surface)' }}>
                      <div style={{ height: '100%', width: `${(a.progress || 0) * 100}%`, background: 'var(--accent)', borderRadius: 2 }} />
                    </div>
                  </div>
                ) : a.excerpt ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45, margin: '0 0 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {a.excerpt}
                  </p>
                ) : null}

                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)' }}>{a.domain}</span>
                  <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>·</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)' }}>{a.readTime} min</span>
                  {a.tags.map((t) => (
                    <span key={t} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 4 }}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ height: 16 }} />
    </div>
  )
}
