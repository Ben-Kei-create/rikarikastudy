'use client'

import { evaluateTextAnswer, hasConfiguredTextKeywords, TextAnswerResult } from '@/lib/answerUtils'
import { fetchStudents, useAuth } from '@/lib/auth'
import { getBadgeRarityLabel } from '@/lib/badges'
import {
  calculateStreakModeXp,
  calculateTestModeXp,
  calculateTimeAttackXp,
  getLevelInfo,
  getXpFloorForLevel,
  TEST_MODE_POINT_PER_QUESTION,
  TEST_MODE_QUESTION_COUNT,
  TIME_ATTACK_UNLOCK_LEVEL,
} from '@/lib/engagement'
import { isGuestStudentId, loadGuestStudyStore } from '@/lib/guestStudy'
import { pickChallengeTestQuestions, pickTimeAttackQuestions, shuffleArray } from '@/lib/questionPicker'
import {
  getCachedColumnSupport,
  isMissingColumnError,
  markColumnMissing,
  markColumnSupported,
} from '@/lib/schemaCompat'
import { loadTimeAttackBest, recordStudySession, saveTimeAttackBest, StudyRewardSummary } from '@/lib/studyRewards'
import { supabase } from '@/lib/supabase'
import { getQuestionImageDisplaySize } from '@/lib/questionImages'
import { useEffect, useMemo, useRef, useState } from 'react'
import LevelUnlockNotice from '@/components/LevelUnlockNotice'

type ChallengeMode = 'time_attack' | 'test_mode' | 'streak_mode'
type LeaderboardMode = Extract<ChallengeMode, 'test_mode' | 'streak_mode'>
type Phase = 'intro' | 'playing' | 'finished'

interface Question {
  id: string
  field: string
  unit: string
  question: string
  type: 'choice' | 'text'
  choices: string[] | null
  answer: string
  accept_answers: string[] | null
  keywords: string[] | null
  explanation: string | null
  image_url: string | null
  image_display_width: number | null
  image_display_height: number | null
}

interface LeaderboardEntry {
  studentId: number
  nickname: string
  score: number
  rank: number
  isCurrentUser: boolean
}

interface SessionModeSummary {
  personalBest: number
  leaderboard: LeaderboardEntry[]
}

const TIME_ATTACK_DURATION_MS = 30_000
const STREAK_MODE_DURATION_MS = 10_000
const STREAK_LEADERBOARD_LIMIT = 5

const CHALLENGE_MODE_META: Record<ChallengeMode, {
  label: string
  badge: string
  emoji: string
  accent: string
  description: string
  startLabel: string
}> = {
  time_attack: {
    label: 'タイムアタック',
    badge: 'Time Attack',
    emoji: '⏱️',
    accent: '#38bdf8',
    description: '30秒でどこまで伸ばせるか挑戦。正解で +0.5 秒。',
    startLabel: 'タイムアタック開始',
  },
  test_mode: {
    label: 'テストモード',
    badge: 'Test Mode',
    emoji: '📝',
    accent: '#f59e0b',
    description: `${TEST_MODE_QUESTION_COUNT}問 × ${TEST_MODE_POINT_PER_QUESTION}点。100点満点の入試意識モード。`,
    startLabel: 'テスト開始',
  },
  streak_mode: {
    label: '連続正解モード',
    badge: 'Streak Mode',
    emoji: '🔥',
    accent: '#22c55e',
    description: '各問題10秒以内に何問連続で正解できるか挑戦。正解で次の10秒へ進みます。',
    startLabel: '連続正解に挑戦',
  },
}

function formatTimer(ms: number) {
  return (ms / 1000).toFixed(1)
}

function getDisplayScore(mode: ChallengeMode, rawScore: number) {
  if (mode === 'test_mode') return rawScore * TEST_MODE_POINT_PER_QUESTION
  return rawScore
}

function getModeXp(mode: ChallengeMode, rawScore: number) {
  if (mode === 'time_attack') return calculateTimeAttackXp(rawScore)
  if (mode === 'test_mode') return calculateTestModeXp(rawScore)
  return calculateStreakModeXp(rawScore)
}

function getModeUnit(mode: ChallengeMode) {
  if (mode === 'time_attack') return 'タイムアタック'
  if (mode === 'test_mode') return 'テストモード'
  return '連続正解モード'
}

function getModeField(mode: ChallengeMode) {
  if (mode === 'streak_mode') return '4分野総合'
  if (mode === 'test_mode') return '4分野総合'
  return '4分野総合'
}

function getModeResultLabel(mode: ChallengeMode, rawScore: number) {
  if (mode === 'test_mode') return `${getDisplayScore(mode, rawScore)} / 100`
  if (mode === 'streak_mode') return `連続 ${rawScore} 問`
  return `${rawScore}`
}

function getModeProgressLabel(mode: ChallengeMode, currentIndex: number, total: number) {
  if (mode === 'test_mode') return `${currentIndex + 1} / ${total}`
  return `解答 ${currentIndex + 1}`
}

