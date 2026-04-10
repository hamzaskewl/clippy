'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Topbar } from '@/components/Topbar'
import { AuthGuard } from '@/components/AuthGuard'
import { getJSON, postJSON, deleteJSON } from '@/lib/api'
import { timeAgoLong } from '@/lib/format'

interface AdminStats {
  auth: { totalUsers: number; availableInvites: number }
  system: { totalChannels?: number; totalMsgsPerSec?: number }
  llm: { spent: number; remaining: number; limit: number; totalCalls: number }
}

interface InviteCode {
  code: string
  label?: string | null
  useCount: number
  maxUses: number
  uses?: { usedByName: string }[]
}

interface AdminUser {
  id: string
  username: string
  role: 'admin' | 'user'
  lastSeen: number
  createdAt: number
}

interface DetailedUser {
  id: string
  username: string
  role: 'admin' | 'user'
  lastSeen: number
  createdAt: number
  hasOAuth: boolean
  clipsCreated: number
  momentsTotal: number
  channels: { channel: string; confirmed: boolean }[]
}

interface WhitelistEntry {
  username: string
}

const USES_PRESETS = [1, 5, 10, 25, 100]

export default function AdminPage() {
  return (
    <AuthGuard role="admin">
      <AdminInner />
    </AuthGuard>
  )
}

