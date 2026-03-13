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

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type SessionMode =
  | 'standard'
  | 'daily_challenge'
  | 'quick_start'
  | 'mixed_quick_start'
  | 'drill'
  | 'custom'
  | 'chemistry_flash'
  | 'chemistry_reaction'
  | 'chemistry_density_lab'
  | 'chemistry_concentration_lab'
  | 'chemistry_battery_lab'
  | 'chemistry_humidity_lab'
  | 'biology_organ_pairs'
  | 'earth_rock_pairs'
  | 'earth_humidity_lab'
  | 'earth_column_lab'
  | 'physics_motion_graph_lab'
  | 'test_mode'
  | 'streak_mode'
  | 'time_attack'

export type Database = {
  public: {
    Tables: {
      students: {
        Row: {
          id: number
          nickname: string
          password: string
          student_xp: number
          xp: number
          created_at: string
        }
        Insert: {
          id: number
          nickname: string
          password?: string
          student_xp?: number
          xp?: number
        }
        Update: {
          nickname?: string
          password?: string
          student_xp?: number
          xp?: number
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
          keywords: string[] | null
          created_by_student_id: number | null
          explanation: string | null
          image_url: string | null
          image_display_width: number | null
          image_display_height: number | null
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
          keywords?: string[] | null
          created_by_student_id?: number | null
          explanation?: string | null
          image_url?: string | null
          image_display_width?: number | null
          image_display_height?: number | null
          grade?: string
        }
        Update: {
          id?: string
          field?: string
          unit?: string
          question?: string
          type?: 'choice' | 'text'
          choices?: string[] | null
          answer?: string
          accept_answers?: string[] | null
          keywords?: string[] | null
          created_by_student_id?: number | null
          explanation?: string | null
          image_url?: string | null
          image_display_width?: number | null
          image_display_height?: number | null
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
          xp_earned: number
          session_mode: SessionMode
          created_at: string
        }
        Insert: {
          student_id: number
          field: string
          unit: string
          total_questions: number
          correct_count: number
          duration_seconds?: number
          xp_earned?: number
          session_mode?: SessionMode
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
      active_sessions: {
        Row: {
          session_token: string
          student_id: number
          last_seen_at: string
          created_at: string
        }
        Insert: {
          session_token: string
          student_id: number
          last_seen_at?: string
        }
        Update: {
          student_id?: number
          last_seen_at?: string
        }
      }
      online_lab_rooms: {
        Row: {
          room_key: string
          mode: string | null
          controller_student_id: number | null
          controller_nickname: string | null
          is_live: boolean
          phase: 'idle' | 'adjusting' | 'result' | 'finished'
          round_index: number
          score: number
          history_json: boolean[]
          state_json: Json | null
          feedback_json: Json | null
          memo_text: string
          whiteboard_strokes: Json
          updated_at: string
          created_at: string
        }
        Insert: {
          room_key?: string
          mode?: string | null
          controller_student_id?: number | null
          controller_nickname?: string | null
          is_live?: boolean
          phase?: 'idle' | 'adjusting' | 'result' | 'finished'
          round_index?: number
          score?: number
          history_json?: boolean[]
          state_json?: Json | null
          feedback_json?: Json | null
          memo_text?: string
          whiteboard_strokes?: Json
          updated_at?: string
        }
        Update: {
          mode?: string | null
          controller_student_id?: number | null
          controller_nickname?: string | null
          is_live?: boolean
          phase?: 'idle' | 'adjusting' | 'result' | 'finished'
          round_index?: number
          score?: number
          history_json?: boolean[]
          state_json?: Json | null
          feedback_json?: Json | null
          memo_text?: string
          whiteboard_strokes?: Json
          updated_at?: string
        }
      }
      chat_guard_logs: {
        Row: {
          id: string
          student_id: number
          field: string
          categories: string[]
          matched_terms: string[]
          message_excerpt: string
          source: 'draft' | 'send'
          created_at: string
        }
        Insert: {
          id?: string
          student_id: number
          field: string
          categories: string[]
          matched_terms: string[]
          message_excerpt: string
          source?: 'draft' | 'send'
        }
        Update: {
          categories?: string[]
          matched_terms?: string[]
          message_excerpt?: string
          source?: 'draft' | 'send'
        }
      }
      question_inquiries: {
        Row: {
          id: string
          student_id: number
          student_nickname: string
          question_id: string | null
          status: 'open' | 'reviewing' | 'resolved'
          category: 'question_content' | 'answer_content' | 'other'
          message: string
          field: '生物' | '化学' | '物理' | '地学'
          unit: string
          question_text: string
          question_type: 'choice' | 'text'
          choices: string[] | null
          answer_text: string
          explanation_text: string | null
          image_url: string | null
          admin_note: string
          admin_reply: string
          created_at: string
          updated_at: string
          replied_at: string | null
          resolved_at: string | null
        }
        Insert: {
          id?: string
          student_id: number
          student_nickname: string
          question_id?: string | null
          status?: 'open' | 'reviewing' | 'resolved'
          category: 'question_content' | 'answer_content' | 'other'
          message?: string
          field: '生物' | '化学' | '物理' | '地学'
          unit: string
          question_text: string
          question_type: 'choice' | 'text'
          choices?: string[] | null
          answer_text: string
          explanation_text?: string | null
          image_url?: string | null
          admin_note?: string
          admin_reply?: string
          created_at?: string
          updated_at?: string
          replied_at?: string | null
          resolved_at?: string | null
        }
        Update: {
          student_id?: number
          student_nickname?: string
          question_id?: string | null
          status?: 'open' | 'reviewing' | 'resolved'
          category?: 'question_content' | 'answer_content' | 'other'
          message?: string
          field?: '生物' | '化学' | '物理' | '地学'
          unit?: string
          question_text?: string
          question_type?: 'choice' | 'text'
          choices?: string[] | null
          answer_text?: string
          explanation_text?: string | null
          image_url?: string | null
          admin_note?: string
          admin_reply?: string
          created_at?: string
          updated_at?: string
          replied_at?: string | null
          resolved_at?: string | null
        }
      }
      admin_messages: {
        Row: {
          id: string
          student_id: number
          student_nickname: string
          status: 'open' | 'reviewing' | 'resolved'
          category: 'request' | 'update' | 'other'
          message: string
          admin_note: string
          admin_reply: string
          created_at: string
          updated_at: string
          replied_at: string | null
          resolved_at: string | null
        }
        Insert: {
          id?: string
          student_id: number
          student_nickname: string
          status?: 'open' | 'reviewing' | 'resolved'
          category: 'request' | 'update' | 'other'
          message: string
          admin_note?: string
          admin_reply?: string
          created_at?: string
          updated_at?: string
          replied_at?: string | null
          resolved_at?: string | null
        }
        Update: {
          student_id?: number
          student_nickname?: string
          status?: 'open' | 'reviewing' | 'resolved'
          category?: 'request' | 'update' | 'other'
          message?: string
          admin_note?: string
          admin_reply?: string
          created_at?: string
          updated_at?: string
          replied_at?: string | null
          resolved_at?: string | null
        }
      }
      science_glossary_entries: {
        Row: {
          id: string
          term: string
          reading: string
          field: '生物' | '化学' | '物理' | '地学'
          short_description: string
          description: string
          related: string[]
          tags: string[]
          created_at: string
        }
        Insert: {
          id?: string
          term: string
          reading: string
          field: '生物' | '化学' | '物理' | '地学'
          short_description: string
          description: string
          related?: string[]
          tags?: string[]
        }
        Update: {
          term?: string
          reading?: string
          field?: '生物' | '化学' | '物理' | '地学'
          short_description?: string
          description?: string
          related?: string[]
          tags?: string[]
        }
      }
      student_element_cards: {
        Row: {
          student_id: number
          card_key: string
          obtain_count: number
          first_obtained_at: string
          last_obtained_at: string
          last_source: 'login' | 'perfect_clear' | 'level_up'
        }
        Insert: {
          student_id: number
          card_key: string
          obtain_count?: number
          first_obtained_at?: string
          last_obtained_at?: string
          last_source?: 'login' | 'perfect_clear' | 'level_up'
        }
        Update: {
          obtain_count?: number
          first_obtained_at?: string
          last_obtained_at?: string
          last_source?: 'login' | 'perfect_clear' | 'level_up'
        }
      }
      element_card_rewards: {
        Row: {
          id: string
          student_id: number
          card_key: string
          source: 'login' | 'perfect_clear' | 'level_up'
          reward_date: string
          created_at: string
        }
        Insert: {
          id?: string
          student_id: number
          card_key: string
          source: 'login' | 'perfect_clear' | 'level_up'
          reward_date: string
          created_at?: string
        }
        Update: {
          card_key?: string
          source?: 'login' | 'perfect_clear' | 'level_up'
          reward_date?: string
          created_at?: string
        }
      }
      daily_challenges: {
        Row: {
          id: string | null
          student_id: number
          date: string
          challenge_date: string | null
          session_id: string
          completed_at: string
        }
        Insert: {
          id?: string | null
          student_id: number
          date: string
          challenge_date?: string | null
          session_id: string
          completed_at?: string
        }
        Update: {
          challenge_date?: string | null
          session_id?: string
          completed_at?: string
        }
      }
      badges: {
        Row: {
          id: string
          key: string
          name: string
          description: string
          icon_emoji: string
          rarity: 'common' | 'rare' | 'legendary'
          condition_type: string
          created_at: string
        }
        Insert: {
          id?: string
          key: string
          name: string
          description: string
          icon_emoji: string
          rarity: 'common' | 'rare' | 'legendary'
          condition_type: string
          created_at?: string
        }
        Update: {
          name?: string
          description?: string
          icon_emoji?: string
          rarity?: 'common' | 'rare' | 'legendary'
          condition_type?: string
        }
      }
      student_badges: {
        Row: {
          id: string | null
          student_id: number
          badge_key: string
          earned_at: string
        }
        Insert: {
          id?: string | null
          student_id: number
          badge_key: string
          earned_at?: string
        }
        Update: {
          id?: string | null
          earned_at?: string
        }
      }
      time_attack_records: {
        Row: {
          student_id: number
          best_score: number
          achieved_at: string
        }
        Insert: {
          student_id: number
          best_score: number
          achieved_at?: string
        }
        Update: {
          best_score?: number
          achieved_at?: string
        }
      }
    }
  }
}