function getModeSummaryMessage(mode: ChallengeMode, rawScore: number) {
  if (mode === 'test_mode') {
    const pointScore = getDisplayScore(mode, rawScore)
    if (pointScore >= 80) return '入試を意識したセットをかなり安定して解けています。'
    if (pointScore >= 60) return 'あと少しで高得点圏です。弱い単元を詰めれば伸ばせます。'
    return 'もう一度挑戦して、得点源になる単元を増やしていきましょう。'
  }

  if (mode === 'streak_mode') {
    if (rawScore >= 10) return 'かなり鋭い反応です。この集中力は強いです。'
    if (rawScore >= 5) return '連続正解がしっかり伸びています。'
    return 'まずは3連続を目標に、テンポよく積み上げていきましょう。'
  }

  if (rawScore >= 15) return 'かなり速く正確に解けています。'
  if (rawScore >= 8) return 'テンポよく得点できています。'
  return '次は正解数をもう少し伸ばしていきましょう。'
}

async function loadSessionModeSummary(
  studentId: number | null,
  mode: LeaderboardMode,
): Promise<SessionModeSummary> {
  const guestPersonalBest = studentId !== null && isGuestStudentId(studentId)
    ? loadGuestStudyStore().sessions
        .filter(session => session.session_mode === mode)
        .reduce((best, session) => Math.max(best, getDisplayScore(mode, session.correct_count)), 0)
    : 0

  const guestLeaderboard = guestPersonalBest > 0 && studentId !== null && isGuestStudentId(studentId)
    ? [{
        studentId,
        nickname: 'ゲスト',
        score: guestPersonalBest,
        rank: 0,
        isCurrentUser: true,
      }]
    : []

  const [students, response] = await Promise.all([
    fetchStudents(),
    supabase
      .from('quiz_sessions')
      .select('student_id, correct_count, created_at')
      .eq('session_mode', mode),
  ])

  if (response.error) {
    console.error(`[challenge] failed to load ${mode} summary`, response.error)
    return {
      personalBest: guestPersonalBest,
      leaderboard: guestLeaderboard,
    }
  }

  const nicknameMap = new Map(students.map(student => [student.id, student.nickname]))
  const bestByStudent = new Map<number, { score: number; createdAt: string }>()

  for (const row of response.data || []) {
    if (row.student_id === 5) continue
    const nextScore = getDisplayScore(mode, row.correct_count)
    const current = bestByStudent.get(row.student_id)
    if (!current || nextScore > current.score || (nextScore === current.score && row.created_at > current.createdAt)) {
      bestByStudent.set(row.student_id, {
        score: nextScore,
        createdAt: row.created_at,
      })
    }
  }

  const ranked = Array.from(bestByStudent.entries())
    .map(([currentStudentId, record]) => ({
      studentId: currentStudentId,
      nickname: nicknameMap.get(currentStudentId) ?? `ID ${currentStudentId}`,
      score: record.score,
      createdAt: record.createdAt,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.createdAt < right.createdAt ? 1 : -1
    })
    .map((entry, index) => ({
      studentId: entry.studentId,
      nickname: entry.nickname,
      score: entry.score,
      rank: index + 1,
      isCurrentUser: entry.studentId === studentId,
    }))

  const personalEntry = ranked.find(entry => entry.studentId === studentId) ?? null
  const leaderboard = ranked.slice(0, STREAK_LEADERBOARD_LIMIT)

  if (personalEntry && personalEntry.rank > leaderboard.length) {
    leaderboard.push(personalEntry)
  }

  if (guestLeaderboard.length > 0) {
    leaderboard.push(...guestLeaderboard)
  }

  return {
    personalBest: personalEntry?.score ?? guestPersonalBest,
    leaderboard,
  }
}

export default function TimeAttackPage({ onBack }: { onBack: () => void }) {
  const { studentId, logout } = useAuth()
  const [selectedMode, setSelectedMode] = useState<ChallengeMode>('time_attack')
  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [choiceQuestions, setChoiceQuestions] = useState<Question[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [phase, setPhase] = useState<Phase>('intro')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [remainingMs, setRemainingMs] = useState(TIME_ATTACK_DURATION_MS)
  const [score, setScore] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [answerResult, setAnswerResult] = useState<TextAnswerResult | null>(null)
  const [timeAttackBest, setTimeAttackBest] = useState(0)
  const [otherLeader, setOtherLeader] = useState<{ studentId: number; nickname: string; score: number } | null>(null)
  const [testSummary, setTestSummary] = useState<SessionModeSummary>({ personalBest: 0, leaderboard: [] })
  const [streakSummary, setStreakSummary] = useState<SessionModeSummary>({ personalBest: 0, leaderboard: [] })
  const [rewardSummary, setRewardSummary] = useState<StudyRewardSummary | null>(null)
  const [answerLogs, setAnswerLogs] = useState<Array<{ qId: string; correct: boolean; answer: string; result?: TextAnswerResult }>>([])
  const [totalXp, setTotalXp] = useState(0)
  const startedAtRef = useRef<number | null>(null)
  const deadlineRef = useRef<number>(0)
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentLevelInfo = useMemo(() => getLevelInfo(totalXp), [totalXp])
  const timeAttackUnlocked = currentLevelInfo.level >= TIME_ATTACK_UNLOCK_LEVEL
  const unlockXpLeft = Math.max(0, getXpFloorForLevel(TIME_ATTACK_UNLOCK_LEVEL) - currentLevelInfo.totalXp)

  const currentModeMeta = CHALLENGE_MODE_META[selectedMode]
  const currentQuestion = useMemo(() => {
    if (questions.length === 0) return null
    return questions[currentIndex] ?? null
  }, [currentIndex, questions])
  const currentQuestionImageDisplay = currentQuestion ? getQuestionImageDisplaySize(currentQuestion) : null
  const usesKeywordInput = currentQuestion?.type === 'text' ? hasConfiguredTextKeywords(currentQuestion.keywords) : false
  const testModeAnswered = selectedMode === 'test_mode' && answerResult !== null
  const testModeProgress = questions.length > 0 ? ((currentIndex + (testModeAnswered ? 1 : 0)) / questions.length) * 100 : 0
  const testModeQuestionReady = allQuestions.length >= TEST_MODE_QUESTION_COUNT
  const currentModeReady = selectedMode === 'test_mode' ? testModeQuestionReady : choiceQuestions.length > 0

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)

      let query = supabase.from('questions').select('*')
      const supportsStudentQuestionFilter = getCachedColumnSupport('created_by_student_id') !== false

      if (supportsStudentQuestionFilter) {
        query = query.or(
          studentId
            ? `created_by_student_id.is.null,created_by_student_id.eq.${studentId}`
            : 'created_by_student_id.is.null',
        )
      }

      let { data, error } = await query

      if (error && isMissingColumnError(error, 'created_by_student_id')) {
        markColumnMissing('created_by_student_id')
        const fallbackResponse = await supabase.from('questions').select('*')
        data = fallbackResponse.data
        error = fallbackResponse.error
      } else if (!error && supportsStudentQuestionFilter) {
        markColumnSupported('created_by_student_id')
      }

      if (error) {
        console.error('[challenge] failed to load questions', error)
      }

      const [best, testBestSummary, streakBestSummary, xp] = await Promise.all([
        loadTimeAttackBest(studentId),
        loadSessionModeSummary(studentId, 'test_mode'),
        loadSessionModeSummary(studentId, 'streak_mode'),
        studentId === null
          ? Promise.resolve(0)
          : isGuestStudentId(studentId)
            ? Promise.resolve(loadGuestStudyStore().xp)
            : supabase
                .from('students')
                .select('student_xp')
                .eq('id', studentId)
                .single()
                .then(response => response.data?.student_xp ?? 0),
      ])
      if (!active) return

      const pool = (data || []) as Question[]
      setAllQuestions(pool)
      setChoiceQuestions(pickTimeAttackQuestions(pool))
      setTimeAttackBest(best.personalBest)
      setOtherLeader(best.otherLeader)
      setTestSummary(testBestSummary)
      setStreakSummary(streakBestSummary)
      setTotalXp(xp)
      setLoading(false)
    }

    void load()
    return () => {
      active = false
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
    }
  }, [studentId])

  useEffect(() => {
    if (phase !== 'playing' || selectedMode === 'test_mode') return
    if (selectedMode === 'streak_mode' && feedback !== null) return

    const intervalId = window.setInterval(() => {
      const nextRemaining = Math.max(0, deadlineRef.current - Date.now())
      setRemainingMs(nextRemaining)
      if (nextRemaining <= 0) {
        window.clearInterval(intervalId)
        void finishRun()
      }
    }, 50)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [feedback, phase, selectedMode])

  const resetRunState = () => {
    setCurrentIndex(0)
    setScore(0)
    setAnsweredCount(0)
    setRewardSummary(null)
    setFeedback(null)
    setSelectedChoice(null)
    setTextInput('')
    setAnswerResult(null)
    setAnswerLogs([])
  }

  const resetStreakTimer = () => {
    deadlineRef.current = Date.now() + STREAK_MODE_DURATION_MS
    setRemainingMs(STREAK_MODE_DURATION_MS)
  }

  const startRun = () => {
    if (selectedMode === 'test_mode') {
      if (!testModeQuestionReady) return
      setQuestions(pickChallengeTestQuestions(allQuestions, TEST_MODE_QUESTION_COUNT))
      setRemainingMs(TIME_ATTACK_DURATION_MS)
    } else {
      if (choiceQuestions.length === 0) return
      setQuestions(shuffleArray(choiceQuestions))
      const baseRemaining = selectedMode === 'streak_mode' ? STREAK_MODE_DURATION_MS : TIME_ATTACK_DURATION_MS
      setRemainingMs(baseRemaining)
      if (selectedMode === 'streak_mode') {
        resetStreakTimer()
      } else {
        deadlineRef.current = Date.now() + baseRemaining
      }
    }

    resetRunState()
    startedAtRef.current = Date.now()
    setPhase('playing')
  }

  const advanceQuestion = () => {
    setCurrentIndex(current => {
      const nextIndex = current + 1
      if (selectedMode === 'test_mode') {
        return nextIndex
      }

      if (nextIndex < questions.length) {
        return nextIndex
      }

      setQuestions(currentDeck => shuffleArray(currentDeck))
      return 0
    })
  }

  const finishRun = async () => {
    if (phase !== 'playing') return
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }

    setPhase('finished')
    setFeedback(null)

    const durationSeconds = startedAtRef.current
      ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      : selectedMode === 'streak_mode'
        ? 10
        : selectedMode === 'time_attack'
          ? 30
          : 0
    const xpEarned = getModeXp(selectedMode, score)

    const saveRecordPromise = selectedMode === 'time_attack'
      ? saveTimeAttackBest(studentId, score)
      : Promise.resolve(score)

    const [savedRecord, reward] = await Promise.all([
      saveRecordPromise,
      recordStudySession({
        studentId,
        field: getModeField(selectedMode),
        unit: getModeUnit(selectedMode),
        totalQuestions: selectedMode === 'test_mode' ? questions.length : answeredCount,
        correctCount: score,
        durationSeconds,
        answerLogs,
        sessionMode: selectedMode,
        xpOverride: xpEarned,
      }),
    ])

    if (selectedMode === 'time_attack') {
      const bests = await loadTimeAttackBest(studentId)
      setTimeAttackBest(Math.max(savedRecord, bests.personalBest))
      setOtherLeader(bests.otherLeader)
    } else if (selectedMode === 'test_mode') {
      setTestSummary(await loadSessionModeSummary(studentId, 'test_mode'))
    } else {
      setStreakSummary(await loadSessionModeSummary(studentId, 'streak_mode'))
    }

    setRewardSummary(reward)
    setTotalXp(reward.totalXp)
  }

  const handleSpeedChoice = (choice: string) => {
    if (phase !== 'playing' || !currentQuestion) return

    const correct = choice === currentQuestion.answer
    setFeedback(correct ? 'correct' : 'wrong')
    setScore(current => current + (correct ? 1 : 0))
    setAnsweredCount(current => current + 1)
    setAnswerLogs(current => [...current, { qId: currentQuestion.id, correct, answer: choice }])

    if (correct && selectedMode === 'time_attack') {
      deadlineRef.current += 500
      setRemainingMs(current => current + 500)
    }

    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null)
      if (!correct && selectedMode === 'streak_mode') {
        void finishRun()
        return
      }
      if (correct && selectedMode === 'streak_mode') {
        resetStreakTimer()
      }
      advanceQuestion()
    }, correct ? 140 : 220)
  }

  const handleTestChoice = (choice: string) => {
    if (phase !== 'playing' || selectedMode !== 'test_mode' || !currentQuestion || testModeAnswered) return
    const result: TextAnswerResult = choice === currentQuestion.answer ? 'exact' : 'incorrect'
    setSelectedChoice(choice)
    setAnswerResult(result)
    setAnsweredCount(current => current + 1)
    if (result === 'exact') setScore(current => current + 1)
    setAnswerLogs(current => [...current, { qId: currentQuestion.id, correct: result === 'exact', answer: choice, result }])
  }

  const handleTestTextSubmit = () => {
    if (phase !== 'playing' || selectedMode !== 'test_mode' || !currentQuestion || testModeAnswered) return
    const answer = textInput.trim()
    if (!answer) return
    const result = evaluateTextAnswer(answer, currentQuestion.answer, currentQuestion.accept_answers, currentQuestion.keywords)
    setAnswerResult(result)
    setAnsweredCount(current => current + 1)
    if (result === 'exact') setScore(current => current + 1)
    setAnswerLogs(current => [...current, { qId: currentQuestion.id, correct: result === 'exact', answer, result }])
  }

  const handleTestDontKnow = () => {
    if (phase !== 'playing' || selectedMode !== 'test_mode' || !currentQuestion || testModeAnswered) return
    setTextInput('わからない')
    setAnswerResult('incorrect')
    setAnsweredCount(current => current + 1)
    setAnswerLogs(current => [...current, { qId: currentQuestion.id, correct: false, answer: 'わからない', result: 'incorrect' }])
  }

  const handleNextTestQuestion = async () => {
    if (selectedMode !== 'test_mode') return
    if (currentIndex + 1 >= questions.length) {
      await finishRun()
      return
    }

    advanceQuestion()
    setSelectedChoice(null)
    setTextInput('')
    setAnswerResult(null)
  }

  const renderRewardStrip = () => {
    const levelInfo = rewardSummary ? getLevelInfo(rewardSummary.totalXp) : null
    if (!rewardSummary) return null

    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <div className="subcard p-4 text-left">
            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">獲得XP</div>
            <div className="mt-2 font-display text-3xl text-sky-300">+{rewardSummary.xpEarned}</div>
            <div className="mt-2 text-xs text-slate-500">今回のチャレンジで加算</div>
          </div>
          {levelInfo && (
            <div className="subcard p-4 text-left">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">現在レベル</div>
                  <div className="mt-2 font-display text-2xl text-white">Lv.{levelInfo.level}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-sky-200">{levelInfo.title}</div>
                  <div className="text-xs text-slate-500">{levelInfo.totalXp} XP</div>
                </div>
              </div>
              <div className="mt-4 soft-track" style={{ height: 8 }}>
                <div
                  style={{
                    width: `${levelInfo.progressRate}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #60a5fa, #38bdf8)',
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {rewardSummary.newBadges.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 text-left">
            {rewardSummary.newBadges.map((badge, index) => (
              <div
                key={badge.key}
                className={`badge-toast badge-toast--${badge.rarity}`}
                style={{ animationDelay: `${index * 0.08}s` }}
              >
                <div className="text-2xl">{badge.iconEmoji}</div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{badge.name}</span>
                    <span className="text-[10px] tracking-[0.18em] text-slate-400">{getBadgeRarityLabel(badge.rarity)}</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-1">{badge.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card text-slate-400">チャレンジモードを準備中...</div>
      </div>
    )
  }

  if (allQuestions.length === 0) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card w-full max-w-xl text-center">
          <div className="font-display text-3xl text-white">チャレンジ準備中</div>
          <p className="mt-3 text-slate-300">問題がまだ足りません。問題を追加してから試してください。</p>
          <div className="mt-6">
            <button onClick={onBack} className="btn-primary">ホームへ</button>
          </div>
        </div>
      </div>
    )
  }

  if (!timeAttackUnlocked) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card w-full max-w-xl text-center">
          <div className="text-5xl mb-4">🔒</div>
          <div className="font-display text-3xl text-white">チャレンジモードは Lv.{TIME_ATTACK_UNLOCK_LEVEL} で解放</div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            現在は Lv.{currentLevelInfo.level} です。あと {unlockXpLeft} XP ためると
            タイムアタック、テストモード、連続正解モードに挑戦できます。
          </p>
          <div className="mt-6 soft-track" style={{ height: 8 }}>
            <div
              style={{
                width: `${Math.min(100, Math.round((currentLevelInfo.totalXp / Math.max(1, getXpFloorForLevel(TIME_ATTACK_UNLOCK_LEVEL))) * 100))}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #60a5fa, #38bdf8)',
                borderRadius: 999,
              }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {currentLevelInfo.totalXp} / {getXpFloorForLevel(TIME_ATTACK_UNLOCK_LEVEL)} XP
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={onBack} className="btn-primary">ホームへ</button>
            <button onClick={() => logout()} className="btn-ghost">ログアウト</button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'intro') {
    return (
      <div className="page-shell page-shell-dashboard">
        <div className="hero-card science-surface p-6 sm:p-7">
          <div className="text-xs font-semibold tracking-[0.2em] text-sky-200 uppercase">Challenge Modes</div>
          <h1 className="font-display mt-3 text-4xl text-white">チャレンジモード</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            タイムアタック、テストモード、連続正解モードから今の気分に合わせて挑戦できます。
          </p>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            {(Object.keys(CHALLENGE_MODE_META) as ChallengeMode[]).map(mode => {
              const meta = CHALLENGE_MODE_META[mode]
              const selected = mode === selectedMode
              const personalBest = mode === 'time_attack'
                ? timeAttackBest
                : mode === 'test_mode'
                  ? testSummary.personalBest
                  : streakSummary.personalBest

              return (
                <button
                  key={mode}
                  onClick={() => setSelectedMode(mode)}
                  className="subcard p-4 text-left transition-all"
                  style={{
                    borderColor: selected ? `${meta.accent}66` : 'rgba(148, 163, 184, 0.14)',
                    background: selected
                      ? `linear-gradient(135deg, ${meta.accent}1f, rgba(15, 23, 42, 0.9))`
                      : 'rgba(15, 23, 42, 0.72)',
                    boxShadow: selected ? `0 0 0 1px ${meta.accent}33 inset` : 'none',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: meta.accent }}>
                        {meta.badge}
                      </div>
                      <div className="mt-2 font-display text-2xl text-white">{meta.label}</div>
                    </div>
                    <div className="text-3xl">{meta.emoji}</div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{meta.description}</p>
                  <div className="mt-4 text-xs text-slate-500">
                    ベスト: {mode === 'test_mode' ? `${personalBest} / 100` : mode === 'streak_mode' ? `${personalBest}問` : `${personalBest} point`}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="subcard p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: currentModeMeta.accent }}>
                    {currentModeMeta.badge}
                  </div>
                  <div className="mt-2 font-display text-3xl text-white">{currentModeMeta.label}</div>
                </div>
                <div className="text-4xl">{currentModeMeta.emoji}</div>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-300">{currentModeMeta.description}</p>

              {selectedMode === 'time_attack' && (
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="subcard p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">自己ベスト</div>
                    <div className="mt-2 font-display text-3xl text-white">{timeAttackBest}</div>
                    <div className="mt-1 text-xs text-slate-500">best score</div>
                  </div>
                  <div className="subcard p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">
                      {otherLeader ? 'ほかの子のニックネーム' : 'ほかの子の1位'}
                    </div>
                    <div className="mt-2 font-display text-2xl text-amber-200">
                      {otherLeader ? otherLeader.nickname : '—'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {otherLeader ? `${otherLeader.nickname} / ${otherLeader.score} point` : 'まだ記録なし'}
                    </div>
                  </div>
                  <div className="subcard p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">出題</div>
                    <div className="mt-2 font-display text-3xl text-sky-300">{choiceQuestions.length}</div>
                    <div className="mt-1 text-xs text-slate-500">choice only</div>
                  </div>
                </div>
              )}

              {selectedMode === 'test_mode' && (
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="subcard p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">自己ベスト</div>
                    <div className="mt-2 font-display text-3xl text-white">{testSummary.personalBest}</div>
                    <div className="mt-1 text-xs text-slate-500">/ 100</div>
                  </div>
                  <div className="subcard p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">配点</div>
                    <div className="mt-2 font-display text-3xl text-amber-200">{TEST_MODE_QUESTION_COUNT}問</div>
                    <div className="mt-1 text-xs text-slate-500">1問 {TEST_MODE_POINT_PER_QUESTION} 点</div>
                  </div>
                  <div className="subcard p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">準備状況</div>
                    <div className="mt-2 font-display text-3xl text-sky-300">{allQuestions.length}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {testModeQuestionReady ? '出題できます' : `あと ${TEST_MODE_QUESTION_COUNT - allQuestions.length} 問必要`}
                    </div>
                  </div>
                </div>
              )}

              {selectedMode === 'streak_mode' && (
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="subcard p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">自己ベスト</div>
                    <div className="mt-2 font-display text-3xl text-white">{streakSummary.personalBest}</div>
                    <div className="mt-1 text-xs text-slate-500">連続正解</div>
                  </div>
                  <div className="subcard p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">制限時間</div>
                    <div className="mt-2 font-display text-3xl text-emerald-300">10秒</div>
                    <div className="mt-1 text-xs text-slate-500">不正解で終了</div>
                  </div>
                  <div className="subcard p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">出題</div>
                    <div className="mt-2 font-display text-3xl text-sky-300">{choiceQuestions.length}</div>
                    <div className="mt-1 text-xs text-slate-500">choice only</div>
                  </div>
                </div>
              )}
            </div>

            <div className="subcard p-5">
              {selectedMode === 'test_mode' ? (
                <>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">ベストスコア</div>
                  <div className="mt-2 font-display text-4xl text-white">{testSummary.personalBest}</div>
                  <div className="mt-1 text-sm text-slate-400">100点満点</div>
                  <p className="mt-5 text-sm leading-7 text-slate-300">
                    テストモードでは他ユーザ名は表示せず、自分の得点だけを見ながら伸ばせます。
                  </p>
                </>
              ) : selectedMode === 'streak_mode' ? (
                <>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">連続正解ランキング</div>
                  <div className="mt-4 space-y-3">
                    {streakSummary.leaderboard.length > 0 ? streakSummary.leaderboard.map(entry => (
                      <div
                        key={`${entry.studentId}-${entry.rank}-${entry.score}`}
                        className="rounded-[18px] border px-4 py-3"
                        style={{
                          borderColor: entry.isCurrentUser ? 'rgba(34, 197, 94, 0.32)' : 'rgba(148, 163, 184, 0.16)',
                          background: entry.isCurrentUser ? 'rgba(34, 197, 94, 0.08)' : 'rgba(15, 23, 42, 0.56)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500">{entry.rank > 0 ? `${entry.rank}位` : 'あなた'}</div>
                            <div className="truncate font-semibold text-white">{entry.nickname}</div>
                          </div>
                          <div className="font-display text-2xl text-emerald-300">{entry.score}問</div>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-[18px] border border-slate-700/70 bg-slate-900/35 px-4 py-4 text-sm text-slate-400">
                        まだ記録がありません。最初のランキングを作れます。
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">ルール</div>
                  <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                    <div>正解すると 0.5 秒延長されます。</div>
                    <div>2択問題だけをテンポよく解き続けます。</div>
                    <div>自己ベストと他ユーザのトップ記録を見比べられます。</div>
                  </div>
                </>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={startRun}
                  disabled={!currentModeReady}
                  className="btn-primary disabled:opacity-60"
                >
                  {currentModeMeta.startLabel}
                </button>
                <button onClick={onBack} className="btn-secondary">
                  ホームへ
                </button>
              </div>
              <button onClick={() => logout()} className="btn-ghost w-full mt-3">
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'finished') {
    const headline = getModeResultLabel(selectedMode, score)

    return (
      <div className="page-shell flex flex-col items-center justify-center">
        <div className={`hero-card reward-card w-full max-w-3xl p-6 text-center sm:p-7 ${rewardSummary?.leveledUp ? 'is-level-up' : ''}`}>
          <div className="text-5xl mb-4">{currentModeMeta.emoji}</div>
          <div className="font-display text-5xl text-white">{headline}</div>
          <div className="mt-2 text-slate-300">{currentModeMeta.label} の結果</div>
          {selectedMode === 'test_mode' && (
            <div className="mt-3 text-sm text-slate-400">
              {score} / {TEST_MODE_QUESTION_COUNT} 正解
            </div>
          )}
          <p className="mt-5 text-slate-300">{getModeSummaryMessage(selectedMode, score)}</p>

          <LevelUnlockNotice rewardSummary={rewardSummary} />

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">獲得XP</div>
              <div className="mt-2 font-display text-3xl text-sky-300">+{getModeXp(selectedMode, score)}</div>
            </div>
            <div className="subcard p-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">自己ベスト</div>
              <div className="mt-2 font-display text-3xl text-white">
                {selectedMode === 'time_attack'
                  ? timeAttackBest
                  : selectedMode === 'test_mode'
                    ? `${testSummary.personalBest}`
                    : streakSummary.personalBest}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {selectedMode === 'test_mode' ? '/ 100' : selectedMode === 'streak_mode' ? '連続正解' : 'best score'}
              </div>
            </div>
            <div className="subcard p-4">
              {selectedMode === 'test_mode' ? (
                <>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">配点</div>
                  <div className="mt-2 font-display text-3xl text-amber-200">{TEST_MODE_POINT_PER_QUESTION}点</div>
                  <div className="mt-1 text-xs text-slate-500">1問あたり</div>
                </>
              ) : selectedMode === 'streak_mode' ? (
                <>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">1位</div>
                  <div className="mt-2 font-display text-2xl text-emerald-300">
                    {streakSummary.leaderboard[0]?.nickname ?? '—'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {streakSummary.leaderboard[0] ? `${streakSummary.leaderboard[0].score}問` : 'まだ記録なし'}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">
                    {otherLeader ? 'ほかの子のニックネーム' : 'ほかの子の1位'}
                  </div>
                  <div className="mt-2 font-display text-2xl text-amber-200">
                    {otherLeader ? otherLeader.nickname : '—'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {otherLeader ? `${otherLeader.nickname} / ${otherLeader.score} point` : 'まだ記録なし'}
                  </div>
                </>
              )}
            </div>
          </div>

          {selectedMode === 'streak_mode' && streakSummary.leaderboard.length > 0 && (
            <div className="subcard mt-5 p-4 text-left">
              <div className="text-sm font-semibold text-white">連続正解ランキング</div>
              <div className="mt-3 space-y-2">
                {streakSummary.leaderboard.map(entry => (
                  <div
                    key={`result-${entry.studentId}-${entry.rank}-${entry.score}`}
                    className="flex items-center justify-between gap-3 rounded-[16px] border px-3 py-2"
                    style={{
                      borderColor: entry.isCurrentUser ? 'rgba(34, 197, 94, 0.32)' : 'rgba(148, 163, 184, 0.16)',
                      background: entry.isCurrentUser ? 'rgba(34, 197, 94, 0.08)' : 'rgba(15, 23, 42, 0.48)',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-500">{entry.rank > 0 ? `${entry.rank}位` : 'あなた'}</div>
                      <div className="truncate font-semibold text-white">{entry.nickname}</div>
                    </div>
                    <div className="font-display text-xl text-emerald-300">{entry.score}問</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {renderRewardStrip()}

          {selectedMode === 'test_mode' && answerLogs.some(log => log.result === 'keyword') && (
            <p className="text-xs text-slate-500 mt-5">▲ は理科キーワードの途中まで入力できています。あと少しで正解です。</p>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button onClick={startRun} className="btn-primary sm:col-span-2">
              もう一度
            </button>
            <button onClick={onBack} className="btn-secondary">
              ホームへ
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (selectedMode === 'test_mode') {
    return (
      <div className="page-shell">
        <div className="card mb-4 anim-fade-up">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center justify-between gap-3 sm:w-auto">
              <button onClick={onBack} className="btn-secondary text-sm !px-4 !py-2.5">
                やめる
              </button>
              <button onClick={() => logout()} className="btn-ghost text-sm !px-4 !py-2.5 sm:hidden">
                ログアウト
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <span>{currentModeMeta.label}</span>
                <span>{getModeProgressLabel(selectedMode, currentIndex, questions.length)}</span>
              </div>
              <div className="soft-track" style={{ height: 8 }}>
                <div
                  style={{
                    width: `${testModeProgress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #f59e0b, #f97316)',
                    borderRadius: 999,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="text-sm font-semibold text-amber-300">
                {getDisplayScore(selectedMode, score)}点
              </div>
              <button onClick={() => logout()} className="btn-ghost hidden text-sm !px-4 !py-2.5 sm:inline-flex">
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {currentQuestion && (
          <div key={`${selectedMode}-${currentQuestion.id}-${currentIndex}`} className="card anim-fade-up mb-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#f59e0b20', color: '#fbbf24' }}>
                  {currentQuestion.field} · {currentQuestion.unit}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(148, 163, 184, 0.14)', color: 'var(--text-muted)' }}>
                  {currentQuestion.type === 'choice' ? `${currentQuestion.choices?.length ?? 0}択` : '記述'}
                </span>
              </div>
              <div className="text-xs text-slate-500">{currentIndex + 1} / {questions.length}</div>
            </div>

            <div className="text-2xl font-bold text-white leading-relaxed">{currentQuestion.question}</div>

            {currentQuestion.image_url && currentQuestionImageDisplay && (
              <div className="mt-4 flex justify-center">
                <div
                  className="overflow-hidden rounded-[24px] border bg-slate-950/50"
                  style={{
                    borderColor: 'rgba(148, 163, 184, 0.16)',
                    width: `min(100%, ${currentQuestionImageDisplay.width}px)`,
                    aspectRatio: currentQuestionImageDisplay.aspectRatio,
                  }}
                >
                  <img
                    src={currentQuestion.image_url}
                    alt={`${currentQuestion.question} の画像`}
                    className="block h-full w-full object-fill"
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            {currentQuestion.type === 'choice' ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {currentQuestion.choices?.map((choice, index) => {
                  const isCorrect = choice === currentQuestion.answer
                  const isSelected = selectedChoice === choice
                  const showState = testModeAnswered
                  return (
                    <button
                      key={`${currentQuestion.id}-${choice}`}
                      onClick={() => handleTestChoice(choice)}
                      disabled={testModeAnswered}
                      className="min-h-[90px] rounded-xl border p-4 text-left font-bold text-white transition-all disabled:opacity-100"
                      style={{
                        borderColor: showState
                          ? isCorrect
                            ? 'rgba(34, 197, 94, 0.48)'
                            : isSelected
                              ? 'rgba(239, 68, 68, 0.48)'
                              : 'rgba(255, 255, 255, 0.08)'
                          : 'rgba(255, 255, 255, 0.08)',
                        background: showState
                          ? isCorrect
                            ? 'rgba(34, 197, 94, 0.14)'
                            : isSelected
                              ? 'rgba(239, 68, 68, 0.14)'
                              : 'rgba(15, 23, 42, 0.72)'
                          : 'rgba(15, 23, 42, 0.72)',
                      }}
                    >
                      <span className="mr-3 opacity-50">{'ABCD'[index] ?? `${index + 1}` }.</span>
                      {choice}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="mt-5">
                <div
                  className="mb-3 rounded-[24px] border px-4 py-3"
                  style={{
                    borderColor: 'rgba(245, 158, 11, 0.24)',
                    background: 'rgba(15, 23, 42, 0.68)',
                  }}
                >
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-amber-200">キーワード入力</div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    {usesKeywordInput
                      ? '答えの文章を全部打たなくてOKです。模範解答に入る理科キーワードを1つ入力してください。'
                      : '短く答えを入力してください。'}
                  </div>
                </div>
                <input
                  value={textInput}
                  onChange={event => setTextInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleTestTextSubmit()
                    }
                  }}
                  disabled={testModeAnswered}
                  placeholder={usesKeywordInput ? '理科キーワードを1つ入力' : '答えを入力'}
                  enterKeyHint="done"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none"
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button onClick={handleTestTextSubmit} disabled={testModeAnswered || !textInput.trim()} className="btn-primary disabled:opacity-60">
                    回答する
                  </button>
                  <button onClick={handleTestDontKnow} disabled={testModeAnswered} className="btn-secondary disabled:opacity-60">
                    わからない
                  </button>
                </div>
              </div>
            )}

            {testModeAnswered && (
              <div
                className="mt-5 rounded-[24px] border px-4 py-4 text-left"
                style={{
                  borderColor: answerResult === 'exact'
                    ? 'rgba(34, 197, 94, 0.36)'
                    : answerResult === 'keyword'
                      ? 'rgba(245, 158, 11, 0.36)'
                      : 'rgba(239, 68, 68, 0.36)',
                  background: answerResult === 'exact'
                    ? 'rgba(34, 197, 94, 0.08)'
                    : answerResult === 'keyword'
                      ? 'rgba(245, 158, 11, 0.08)'
                      : 'rgba(239, 68, 68, 0.08)',
                }}
              >
                <div className="font-semibold text-white">
                  {answerResult === 'exact' ? '○ 正解' : answerResult === 'keyword' ? '△ あと少し' : '× 不正解'}
                </div>
                <div className="mt-2 text-sm leading-7 text-slate-300">
                  正解: {currentQuestion.answer}
                </div>
                {answerResult !== 'exact' && usesKeywordInput && currentQuestion.keywords && currentQuestion.keywords.length > 0 && (
                  <div className="mt-2 text-xs leading-6 text-slate-400">
                    正解キーワード例: {currentQuestion.keywords.join(' / ')}
                  </div>
                )}
                {answerResult === 'keyword' && (
                  <div className="mt-2 text-xs leading-6 text-amber-200">
                    理科キーワードの途中まで合っています。もう少し入力すると正解になります。
                  </div>
                )}
                {currentQuestion.explanation && (
                  <div className="mt-2 text-sm leading-7 text-slate-300">{currentQuestion.explanation}</div>
                )}
                <div className="mt-4">
                  <button onClick={() => void handleNextTestQuestion()} className="btn-primary">
                    {currentIndex + 1 >= questions.length ? '採点する' : '次へ'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page-shell page-shell-dashboard">
      <div className={`hero-card p-5 sm:p-6 ${feedback ? `time-attack-shell is-${feedback}` : 'time-attack-shell'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={onBack} className="btn-secondary text-sm !px-4 !py-2.5">
            やめる
          </button>
          <div className={`time-attack-timer ${remainingMs <= 5000 ? 'is-danger' : ''}`}>
            {formatTimer(remainingMs)}
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">{selectedMode === 'streak_mode' ? '連続数' : 'スコア'}</div>
            <div className="font-display text-3xl text-white">{score}</div>
          </div>
        </div>

        {currentQuestion && (
          <div className="mt-6">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: `${currentModeMeta.accent}26`, color: currentModeMeta.accent }}
              >
                {currentModeMeta.label}
              </span>
              <span className="rounded-full px-3 py-1 text-xs font-semibold text-sky-100" style={{ background: 'rgba(56, 189, 248, 0.16)' }}>
                {currentQuestion.field}
              </span>
              <span className="text-xs text-slate-500">{currentQuestion.unit}</span>
            </div>
            <h2 className="mt-4 text-2xl font-bold text-white sm:text-3xl">{currentQuestion.question}</h2>
            {currentQuestion.image_url && currentQuestionImageDisplay && (
              <div className="mt-4 flex justify-center">
                <div
                  className="overflow-hidden rounded-[24px] border bg-slate-950/50"
                  style={{
                    borderColor: 'rgba(148, 163, 184, 0.16)',
                    width: `min(100%, ${currentQuestionImageDisplay.width}px)`,
                    aspectRatio: currentQuestionImageDisplay.aspectRatio,
                  }}
                >
                  <img
                    src={currentQuestion.image_url}
                    alt={`${currentQuestion.question} の画像`}
                    className="block h-full w-full object-fill"
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {currentQuestion.choices?.map((choice, index) => (
                <button
                  key={`${currentQuestion.id}-${choice}`}
                  onClick={() => handleSpeedChoice(choice)}
                  className="min-h-[90px] rounded-xl border border-white/10 bg-slate-900/70 p-4 text-left font-bold text-white transition-all"
                  disabled={phase !== 'playing'}
                >
                  <span className="mr-3 opacity-50">{'AB'[index] ?? `${index + 1}` }.</span>
                  {choice}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 text-xs text-slate-400">
          <span>{selectedMode === 'streak_mode' ? '不正解でその場で終了' : '正解すると +0.5 秒'}</span>
          <span>
            {selectedMode === 'streak_mode'
              ? `ベスト ${streakSummary.personalBest}問`
              : `自己ベスト ${timeAttackBest}`}
          </span>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button onClick={() => logout()} className="btn-ghost text-sm !px-4 !py-2.5">
          ログアウト
        </button>
      </div>
    </div>
  )
}