function AdminInner() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([])
  const [detailedUsers, setDetailedUsers] = useState<DetailedUser[]>([])

  const [inviteLabel, setInviteLabel] = useState('')
  const [selectedUses, setSelectedUses] = useState<number>(5)
  const [customUses, setCustomUses] = useState('')
  const [whitelistInput, setWhitelistInput] = useState('')

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'clips-desc' | 'clips-asc' | 'moments-desc' | 'last-seen' | 'joined' | 'channels-desc'>('clips-desc')
  const [filter, setFilter] = useState<'all' | 'has-oauth' | 'no-oauth' | 'has-clips' | 'no-clips' | 'has-channels'>('all')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    try {
      setStats(await getJSON<AdminStats>('/admin/stats'))
    } catch {}
  }, [])
  const loadInvites = useCallback(async () => {
    try {
      const d = await getJSON<{ invites: InviteCode[] }>('/admin/invites')
      setInvites(d.invites || [])
    } catch {}
  }, [])
  const loadUsers = useCallback(async () => {
    try {
      const d = await getJSON<{ users: AdminUser[] }>('/admin/users')
      setUsers(d.users || [])
    } catch {}
  }, [])
  const loadWhitelist = useCallback(async () => {
    try {
      const d = await getJSON<{ whitelist: WhitelistEntry[] }>('/admin/whitelist')
      setWhitelist(d.whitelist || [])
    } catch {}
  }, [])
  const loadDetailed = useCallback(async () => {
    try {
      const d = await getJSON<{ users: DetailedUser[] }>('/admin/users/detailed')
      setDetailedUsers(d.users || [])
    } catch {}
  }, [])

  useEffect(() => {
    loadStats()
    loadInvites()
    loadUsers()
    loadWhitelist()
    loadDetailed()
    const id = setInterval(loadStats, 10000)
    return () => clearInterval(id)
  }, [loadStats, loadInvites, loadUsers, loadWhitelist, loadDetailed])

  async function createInvite() {
    try {
      const maxUses = customUses ? Math.min(parseInt(customUses, 10) || 5, 10000) : selectedUses
      await postJSON('/admin/invite', { label: inviteLabel.trim(), maxUses })
      setInviteLabel('')
      setCustomUses('')
      setSelectedUses(5)
      await Promise.all([loadInvites(), loadStats()])
    } catch {}
  }

  async function deleteInvite(code: string) {
    if (!confirm(`Delete invite code ${code}?`)) return
    try {
      await deleteJSON(`/admin/invites/${code}`)
      await Promise.all([loadInvites(), loadStats()])
    } catch {}
  }

  async function revokeUser(id: string, username: string) {
    if (!confirm(`Revoke access for ${username}? This deletes their account and all sessions.`)) return
    try {
      await deleteJSON(`/admin/users/${id}`)
      await Promise.all([loadUsers(), loadDetailed(), loadStats()])
    } catch {}
  }

  async function revokeToken(id: string, username: string) {
    if (!confirm(`Revoke OAuth token for ${username}? They will need to re-login to create clips.`)) return
    try {
      await deleteJSON(`/admin/users/${id}/token`)
      await loadDetailed()
    } catch {}
  }

  async function addWhitelist() {
    const username = whitelistInput.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    setWhitelistInput('')
    if (!username) return
    try {
      await postJSON('/admin/whitelist', { username })
      await loadWhitelist()
    } catch {}
  }

  async function removeWhitelist(username: string) {
    try {
      await deleteJSON(`/admin/whitelist/${username}`)
      await loadWhitelist()
    } catch {}
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const filteredUsers = useMemo(() => {
    let list = [...detailedUsers]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.id.includes(q) ||
          u.channels.some((c) => c.channel.toLowerCase().includes(q))
      )
    }
    if (filter === 'has-oauth') list = list.filter((u) => u.hasOAuth)
    else if (filter === 'no-oauth') list = list.filter((u) => !u.hasOAuth)
    else if (filter === 'has-clips') list = list.filter((u) => u.clipsCreated > 0)
    else if (filter === 'no-clips') list = list.filter((u) => u.clipsCreated === 0)
    else if (filter === 'has-channels') list = list.filter((u) => u.channels.length > 0)

    if (sort === 'clips-desc') list.sort((a, b) => b.clipsCreated - a.clipsCreated)
    else if (sort === 'clips-asc') list.sort((a, b) => a.clipsCreated - b.clipsCreated)
    else if (sort === 'moments-desc') list.sort((a, b) => b.momentsTotal - a.momentsTotal)
    else if (sort === 'last-seen') list.sort((a, b) => b.lastSeen - a.lastSeen)
    else if (sort === 'joined') list.sort((a, b) => b.createdAt - a.createdAt)
    else if (sort === 'channels-desc') list.sort((a, b) => b.channels.length - a.channels.length)

    return list
  }, [detailedUsers, search, sort, filter])

  const budgetPct = stats ? Math.min(100, (stats.llm.spent / stats.llm.limit) * 100) : 0
  const budgetColor = budgetPct > 80 ? 'bg-[#ef4444]' : budgetPct > 50 ? 'bg-gradient-to-r from-[#f59e0b] to-[#ef4444]' : 'bg-gradient-to-r from-[#22c55e] to-[#f59e0b]'

  return (
    <>
      <Topbar showLogout />
      <div className="max-w-[1400px] mx-auto p-4 md:p-8">
        <div className="text-[11px] uppercase tracking-[2px] text-[#444] mb-6">admin panel</div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard val={stats?.auth.totalUsers ?? '-'} label="users" />
          <StatCard val={stats?.auth.availableInvites ?? '-'} label="invites available" />
          <StatCard val={stats?.system.totalChannels?.toLocaleString() ?? '-'} label="channels" />
          <StatCard val={stats?.system.totalMsgsPerSec?.toFixed(0) ?? '-'} label="msg/s" />
          <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-5">
            <div className="text-[28px] font-bold text-white">${stats?.llm.spent.toFixed(4) ?? '-'}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#444] mt-1">LLM spent</div>
            <div className="text-[11px] text-[#333] mt-[2px]">
              {stats && `$${stats.llm.remaining.toFixed(2)} / $${stats.llm.limit} remaining`}
            </div>
            <div className="w-full h-2 bg-[#1a1a1a] rounded mt-3 overflow-hidden">
              <div className={`h-full rounded transition-all ${budgetColor}`} style={{ width: `${budgetPct}%` }} />
            </div>
          </div>
          <StatCard val={stats?.llm.totalCalls ?? '-'} label="LLM calls" />
        </div>

        {/* Invites + Users (basic) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Invite codes */}
          <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-6">
            <div className="text-[10px] uppercase tracking-wider text-[#555] mb-4">invite codes</div>
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                type="text"
                value={inviteLabel}
                onChange={(e) => setInviteLabel(e.target.value)}
                placeholder="label (optional)"
                className="flex-1 min-w-[140px] bg-[#0a0a0a] border border-[#1a1a1a] focus:border-[#333] rounded px-[14px] py-[10px] text-white text-[12px] outline-none"
              />
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-[#444] whitespace-nowrap">uses:</span>
                {USES_PRESETS.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setSelectedUses(n)
                      setCustomUses('')
                    }}
                    className={`bg-[#0e0e0e] border rounded text-[11px] px-2 py-[5px] min-w-[28px] text-center ${
                      selectedUses === n && !customUses
                        ? 'border-[#9146ff] text-[#9146ff] bg-[#1a0a2a]'
                        : 'border-[#222] text-[#555] hover:border-[#444] hover:text-[#999]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={customUses}
                  onChange={(e) => setCustomUses(e.target.value)}
                  placeholder="#"
                  className="w-12 bg-[#0e0e0e] border border-[#222] rounded text-white text-[11px] px-[6px] py-1 text-center outline-none"
                />
              </div>
              <button
                onClick={createInvite}
                className="bg-[#9146ff] hover:bg-[#7c3aed] text-white text-[12px] font-semibold px-5 py-[10px] rounded"
              >
                generate
              </button>
            </div>
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr>
                    <Th>code</Th>
                    <Th>label</Th>
                    <Th>uses</Th>
                    <Th>used by</Th>
                    <Th>{''}</Th>
                  </tr>
                </thead>
                <tbody>
                  {invites.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-[#222] text-center p-6">
                        no invite codes yet
                      </td>
                    </tr>
                  ) : (
                    invites.map((i) => {
                      const exhausted = i.useCount >= i.maxUses
                      const pct = Math.min(100, (i.useCount / i.maxUses) * 100)
                      return (
                        <tr key={i.code} className="hover:bg-[#0e0e0e]">
                          <td className="py-[10px] px-3 border-b border-[#111] tracking-[1px] text-[#9146ff] font-medium">
                            {i.code}
                          </td>
                          <td className="py-[10px] px-3 border-b border-[#111] text-[#999]">{i.label || '-'}</td>
                          <td className="py-[10px] px-3 border-b border-[#111] text-[#999]">
                            <div className="flex items-center gap-1">
                              <div className="h-[3px] rounded bg-[#222] flex-1 overflow-hidden">
                                <div
                                  className={`h-full rounded ${exhausted ? 'bg-[#ef4444]' : 'bg-[#9146ff]'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-[#555] whitespace-nowrap">
                                {i.useCount}/{i.maxUses}
                              </span>
                            </div>
                            <span
                              className={`inline-block px-2 py-[2px] rounded text-[10px] mt-1 ${
                                exhausted ? 'bg-[#111] text-[#333]' : 'bg-[#0a1a0a] text-[#22c55e]'
                              }`}
                            >
                              {exhausted ? 'exhausted' : 'available'}
                            </span>
                          </td>
                          <td className="py-[10px] px-3 border-b border-[#111] text-[#999]">
                            {i.uses && i.uses.length > 0 ? (
                              <div className="text-[10px] text-[#555] leading-[1.6]">
                                {i.uses.map((u, idx) => (
                                  <span key={idx} className="text-[#888]">
                                    {u.usedByName}
                                    {idx < i.uses!.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[#333]">—</span>
                            )}
                          </td>
                          <td className="py-[10px] px-3 border-b border-[#111] flex gap-1">
                            {!exhausted && (
                              <button
                                onClick={() => copyCode(i.code)}
                                className={`border rounded text-[10px] px-2 py-[2px] ${
                                  copiedCode === i.code
                                    ? 'border-[#22c55e] text-[#22c55e]'
                                    : 'border-[#222] text-[#555] hover:border-[#444] hover:text-[#999]'
                                }`}
                              >
                                {copiedCode === i.code ? 'copied' : 'copy'}
                              </button>
                            )}
                            <button
                              onClick={() => deleteInvite(i.code)}
                              className="border border-[#ef444444] text-[#ef4444] rounded text-[10px] px-2 py-[2px] hover:bg-[#1a0a0a]"
                            >
                              del
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Users (basic) */}
          <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-6">
            <div className="text-[10px] uppercase tracking-wider text-[#555] mb-4">users</div>
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr>
                    <Th>user</Th>
                    <Th>role</Th>
                    <Th>last seen</Th>
                    <Th>joined</Th>
                    <Th>{''}</Th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-[#222] text-center p-6">
                        no users yet
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-[#0e0e0e]">
                        <td className="py-[10px] px-3 border-b border-[#111] text-white">{u.username}</td>
                        <td className="py-[10px] px-3 border-b border-[#111]">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="py-[10px] px-3 border-b border-[#111] text-[#999]">{timeAgoLong(u.lastSeen)}</td>
                        <td className="py-[10px] px-3 border-b border-[#111] text-[#999]">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-[10px] px-3 border-b border-[#111]">
                          {u.role !== 'admin' && (
                            <button
                              onClick={() => revokeUser(u.id, u.username)}
                              className="border border-[#ef444444] text-[#ef4444] rounded text-[10px] px-2 py-[2px] hover:bg-[#1a0a0a]"
                            >
                              revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detailed users */}
        <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-6 mb-4">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div className="text-[10px] uppercase tracking-wider text-[#555]">user details</div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search users..."
                className="bg-[#0a0a0a] border border-[#1a1a1a] rounded px-3 py-[6px] text-white text-[11px] outline-none w-[180px]"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="bg-[#0a0a0a] border border-[#1a1a1a] rounded px-[10px] py-[6px] text-[#888] text-[11px] outline-none cursor-pointer"
              >
                <option value="clips-desc">most clips</option>
                <option value="clips-asc">least clips</option>
                <option value="moments-desc">most moments</option>
                <option value="last-seen">last seen</option>
                <option value="joined">newest</option>
                <option value="channels-desc">most channels</option>
              </select>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="bg-[#0a0a0a] border border-[#1a1a1a] rounded px-[10px] py-[6px] text-[#888] text-[11px] outline-none cursor-pointer"
              >
                <option value="all">all users</option>
                <option value="has-oauth">has OAuth</option>
                <option value="no-oauth">no OAuth</option>
                <option value="has-clips">has clips</option>
                <option value="no-clips">no clips</option>
                <option value="has-channels">has channels</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto py-1">
            {filteredUsers.length === 0 ? (
              <div className="text-[#333] text-center py-6">no users match</div>
            ) : (
              filteredUsers.map((u) => (
                <div key={u.id} className="bg-[#0e0e0e] border border-[#1a1a1a] hover:border-[#222] rounded-lg px-5 py-4">
                  <div className="flex justify-between items-center mb-[10px] flex-wrap gap-2">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-[14px] font-semibold text-white">{u.username}</span>
                      <span className="text-[10px] text-[#333]">{u.id}</span>
                      <RoleBadge role={u.role} />
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-[2px] rounded ${
                          u.hasOAuth ? 'bg-[#0a1a0a] text-[#22c55e]' : 'bg-[#1a1a1a] text-[#444]'
                        }`}
                      >
                        {u.hasOAuth ? '● OAuth connected' : '○ no OAuth'}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#333]">
                      seen {timeAgoLong(u.lastSeen)} · joined {new Date(u.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-4 mb-[10px]">
                    <div className="text-[11px] text-[#555]">
                      <b className="text-[#22c55e] text-[13px]">{u.clipsCreated}</b> clips
                    </div>
                    <div className="text-[11px] text-[#555]">
                      <b className="text-white text-[13px]">{u.momentsTotal}</b> moments
                    </div>
                    <div className="text-[11px] text-[#555]">
                      <b className="text-white text-[13px]">{u.channels.filter((c) => c.confirmed).length}</b>/
                      <b className="text-white text-[13px]">{u.channels.length}</b> channels confirmed
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-[6px]">
                    {u.channels.length > 0 ? (
                      u.channels.map((c) => (
                        <span
                          key={c.channel}
                          className={`text-[10px] px-2 py-[3px] rounded border ${
                            c.confirmed ? 'border-[#22c55e44] text-[#22c55e]' : 'border-[#f59e0b44] text-[#f59e0b]'
                          }`}
                        >
                          {c.channel} {c.confirmed ? '✓' : '⏳'}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-[#333]">no channels</span>
                    )}
                  </div>
                  <div className="flex gap-[6px] mt-[10px] pt-[10px] border-t border-[#1a1a1a]">
                    {u.hasOAuth && (
                      <button
                        onClick={() => revokeToken(u.id, u.username)}
                        className="border border-[#ef444444] text-[#ef4444] rounded text-[10px] px-[10px] py-1 hover:bg-[#1a0a0a]"
                      >
                        revoke OAuth
                      </button>
                    )}
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => revokeUser(u.id, u.username)}
                        className="border border-[#ef444444] text-[#ef4444] rounded text-[10px] px-[10px] py-1 hover:bg-[#1a0a0a]"
                      >
                        revoke access
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Whitelist */}
        <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-6">
          <div className="text-[10px] uppercase tracking-wider text-[#555] mb-4">whitelist</div>
          <div className="flex gap-2 mb-4 flex-col md:flex-row">
            <input
              type="text"
              value={whitelistInput}
              onChange={(e) => setWhitelistInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addWhitelist()}
              placeholder="twitch username"
              className="flex-1 bg-[#0a0a0a] border border-[#1a1a1a] focus:border-[#333] rounded px-[14px] py-[10px] text-white text-[12px] outline-none"
            />
            <button
              onClick={addWhitelist}
              className="bg-[#9146ff] hover:bg-[#7c3aed] text-white text-[12px] font-semibold px-5 py-[10px] rounded"
            >
              add
            </button>
          </div>
          <div className="text-[11px] text-[#555]">
            {whitelist.length === 0 ? (
              <div className="text-[#222] text-center py-3">no whitelisted users</div>
            ) : (
              whitelist.map((w) => (
                <div
                  key={w.username}
                  className="flex justify-between items-center px-3 py-2 border-b border-[#1a1a1a] last:border-b-0"
                >
                  <span className="text-white">{w.username}</span>
                  <button
                    onClick={() => removeWhitelist(w.username)}
                    className="border border-[#ef444444] text-[#ef4444] rounded text-[10px] px-2 py-[2px] hover:bg-[#1a0a0a]"
                  >
                    remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function StatCard({ val, label }: { val: React.ReactNode; label: string }) {
  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-5">
      <div className="text-[28px] font-bold text-white">{val}</div>
      <div className="text-[10px] uppercase tracking-wider text-[#444] mt-1">{label}</div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[10px] uppercase tracking-wider text-[#444] px-3 py-2 border-b border-[#1a1a1a] sticky top-0 bg-[#111]">
      {children}
    </th>
  )
}

function RoleBadge({ role }: { role: 'admin' | 'user' }) {
  return (
    <span
      className={`inline-block text-[10px] font-medium px-2 py-[2px] rounded ${
        role === 'admin' ? 'bg-[#1a0a2a] text-[#9146ff]' : 'bg-[#111] text-[#555]'
      }`}
    >
      {role}
    </span>
  )
}
