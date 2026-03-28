export type ChatModerationCategory = 'abuse' | 'sexual'
export type ChatModerationSource = 'draft' | 'send'

interface ChatModerationRule {
  category: ChatModerationCategory
  term: string
}

export interface ChatModerationResult {
  blocked: boolean
  categories: ChatModerationCategory[]
  matchedTerms: string[]
  warningMessage: string
}

const CHAT_MODERATION_CATEGORY_LABELS: Record<ChatModerationCategory, string> = {
  abuse: '悪口・暴言',
  sexual: '下ネタ・性的表現',
}

const CHAT_MODERATION_RULES: ChatModerationRule[] = [
  { category: 'abuse', term: 'ばか' },
  { category: 'abuse', term: 'バカ' },
  { category: 'abuse', term: '馬鹿' },
  { category: 'abuse', term: 'あほ' },
  { category: 'abuse', term: 'アホ' },
  { category: 'abuse', term: 'しね' },
  { category: 'abuse', term: '死ね' },
  { category: 'abuse', term: 'きもい' },
  { category: 'abuse', term: 'キモい' },
  { category: 'abuse', term: 'うざい' },
  { category: 'abuse', term: 'ブス' },
  { category: 'abuse', term: 'くず' },
  { category: 'abuse', term: 'クズ' },
  { category: 'abuse', term: 'かす' },
  { category: 'abuse', term: 'カス' },
  { category: 'abuse', term: 'ころす' },
  { category: 'abuse', term: '殺す' },
  { category: 'abuse', term: 'ぶっころす' },
  { category: 'sexual', term: 'えろ' },
  { category: 'sexual', term: 'エロ' },
  { category: 'sexual', term: 'せっくす' },
  { category: 'sexual', term: 'セックス' },
  { category: 'sexual', term: '下ネタ' },
  { category: 'sexual', term: 'ちんこ' },
  { category: 'sexual', term: 'まんこ' },
  { category: 'sexual', term: 'おっぱい' },
  { category: 'sexual', term: '乳首' },
  { category: 'sexual', term: 'オナニー' },
  { category: 'sexual', term: '自慰' },
  { category: 'sexual', term: '陰茎' },
  { category: 'sexual', term: '膣' },
  { category: 'sexual', term: '性交' },
  { category: 'sexual', term: '裸' },
]

function normalizeModerationText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
}

function buildWarningMessage(categories: ChatModerationCategory[]) {
  const labels = Array.from(new Set(categories)).map(category => CHAT_MODERATION_CATEGORY_LABELS[category])
  const joinedLabels = labels.join('・')

  return `${joinedLabels}は送れません。理科の質問だけを書いてください。この内容は管理者確認用に記録されます。`
}

export function getChatModerationCategoryLabel(category: ChatModerationCategory) {
  return CHAT_MODERATION_CATEGORY_LABELS[category]
}

export function detectScienceChatModeration(value: string): ChatModerationResult {
  const normalizedInput = normalizeModerationText(value)

  if (!normalizedInput) {
    return {
      blocked: false,
      categories: [],
      matchedTerms: [],
      warningMessage: '',
    }
  }

  const matches = CHAT_MODERATION_RULES.filter(rule =>
    normalizedInput.includes(normalizeModerationText(rule.term))
  )

  if (matches.length === 0) {
    return {
      blocked: false,
      categories: [],
      matchedTerms: [],
      warningMessage: '',
    }
  }

  const categories = Array.from(new Set(matches.map(match => match.category)))
  const matchedTerms = Array.from(new Set(matches.map(match => match.term)))

  return {
    blocked: true,
    categories,
    matchedTerms,
    warningMessage: buildWarningMessage(categories),
  }
}
