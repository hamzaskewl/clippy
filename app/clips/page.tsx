'use client'

import { useEffect, useMemo, useState } from 'react'
import { Topbar } from '@/components/Topbar'
import { VibeTag } from '@/components/VibeTag'
import { AuthGuard } from '@/components/AuthGuard'
import { swrFetcher, getJSON } from '@/lib/api'
import { jumpClass } from '@/lib/format'
import type { ClipsResponse, MyChannel } from '@/lib/types'

const PER_PAGE = 12

export default function ClipsPage() {
  return (
    <AuthGuard>
      <ClipsInner />
    </AuthGuard>
  )
}

function ClipsInner() {
  const [data, setData] = useState<ClipsResponse | null>(null)
  const [page, setPage] = useState(1)
  const [filterChannel, setFilterChannel] = useState<string | null>(null)
  const [myClipsOnly, setMyClipsOnly] = useState(false)
  const [myChannels, setMyChannels] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  // Load my channels once
  useEffect(() => {
    getJSON<{ channels: MyChannel[] }>('/my/channels')
      .then((d) => setMyChannels((d.channels || []).map((c) => c.channel)))
      .catch(() => {})
  }, [])

  // Load page
  useEffect(() => {
    const offset = (page - 1) * PER_PAGE
    let url = `/api/clips?limit=${PER_PAGE}&offset=${offset}`
    if (filterChannel) url += `&channel=${encodeURIComponent(filterChannel)}`
    swrFetcher<ClipsResponse>(url)
      .then((d) => setData(d))
      .catch(() => {})
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page, filterChannel])

  // Close search dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('#channelSearch') && !t.closest('#searchResults')) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const stats = data?.stats
  const totalPages = useMemo(() => {
    if (!data) return 1
    return Math.max(1, Math.ceil(data.filteredTotal / PER_PAGE))
  }, [data])

  const filteredClips = useMemo(() => {
    if (!data) return []
    if (myClipsOnly && myChannels.length > 0) {
      return data.clips.filter((c) => myChannels.includes(c.channel.toLowerCase()))
    }
    return data.clips
  }, [data, myClipsOnly, myChannels])

  const searchMatches = useMemo(() => {
    if (!search.trim() || !stats) return []
    const q = search.toLowerCase()
    return stats.topChannels.filter((ch) => ch.channel.toLowerCase().includes(q)).slice(0, 10)
  }, [search, stats])

  const clipRate = stats && stats.total > 0 ? Math.round((stats.clipped / stats.total) * 100) : 0

  function toggleFilter(channel: string) {
    setFilterChannel((cur) => (cur === channel ? null : channel))
    setSearch(channel === filterChannel ? '' : channel)
    setPage(1)
  }

  function applySearch() {
    setSearchOpen(false)
    setFilterChannel(search.trim() ? search.trim().toLowerCase() : null)
    setPage(1)
  }

  return (
    <>
      <Topbar showLogout />
      <div className="max-w-[1400px] mx-auto p-4 md:p-8">
        {/* Stats bar */}
        <div className="flex gap-4 md:gap-8 mb-8 py-5 border-b border-[#111]">
          <div>
            <div className="text-[28px] font-bold text-white">{stats?.total?.toLocaleString() ?? '-'}</div>
            <div className="text-[9px] uppercase tracking-wider text-[#444] mt-[2px]">total moments</div>
          </div>
          <div>
            <div className="text-[28px] font-bold text-white">{stats?.clipped?.toLocaleString() ?? '-'}</div>
            <div className="text-[9px] uppercase tracking-wider text-[#444] mt-[2px]">clips created</div>
          </div>
          <div>
            <div className="text-[28px] font-bold text-white">{clipRate}%</div>
            <div className="text-[9px] uppercase tracking-wider text-[#444] mt-[2px]">clip rate</div>
          </div>
        </div>

        {/* Top channels + search */}
        <div className="flex justify-between items-center mb-3">
          <div className="text-[10px] font-medium uppercase tracking-[2px] text-[#444]">top channels</div>
          <div className="relative">
            <input
              id="channelSearch"
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSearchOpen(true)
              }}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              placeholder="search channel..."
              className="bg-[#111] border border-[#1a1a1a] rounded-md pl-[30px] pr-[14px] py-2 text-white text-[12px] outline-none w-[220px]"
            />
            <svg
              className="absolute left-[10px] top-1/2 -translate-y-1/2 opacity-30 pointer-events-none"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            {searchOpen && search.trim() && (
              <div
                id="searchResults"
                className="absolute top-full left-0 right-0 bg-[#111] border border-[#222] rounded-md mt-1 max-h-[200px] overflow-y-auto z-50"
              >
                {searchMatches.length > 0 ? (
                  searchMatches.map((ch) => (
                    <div
                      key={ch.channel}
                      className="px-3 py-2 text-[11px] text-[#ccc] cursor-pointer flex justify-between hover:bg-[#1a1a1a]"
                      onClick={() => {
                        setFilterChannel(ch.channel.toLowerCase())
                        setSearch(ch.channel)
                        setSearchOpen(false)
                        setPage(1)
                      }}
                    >
                      <span>{ch.channel}</span>
                      <span className="text-[#444]">{ch.count} clips</span>
                    </div>
                  ))
                ) : (
                  <div
                    className="px-3 py-2 text-[11px] text-[#666] cursor-pointer"
                    onClick={applySearch}
                  >
                    {search} <span className="text-[#444]">— search</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-8">
          {stats?.topChannels?.map((ch) => (
            <div
              key={ch.channel}
              onClick={() => toggleFilter(ch.channel)}
              className={`text-[11px] px-[14px] py-[6px] bg-[#111] border rounded-full cursor-pointer hover:border-[#333] hover:text-white ${
                filterChannel === ch.channel
                  ? 'border-[#9146ff] text-[#9146ff]'
                  : 'border-[#1a1a1a] text-[#888]'
              }`}
            >
              {ch.channel}
              <span className="text-[#444] ml-1">{ch.count}</span>
            </div>
          ))}
        </div>

        {/* Recent clips heading + filter toggle */}
        <div className="flex justify-between items-center mb-4">
          <div className="text-[10px] font-medium uppercase tracking-[2px] text-[#444]">recent clips</div>
          {myChannels.length > 0 && (
            <div
              className="flex items-center gap-[10px] text-[12px] text-[#666] cursor-pointer select-none"
              onClick={() => setMyClipsOnly((v) => !v)}
            >
              <span>my channels only</span>
              <div
                className={`w-9 h-5 rounded-full relative transition-colors ${myClipsOnly ? 'bg-[#9146ff]' : 'bg-[#222]'}`}
              >
                <div
                  className={`w-4 h-4 rounded-full absolute top-[2px] transition-all ${
                    myClipsOnly ? 'left-[18px] bg-white' : 'left-[2px] bg-[#555]'
                  }`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Clips grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {!data ? (
            <div className="text-[#222] text-[12px] text-center py-12 col-span-full">loading...</div>
          ) : filteredClips.length === 0 ? (
            <div className="text-[#222] text-[12px] text-center py-12 col-span-full">no clips yet</div>
          ) : (
            filteredClips.map((c) => {
              const jc = jumpClass(c.jumpPercent)
              const jumpColor = jc === 'mega' ? 'text-[#f59e0b]' : jc === 'high' ? 'text-[#22c55e]' : ''
              const moodTag = c.mood || c.vibe
              const clipSlug = c.clipUrl ? c.clipUrl.split('/').pop() : null
              const time = new Date(c.timestamp).toLocaleString()
              const embedSrc =
                clipSlug && typeof window !== 'undefined'
                  ? `https://clips.twitch.tv/embed?clip=${clipSlug}&parent=${location.hostname}&autoplay=false&muted=true`
                  : null
              return (
                <div key={c.id} className="bg-[#111] border border-[#1a1a1a] rounded-lg overflow-hidden hover:border-[#333] transition-colors">
                  {embedSrc && (
                    <div className="w-full aspect-video bg-[#0a0a0a]">
                      <iframe src={embedSrc} className="w-full h-full border-0" loading="lazy" allowFullScreen />
                    </div>
                  )}
                  <div className="px-4 py-[14px]">
                    <div className="flex justify-between items-center mb-[6px]">
                      <span className="text-[13px] font-semibold text-white">{c.channel}</span>
                      <span className={`text-[12px] font-bold ${jumpColor}`}>+{c.jumpPercent}%</span>
                    </div>
                    <div className="flex gap-2 items-center mb-[6px]">
                      <VibeTag vibe={moodTag as any} />
                      <span className="text-[10px] text-[#333]">{time}</span>
                    </div>
                    {c.description && (
                      <div className="text-[12px] text-[#666] leading-[1.5]">{c.description}</div>
                    )}
                    <div className="flex gap-2 mt-[10px]">
                      {c.clipUrl && (
                        <a
                          href={c.clipUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] px-[10px] py-1 bg-[#1a1a1a] text-[#22c55e] border border-[#22c55e44] rounded hover:bg-[#222]"
                        >
                          watch clip
                        </a>
                      )}
                      {c.vodUrl && (
                        <a
                          href={c.vodUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] px-[10px] py-1 bg-[#1a1a1a] text-[#666] border border-[#222] rounded hover:bg-[#222] hover:text-[#999]"
                        >
                          vod
                        </a>
                      )}
                      <a
                        href={`/clip/${c.id}`}
                        className="text-[10px] px-[10px] py-1 bg-[#1a1a1a] text-[#666] border border-[#222] rounded hover:bg-[#222] hover:text-[#999]"
                      >
                        details
                      </a>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-1 py-6">
            <PageButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              «
            </PageButton>
            {paginationPages(page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`e${i}`} className="text-[11px] text-[#333] px-2">
                  ...
                </span>
              ) : (
                <PageButton key={p} active={p === page} onClick={() => setPage(p as number)}>
                  {p}
                </PageButton>
              )
            )}
            <PageButton disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              »
            </PageButton>
          </div>
        )}
      </div>
    </>
  )
}

function PageButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`bg-[#1a1a1a] border rounded px-3 py-[6px] text-[11px] min-w-[32px] text-center hover:bg-[#222] hover:text-[#999] disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? 'border-[#9146ff] text-[#9146ff] bg-[#1a0a2a]'
          : 'border-[#222] text-[#666]'
      }`}
    >
      {children}
    </button>
  )
}

function paginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}
