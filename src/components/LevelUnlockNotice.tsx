'use client'

import { getNewlyUnlockedLevelRewards } from '@/lib/engagement'
import { StudyRewardSummary } from '@/lib/studyRewards'

export default function LevelUnlockNotice({
  rewardSummary,
}: {
  rewardSummary: StudyRewardSummary | null
}) {
  if (!rewardSummary) return null

  const unlockedRewards = getNewlyUnlockedLevelRewards(rewardSummary.levelBefore, rewardSummary.levelAfter)
  if (unlockedRewards.length === 0) return null

  return (
    <div className="mt-5 rounded-[24px] border px-4 py-4 text-left" style={{
      borderColor: 'rgba(56, 189, 248, 0.24)',
      background: 'linear-gradient(180deg, rgba(56, 189, 248, 0.12), rgba(15, 23, 42, 0.08))',
    }}>
      <div className="text-xs font-semibold tracking-[0.2em] text-sky-200">UNLOCKED</div>
      <div className="mt-2 font-semibold text-white">レベルアップで新しい報酬が解放されました</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {unlockedRewards.map(reward => (
          <div
            key={reward.key}
            className="rounded-[18px] border px-4 py-3"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.08)',
              background: 'rgba(15, 23, 42, 0.36)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="text-2xl">{reward.emoji}</div>
              <div className="min-w-0">
                <div className="font-semibold text-white">{reward.title}</div>
                <div className="mt-1 text-xs leading-6 text-slate-300">{reward.description}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
