import { useState } from 'react'
import { articles, type Article } from '../data/articles'

type Density = 'dense' | 'roomy'
type StatusFilter = 'all' | 'archived' | 'favourites'

const MAX_VISIBLE_TAGS = 2

export default function QueueScreen({
  onGoEmpty,
  density,
}: {
  onGoEmpty: () => void
  density: Density
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [swiping, setSwiping] = useState<number | null>(null)
  const [archived, setArchived] = useState<number[]>([])

  const allTags = Array.from(new Set(articles.flatMap((a) => a.tags)))
  const visibleTags = allTags.slice(0, MAX_VISIBLE_TAGS)
  const overflowCount = allTags.length - MAX_VISIBLE_TAGS

  const toggleTag = (tag: string) =>
    setActiveTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])

  const visible = articles.filter((a) => {
    if (archived.includes(a.id)) return false
    const matchesQuery = !query ||
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.excerpt.toLowerCase().includes(query.toLowerCase()) ||
      a.domain.toLowerCase().includes(query.toLowerCase())
    const matchesStatus =
      status === 'all' ||
      (status === 'archived' && a.status === 'read') ||
      (status === 'favourites' && a.favourited)
    const matchesTags = activeTags.length === 0 || activeTags.some((t) => a.tags.includes(t))
    return matchesQuery && matchesStatus && matchesTags
  })

  const statusFilters: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'archived', label: 'Archived' },
    { id: 'favourites', label: 'Favourites' },
  ]

  return (
    <div style={{ padding: '10px 0 0', animation: 'fadeIn 0.2s ease' }}>

      {/* Search bar */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 14, padding: '11px 14px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.8" style={{ width: 16, height: 16, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, summaries, tags"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 14 }}
          />
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

      {/* Filter chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {statusFilters.map(({ id, label }) => {
          const active = status === id
          return (
            <button key={id} onClick={() => setStatus(id)} style={{ padding: '5px 13px', borderRadius: 999, border: active ? 'none' : '1px solid var(--border2)', background: active ? 'var(--accent)' : 'transparent', color: active ? '#1a1a1a' : 'var(--text-muted)', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s' }}>
              {label}
            </button>
          )
        })}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-faint)', flexShrink: 0, margin: '0 2px' }}>//</span>
        <button onClick={() => setActiveTags([])} style={{ padding: '5px 11px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: '#1a1a1a', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          tags
        </button>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-faint)', flexShrink: 0 }}>:</span>
        {visibleTags.map((tag) => {
          const active = activeTags.includes(tag)
          return (
            <button key={tag} onClick={() => toggleTag(tag)} style={{ padding: '5px 11px', borderRadius: 999, border: active ? 'none' : '1px solid var(--border2)', background: active ? 'var(--accent)' : 'rgba(244,162,107,0.12)', color: active ? '#1a1a1a' : 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s' }}>
              {tag}
            </button>
          )
        })}
        {overflowCount > 0 && (
          <button style={{ padding: '5px 11px', borderRadius: 999, border: 'none', background: 'rgba(244,162,107,0.12)', color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            +{overflowCount}
          </button>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', marginBottom: 4 }} />

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: density === 'dense' ? 0 : 10, padding: density === 'roomy' ? '0 14px' : 0 }}>
        {visible.map((a) =>
          density === 'dense' ? (
            <DenseRow key={a.id} article={a} swiping={swiping === a.id} onSwipeStart={() => setSwiping(a.id)} onSwipeEnd={() => setSwiping(null)} onArchive={() => setArchived((prev) => [...prev, a.id])} />
          ) : (
            <RoomyCard key={a.id} article={a} swiping={swiping === a.id} onSwipeStart={() => setSwiping(a.id)} onSwipeEnd={() => setSwiping(null)} onArchive={() => setArchived((prev) => [...prev, a.id])} />
          )
        )}
      </div>
      <div style={{ height: 16 }} />
    </div>
  )
}


type SwipeProps = {
  article: Article
  swiping: boolean
  onSwipeStart: () => void
  onSwipeEnd: () => void
  onArchive: () => void
}

function DenseRow({ article: a, swiping, onSwipeStart, onSwipeEnd, onArchive }: SwipeProps) {
  const [touchStartX, setTouchStartX] = useState(0)
  const [offsetX, setOffsetX] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [fav, setFav] = useState(a.favourited)

  const handleTouchStart = (e: React.TouchEvent) => { setTouchStartX(e.touches[0].clientX); onSwipeStart() }
  const handleTouchMove = (e: React.TouchEvent) => { const dx = e.touches[0].clientX - touchStartX; if (dx < 0) setOffsetX(Math.max(dx, -90)) }
  const handleTouchEnd = () => { if (offsetX < -50) { setRevealed(true); setOffsetX(-90) } else { setRevealed(false); setOffsetX(0) }; onSwipeEnd() }

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 90, background: '#c05a1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{ width: 18, height: 18 }}>
          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
        </svg>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'white', letterSpacing: '0.06em' }}>ARCHIVE</span>
      </div>

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? 'none' : 'transform 0.25s ease',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          padding: '14px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        {revealed && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
            <button onClick={onArchive} style={{ padding: '3px 10px', borderRadius: 6, background: '#c05a1f', border: 'none', color: 'white', fontFamily: 'var(--mono)', fontSize: 10, cursor: 'pointer' }}>archive</button>
            <button onClick={() => { setRevealed(false); setOffsetX(0) }} style={{ padding: '3px 10px', borderRadius: 6, background: 'var(--surface)', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: 10, cursor: 'pointer' }}>cancel</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: 'var(--text)', flex: 1 }}>{a.title}</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingTop: 2 }}>
            <button style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" style={{ width: 16, height: 16 }}>
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button onClick={() => setFav(!fav)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2 }}>
              <svg viewBox="0 0 24 24" fill={fav ? 'var(--accent)' : 'none'} stroke={fav ? 'var(--accent)' : 'var(--text-faint)'} strokeWidth="1.6" style={{ width: 16, height: 16 }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          </div>
        </div>

        {a.status === 'summarising' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-dot 1.4s ease infinite' }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.06em' }}>SUMMARISING</span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--surface)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(a.progress || 0) * 100}%`, background: 'var(--accent)', borderRadius: 2 }} />
            </div>
          </div>
        ) : a.excerpt ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.excerpt}</p>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)' }}>{a.domain}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)' }}>·</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)' }}>{a.readTime} min</span>
          {a.tags.map((t) => (
            <span key={t} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface)', padding: '1px 6px', borderRadius: 4 }}>{t}</span>
          ))}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>{a.age}</span>
        </div>
      </div>
    </div>
  )
}

function RoomyCard({ article: a, swiping, onSwipeStart, onSwipeEnd, onArchive }: SwipeProps) {
  const [touchStartX, setTouchStartX] = useState(0)
  const [offsetX, setOffsetX] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [fav, setFav] = useState(a.favourited)

  const handleTouchStart = (e: React.TouchEvent) => { setTouchStartX(e.touches[0].clientX); onSwipeStart() }
  const handleTouchMove = (e: React.TouchEvent) => { const dx = e.touches[0].clientX - touchStartX; if (dx < 0) setOffsetX(Math.max(dx, -100)) }
  const handleTouchEnd = () => { if (offsetX < -60) { setRevealed(true); setOffsetX(-100) } else { setRevealed(false); setOffsetX(0) }; onSwipeEnd() }

  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 100, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 3, borderRadius: '0 14px 14px 0' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" style={{ width: 20, height: 20 }}>
          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
        </svg>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'white', fontWeight: 600, letterSpacing: '0.06em' }}>ARCHIVE</span>
      </div>

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? 'none' : 'transform 0.25s ease',
          background: 'var(--card)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{a.domain}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)' }}>{a.readTime} min</span>
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, margin: 0, color: 'var(--text)' }}>{a.title}</h3>
        {a.status === 'summarising' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-dot 1.4s ease infinite' }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.06em' }}>SUMMARISING</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--surface)' }}>
              <div style={{ height: '100%', width: `${(a.progress || 0) * 100}%`, background: 'var(--accent)', borderRadius: 2 }} />
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{a.excerpt}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {a.tags.map((t) => (
            <span key={t} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface)', padding: '2px 8px', borderRadius: 5 }}>{t}</span>
          ))}
          <button onClick={() => setFav(!fav)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, marginLeft: 'auto' }}>
            <svg viewBox="0 0 24 24" fill={fav ? 'var(--accent)' : 'none'} stroke={fav ? 'var(--accent)' : 'var(--text-faint)'} strokeWidth="1.6" style={{ width: 17, height: 17 }}>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
