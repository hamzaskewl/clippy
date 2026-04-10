'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Topbar } from '@/components/Topbar'
import { VibeTag } from '@/components/VibeTag'
import { AuthGuard } from '@/components/AuthGuard'
import { useSSE } from '@/lib/useSSE'
import { swrFetcher, getJSON, postJSON, deleteJSON } from '@/lib/api'
import { jumpClass, timeAgoLong } from '@/lib/format'
import type {
  ChannelStats,
  DashboardMoment,
  Health,
  MyChannel,
  TrendingChannel,
  Vibe,
} from '@/lib/types'

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardInner />
    </AuthGuard>
  )
}

interface MomentsResponse {
  moments: Array<{
    id: number
    channel: string
    jumpPercent: number
    vibe: Vibe
    mood?: string | null
    description?: string | null
    chatSnapshot?: string[]
    clipUrl?: string | null
    clipId?: string | null
    vodUrl?: string | null
    vodTimestamp?: string | null
    spikeAt: number
  }>
}

function DashboardInner() {
  const [userChannels, setUserChannels] = useState<MyChannel[]>([])
  const [moments, setMoments] = useState<DashboardMoment[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [embedVisible, setEmbedVisible] = useState<Set<string>>(new Set())
  const [filterChannel, setFilterChannel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [addInput, setAddInput] = useState('')
  const [oauthDisconnected, setOauthDisconnected] = useState(false)
  const [, forceTick] = useState(0)
  const userChannelsRef = useRef<MyChannel[]>([])
  userChannelsRef.current = userChannels

  const { data: health } = useSWR<Health>('/health', swrFetcher, { refreshInterval: 5000 })
  const { data: trending } = useSWR<{ channels: TrendingChannel[] }>('/trending', swrFetcher, {
    refreshInterval: 15000,
  })

  const loadChannels = useCallback(async () => {
    try {
      const data = await getJSON<{ channels: MyChannel[] }>('/my/channels')
      setUserChannels(data.channels || [])
    } catch {}
  }, [])

  const loadMomentsFromDB = useCallback(async () => {
    try {
      const data = await getJSON<MomentsResponse>('/my/moments?limit=100')
      setMoments((cur) => mergeMoments(cur, data.moments))
    } catch {}
  }, [])

  useEffect(() => {
    loadChannels()
    loadMomentsFromDB()
    const id1 = setInterval(loadChannels, 30000)
    const id2 = setInterval(() => forceTick((n) => n + 1), 10000)
    return () => {
      clearInterval(id1)
      clearInterval(id2)
    }
  }, [loadChannels, loadMomentsFromDB])

  // SSE for live spikes — only react to channels we own
  useSSE('/alerts', (data: any) => {
    if (data?.type !== 'spike') return
    const myChannels = userChannelsRef.current.map((c) => c.channel)
    if (myChannels.length === 0) return
    if (!myChannels.includes(data.channel.toLowerCase())) return

    const id = `live-${Date.now()}-${Math.random()}`
    const newSpike: DashboardMoment = {
      id,
      channel: data.channel,
      jumpPercent: data.jumpPercent,
      viewers: data.viewers ?? null,
      vibe: data.vibe,
      mood: null,
      description: null,
      chatSnapshot: data.chatSnapshot || [],
      clipUrl: null,
      clipId: null,
      vodUrl: data.vodUrl ?? null,
      vodTimestamp: data.vodTimestamp ?? null,
      receivedAt: Date.now(),
    }
    setMoments((cur) => mergeMoments([newSpike, ...cur], []))

    // Refresh from DB after a delay to pick up the LLM classification + clip
    setTimeout(() => fetchMomentForSpike(id, data.channel), 4000)
    setTimeout(() => fetchMomentForSpike(id, data.channel), 10000)
  })

  const fetchMomentForSpike = useCallback(async (spikeId: string, channel: string) => {
    try {
      const m = await getJSON<{
        id: number
        clipUrl?: string | null
        mood?: string | null
        description?: string | null
        chatSnapshot?: string[]
      }>(`/moments/latest/${channel}`)
      setMoments((cur) =>
        cur.map((s) => {
          if (s.id !== spikeId) return s
          return {
            ...s,
            dbId: m.id ?? s.dbId,
            clipUrl: m.clipUrl ?? s.clipUrl,
            mood: m.mood && m.mood !== 'error' ? m.mood : s.mood,
            description: m.mood && m.mood !== 'error' ? m.description ?? s.description : s.description,
            chatSnapshot:
              m.chatSnapshot && m.chatSnapshot.length > (s.chatSnapshot?.length || 0)
                ? m.chatSnapshot
                : s.chatSnapshot,
          }
        })
      )
    } catch {}
  }, [])

  const channelOptions = useMemo(
    () => Array.from(new Set(userChannels.map((c) => c.channel))),
    [userChannels]
  )

  const filteredMoments = useMemo(() => {
    if (!filterChannel) return moments
    return moments.filter((s) => s.channel.toLowerCase() === filterChannel)
  }, [moments, filterChannel])

  async function addChannel() {
    const ch = addInput.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    setAddInput('')
    if (!ch) return
    setError(null)
    try {
      const data = await postJSON<{ channels: MyChannel[] }>('/my/channels', { channel: ch })
      setUserChannels(data.channels || [])
      fetch(`/track/${ch}`, { method: 'POST', credentials: 'include' }).catch(() => {})
    } catch (e: any) {
      setError(e?.message || 'Failed to add channel')
      setTimeout(() => setError(null), 5000)
    }
  }

  async function removeChannel(ch: string) {
    setError(null)
    try {
      const data = await deleteJSON<{ channels: MyChannel[] }>(`/my/channels/${ch}`)
      setUserChannels(data.channels || [])
      fetch(`/track/${ch}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    } catch {}
  }

  async function confirmChannel(ch: string) {
    setError(null)
    try {
      const data = await postJSON<{ channels: MyChannel[] }>(`/my/channels/${ch}/confirm`)
      setUserChannels(data.channels || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to confirm channel')
      setTimeout(() => setError(null), 5000)
    }
  }

  async function quickAdd(ch: string) {
    if (userChannels.length >= 3) {
      setError('All 3 slots in use — remove one first')
      setTimeout(() => setError(null), 5000)
      return
    }
    if (userChannels.some((c) => c.channel === ch)) {
      setError(`Already watching ${ch}`)
      setTimeout(() => setError(null), 5000)
      return
    }
    setAddInput(ch)
    // Defer one tick so addInput is set
    setTimeout(addChannel, 0)
  }

  async function disconnectOAuth() {
    if (
      !confirm(
        "Disconnect your Twitch OAuth? This will stop all clip creation from your account. You'll need to re-login to reconnect."
      )
    )
      return
    try {
      const res = await fetch('/my/token', { method: 'DELETE', credentials: 'include' })
      if (res.ok) setOauthDisconnected(true)
    } catch {}
  }

  const slotsLeft = userChannels.length < 3
  const live = health?.connected ?? false

  return (
    <>
      <Topbar status={{ live, label: live ? 'live' : 'connecting...' }} showLogout />
      <div className="grid lg:grid-cols-[1fr_340px] min-h-[calc(100vh-53px)]">
        {/* Main */}
        <div className="px-4 md:px-8 py-6 overflow-y-auto">
          <div className="bg-[#2a1800] border border-[#f59e0b55] rounded px-[14px] py-[10px] mb-3 text-[11px] leading-relaxed text-[#fbbf24]">
            <strong className="text-[#f59e0b]">heads up:</strong> clips are created using{' '}
            <strong>your Twitch account</strong> and will keep generating in the background even when your browser is closed. to stop, remove the channel from your watchlist below.
          </div>

          <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg px-[18px] py-[14px] mb-6 text-[11px] text-[#555] leading-relaxed flex items-center gap-3">
            <span className="text-[16px] text-[#9146ff]">*</span>
            <span>
              <b className="text-[#888]">Free early access.</b> You have <b className="text-[#888]">3 channel slots</b> for live auto-clipping. Add a channel, then <b className="text-[#888]">confirm</b> it when the stream goes live. Channels persist across sessions but must be re-confirmed each time a stream starts.
            </span>
          </div>

          {error && (
            <div className="bg-[#1a0a0a] border border-[#331111] rounded px-[14px] py-[10px] text-[11px] text-[#f87171] mb-4">
              {error}
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <div className="text-[10px] font-medium uppercase tracking-[2px] text-[#444]">your channels</div>
            <div className="text-[11px] text-[#555]">
              <b className="text-white">{userChannels.length}</b> / <b className="text-white">3</b> slots used
            </div>
          </div>

          <div className="flex gap-2 mb-7 flex-col md:flex-row">
            <input
              type="text"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChannel()}
              placeholder={slotsLeft ? 'add a channel (e.g. xqc, pokimane)...' : 'all 3 slots in use — remove one first'}
              disabled={!slotsLeft}
              className="flex-1 bg-[#111] border border-[#1a1a1a] focus:border-[#333] rounded-md px-4 py-3 text-white text-[13px] outline-none transition-colors placeholder:text-[#222] disabled:opacity-50"
            />
            <button
              onClick={addChannel}
              disabled={!slotsLeft}
              className="bg-[#1a1a1a] hover:bg-[#222] text-[#888] hover:text-white border border-[#222] rounded-md px-5 py-3 text-[12px] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              add
            </button>
          </div>

          <div className="flex flex-col gap-2 mb-7">
            {userChannels.length === 0
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-[#111] border border-dashed border-[#1a1a1a] rounded-lg p-6 flex items-center justify-center text-[#222] text-[12px]">
                    slot {i + 1} — empty
                  </div>
                ))
              : (
                <>
                  {userChannels.map((ch) => (
                    <ChannelSlot
                      key={ch.channel}
                      ch={ch}
                      onConfirm={() => confirmChannel(ch.channel)}
                      onRemove={() => removeChannel(ch.channel)}
                    />
                  ))}
                  {Array.from({ length: 3 - userChannels.length }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="bg-[#111] border border-dashed border-[#1a1a1a] rounded-lg p-6 flex items-center justify-center text-[#222] text-[12px]"
                    >
                      slot {userChannels.length + i + 1} — empty
                    </div>
                  ))}
                </>
              )}
          </div>

          {/* Moments */}
          <div className="flex justify-between items-center mb-3">
            <div className="text-[10px] font-medium uppercase tracking-[2px] text-[#444] flex items-center gap-2">
              your moments
              <span className="bg-[#1a1a1a] text-[#555] text-[10px] px-[6px] py-[1px] rounded">
                {filteredMoments.length}
              </span>
            </div>
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="bg-[#111] border border-[#1a1a1a] rounded text-[#888] text-[11px] px-2 py-1 outline-none"
            >
              <option value="">all channels</option>
              {channelOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            {filteredMoments.length === 0 ? (
              <div className="text-[#1a1a1a] text-[12px] py-8 text-center">
                <span className="pulse">
                  {userChannels.filter((c) => c.confirmed).length === 0
                    ? 'add and confirm channels to start watching'
                    : `watching ${userChannels
                        .filter((c) => c.confirmed)
                        .map((c) => c.channel)
                        .join(', ')} — no moments yet`}
                </span>
              </div>
            ) : (
              filteredMoments.map((s) => (
                <MomentCard
                  key={s.id}
                  m={s}
                  open={expandedId === s.id}
                  embedVisible={embedVisible.has(s.id)}
                  onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  onToggleEmbed={() => {
                    setEmbedVisible((cur) => {
                      const next = new Set(cur)
                      if (next.has(s.id)) next.delete(s.id)
                      else next.add(s.id)
                      return next
                    })
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="border-t lg:border-t-0 lg:border-l border-[#141414] p-4 md:p-6 overflow-y-auto bg-[#0c0c0c]">
          <ConfirmedChannelStats channels={userChannels.filter((c) => c.confirmed)} />

          <div className="mb-7">
            <div className="text-[10px] font-medium uppercase tracking-[2px] text-[#444] mb-3">trending</div>
            <div className="flex flex-col gap-1">
              {!trending?.channels?.length ? (
                <div className="text-[#1a1a1a] text-[12px] py-4 text-center">loading...</div>
              ) : (
                trending.channels.map((ch) => (
                  <div
                    key={ch.channel}
                    onClick={() => quickAdd(ch.channel.toLowerCase())}
                    className="flex justify-between items-center px-[14px] py-[10px] bg-[#111] border border-[#161616] rounded-md text-[12px] cursor-pointer hover:border-[#333]"
                  >
                    <span className="font-medium text-white truncate max-w-[140px]">{ch.channel}</span>
                    <span className="text-[#555] text-[11px] flex items-center">
                      <b className="text-[#ccc]">{ch.burst}</b>
                      <span className="ml-1">msg/s</span>
                      <VibeTag vibe={ch.vibe} className="ml-[6px]" />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mb-7">
            <div className="text-[10px] font-medium uppercase tracking-[2px] text-[#444] mb-3">account</div>
            <div className="bg-[#111] border border-[#161616] rounded-md p-[14px]">
              <div className="text-[11px] text-[#555] mb-[10px]">
                Clips are created using your Twitch OAuth. You can disconnect to stop all clip creation from your account.
              </div>
              <button
                onClick={disconnectOAuth}
                disabled={oauthDisconnected}
                className="w-full bg-transparent border border-[#ef444444] text-[#ef4444] text-[10px] py-[6px] rounded disabled:border-[#222] disabled:text-[#333] disabled:cursor-not-allowed"
              >
                {oauthDisconnected ? 'disconnected' : 'disconnect Twitch OAuth'}
              </button>
              <div className="text-[10px] text-[#333] mt-2 text-center">
                You can also revoke access at{' '}
                <a
                  href="https://www.twitch.tv/settings/connections"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#9146ff]"
                >
                  twitch.tv/settings/connections
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function ChannelSlot({
  ch,
  onConfirm,
  onRemove,
}: {
  ch: MyChannel
  onConfirm: () => void
  onRemove: () => void
}) {
  return (
    <div className="bg-[#111] border border-[#161616] rounded-lg px-5 py-4">
      <div className="flex justify-between items-center mb-2 gap-2 flex-col md:flex-row md:items-center items-start">
        <span className="text-[14px] font-semibold text-white">{ch.channel}</span>
        <div className="flex items-center gap-2">
          {!ch.confirmed ? (
            <button
              onClick={onConfirm}
              className="bg-[#1a1a1a] hover:bg-[#0a1a0a] text-[#22c55e] border border-[#22c55e44] rounded px-3 py-[5px] text-[10px]"
            >
              confirm (must be live)
            </button>
          ) : (
            <span className="text-[10px] text-[#22c55e]">confirmed</span>
          )}
          <button
            onClick={onRemove}
            className="bg-[#1a1a1a] hover:bg-[#1a0a0a] text-[#ef4444] border border-[#ef444444] rounded px-3 py-[5px] text-[10px]"
          >
            remove
          </button>
        </div>
      </div>
      <div className="text-[11px] text-[#555]">
        {ch.confirmed ? 'auto-clipping active' : 'not confirmed — confirm when stream is live'}
      </div>
    </div>
  )
}

function MomentCard({
  m,
  open,
  embedVisible,
  onToggle,
  onToggleEmbed,
}: {
  m: DashboardMoment
  open: boolean
  embedVisible: boolean
  onToggle: () => void
  onToggleEmbed: () => void
}) {
  const jc = jumpClass(m.jumpPercent)
  const jumpColor = jc === 'mega' ? 'text-[#f59e0b]' : jc === 'high' ? 'text-[#22c55e]' : ''
  const moodTag = (m.mood || m.vibe) as Vibe
  const clipSlug = m.clipUrl ? m.clipUrl.split('/').pop() : null

  return (
    <>
      <div
        onClick={onToggle}
        className={`grid grid-cols-[1fr_auto] md:grid-cols-[140px_70px_60px_1fr_80px] items-center gap-3 px-4 py-[14px] bg-[#111] border border-[#161616] rounded-md text-[12px] cursor-pointer hover:bg-[#151515] hover:border-[#222] transition-colors ${
          m.clipUrl ? 'border-l-[3px] border-l-[#22c55e]' : ''
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white text-[13px]">{m.channel}</span>
          {m.viewers ? <span className="text-[#444] text-[10px]">{(m.viewers / 1000).toFixed(1)}k</span> : null}
        </div>
        <span className={`font-bold text-[13px] ${jumpColor}`}>+{m.jumpPercent}%</span>
        <VibeTag vibe={moodTag} className="hidden md:inline-block" />
        <span className="text-[#555] text-[11px] truncate hidden md:block">{m.description || ''}</span>
        <span className="text-[#333] text-[10px] text-right hidden md:block">{timeAgoLong(m.receivedAt)}</span>
      </div>
      {open && (
        <div className="bg-[#0e0e0e] border border-[#1a1a1a] border-t-0 rounded-b-md -mt-1 mb-1 p-4">
          <div className="flex gap-2 mb-3">
            {m.clipUrl && (
              <a
                href={m.clipUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] px-[10px] py-1 bg-[#1a1a1a] text-[#22c55e] border border-[#22c55e44] rounded"
              >
                view clip
              </a>
            )}
            {clipSlug && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleEmbed()
                }}
                className={`inline-flex items-center gap-[6px] text-[10px] cursor-pointer select-none px-[10px] py-1 bg-[#1a1a1a] hover:bg-[#222] hover:text-[#999] border border-[#222] rounded ${
                  embedVisible ? 'text-[#999]' : 'text-[#555]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${embedVisible ? 'bg-[#22c55e]' : 'bg-[#333]'}`} />
                {embedVisible ? 'hide clip' : 'show clip'}
              </span>
            )}
            {m.vodUrl && (
              <a
                href={m.vodUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] px-[10px] py-1 bg-[#1a1a1a] hover:bg-[#222] text-[#666] hover:text-[#999] border border-[#222] rounded"
              >
                vod
              </a>
            )}
          </div>
          {m.description && (
            <div className="text-[12px] text-[#888] mb-3 leading-[1.6]">
              <b>{m.mood || ''}</b> — {m.description}
            </div>
          )}
          {embedVisible && clipSlug && typeof window !== 'undefined' && (
            <div className="w-full aspect-video rounded-md overflow-hidden mt-3 bg-[#0a0a0a]">
              <iframe
                src={`https://clips.twitch.tv/embed?clip=${clipSlug}&parent=${location.hostname}`}
                className="w-full h-full border-0"
                allowFullScreen
              />
            </div>
          )}
          {m.chatSnapshot && m.chatSnapshot.length > 0 && (
            <div className="text-[11px] text-[#444] leading-[1.7] max-h-[180px] overflow-y-auto px-3 py-[10px] bg-[#0a0a0a] rounded">
              {m.chatSnapshot.slice(0, 15).map((line, idx) => {
                const colonIdx = line.indexOf(': ')
                if (colonIdx > -1) {
                  return (
                    <div key={idx}>
                      <span className="text-[#555]">{line.slice(0, colonIdx)}:</span>{' '}
                      {line.slice(colonIdx + 2)}
                    </div>
                  )
                }
                return <div key={idx}>{line}</div>
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function ConfirmedChannelStats({ channels }: { channels: MyChannel[] }) {
  const [stats, setStats] = useState<Record<string, ChannelStats>>({})

  useEffect(() => {
    if (channels.length === 0) {
      setStats({})
      return
    }
    const refresh = async () => {
      const next: Record<string, ChannelStats> = {}
      await Promise.all(
        channels.map(async (ch) => {
          try {
            next[ch.channel] = await getJSON<ChannelStats>(`/channel-stats/${ch.channel}`)
          } catch {}
        })
      )
      setStats(next)
    }
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [channels])

  if (channels.length === 0) return null

  return (
    <div className="mb-7">
      <div className="text-[10px] font-medium uppercase tracking-[2px] text-[#444] mb-3">live stats</div>
      {channels.map((ch) => {
        const d = stats[ch.channel]
        return (
          <div
            key={ch.channel}
            className={`px-[14px] py-3 bg-[#111] border rounded-md text-[11px] mb-[6px] ${
              d?.isSpike ? 'border-[#f59e0b44]' : 'border-[#161616]'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[12px] font-semibold text-white">{ch.channel}</span>
              {d?.viewers ? <span className="text-[10px] text-[#444]">{(d.viewers / 1000).toFixed(1)}k</span> : null}
            </div>
            <div className="flex gap-3 text-[#555]">
              {d?.rate != null ? (
                <>
                  <span>
                    <b className="text-[#ccc]">{d.rate}</b> msg/s
                  </span>
                  <span>
                    base <b className="text-[#ccc]">{d.baseline}</b>
                  </span>
                  {d.isSpike && <span className="text-[#f59e0b]">+{d.jumpPercent}%</span>}
                </>
              ) : (
                <span className="text-[#222]">connecting...</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function mergeMoments(
  current: DashboardMoment[],
  fromDb: MomentsResponse['moments']
): DashboardMoment[] {
  const list = [...current]
  for (const m of fromDb) {
    if (list.some((s) => s.dbId === m.id)) continue
    list.push({
      id: `db-${m.id}`,
      dbId: m.id,
      channel: m.channel,
      jumpPercent: m.jumpPercent,
      viewers: null,
      vibe: m.vibe,
      mood: m.mood ?? null,
      description: m.description ?? null,
      chatSnapshot: m.chatSnapshot || [],
      clipUrl: m.clipUrl ?? null,
      clipId: m.clipId ?? null,
      vodUrl: m.vodUrl ?? null,
      vodTimestamp: m.vodTimestamp ?? null,
      receivedAt: m.spikeAt,
    })
  }

  // Dedupe by dbId or channel + 60s proximity
  const seen: DashboardMoment[] = []
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]
    const dupe = seen.find(
      (x) =>
        (s.dbId && x.dbId && s.dbId === x.dbId) ||
        (x.channel === s.channel && Math.abs(x.receivedAt - s.receivedAt) < 60_000)
    )
    if (dupe) {
      const sHasMore = !!(s.mood || s.clipUrl || s.dbId)
      const dupeHasNone = !dupe.mood && !dupe.clipUrl && !dupe.dbId
      if (sHasMore && dupeHasNone) {
        const idx = list.indexOf(dupe)
        if (idx > -1) list.splice(idx, 1)
        seen.push(s)
      } else {
        if (s.dbId && !dupe.dbId) dupe.dbId = s.dbId
        list.splice(i, 1)
      }
    } else {
      seen.push(s)
    }
  }

  list.sort((a, b) => b.receivedAt - a.receivedAt)
  return list
}
