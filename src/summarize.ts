import { getRecentMessages } from './firehose'
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

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
    // Write JSON body to a temp file to avoid shell escaping hell
    const tmpFile = join(tmpdir(), `tempo-req-${Date.now()}.json`)
    writeFileSync(tmpFile, JSON.stringify(body))

    // Convert Windows path to WSL path
    const wslTmpFile = tmpFile.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)

    const cmd = `wsl -- bash -c '$HOME/.local/bin/tempo request -X POST -H "Content-Type: application/json" -d @${wslTmpFile} https://anthropic.mpp.tempo.xyz/v1/messages'`

    console.log('[summarize] Calling Anthropic via MPP...')
    const result = execSync(cmd, {
      timeout: 45000,
      encoding: 'utf-8',
      maxBuffer: 5 * 1024 * 1024,
    })

    // Clean up temp file
    try { unlinkSync(tmpFile) } catch {}

    console.log('[summarize] Raw response length:', result.length)

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
    if (err.stdout) console.error('[summarize] stdout:', err.stdout?.toString().substring(0, 500))
    if (err.stderr) console.error('[summarize] stderr:', err.stderr?.toString().substring(0, 500))

    // Fallback: basic local summary
    return buildFallbackSummary(messages)
  }
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
