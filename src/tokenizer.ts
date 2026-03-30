// Single-pass chat message tokenizer
// Replaces per-message regex scoring with token classification + map lookup

export type Vibe = 'funny' | 'hype' | 'awkward' | 'win' | 'loss' | 'neutral'

export interface VibeScores {
  funny: number
  hype: number
  awkward: number
  win: number
  loss: number
}

export type TokenType = 'emote' | 'word' | 'emoji' | 'punctuation' | 'mention' | 'url'

export interface Token {
  raw: string        // original text
  normalized: string // lowercased, collapsed repeats
  type: TokenType
  vibe: Vibe
  weight: number
}

// --- Emote + word vibe dictionary ---
// All lookups are O(1) via Map. Keys are lowercase.
const VIBE_MAP = new Map<string, { vibe: Vibe; weight: number; type: TokenType }>()

function emote(name: string, vibe: Vibe, weight: number) {
  VIBE_MAP.set(name.toLowerCase(), { vibe, weight, type: 'emote' })
}
function word(name: string, vibe: Vibe, weight: number) {
  VIBE_MAP.set(name.toLowerCase(), { vibe, weight, type: 'word' })
}

// ── Funny emotes ──
emote('KEKW', 'funny', 2)
emote('OMEGALUL', 'funny', 2)
emote('LUL', 'funny', 1)
emote('LULW', 'funny', 2)
emote('ICANT', 'funny', 2)
emote('pepeLaugh', 'funny', 2)
emote('LMAO', 'funny', 2)
emote('ROFL', 'funny', 2)
emote('4Head', 'funny', 1)
emote('EleGiggle', 'funny', 1)
emote('SeemsGood', 'funny', 1)
emote('pepeJam', 'funny', 1)
emote('pepeMeltdown', 'funny', 2)
emote('WAYTOODANK', 'funny', 2)
emote('Deadge', 'funny', 2)
emote('forsenLaughingAtYou', 'funny', 2)

// ── Hype emotes ──
emote('PogChamp', 'hype', 2)
emote('PogU', 'hype', 2)
emote('Pog', 'hype', 2)
emote('POGGIES', 'hype', 2)
emote('POGGERS', 'hype', 2)
emote('peepoClap', 'hype', 1)
emote('Clap', 'hype', 1)
emote('widepeepoHappy', 'hype', 1)
emote('HYPERS', 'hype', 2)
emote('GIGACHAD', 'hype', 2)
emote('EZ', 'hype', 1)
emote('Catjam', 'hype', 1)
emote('BASED', 'hype', 2)
emote('FeelsStrongMan', 'hype', 2)

// ── Awkward emotes ──
emote('monkaS', 'awkward', 2)
emote('monkaW', 'awkward', 2)
emote('monkaHmm', 'awkward', 1)
emote('Clueless', 'awkward', 1)
emote('Aware', 'awkward', 2)
emote('D:', 'awkward', 2)
emote('NotLikeThis', 'awkward', 2)
emote('FailFish', 'awkward', 1)
emote('modCheck', 'awkward', 1)
emote('Sussy', 'awkward', 1)
emote('Suge', 'awkward', 1)

// ── Win/Loss emotes ──
emote('Sadge', 'loss', 1)
emote('widepeepoSad', 'loss', 1)
emote('BibleThump', 'loss', 1)
emote('PepeHands', 'loss', 2)
emote('Copium', 'loss', 1)
emote('ResidentSleeper', 'loss', 1)

// ── Funny words ──
word('lol', 'funny', 1)
word('lmao', 'funny', 2)
word('lmfao', 'funny', 2)
word('rofl', 'funny', 2)
word('haha', 'funny', 1)
word('hahaha', 'funny', 2)
word('dead', 'funny', 1)
word('dying', 'funny', 1)
word('bruh', 'funny', 1)

// ── Hype words ──
word('insane', 'hype', 2)
word('holy', 'hype', 1)
word('sheesh', 'hype', 1)
word('alarm', 'hype', 2)
word('maxwin', 'hype', 2)
word('clutch', 'hype', 2)
word('goated', 'hype', 2)
word('goat', 'hype', 1)
word('bang', 'hype', 2)
word('banger', 'hype', 2)
word('clean', 'hype', 1)
word('nuts', 'hype', 1)
word('crazy', 'hype', 1)
word('insane', 'hype', 2)
word('godlike', 'hype', 2)

