import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''

// Never throw at module level — a throw here kills client-side hydration.
// When credentials are missing the client points at a dummy host;
// auth.tsx falls back to DEFAULT_STUDENTS on any fetch error.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.invalid',
  supabaseKey || 'placeholder'
)

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey)

export type Database = {
  public: {
    Tables: {
      students: {
        Row: {
          id: number
          nickname: string
          password: string
          created_at: string
        }
        Insert: {
          id: number
          nickname: string
          password?: string
        }
        Update: {
          nickname?: string
          password?: string
        }
      }
      questions: {
        Row: {
          id: string
          field: string
          unit: string
          question: string
          type: 'choice' | 'text'
          choices: string[] | null
          answer: string
          accept_answers: string[] | null
          created_by_student_id: number | null
          explanation: string | null
          grade: string
          created_at: string
        }
        Insert: {
          id?: string
          field: string
          unit: string
          question: string
          type: 'choice' | 'text'
          choices?: string[] | null
          answer: string
          accept_answers?: string[] | null
          created_by_student_id?: number | null
          explanation?: string | null
          grade?: string
        }
      }
      quiz_sessions: {
        Row: {
          id: string
          student_id: number
          field: string
          unit: string
          total_questions: number
          correct_count: number
          duration_seconds: number
          created_at: string
        }
        Insert: {
          student_id: number
          field: string
          unit: string
          total_questions: number
          correct_count: number
          duration_seconds?: number
        }
      }
      answer_logs: {
        Row: {
          id: string
          session_id: string
          student_id: number
          question_id: string
          is_correct: boolean
          student_answer: string
          created_at: string
        }
        Insert: {
          session_id: string
          student_id: number
          question_id: string
          is_correct: boolean
          student_answer: string
        }
      }
    }
  }
}
