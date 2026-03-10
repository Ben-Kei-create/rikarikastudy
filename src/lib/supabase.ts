import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      students: {
        Row: {
          id: number
          nickname: string
          created_at: string
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
          created_at: string
        }
        Insert: {
          student_id: number
          field: string
          unit: string
          total_questions: number
          correct_count: number
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