// ── Awkward words ──
word('yikes', 'awkward', 2)
word('cringe', 'awkward', 2)
word('weird', 'awkward', 1)
word('sus', 'awkward', 1)
word('sussy', 'awkward', 1)
word('uh', 'awkward', 1)
word('uhh', 'awkward', 1)
word('eww', 'awkward', 1)
word('ew', 'awkward', 1)

// ── Win words ──
word('ww', 'win', 2)
word('www', 'win', 2)
word('dub', 'win', 1)
word('gg', 'win', 1)

// ── Loss words ──
word('ll', 'loss', 2)
word('lll', 'loss', 2)
word('rip', 'loss', 1)
word('oof', 'loss', 1)
word('f', 'loss', 1)
word('ff', 'loss', 1)

// --- Emoji vibe map ---
const EMOJI_VIBES = new Map<string, { vibe: Vibe; weight: number }>([
  ['\u{1F480}', { vibe: 'funny', weight: 2 }],   // 💀
  ['\u{1F602}', { vibe: 'funny', weight: 1 }],   // 😂
  ['\u{1F923}', { vibe: 'funny', weight: 2 }],   // 🤣
  ['\u{1F62D}', { vibe: 'funny', weight: 1 }],   // 😭 (often used as laughing on twitch)
  ['\u{1F525}', { vibe: 'hype', weight: 1 }],    // 🔥
  ['\u{1F6A8}', { vibe: 'hype', weight: 2 }],    // 🚨
  ['\u{1F389}', { vibe: 'hype', weight: 1 }],    // 🎉
  ['\u{1F631}', { vibe: 'awkward', weight: 1 }],  // 😱
  ['\u{1F622}', { vibe: 'loss', weight: 1 }],     // 😢
])

// --- Known emote set (populated from 7TV/BTTV/FFZ APIs) ---
// Emotes not in VIBE_MAP still get type:'emote' for emote-only detection
const knownEmotes = new Set<string>()       // lowercase emote names (global)
const channelEmotes = new Map<string, Set<string>>()  // per-channel emote sets

// Auto-assign vibes to emotes based on name keywords
const VIBE_KEYWORDS: { pattern: string; vibe: Vibe; weight: number }[] = [
  // Funny
  { pattern: 'laugh', vibe: 'funny', weight: 1 },
  { pattern: 'lol', vibe: 'funny', weight: 1 },
  { pattern: 'lul', vibe: 'funny', weight: 1 },
  { pattern: 'kek', vibe: 'funny', weight: 1 },
  { pattern: 'dead', vibe: 'funny', weight: 1 },
  { pattern: 'clown', vibe: 'funny', weight: 1 },
  { pattern: 'melt', vibe: 'funny', weight: 1 },
  { pattern: 'comedy', vibe: 'funny', weight: 1 },
  { pattern: 'bruh', vibe: 'funny', weight: 1 },
  // Hype
  { pattern: 'pog', vibe: 'hype', weight: 1 },
  { pattern: 'hype', vibe: 'hype', weight: 1 },
  { pattern: 'clap', vibe: 'hype', weight: 1 },
  { pattern: 'dance', vibe: 'hype', weight: 1 },
  { pattern: 'jam', vibe: 'hype', weight: 1 },
  { pattern: 'happy', vibe: 'hype', weight: 1 },
  { pattern: 'strong', vibe: 'hype', weight: 1 },
  { pattern: 'chad', vibe: 'hype', weight: 1 },
  { pattern: 'based', vibe: 'hype', weight: 1 },
  { pattern: 'fire', vibe: 'hype', weight: 1 },
  // Awkward
  { pattern: 'monka', vibe: 'awkward', weight: 1 },
  { pattern: 'scared', vibe: 'awkward', weight: 1 },
  { pattern: 'sus', vibe: 'awkward', weight: 1 },
  { pattern: 'weird', vibe: 'awkward', weight: 1 },
  { pattern: 'cringe', vibe: 'awkward', weight: 1 },
  { pattern: 'stare', vibe: 'awkward', weight: 1 },
  { pattern: 'clueless', vibe: 'awkward', weight: 1 },
  // Loss
  { pattern: 'sad', vibe: 'loss', weight: 1 },
  { pattern: 'cry', vibe: 'loss', weight: 1 },
  { pattern: 'pain', vibe: 'loss', weight: 1 },
  { pattern: 'copium', vibe: 'loss', weight: 1 },
  { pattern: 'despair', vibe: 'loss', weight: 1 },
  { pattern: 'sadge', vibe: 'loss', weight: 1 },
  { pattern: 'rip', vibe: 'loss', weight: 1 },
  // Win
  { pattern: 'win', vibe: 'win', weight: 1 },
  { pattern: 'gg', vibe: 'win', weight: 1 },
  { pattern: 'ez', vibe: 'win', weight: 1 },
]

