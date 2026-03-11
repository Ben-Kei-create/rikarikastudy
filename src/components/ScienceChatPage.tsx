'use client'
import { useEffect, useRef, useState } from 'react'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import {
  buildThreadTitle,
  capThreadsPerField,
  countUserMessages,
  createThread,
  SCIENCE_CHAT_MAX_RALLIES_PER_THREAD,
  SCIENCE_CHAT_STORAGE_KEY,
  sanitizeThreads,
  ScienceChatApiReply,
  ScienceChatField,
  ScienceChatMessage,
  ScienceChatProvider,
  ScienceChatThread,
} from '@/lib/scienceChat'

const FIELD_META: Record<ScienceChatField, { icon: string; color: string; hint: string }> = {
  '生物': { icon: '🌿', color: '#22c55e', hint: '生き物・細胞・遺伝の質問を3行以内で整理します。' },
  '化学': { icon: '⚗️', color: '#f97316', hint: '化学式・イオン・反応の疑問を短くまとめます。' },
  '物理': { icon: '⚡', color: '#4da2ff', hint: '力・電気・エネルギーの要点をコンパクトに返します。' },
  '地学': { icon: '🌏', color: '#8b7cff', hint: '天気・地震・宇宙の質問をざっくり整理します。' },
}

function readStoredThreads() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(SCIENCE_CHAT_STORAGE_KEY)
    return sanitizeThreads(raw ? JSON.parse(raw) : [])
  } catch {
    return []
  }
}

function writeStoredThreads(threads: ScienceChatThread[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(SCIENCE_CHAT_STORAGE_KEY, JSON.stringify(threads))
  } catch {}
}

