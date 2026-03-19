import WebSocket from 'ws'

export interface ChatMessage {
  channel: string
  displayName: string
  text: string
  timestamp: number
  tags?: {
    badges?: string
    color?: string
    emotes?: string
  }
}

export interface ChannelState {
  name: string
  // Rolling window: timestamps of messages in last 60s
  messageTimes: number[]
  // Last 200 messages
  recentMessages: ChatMessage[]
  // Spike detection
  avgRate: number // smoothed average msgs/sec
  lastSpikeAt: number | null
  peakRate: number
}

const channels = new Map<string, ChannelState>()
let totalMsgsPerSec = 0
let connected = false

function getOrCreateChannel(name: string): ChannelState {
  let state = channels.get(name)
  if (!state) {
    state = {
      name,
      messageTimes: [],
      recentMessages: [],
      avgRate: 0,
      lastSpikeAt: null,
      peakRate: 0,
    }
    channels.set(name, state)
  }
  return state
}

function processMessage(msg: ChatMessage) {
  const state = getOrCreateChannel(msg.channel)
  const now = Date.now()

  state.messageTimes.push(now)
  state.recentMessages.push(msg)

  // Keep only last 200 messages
  if (state.recentMessages.length > 200) {
    state.recentMessages.shift()
  }
}

// Clean old timestamps and update rates every second
setInterval(() => {
  const now = Date.now()
  const cutoff = now - 60_000 // 60 second window

  let totalRate = 0

  for (const [name, state] of channels) {
    // Remove timestamps older than 60s
    state.messageTimes = state.messageTimes.filter(t => t > cutoff)

    const currentRate = state.messageTimes.length / 60 // msgs per second over last minute

    // Smoothed average (exponential moving average)
    if (state.avgRate === 0) {
      state.avgRate = currentRate
    } else {
      state.avgRate = state.avgRate * 0.9 + currentRate * 0.1
    }

    // Spike detection: current rate > 2x the smoothed average
    if (currentRate > state.avgRate * 2 && currentRate > 1) {
      state.lastSpikeAt = now
      if (currentRate > state.peakRate) {
        state.peakRate = currentRate
      }
    }

    totalRate += currentRate

    // Clean up dead channels (no messages in 5 min)
    if (state.messageTimes.length === 0 && state.recentMessages.length === 0) {
      channels.delete(name)
    }
  }

  totalMsgsPerSec = totalRate
}, 1000)

export function connectFirehose(instance = 'logs.spanix.team') {
  const url = `wss://${instance}/firehose?jsonBasic=true`
  console.log(`[firehose] Connecting to ${url}...`)

  const ws = new WebSocket(url)

  ws.on('open', () => {
    connected = true
    console.log('[firehose] Connected!')
  })

  ws.on('message', (data) => {
    try {
      const msg: ChatMessage = JSON.parse(data.toString())
      if (msg.channel && msg.text) {
        processMessage(msg)
      }
    } catch {
      // skip malformed messages
    }
  })

  ws.on('close', () => {
    connected = false
    console.log('[firehose] Disconnected. Reconnecting in 3s...')
    setTimeout(() => connectFirehose(instance), 3000)
  })

  ws.on('error', (err) => {
    console.error('[firehose] Error:', err.message)
    ws.close()
  })

  return ws
}

// Public API for routes to query state
export function getTrending(limit = 20) {
  const sorted = [...channels.values()]
    .map(ch => ({
      channel: ch.name,
      msgsPerSec: Math.round((ch.messageTimes.length / 60) * 100) / 100,
      totalLast60s: ch.messageTimes.length,
    }))
    .sort((a, b) => b.msgsPerSec - a.msgsPerSec)
    .slice(0, limit)

  return { channels: sorted, totalMsgsPerSec: Math.round(totalMsgsPerSec * 100) / 100 }
}

export function getChannel(name: string) {
  const state = channels.get(name) || channels.get(name.toLowerCase())
  if (!state) return null

  const now = Date.now()
  const msgsPerSec = Math.round((state.messageTimes.length / 60) * 100) / 100
  const isSpike = msgsPerSec > state.avgRate * 2 && msgsPerSec > 1

  return {
    channel: state.name,
    msgsPerSec,
    avgRate: Math.round(state.avgRate * 100) / 100,
    isSpike,
    lastSpikeAt: state.lastSpikeAt,
    peakRate: Math.round(state.peakRate * 100) / 100,
    recentMessages: state.recentMessages.slice(-50).map(m => ({
      user: m.displayName,
      text: m.text,
      timestamp: m.timestamp,
    })),
    messageCount: state.recentMessages.length,
  }
}

export function getSpikes(withinMinutes = 5) {
  const cutoff = Date.now() - withinMinutes * 60_000

  return [...channels.values()]
    .filter(ch => ch.lastSpikeAt && ch.lastSpikeAt > cutoff)
    .map(ch => ({
      channel: ch.name,
      spikeAt: ch.lastSpikeAt,
      currentRate: Math.round((ch.messageTimes.length / 60) * 100) / 100,
      avgRate: Math.round(ch.avgRate * 100) / 100,
      peakRate: Math.round(ch.peakRate * 100) / 100,
    }))
    .sort((a, b) => b.currentRate - a.currentRate)
}

export function getRecentMessages(channelName: string, limit = 100): string[] {
  const state = channels.get(channelName) || channels.get(channelName.toLowerCase())
  if (!state) return []
  return state.recentMessages.slice(-limit).map(m => `${m.displayName}: ${m.text}`)
}

export function isConnected() {
  return connected
}

export function getStats() {
  return {
    connected,
    totalChannels: channels.size,
    totalMsgsPerSec: Math.round(totalMsgsPerSec * 100) / 100,
  }
}
