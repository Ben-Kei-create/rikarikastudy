'use client'
import { useEffect, useRef, useState } from 'react'
import ScienceBackdrop from '@/components/ScienceBackdrop'
import { useAuth } from '@/lib/auth'
import { detectScienceChatModeration } from '@/lib/chatModeration'
import { isGuestStudentId } from '@/lib/guestStudy'
import {
  buildThreadTitle,
  capThreadsPerField,
  countUserMessages,
  createThread,
  SCIENCE_CHAT_GUEST_MAX_RALLIES_PER_THREAD,
  SCIENCE_CHAT_GUEST_MAX_THREADS_PER_FIELD,
  SCIENCE_CHAT_MAX_RALLIES_PER_THREAD,
  SCIENCE_CHAT_MAX_THREADS_PER_FIELD,
  getScienceChatStorageKey,
  sanitizeThreads,
  ScienceChatApiReply,
  ScienceChatField,
  ScienceChatMessage,
  ScienceChatProvider,
  ScienceChatThread,
} from '@/lib/scienceChat'

const FIELD_META: Record<ScienceChatField, { icon: string; color: string; hint: string }> = {
  '生物': { icon: '🌿', color: '#22c55e', hint: '質問したり、Geminiから出題してもらえます。' },
  '化学': { icon: '⚗️', color: '#f97316', hint: '質問したり、Geminiから出題してもらえます。' },
  '物理': { icon: '⚡', color: '#4da2ff', hint: '質問したり、Geminiから出題してもらえます。' },
  '地学': { icon: '🌏', color: '#8b7cff', hint: '質問したり、Geminiから出題してもらえます。' },
}

function readStoredThreads(storageKey: string) {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(storageKey)
    return sanitizeThreads(raw ? JSON.parse(raw) : [])
  } catch {
    return []
  }
}

