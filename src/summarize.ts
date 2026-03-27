import { getRecentMessages } from './firehose.js'
import { Mppx, tempo } from 'mppx/client'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempo as tempoChain } from 'viem/chains'
import { db } from './db/index.js'
import { llmUsage } from './db/schema.js'
import { eq } from 'drizzle-orm'

// --- Direct Anthropic API (for dashboard users, free tier) ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

// Budget tracking (restored from DB on startup)
let totalInputTokens = 0
let totalOutputTokens = 0
let totalCalls = 0
const BUDGET_LIMIT_USD = parseFloat(process.env.LLM_BUDGET_USD || '20')

function estimateCostUSD(): number {
  // Sonnet 4 pricing: $3/1M input, $15/1M output
  return (totalInputTokens * 3 + totalOutputTokens * 15) / 1_000_000
}

export function getLLMBudget() {
  const spent = estimateCostUSD()
  return {
    spent: Math.round(spent * 10000) / 10000,
    limit: BUDGET_LIMIT_USD,
    remaining: Math.round((BUDGET_LIMIT_USD - spent) * 10000) / 10000,
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
  }
}

function isBudgetExhausted(): boolean {
  return estimateCostUSD() >= BUDGET_LIMIT_USD
}

// Restore LLM usage from DB
export async function restoreLLMUsage() {
  if (!db) return
  try {
    const rows = await db.select().from(llmUsage).where(eq(llmUsage.id, 'global'))
    if (rows.length > 0) {
      totalInputTokens = rows[0].totalInputTokens
      totalOutputTokens = rows[0].totalOutputTokens
      totalCalls = rows[0].totalCalls
      console.log(`[llm] Restored usage: ${totalCalls} calls, $${estimateCostUSD().toFixed(4)} spent`)
    }
  } catch (err: any) {
    console.error('[llm] Failed to restore usage:', err.message)
  }
}

// Persist LLM usage to DB (called after each API call)
async function persistLLMUsage() {
  if (!db) return
  try {
    await db.insert(llmUsage).values({
      id: 'global',
      totalInputTokens,
      totalOutputTokens,
      totalCalls,
    }).onConflictDoUpdate({
      target: llmUsage.id,
      set: {
        totalInputTokens,
        totalOutputTokens,
        totalCalls,
        updatedAt: new Date(),
      },
    })
  } catch {}
}

