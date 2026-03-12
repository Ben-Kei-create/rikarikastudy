import { GUEST_STUDENT_ID } from '@/lib/guestStudy'

interface StudentAvatarMeta {
  emoji: string
  background: string
  borderColor: string
  glow: string
}

const STUDENT_AVATAR_META: Record<number, StudentAvatarMeta> = {
  [GUEST_STUDENT_ID]: {
    emoji: '🪐',
    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.28), rgba(56, 189, 248, 0.12))',
    borderColor: 'rgba(125, 211, 252, 0.32)',
    glow: '0 10px 22px rgba(14, 165, 233, 0.18)',
  },
  1: {
    emoji: '🧪',
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.28), rgba(147, 197, 253, 0.12))',
    borderColor: 'rgba(147, 197, 253, 0.34)',
    glow: '0 10px 22px rgba(59, 130, 246, 0.18)',
  },
  2: {
    emoji: '🌿',
    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.28), rgba(134, 239, 172, 0.12))',
    borderColor: 'rgba(134, 239, 172, 0.34)',
    glow: '0 10px 22px rgba(34, 197, 94, 0.18)',
  },
  3: {
    emoji: '⚡',
    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.28), rgba(253, 224, 71, 0.12))',
    borderColor: 'rgba(253, 224, 71, 0.34)',
    glow: '0 10px 22px rgba(245, 158, 11, 0.18)',
  },
  4: {
    emoji: '🌏',
    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.28), rgba(196, 181, 253, 0.12))',
    borderColor: 'rgba(196, 181, 253, 0.34)',
    glow: '0 10px 22px rgba(168, 85, 247, 0.18)',
  },
  5: {
    emoji: '🧑‍🏫',
    background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.28), rgba(251, 207, 232, 0.12))',
    borderColor: 'rgba(251, 207, 232, 0.34)',
    glow: '0 10px 22px rgba(244, 114, 182, 0.16)',
  },
}

const FALLBACK_AVATAR_META: StudentAvatarMeta = {
  emoji: '🔬',
  background: 'linear-gradient(135deg, rgba(148, 163, 184, 0.28), rgba(203, 213, 225, 0.12))',
  borderColor: 'rgba(203, 213, 225, 0.28)',
  glow: '0 10px 22px rgba(148, 163, 184, 0.12)',
}

export function getStudentAvatarMeta(studentId: number) {
  return STUDENT_AVATAR_META[studentId] ?? FALLBACK_AVATAR_META
}
