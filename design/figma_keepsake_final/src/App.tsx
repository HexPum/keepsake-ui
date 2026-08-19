import { useState, useRef, type ReactNode } from 'react'
import QueueScreen from './screens/QueueScreen'
import ListsScreen from './screens/ListsScreen'
import SettingsScreen from './screens/SettingsScreen'
import EmptySettingsScreen from './screens/EmptySettingsScreen'
import AddModal from './components/AddModal'

type Tab = 'queue' | 'lists' | 'settings'
type Density = 'dense' | 'roomy'

const isPhone = () => typeof window !== 'undefined' && window.innerWidth <= 500

export default function App() {
  const [tab, setTab] = useState<Tab>('queue')
  const [showAdd, setShowAdd] = useState(false)
  const [isEmpty, setIsEmpty] = useState(false)
  const [density, setDensity] = useState<Density>('dense')
  const [tabBarVisible, setTabBarVisible] = useState(true)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentY = e.currentTarget.scrollTop
    if (!ticking.current) {
      requestAnimationFrame(() => {
        const dy = currentY - lastScrollY.current
        if (dy > 8) setTabBarVisible(false)
        else if (dy < -8) setTabBarVisible(true)
        lastScrollY.current = currentY
        ticking.current = false
      })
      ticking.current = true
    }
  }

  const switchTab = (t: Tab) => { setTab(t); setTabBarVisible(true) }

  const renderScreen = () => {
    if (tab === 'queue' && isEmpty) return <EmptySettingsScreen onToggleEmpty={() => setIsEmpty(false)} />
    switch (tab) {
      case 'queue': return <QueueScreen onGoEmpty={() => setIsEmpty(true)} density={density} />
      case 'lists': return <ListsScreen />
      case 'settings': return <SettingsScreen density={density} onDensityChange={setDensity} />
    }
  }

  const phone = isPhone()

  // 4 slots: queue | add | lists | settings
  type Slot =
    | { kind: 'tab'; id: Tab; icon: ReactNode }
    | { kind: 'add' }

  const slots: Slot[] = [
    {
      kind: 'tab',
      id: 'queue',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 20, height: 20 }}>
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    { kind: 'add' },
    {
      kind: 'tab',
      id: 'lists',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 20, height: 20 }}>
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" strokeLinecap="round" strokeWidth="2.4" />
          <line x1="3" y1="12" x2="3.01" y2="12" strokeLinecap="round" strokeWidth="2.4" />
          <line x1="3" y1="18" x2="3.01" y2="18" strokeLinecap="round" strokeWidth="2.4" />
        </svg>
      ),
    },
    {
      kind: 'tab',
      id: 'settings',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 20, height: 20 }}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#111' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 430,
          height: '100dvh',
          maxHeight: 932,
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: phone ? 0 : 44,
          boxShadow: phone ? 'none' : '0 32px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 28px 0', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600 }}>9:41</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <SignalIcon /><WifiIcon /><BatteryIcon />
          </div>
        </div>

        {/* Screen */}
        <div
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 100 }}
          onScroll={handleScroll}
        >
          {renderScreen()}
        </div>

        {/* Floating pill tab bar — 4 uniform slots */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingBottom: 22,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            transform: tabBarVisible ? 'translateY(0)' : 'translateY(120%)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--card2)',
              borderRadius: 999,
              padding: '6px 6px',
              gap: 2,
              border: '1px solid var(--border2)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset',
              pointerEvents: 'all',
            }}
          >
            {slots.map((slot, i) => {
              if (slot.kind === 'add') {
                return (
                  <button
                    key="add"
                    onClick={() => { setShowAdd(true); setTabBarVisible(true) }}
                    title="Add"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#1a1a1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      boxShadow: '0 2px 10px rgba(244,162,107,0.3)',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ width: 18, height: 18 }}>
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                )
              }
              const s = slot as Extract<Slot, { kind: 'tab' }>
              const active = tab === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => switchTab(s.id)}
                  title={s.id}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: 'none',
                    background: active ? 'var(--surface)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-faint)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'background 0.18s, color 0.18s',
                    boxShadow: active ? '0 0 0 1px rgba(244,162,107,0.12)' : 'none',
                  }}
                >
                  {s.icon}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 16" style={{ width: 18, height: 12 }} fill="var(--text)">
      <rect x="0" y="10" width="4" height="6" rx="1" />
      <rect x="5" y="7" width="4" height="9" rx="1" />
      <rect x="10" y="4" width="4" height="12" rx="1" />
      <rect x="15" y="1" width="4" height="15" rx="1" />
    </svg>
  )
}
function WifiIcon() {
  return (
    <svg viewBox="0 0 24 18" style={{ width: 16, height: 12 }} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round">
      <path d="M1 6.5C5.5 2.5 18.5 2.5 23 6.5" />
      <path d="M4.5 10C7.5 7.5 16.5 7.5 19.5 10" />
      <path d="M8.5 13.5C10 12 14 12 15.5 13.5" />
      <circle cx="12" cy="17" r="1.5" fill="var(--text)" stroke="none" />
    </svg>
  )
}
function BatteryIcon() {
  return (
    <svg viewBox="0 0 28 14" style={{ width: 26, height: 13 }} fill="none">
      <rect x="0.5" y="0.5" width="23" height="13" rx="3.5" stroke="var(--text)" strokeOpacity="0.5" />
      <rect x="2" y="2" width="18" height="10" rx="2" fill="var(--text)" />
      <path d="M25 4.5v5a2.5 2.5 0 0 0 0-5z" fill="var(--text)" fillOpacity="0.4" />
    </svg>
  )
}