function writeStoredThreads(storageKey: string, threads: ScienceChatThread[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(threads))
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

function formatMessageTime(iso: string) {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('ja-JP', {
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

function isQuizQuestion(text: string) {
  return text.startsWith('【問題】')
}

function isQuizEvaluation(text: string) {
  return text.startsWith('【評価】')
}

export default function ScienceChatPage({
  field,
  onBack,
}: {
  field: ScienceChatField
  onBack: () => void
}) {
  const { studentId, isApproved } = useAuth()
  const meta = FIELD_META[field]
  const isGuest = isGuestStudentId(studentId)
  const maxThreads = isGuest ? SCIENCE_CHAT_GUEST_MAX_THREADS_PER_FIELD : SCIENCE_CHAT_MAX_THREADS_PER_FIELD
  const maxRallies = isGuest ? SCIENCE_CHAT_GUEST_MAX_RALLIES_PER_THREAD : SCIENCE_CHAT_MAX_RALLIES_PER_THREAD
  const storageKey = getScienceChatStorageKey(studentId)
  const [allThreads, setAllThreads] = useState<ScienceChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [draftThread, setDraftThread] = useState<ScienceChatThread>(() => createThread(field))
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<ScienceChatProvider>('mock')
  const [waitingForQuizAnswer, setWaitingForQuizAnswer] = useState(false)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const reportedBlockedDraftRef = useRef(false)

  const visibleThreads = allThreads
    .filter(thread => thread.field === field)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

  const activeStoredThread = activeThreadId
    ? visibleThreads.find(thread => thread.id === activeThreadId) ?? null
    : null
  const activeThread = activeStoredThread ?? draftThread
  const rallyCount = countUserMessages(activeThread)
  const isDraft = !activeStoredThread
  const moderation = detectScienceChatModeration(input)

  useEffect(() => {
    const storedThreads = readStoredThreads(storageKey)
    const nextVisibleThreads = storedThreads
      .filter(thread => thread.field === field)
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

    setAllThreads(storedThreads)
    setActiveThreadId(nextVisibleThreads[0]?.id ?? null)
    setDraftThread(createThread(field))
    setInput('')
    setError('')
    setWarning('')
    setProvider('mock')
    setWaitingForQuizAnswer(false)
    reportedBlockedDraftRef.current = false
  }, [field, storageKey])

  useEffect(() => {
    if (!messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [activeThread.messages.length, loading])

  useEffect(() => {
    const lastMessage = activeThread.messages[activeThread.messages.length - 1]
    if (lastMessage && lastMessage.role === 'assistant' && isQuizQuestion(lastMessage.text)) {
      setWaitingForQuizAnswer(true)
    }
  }, [activeThread.messages])

  useEffect(() => {
    if (!studentId || isGuest || !input.trim() || !moderation.blocked) {
      reportedBlockedDraftRef.current = false
      return
    }

    if (reportedBlockedDraftRef.current) return

    reportedBlockedDraftRef.current = true

    void fetch('/api/science-chat/moderation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId,
        field,
        prompt: input.trim(),
        source: 'draft',
      }),
    }).catch(() => {
      reportedBlockedDraftRef.current = false
    })
  }, [field, input, isGuest, moderation.blocked, studentId])

  const persistThreads = (nextThreads: ScienceChatThread[]) => {
    const cappedThreads = capThreadsPerField(nextThreads, maxThreads)
    setAllThreads(cappedThreads)
    writeStoredThreads(storageKey, cappedThreads)
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
    setWarning('')
    setWaitingForQuizAnswer(false)
  }

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId)
    setInput('')
    setError('')
    setWarning('')
    const thread = allThreads.find(t => t.id === threadId)
    if (thread) {
      const lastMsg = thread.messages[thread.messages.length - 1]
      setWaitingForQuizAnswer(lastMsg?.role === 'assistant' && isQuizQuestion(lastMsg.text))
    }
  }

  const sendToApi = async (
    threadToUpdate: ScienceChatThread,
    chatMode: 'chat' | 'quiz-question' | 'quiz-evaluate',
  ) => {
    setError('')
    setWarning('')
    setLoading(true)

    try {
      const response = await fetch('/api/science-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          chatMode,
          messages: threadToUpdate.messages.map(message => ({
            role: message.role,
            text: message.text,
          })),
        }),
      })

      const payload = await response.json() as ScienceChatApiReply | { error?: string }
      if (!response.ok || !('reply' in payload)) {
        throw new Error(payload && 'error' in payload && payload.error ? payload.error : '送信に失敗しました。')
      }

      setProvider(payload.provider)
      setWarning(typeof payload.warning === 'string' ? payload.warning : '')
      const assistantMessage = makeMessage('assistant', payload.reply)

      const updatedThread = upsertThread({
        ...threadToUpdate,
        updatedAt: assistantMessage.createdAt,
        messages: [...threadToUpdate.messages, assistantMessage],
      })

      if (isQuizQuestion(payload.reply)) {
        setWaitingForQuizAnswer(true)
      } else {
        setWaitingForQuizAnswer(false)
      }

      return updatedThread
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '送信に失敗しました。'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    const prompt = input.trim()
    if (!prompt || loading) return

    if (!waitingForQuizAnswer && moderation.blocked) {
      setError(moderation.warningMessage)
      return
    }

    if (rallyCount >= maxRallies) {
      setError(`このテーマは${maxRallies}ラリーに達しました。新しいテーマを作ってください。`)
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

    const chatMode = waitingForQuizAnswer ? 'quiz-evaluate' as const : 'chat' as const
    await sendToApi(storedThread, chatMode)
  }

  const handleRequestQuiz = async () => {
    if (loading) return

    if (rallyCount >= maxRallies) {
      setError(`このテーマは${maxRallies}ラリーに達しました。新しいテーマを作ってください。`)
      return
    }

    const threadBase = activeStoredThread ?? draftThread
    const requestMessage = makeMessage('user', `${field}の問題を出してください。`)
    const optimisticThread: ScienceChatThread = {
      ...threadBase,
      title: threadBase.messages.length === 0 ? `${field}クイズ` : threadBase.title,
      updatedAt: requestMessage.createdAt,
      messages: [...threadBase.messages, requestMessage],
    }

    const storedThread = upsertThread(optimisticThread)
    if (isDraft) {
      setDraftThread(createThread(field))
    }

    setInput('')
    await sendToApi(storedThread, 'quiz-question')
  }

  if (isGuest || !isApproved) {
    const reason = isGuest
      ? 'ゲストモードでは Gemini などの質問機能は使えません。'
      : '管理者の承認がまだのため、質問チャットは利用できません。'
    const title = isGuest ? 'ゲストでは利用できません' : '承認待ちです'

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
                <p className="text-slate-300 text-sm mt-1 leading-6">{reason}</p>
              </div>
            </div>
            <button onClick={onBack} className="btn-secondary w-full lg:w-auto">
              もどる
            </button>
          </div>
        </div>

        <div className="card text-center py-10">
          <div className="text-5xl mb-4">🔒</div>
          <div className="font-display text-2xl text-white">{title}</div>
          <p className="mt-3 text-sm leading-7 text-slate-400">{reason}</p>
        </div>
      </div>
    )
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
              <div className="mt-2 font-display text-2xl text-white">{visibleThreads.length}<span className="text-base text-slate-400"> / {maxThreads}</span></div>
              <div className="mt-1 text-xs text-slate-500">この分野の保存テーマ</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">ラリー</div>
              <div className="mt-2 font-display text-2xl text-white">{rallyCount}<span className="text-base text-slate-400"> / {maxRallies}</span></div>
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
            <div className="text-slate-500 text-xs mt-1">
              {isGuest ? `ゲストはこの分野ごとに最新${maxThreads}テーマまで保存します` : 'この分野ごとに最新5テーマまで保存します'}
            </div>
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
                background: thread.id === activeThreadId ? `${meta.color}12` : 'var(--card-gradient-base-soft)',
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
          className="rounded-[28px] border border-slate-800 bg-slate-950/60 p-3 sm:p-4"
          style={{
            maxHeight: '52vh',
            overflowY: 'auto',
            backgroundImage: 'linear-gradient(180deg, var(--card-gradient-base), var(--card-gradient-base))',
          }}
        >
          {activeThread.messages.length === 0 ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                  style={{ background: `${meta.color}1a`, border: `1px solid ${meta.color}30` }}
                >
                  {meta.icon}
                </div>
                <div className="max-w-[88%]">
                  <div className="mb-1 flex items-center gap-2">
                    <div className="text-xs font-semibold text-slate-300">Gemini</div>
                    <div className="text-[11px] text-slate-500">質問をどうぞ</div>
                  </div>
                  <div className="relative rounded-[24px] rounded-tl-[12px] border border-slate-700/80 bg-slate-800/90 px-4 py-3 text-sm leading-7 text-slate-200">
                    自分から質問したり、「質問してもらう」ボタンで Gemini に出題してもらえます。
                    <div
                      aria-hidden="true"
                      className="absolute -left-1.5 top-3 h-3.5 w-3.5 rotate-45 border-l border-t border-slate-700/80 bg-slate-800/90"
                    />
                  </div>
                </div>
              </div>
              <div className="pl-[3.25rem] text-xs text-slate-500">
                左に Gemini、右に自分の吹き出しで会話が並びます。
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {activeThread.messages.map(message => {
                const isUser = message.role === 'user'
                const isQuiz = !isUser && isQuizQuestion(message.text)
                const isEval = !isUser && isQuizEvaluation(message.text)
                return (
                  <div
                    key={message.id}
                    className={`flex items-end gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                        style={{ background: `${meta.color}1a`, border: `1px solid ${meta.color}30` }}
                      >
                        {meta.icon}
                      </div>
                    )}

                    <div className={`max-w-[88%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className={`mb-1 flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className="text-xs font-semibold text-slate-300">
                          {isUser ? 'あなた' : 'Gemini'}
                        </div>
                        {(isQuiz || isEval) && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{
                              background: isQuiz ? '#7c3aed22' : '#05966922',
                              color: isQuiz ? '#a78bfa' : '#6ee7b7',
                              border: `1px solid ${isQuiz ? '#7c3aed33' : '#05966933'}`,
                            }}
                          >
                            {isQuiz ? '出題' : '評価'}
                          </span>
                        )}
                        <div className="text-[11px] text-slate-500">{formatMessageTime(message.createdAt)}</div>
                      </div>

                      <div
                        className={`relative whitespace-pre-wrap rounded-[24px] px-4 py-3 text-sm leading-7 ${
                          isUser ? 'rounded-br-[12px]' : 'rounded-tl-[12px]'
                        }`}
                        style={{
                          background: isUser
                            ? `linear-gradient(135deg, ${meta.color}2f, ${meta.color}20)`
                            : isQuiz
                              ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(30, 41, 59, 0.9))'
                              : isEval
                                ? 'linear-gradient(135deg, rgba(5, 150, 105, 0.12), rgba(30, 41, 59, 0.9))'
                                : 'rgba(30, 41, 59, 0.9)',
                          border: `1px solid ${
                            isUser ? `${meta.color}44`
                              : isQuiz ? 'rgba(124, 58, 237, 0.3)'
                                : isEval ? 'rgba(5, 150, 105, 0.25)'
                                  : 'rgba(148, 163, 184, 0.16)'
                          }`,
                          color: isUser ? '#f8fafc' : '#e2e8f0',
                          boxShadow: isUser ? `0 14px 28px ${meta.color}18` : '0 14px 28px rgba(15, 23, 42, 0.2)',
                        }}
                      >
                        {message.text}
                        <div
                          aria-hidden="true"
                          className={`absolute top-3 h-3.5 w-3.5 rotate-45 ${
                            isUser ? '-right-1.5 border-r border-t' : '-left-1.5 border-l border-t'
                          }`}
                          style={{
                            background: isUser ? `${meta.color}26` : 'rgba(30, 41, 59, 0.9)',
                            borderColor: isUser ? `${meta.color}44` : 'rgba(148, 163, 184, 0.16)',
                          }}
                        />
                      </div>
                    </div>

                    {isUser && (
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{ background: `${meta.color}24`, border: `1px solid ${meta.color}36` }}
                      >
                        You
                      </div>
                    )}
                  </div>
                )
              })}

              {loading && (
                <div className="flex items-end gap-3 justify-start">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                    style={{ background: `${meta.color}1a`, border: `1px solid ${meta.color}30` }}
                  >
                    {meta.icon}
                  </div>
                  <div className="max-w-[88%]">
                    <div className="mb-1 flex items-center gap-2">
                      <div className="text-xs font-semibold text-slate-300">Gemini</div>
                      <div className="text-[11px] text-slate-500">考え中</div>
                    </div>
                    <div className="relative rounded-[24px] rounded-tl-[12px] border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-400">
                      {waitingForQuizAnswer ? '回答を評価しています...' : '回答をまとめています...'}
                      <div
                        aria-hidden="true"
                        className="absolute -left-1.5 top-3 h-3.5 w-3.5 rotate-45 border-l border-t border-slate-700 bg-slate-900"
                      />
                    </div>
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

        {warning && (
          <div className="mt-3 rounded-2xl border border-amber-700/70 bg-amber-950/60 px-4 py-3 text-sm text-amber-100">
            {warning}
          </div>
        )}

        <div className="mt-4 rounded-[28px] border border-slate-800 bg-slate-950/55 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-base"
                style={{ background: `${meta.color}1c`, border: `1px solid ${meta.color}32` }}
              >
                {waitingForQuizAnswer ? '✏️' : '💬'}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  {waitingForQuizAnswer ? '回答を入力する' : `${field}について質問する`}
                </div>
                <div className="text-xs text-slate-500">
                  {waitingForQuizAnswer ? '5行以内で評価・模範回答・ポイントを返します' : 'やさしく短く返すチャット形式'}
                </div>
              </div>
            </div>
            <div className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] text-slate-400">
              {waitingForQuizAnswer ? '5行以内' : '3行以内'}
            </div>
          </div>

          <textarea
            value={input}
            onChange={event => {
              setInput(event.target.value)
              setError('')
            }}
            placeholder={waitingForQuizAnswer ? '上の問題に回答を書いてください' : `${field}について質問を書く（3行以内で返答）`}
            rows={3}
            className="input-surface resize-y border-none bg-slate-900/70"
            style={{ boxShadow: 'none' }}
            disabled={loading || rallyCount >= maxRallies}
          />
          {!waitingForQuizAnswer && moderation.blocked && (
            <div className="mt-3 rounded-2xl border border-amber-700/70 bg-amber-950/60 px-4 py-3 text-sm text-amber-100">
              {moderation.warningMessage}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-6 text-slate-500">
              {isGuest
                ? `ゲストは1テーマ${maxRallies}ラリーまで。履歴はこの端末のブラウザにだけ保存します。`
                : '1テーマ50ラリーまで。履歴はこの端末のブラウザにだけ保存します。'}
            </div>
            <div className="flex items-center gap-2">
              {!waitingForQuizAnswer && (
                <button
                  onClick={handleRequestQuiz}
                  disabled={loading || rallyCount >= maxRallies}
                  className="whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
                  style={{
                    borderColor: '#7c3aed44',
                    background: '#7c3aed18',
                    color: '#c4b5fd',
                  }}
                >
                  {loading ? '出題中...' : '質問してもらう'}
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading || rallyCount >= maxRallies || (!waitingForQuizAnswer && moderation.blocked)}
                className="btn-primary whitespace-nowrap disabled:opacity-60"
              >
                {loading ? '送信中...' : waitingForQuizAnswer ? '回答を送る' : 'Geminiに聞く'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