function autoVibeFromName(name: string): { vibe: Vibe; weight: number } | null {
  const lower = name.toLowerCase()
  for (const { pattern, vibe, weight } of VIBE_KEYWORDS) {
    if (lower.includes(pattern)) return { vibe, weight }
  }
  return null
}

function registerEmote(name: string) {
  const lower = name.toLowerCase()
  knownEmotes.add(lower)
  // If not already in VIBE_MAP, try auto-vibe from name
  if (!VIBE_MAP.has(lower)) {
    const autoVibe = autoVibeFromName(name)
    if (autoVibe) {
      VIBE_MAP.set(lower, { vibe: autoVibe.vibe, weight: autoVibe.weight, type: 'emote' })
    }
  }
}

function registerChannelEmote(channel: string, name: string) {
  const ch = channel.toLowerCase()
  if (!channelEmotes.has(ch)) channelEmotes.set(ch, new Set())
  channelEmotes.get(ch)!.add(name.toLowerCase())
  // Also register globally for token type detection
  registerEmote(name)
}

// Check if a token is a known emote (global or any channel)
function isKnownEmote(name: string): boolean {
  return knownEmotes.has(name.toLowerCase())
}

// --- Fetch emotes from 7TV/BTTV/FFZ APIs ---

async function fetch7TVGlobal(): Promise<string[]> {
  try {
    const res = await fetch('https://7tv.io/v3/emote-sets/global')
    const data = await res.json() as any
    return (data.emotes || []).map((e: any) => e.name)
  } catch (err: any) {
    console.error('[emotes] 7TV global fetch failed:', err.message)
    return []
  }
}

async function fetch7TVChannel(twitchId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchId}`)
    const data = await res.json() as any
    return (data.emote_set?.emotes || []).map((e: any) => e.name)
  } catch (err: any) {
    console.error(`[emotes] 7TV channel ${twitchId} fetch failed:`, err.message)
    return []
  }
}

async function fetchBTTVGlobal(): Promise<string[]> {
  try {
    const res = await fetch('https://api.betterttv.net/3/cached/emotes/global')
    const data = await res.json() as any
    return (data || []).map((e: any) => e.code)
  } catch (err: any) {
    console.error('[emotes] BTTV global fetch failed:', err.message)
    return []
  }
}

async function fetchBTTVChannel(twitchId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`)
    const data = await res.json() as any
    const shared = (data.sharedEmotes || []).map((e: any) => e.code)
    const channel = (data.channelEmotes || []).map((e: any) => e.code)
    return [...shared, ...channel]
  } catch (err: any) {
    console.error(`[emotes] BTTV channel ${twitchId} fetch failed:`, err.message)
    return []
  }
}

async function fetchFFZGlobal(): Promise<string[]> {
  try {
    const res = await fetch('https://api.frankerfacez.com/v1/set/global')
    const data = await res.json() as any
    const emotes: string[] = []
    for (const set of Object.values(data.sets || {}) as any[]) {
      for (const e of (set.emoticons || [])) emotes.push(e.name)
    }
    return emotes
  } catch (err: any) {
    console.error('[emotes] FFZ global fetch failed:', err.message)
    return []
  }
}