// Direct Anthropic fetch with retry
async function anthropicFetch(body: object): Promise<any> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
  if (isBudgetExhausted()) throw new Error('LLM budget exhausted')

  for (let i = 0; i <= 2; i++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (res.status === 429) {
      const wait = 5000 * (i + 1)
      console.log(`[anthropic] 429 rate limited, retrying in ${wait / 1000}s...`)
      await new Promise(r => setTimeout(r, wait))
      continue
    }

    const result = await res.json()

    // Track token usage
    if (result.usage) {
      totalInputTokens += result.usage.input_tokens || 0
      totalOutputTokens += result.usage.output_tokens || 0
      totalCalls++
      persistLLMUsage()
    }

    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${JSON.stringify(result)}`)
    }

    return result
  }

  throw new Error('Anthropic API: max retries exceeded')
}

// --- MPP client (for paid agent endpoints) ---
const SESSION_KEY = process.env.TEMPO_SESSION_KEY || '0x68c50e09fea51bb3e113dca81a56f3c6cc5b354bdf1d4715780a9c0b2ecf1251'

const account = privateKeyToAccount(SESSION_KEY as `0x${string}`)

const tempoMethod = tempo({
  account,
  maxDeposit: '1.00',
  // @ts-ignore walletClient required at runtime but missing from mppx types
  walletClient: createWalletClient({
    account,
    chain: tempoChain,
    transport: http(process.env.TEMPO_RPC || 'https://rpc.tempo.xyz'),
  }),
})

const mppClient = Mppx.create({
  methods: [tempoMethod],
})

// Helper: fetch with retry on 429
async function mppFetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await mppClient.fetch(url, options)
    if (res.status !== 429) return res
    const wait = 5000 * (i + 1) // 5s, 10s, 15s
    console.log(`[mpp] 429 rate limited, retrying in ${wait/1000}s...`)
    await new Promise(r => setTimeout(r, wait))
  }
  return mppClient.fetch(url, options)
}

// Call Anthropic via MPP to summarize chat
export async function summarizeChannel(channel: string): Promise<{
  summary: string
  sentiment: string
  topTopics: string[]
}> {
  const messages = getRecentMessages(channel, 100)

  if (messages.length === 0) {
    return {
      summary: `No recent messages found for channel "${channel}".`,
      sentiment: 'neutral',
      topTopics: [],
    }
  }

  const chatLog = messages.join('\n')

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `You are analyzing a Twitch chat log. Summarize what the chat is talking about in 2-3 sentences. Also identify the overall sentiment (positive, negative, excited, toxic, chill, mixed) and the top 3 topics being discussed.

Respond ONLY with this JSON format, no other text:
{"summary": "...", "sentiment": "...", "topTopics": ["topic1", "topic2", "topic3"]}

Here is the chat log:
${chatLog}`,
      },
    ],
  }

  try {
    console.log('[summarize] Calling Anthropic via MPP...')
    const res = await mppFetchWithRetry('https://anthropic.mpp.tempo.xyz/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const result = await res.text()
    console.log('[summarize] Raw response length:', result.length)
    console.log('[summarize] Raw response:', result.substring(0, 500))

    // Parse Anthropic response
    const response = JSON.parse(result)
    const text = response.content?.[0]?.text || response.text || result

    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        summary: parsed.summary || 'Unable to summarize.',
        sentiment: parsed.sentiment || 'unknown',
        topTopics: parsed.topTopics || [],
      }
    }

    return {
      summary: typeof text === 'string' ? text : JSON.stringify(text),
      sentiment: 'unknown',
      topTopics: [],
    }
  } catch (err: any) {
    console.error('[summarize] Error calling Anthropic via MPP:', err.message)

    // Fallback: basic local summary
    return buildFallbackSummary(messages)
  }
}

// Quick spike classification — takes chat snapshot, returns mood + what happened
export async function classifySpike(chatSnapshot: string[]): Promise<{
  mood: string
  description: string
  clipWorthy: boolean
} | null> {
  if (chatSnapshot.length === 0) return null

  const chatLog = chatSnapshot.join('\n')

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `Twitch chat just spiked. Classify the mood, say what happened in ONE short sentence, and decide if this is clip-worthy (a viewer would rewind to see this moment).

Moods: hype, funny, rage, clutch, awkward, wholesome, drama, shock, sad, neutral

Respond ONLY with JSON: {"mood": "...", "description": "...", "clipWorthy": true/false}

Chat:
${chatLog}`,
      },
    ],
  }

  try {
    const res = await mppFetchWithRetry('https://anthropic.mpp.tempo.xyz/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const result = await res.text()
    if (!res.ok) {
      console.error(`[classify] HTTP ${res.status}: ${result.substring(0, 200)}`)
      return null
    }
    const response = JSON.parse(result)
    const text = response.content?.[0]?.text || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        mood: parsed.mood || 'unknown',
        description: parsed.description || '',
        clipWorthy: !!parsed.clipWorthy,
      }
    }
    return null
  } catch (err: any) {
    console.error('[classify] Error:', err.message)
    if (err.cause) console.error('[classify] Cause:', err.cause)
    if (err.status) console.error('[classify] Status:', err.status)
    return null
  }
}

// --- Direct Anthropic API versions (for dashboard / free tier) ---

export async function classifySpikeDirect(chatSnapshot: string[]): Promise<{
  mood: string
  description: string
  clipWorthy: boolean
} | null> {
  if (chatSnapshot.length === 0) return null

  try {
    const response = await anthropicFetch({
      model: ANTHROPIC_MODEL,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `Twitch chat just spiked. Classify the mood, say what happened in ONE short sentence, and decide if this is clip-worthy (a viewer would rewind to see this moment).

Moods: hype, funny, rage, clutch, awkward, wholesome, drama, shock, sad, neutral

Respond ONLY with JSON: {"mood": "...", "description": "...", "clipWorthy": true/false}

Chat:
${chatSnapshot.join('\n')}`,
        },
      ],
    })

    const text = response.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        mood: parsed.mood || 'unknown',
        description: parsed.description || '',
        clipWorthy: !!parsed.clipWorthy,
      }
    }
    return null
  } catch (err: any) {
    console.error('[classify-direct] Error:', err.message)
    return null
  }
}

export async function summarizeChannelDirect(channel: string): Promise<{
  summary: string
  sentiment: string
  topTopics: string[]
}> {
  const messages = getRecentMessages(channel, 100)
  if (messages.length === 0) {
    return { summary: `No recent messages for "${channel}".`, sentiment: 'neutral', topTopics: [] }
  }

  try {
    const response = await anthropicFetch({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `You are analyzing a Twitch chat log. Summarize what the chat is talking about in 2-3 sentences. Also identify the overall sentiment (positive, negative, excited, toxic, chill, mixed) and the top 3 topics being discussed.

Respond ONLY with this JSON format, no other text:
{"summary": "...", "sentiment": "...", "topTopics": ["topic1", "topic2", "topic3"]}

Here is the chat log:
${messages.join('\n')}`,
        },
      ],
    })

    const text = response.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        summary: parsed.summary || 'Unable to summarize.',
        sentiment: parsed.sentiment || 'unknown',
        topTopics: parsed.topTopics || [],
      }
    }
    return { summary: text, sentiment: 'unknown', topTopics: [] }
  } catch (err: any) {
    console.error('[summarize-direct] Error:', err.message)
    return buildFallbackSummary(messages)
  }
}

// Returns true if direct Anthropic API is available and within budget
export function hasDirectAPI(): boolean {
  return !!ANTHROPIC_API_KEY && !isBudgetExhausted()
}

function buildFallbackSummary(messages: string[]) {
  const wordFreq = new Map<string, number>()
  const stopWords = new Set(['that', 'this', 'with', 'from', 'have', 'they', 'what', 'just', 'like', 'your', 'will'])

  for (const msg of messages) {
    const words = msg.split(':').slice(1).join(':').trim().toLowerCase().split(/\s+/)
    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
      }
    }
  }
  const topWords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)

  return {
    summary: `Chat is active with ${messages.length} recent messages. Common words: ${topWords.join(', ')}. (LLM summary unavailable — using fallback)`,
    sentiment: 'unknown',
    topTopics: topWords.slice(0, 3),
  }
}