function formatThreadTime(iso: string) {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function makeMessage(role: ScienceChatMessage['role'], text: string): ScienceChatMessage {
  return {
    id: `${role}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
    role,
    text,
    createdAt: new Date().toISOString(),
  }
}

export default function ScienceChatPage({
  field,
  onBack,
}: {
  field: ScienceChatField
  onBack: () => void
}) {
  const meta = FIELD_META[field]
  const [allThreads, setAllThreads] = useState<ScienceChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [draftThread, setDraftThread] = useState<ScienceChatThread>(() => createThread(field))
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<ScienceChatProvider>('mock')
  const messagesRef = useRef<HTMLDivElement | null>(null)

  const visibleThreads = allThreads
    .filter(thread => thread.field === field)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

  const activeStoredThread = activeThreadId
    ? visibleThreads.find(thread => thread.id === activeThreadId) ?? null
    : null
  const activeThread = activeStoredThread ?? draftThread
  const rallyCount = countUserMessages(activeThread)
  const isDraft = !activeStoredThread

  useEffect(() => {
    const storedThreads = readStoredThreads()
    const nextVisibleThreads = storedThreads
      .filter(thread => thread.field === field)
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

    setAllThreads(storedThreads)
    setActiveThreadId(nextVisibleThreads[0]?.id ?? null)
    setDraftThread(createThread(field))
    setInput('')
    setError('')
    setProvider('mock')
  }, [field])

  useEffect(() => {
    if (!messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [activeThread.messages.length, loading])

  const persistThreads = (nextThreads: ScienceChatThread[]) => {
    const cappedThreads = capThreadsPerField(nextThreads)
    setAllThreads(cappedThreads)
    writeStoredThreads(cappedThreads)
    return cappedThreads
  }

  const upsertThread = (thread: ScienceChatThread) => {
    const nextThreads = persistThreads([
      ...allThreads.filter(current => current.id !== thread.id),
      thread,
    ])
    const storedThread = nextThreads.find(current => current.id === thread.id) ?? thread
    setActiveThreadId(storedThread.id)
    return storedThread
  }

  const handleCreateNewThread = () => {
    setActiveThreadId(null)
    setDraftThread(createThread(field))
    setInput('')
    setError('')
  }

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId)
    setInput('')
    setError('')
  }

  const handleSend = async () => {
    const prompt = input.trim()
    if (!prompt || loading) return

    if (rallyCount >= SCIENCE_CHAT_MAX_RALLIES_PER_THREAD) {
      setError('このテーマは50ラリーに達しました。新しいテーマを作ってください。')
      return
    }

    const userMessage = makeMessage('user', prompt)
    const threadBase = activeStoredThread ?? draftThread
    const optimisticThread: ScienceChatThread = {
      ...threadBase,
      title: threadBase.messages.length === 0 ? buildThreadTitle(prompt) : threadBase.title,
      updatedAt: userMessage.createdAt,
      messages: [...threadBase.messages, userMessage],
    }

    const storedThread = upsertThread(optimisticThread)
    if (isDraft) {
      setDraftThread(createThread(field))
    }

    setInput('')
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/science-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          field,
          messages: storedThread.messages.map(message => ({
            role: message.role,
            text: message.text,
          })),
        }),
      })

      const payload = await response.json() as ScienceChatApiReply | { error?: string }
      if (!response.ok || !('reply' in payload)) {
        throw new Error(payload && 'error' in payload && payload.error ? payload.error : '質問の送信に失敗しました。')
      }

      setProvider(payload.provider)
      const assistantMessage = makeMessage('assistant', payload.reply)
      upsertThread({
        ...storedThread,
        updatedAt: assistantMessage.createdAt,
        messages: [...storedThread.messages, assistantMessage],
      })
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '質問の送信に失敗しました。'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell page-shell-dashboard">
      <div className="hero-card science-surface p-5 sm:p-6 lg:p-7 mb-5 anim-fade-up">
        <ScienceBackdrop />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-[22px] text-3xl"
              style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}26` }}
            >
              {meta.icon}
            </div>
            <div>
              <div className="text-slate-400 text-xs font-semibold tracking-[0.18em] uppercase mb-2">
                Gemini Chat
              </div>
              <div className="font-display text-3xl text-white">{field}に質問</div>
              <p className="text-slate-300 text-sm mt-1 leading-6">
                {meta.hint}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">テーマ</div>
              <div className="mt-2 font-display text-2xl text-white">{visibleThreads.length}<span className="text-base text-slate-400"> / 5</span></div>
              <div className="mt-1 text-xs text-slate-500">この分野の保存テーマ</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">ラリー</div>
              <div className="mt-2 font-display text-2xl text-white">{rallyCount}<span className="text-base text-slate-400"> / 50</span></div>
              <div className="mt-1 text-xs text-slate-500">1テーマごとの上限</div>
            </div>
            <button onClick={onBack} className="btn-secondary w-full">もどる</button>
            <button onClick={handleCreateNewThread} className="btn-ghost w-full">新しいテーマ</button>
          </div>
        </div>
      </div>

      <div className="card anim-fade-up mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-white font-semibold">最近のテーマ</div>
            <div className="text-slate-500 text-xs mt-1">この分野ごとに最新5テーマまで保存します</div>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: provider === 'gemini' ? `${meta.color}18` : '#334155',
              color: provider === 'gemini' ? meta.color : '#cbd5e1',
            }}
          >
            {provider === 'gemini' ? 'Gemini接続中' : 'プレースホルダー応答'}
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {visibleThreads.map(thread => (
            <button
              key={thread.id}
              onClick={() => handleSelectThread(thread.id)}
              className="text-left rounded-2xl px-4 py-3 transition-all"
              style={{
                border: thread.id === activeThreadId ? `1px solid ${meta.color}55` : '1px solid rgba(148, 163, 184, 0.16)',
                background: thread.id === activeThreadId ? `${meta.color}12` : 'rgba(15, 23, 42, 0.42)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-white font-semibold">{thread.title}</div>
                <div className="text-slate-500 text-xs whitespace-nowrap">{formatThreadTime(thread.updatedAt)}</div>
              </div>
              <div className="text-slate-400 text-sm mt-2 line-clamp-2">
                {thread.messages[thread.messages.length - 1]?.text || 'まだ会話はありません。'}
              </div>
            </button>
          ))}

          {visibleThreads.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
              まだ保存テーマはありません。最初の質問を送ると、この分野のテーマとして保存されます。
            </div>
          )}
        </div>
      </div>

      <div className="card anim-fade-up">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-white font-semibold">{activeThread.title}</div>
            <div className="text-slate-500 text-xs mt-1">
              {isDraft ? '未保存の新しいテーマ' : `最終更新: ${formatThreadTime(activeThread.updatedAt)}`}
            </div>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: `${meta.color}18`, color: meta.color }}
          >
            {field}
          </span>
        </div>

        <div
          ref={messagesRef}
          className="rounded-[24px] border border-slate-800 bg-slate-950/50 p-3 sm:p-4"
          style={{ maxHeight: '52vh', overflowY: 'auto' }}
        >
          {activeThread.messages.length === 0 ? (
            <div className="text-sm leading-7 text-slate-400">
              例: 「光合成って何？」「イオンってざっくり何？」「地震のP波とS波の違いは？」
            </div>
          ) : (
            <div className="space-y-3">
              {activeThread.messages.map(message => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-7 whitespace-pre-wrap"
                    style={{
                      background: message.role === 'user' ? `${meta.color}24` : 'rgba(30, 41, 59, 0.86)',
                      border: `1px solid ${message.role === 'user' ? `${meta.color}38` : 'rgba(148, 163, 184, 0.16)'}`,
                      color: message.role === 'user' ? '#f8fafc' : '#e2e8f0',
                    }}
                  >
                    {message.text}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-[88%] rounded-[22px] border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-400">
                    回答をまとめています...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-2xl border border-red-800/70 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-4">
          <textarea
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder={`${field}について質問を書く（3行以内で返答）`}
            rows={3}
            className="input-surface resize-y"
            disabled={loading || rallyCount >= SCIENCE_CHAT_MAX_RALLIES_PER_THREAD}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-6 text-slate-500">
              1テーマ50ラリーまで。履歴はこの端末のブラウザにだけ保存します。
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading || rallyCount >= SCIENCE_CHAT_MAX_RALLIES_PER_THREAD}
              className="btn-primary whitespace-nowrap disabled:opacity-60"
            >
              {loading ? '送信中...' : 'Geminiに聞く'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