async function fetchFFZChannel(twitchId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.frankerfacez.com/v1/room/id/${twitchId}`)
    const data = await res.json() as any
    const emotes: string[] = []
    for (const set of Object.values(data.sets || {}) as any[]) {
      for (const e of (set.emoticons || [])) emotes.push(e.name)
    }
    return emotes
  } catch (err: any) {
    console.error(`[emotes] FFZ channel ${twitchId} fetch failed:`, err.message)
    return []
  }
}

// Load all global emotes from 7TV/BTTV/FFZ
export async function loadGlobalEmotes(): Promise<void> {
  console.log('[emotes] Loading global emotes from 7TV, BTTV, FFZ...')
  const [stv, bttv, ffz] = await Promise.all([
    fetch7TVGlobal(),
    fetchBTTVGlobal(),
    fetchFFZGlobal(),
  ])

  for (const name of [...stv, ...bttv, ...ffz]) registerEmote(name)
  console.log(`[emotes] Loaded ${knownEmotes.size} global emotes (7TV: ${stv.length}, BTTV: ${bttv.length}, FFZ: ${ffz.length})`)
}

// Resolve Twitch login -> user ID via GQL
async function resolveTwitchId(login: string): Promise<string | null> {
  try {
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: `query { user(login: "${login}") { id } }` }),
    })
    const data = await res.json() as any
    return data?.data?.user?.id || null
  } catch {
    return null
  }
}

// Load emotes for a specific channel (resolves Twitch ID automatically)
export async function loadChannelEmotes(channel: string, twitchId?: string): Promise<void> {
  if (!twitchId) {
    twitchId = await resolveTwitchId(channel) || undefined
    if (!twitchId) {
      console.error(`[emotes] Could not resolve Twitch ID for ${channel}`)
      return
    }
  }
  const [stv, bttv, ffz] = await Promise.all([
    fetch7TVChannel(twitchId),
    fetchBTTVChannel(twitchId),
    fetchFFZChannel(twitchId),
  ])

  for (const name of [...stv, ...bttv, ...ffz]) registerChannelEmote(channel, name)
  const total = stv.length + bttv.length + ffz.length
  console.log(`[emotes] Loaded ${total} emotes for ${channel} (7TV: ${stv.length}, BTTV: ${bttv.length}, FFZ: ${ffz.length})`)
}

// --- Gift sub detection tokens ---
const GIFT_SUB_TOKENS = new Set(['gifted', 'gifting'])
const GIFT_SUB_CONTEXT = new Set(['sub', 'subs', 'tier'])

// --- Unicode emoji detection (single codepoint check, no regex) ---
function isEmoji(str: string): boolean {
  const cp = str.codePointAt(0)
  if (!cp) return false
  // Common emoji ranges
  return (cp >= 0x1F300 && cp <= 0x1FAD6) || // Misc symbols, emoticons, etc
         (cp >= 0x2600 && cp <= 0x27BF) ||   // Misc symbols
         (cp >= 0xFE00 && cp <= 0xFE0F) ||   // Variation selectors
         (cp >= 0x1F900 && cp <= 0x1F9FF)    // Supplemental symbols
}

// --- Normalize repeated characters: LOOOOL -> lol, HAHAHA -> haha ---
function normalizeRepeats(s: string): string {
  // Collapse 3+ of the same char to 1: LOOOOL -> LOL
  let result = ''
  let prev = ''
  let count = 0
  for (const ch of s) {
    if (ch === prev) {
      count++
      if (count < 2) result += ch // keep up to 2 of same char
    } else {
      result += ch
      prev = ch
      count = 1
    }
  }
  return result.toLowerCase()
}

// --- Tokenize a message in a single pass ---
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const parts = text.split(/\s+/)

  for (const raw of parts) {
    if (!raw) continue

    // Check for URLs (skip scoring)
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      tokens.push({ raw, normalized: raw, type: 'url', vibe: 'neutral', weight: 0 })
      continue
    }

    // Check for @mentions
    if (raw.startsWith('@')) {
      tokens.push({ raw, normalized: raw.toLowerCase(), type: 'mention', vibe: 'neutral', weight: 0 })
      continue
    }

    // Check for pure punctuation (???, !!!)
    if (/^[?!.]+$/.test(raw)) {
      const vibe: Vibe = raw.includes('?') && raw.length >= 3 ? 'awkward' : 'neutral'
      const weight = vibe === 'awkward' ? 1 : 0
      tokens.push({ raw, normalized: raw, type: 'punctuation', vibe, weight })
      continue
    }

    // Check each character for emoji — extract emoji and remaining text
    const chars = [...raw]
    let textPart = ''

    for (const ch of chars) {
      const emojiVibe = EMOJI_VIBES.get(ch)
      if (emojiVibe) {
        // Flush any accumulated text first
        if (textPart) {
          tokens.push(classifyWord(textPart))
          textPart = ''
        }
        tokens.push({ raw: ch, normalized: ch, type: 'emoji', vibe: emojiVibe.vibe, weight: emojiVibe.weight })
      } else if (isEmoji(ch)) {
        if (textPart) {
          tokens.push(classifyWord(textPart))
          textPart = ''
        }
        tokens.push({ raw: ch, normalized: ch, type: 'emoji', vibe: 'neutral', weight: 0 })
      } else {
        textPart += ch
      }
    }

    // Classify any remaining text
    if (textPart) {
      tokens.push(classifyWord(textPart))
    }
  }

  return tokens
}

// Classify a single word/emote token via map lookup
function classifyWord(raw: string): Token {
  const lower = raw.toLowerCase()

  // Direct lookup first (covers emotes + exact words with vibes)
  const direct = VIBE_MAP.get(lower)
  if (direct) {
    return { raw, normalized: lower, type: direct.type, vibe: direct.vibe, weight: direct.weight }
  }

  // Check if it's a known emote (from 7TV/BTTV/FFZ) — case-insensitive
  if (isKnownEmote(raw)) {
    return { raw, normalized: lower, type: 'emote', vibe: 'neutral', weight: 0 }
  }

  // Try normalized (collapsed repeats): LOOOOL -> lol, OMEGALUUUL -> omegalul
  const norm = normalizeRepeats(raw)
  const normLookup = VIBE_MAP.get(norm)
  if (normLookup) {
    return { raw, normalized: norm, type: normLookup.type, vibe: normLookup.vibe, weight: normLookup.weight }
  }

  // Single-char vibes: lone "W" or "L"
  if (lower === 'w') return { raw, normalized: lower, type: 'word', vibe: 'win', weight: 1 }
  if (lower === 'l') return { raw, normalized: lower, type: 'word', vibe: 'loss', weight: 1 }

  // Default: unscored word
  return { raw, normalized: lower, type: 'word', vibe: 'neutral', weight: 0 }
}

// --- Score a tokenized message ---
export function scoreTokens(tokens: Token[]): VibeScores {
  const scores: VibeScores = { funny: 0, hype: 0, awkward: 0, win: 0, loss: 0 }
  for (const t of tokens) {
    if (t.vibe !== 'neutral' && t.weight > 0) {
      scores[t.vibe] += t.weight
    }
  }

  // Bigram bonuses: check adjacent token pairs for multi-word patterns
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i].normalized
    const b = tokens[i + 1].normalized
    const bigram = a + ' ' + b

    switch (bigram) {
      case 'lets go':
      case 'let\'s go':
        scores.hype += 2; break
      case 'w take':
      case 'w chat':
      case 'w streamer':
        scores.win += 2; break
      case 'l take':
      case 'l chat':
      case 'l streamer':
        scores.loss += 2; break
      case 'no way':
      case 'no shot':
        scores.hype += 1; break
    }
  }

  return scores
}

// --- Detect gift sub messages from tokens (no regex) ---
export function isGiftSub(tokens: Token[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const norm = tokens[i].normalized
    if (GIFT_SUB_TOKENS.has(norm)) {
      // Check if any nearby token (within 3) contains sub/tier context
      for (let j = Math.max(0, i - 2); j < Math.min(tokens.length, i + 4); j++) {
        if (j !== i && GIFT_SUB_CONTEXT.has(tokens[j].normalized)) {
          return true
        }
      }
    }
  }
  return false
}

// --- Message analysis: tokenize + score in one call ---
export interface MessageAnalysis {
  tokens: Token[]
  scores: VibeScores
  giftSub: boolean
  emoteOnly: boolean  // true if message is purely emotes/emoji (no real words)
  emoteCount: number  // number of emote tokens
  wordCount: number   // number of non-emote word tokens
}

export function analyzeMessage(text: string): MessageAnalysis {
  const tokens = tokenize(text)
  const scores = scoreTokens(tokens)
  const giftSub = isGiftSub(tokens)

  // Count token types
  let emoteCount = 0
  let wordCount = 0
  for (const t of tokens) {
    if (t.type === 'emote' || t.type === 'emoji') emoteCount++
    else if (t.type === 'word') wordCount++
  }

  // Emote-only: all meaningful tokens are emotes/emoji (ignore punctuation, mentions, urls)
  const emoteOnly = emoteCount > 0 && wordCount === 0

  return { tokens, scores, giftSub, emoteOnly, emoteCount, wordCount }
}
