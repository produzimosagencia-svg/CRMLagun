export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      _dedup_email_map: {
        Row: {
          dup_count: number | null
          email: string
          primary_id: string
          processed: boolean
        }
        Insert: {
          dup_count?: number | null
          email: string
          primary_id: string
          processed?: boolean
        }
        Update: {
          dup_count?: number | null
          email?: string
          primary_id?: string
          processed?: boolean
        }
        Relationships: []
      }
      _dedup_id_map: {
        Row: {
          dup_id: string
          primary_id: string
        }
        Insert: {
          dup_id: string
          primary_id: string
        }
        Update: {
          dup_id?: string
          primary_id?: string
        }
        Relationships: []
      }
      _import_staging: {
        Row: {
          birth_date: string | null
          city: string | null
          coupon: string | null
          email: string | null
          event_name: string | null
          full_name: string | null
          id: number
          neighborhood: string | null
          payment_method: string | null
          phone: string | null
          price: number | null
          processed: boolean
          state: string | null
        }
        Insert: {
          birth_date?: string | null
          city?: string | null
          coupon?: string | null
          email?: string | null
          event_name?: string | null
          full_name?: string | null
          id?: number
          neighborhood?: string | null
          payment_method?: string | null
          phone?: string | null
          price?: number | null
          processed?: boolean
          state?: string | null
        }
        Update: {
          birth_date?: string | null
          city?: string | null
          coupon?: string | null
          email?: string | null
          event_name?: string | null
          full_name?: string | null
          id?: number
          neighborhood?: string | null
          payment_method?: string | null
          phone?: string | null
          price?: number | null
          processed?: boolean
          state?: string | null
        }
        Relationships: []
      }
      ad_creative_comments: {
        Row: {
          ad_id: string
          comment: string
          created_at: string
          created_by: string | null
          id: string
          updated_at: string
        }
        Insert: {
          ad_id: string
          comment: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          ad_id?: string
          comment?: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      chatbot_event_knowledge: {
        Row: {
          age_rating: string | null
          attractions: string | null
          created_at: string
          event_date: string | null
          event_location: string | null
          event_name: string
          id: string
          observations: string | null
          ticket_link: string | null
          updated_at: string
        }
        Insert: {
          age_rating?: string | null
          attractions?: string | null
          created_at?: string
          event_date?: string | null
          event_location?: string | null
          event_name: string
          id?: string
          observations?: string | null
          ticket_link?: string | null
          updated_at?: string
        }
        Update: {
          age_rating?: string | null
          attractions?: string | null
          created_at?: string
          event_date?: string | null
          event_location?: string | null
          event_name?: string
          id?: string
          observations?: string | null
          ticket_link?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      creative_references: {
        Row: {
          created_at: string
          created_by: string | null
          events: string[]
          id: string
          image_url: string
          observation: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          image_url: string
          observation?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          image_url?: string
          observation?: string | null
        }
        Relationships: []
      }
      creator_content_detections: {
        Row: {
          caption: string | null
          comments: number | null
          creator_id: string
          detected_at: string
          detected_mention: string | null
          event_id: string | null
          id: string
          impressions: number | null
          instagram_account_id: string
          likes: number | null
          media_id: string
          media_type: string
          permalink: string | null
          posted_at: string | null
          raw_payload: Json | null
          reach: number | null
          saves: number | null
          target_account_id: string | null
          thumbnail_url: string | null
          views: number | null
        }
        Insert: {
          caption?: string | null
          comments?: number | null
          creator_id: string
          detected_at?: string
          detected_mention?: string | null
          event_id?: string | null
          id?: string
          impressions?: number | null
          instagram_account_id: string
          likes?: number | null
          media_id: string
          media_type: string
          permalink?: string | null
          posted_at?: string | null
          raw_payload?: Json | null
          reach?: number | null
          saves?: number | null
          target_account_id?: string | null
          thumbnail_url?: string | null
          views?: number | null
        }
        Update: {
          caption?: string | null
          comments?: number | null
          creator_id?: string
          detected_at?: string
          detected_mention?: string | null
          event_id?: string | null
          id?: string
          impressions?: number | null
          instagram_account_id?: string
          likes?: number | null
          media_id?: string
          media_type?: string
          permalink?: string | null
          posted_at?: string | null
          raw_payload?: Json | null
          reach?: number | null
          saves?: number | null
          target_account_id?: string | null
          thumbnail_url?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_content_detections_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "crm_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_content_detections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_content_detections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_content_detections_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "creator_instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_content_detections_target_account_id_fkey"
            columns: ["target_account_id"]
            isOneToOne: false
            referencedRelation: "promotion_target_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_instagram_accounts: {
        Row: {
          access_token: string
          account_type: string | null
          connected_at: string
          created_at: string
          creator_id: string
          followers_count: number | null
          id: string
          instagram_user_id: string
          last_synced_at: string | null
          media_count: number | null
          profile_picture_url: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          username: string
        }
        Insert: {
          access_token: string
          account_type?: string | null
          connected_at?: string
          created_at?: string
          creator_id: string
          followers_count?: number | null
          id?: string
          instagram_user_id: string
          last_synced_at?: string | null
          media_count?: number | null
          profile_picture_url?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          access_token?: string
          account_type?: string | null
          connected_at?: string
          created_at?: string
          creator_id?: string
          followers_count?: number | null
          id?: string
          instagram_user_id?: string
          last_synced_at?: string | null
          media_count?: number | null
          profile_picture_url?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_instagram_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "crm_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_creators: {
        Row: {
          city: string
          created_at: string
          email: string
          expected_value: number
          followers_instagram: number
          followers_tiktok: number
          full_name: string
          id: string
          instagram: string
          motivation: string
          music_style: string
          qualification: string
          qualification_score: number
          tiktok: string | null
          video_skill: string
          whatsapp: string
        }
        Insert: {
          city?: string
          created_at?: string
          email: string
          expected_value?: number
          followers_instagram?: number
          followers_tiktok?: number
          full_name: string
          id?: string
          instagram: string
          motivation: string
          music_style: string
          qualification?: string
          qualification_score?: number
          tiktok?: string | null
          video_skill: string
          whatsapp: string
        }
        Update: {
          city?: string
          created_at?: string
          email?: string
          expected_value?: number
          followers_instagram?: number
          followers_tiktok?: number
          full_name?: string
          id?: string
          instagram?: string
          motivation?: string
          music_style?: string
          qualification?: string
          qualification_score?: number
          tiktok?: string | null
          video_skill?: string
          whatsapp?: string
        }
        Relationships: []
      }
      crm_customers: {
        Row: {
          birth_date: string | null
          city: string | null
          classification:
            | Database["public"]["Enums"]["client_classification"]
            | null
          created_at: string
          email: string | null
          first_purchase: boolean | null
          full_name: string
          id: string
          last_event: string | null
          ltv: number | null
          neighborhood: string | null
          phone: string | null
          preferred_event_type: string | null
          previous_purchases_count: number | null
          state: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          city?: string | null
          classification?:
            | Database["public"]["Enums"]["client_classification"]
            | null
          created_at?: string
          email?: string | null
          first_purchase?: boolean | null
          full_name: string
          id?: string
          last_event?: string | null
          ltv?: number | null
          neighborhood?: string | null
          phone?: string | null
          preferred_event_type?: string | null
          previous_purchases_count?: number | null
          state?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          city?: string | null
          classification?:
            | Database["public"]["Enums"]["client_classification"]
            | null
          created_at?: string
          email?: string | null
          first_purchase?: boolean | null
          full_name?: string
          id?: string
          last_event?: string | null
          ltv?: number | null
          neighborhood?: string | null
          phone?: string | null
          preferred_event_type?: string | null
          previous_purchases_count?: number | null
          state?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_orphan_customers: {
        Row: {
          archived_at: string
          birth_date: string | null
          city: string | null
          classification: string | null
          email: string | null
          first_purchase: boolean | null
          full_name: string | null
          id: string
          last_event: string | null
          ltv: number | null
          neighborhood: string | null
          original_created_at: string | null
          original_id: string | null
          phone: string | null
          preferred_event_type: string | null
          previous_purchases_count: number | null
          state: string | null
          tags: string[] | null
        }
        Insert: {
          archived_at?: string
          birth_date?: string | null
          city?: string | null
          classification?: string | null
          email?: string | null
          first_purchase?: boolean | null
          full_name?: string | null
          id?: string
          last_event?: string | null
          ltv?: number | null
          neighborhood?: string | null
          original_created_at?: string | null
          original_id?: string | null
          phone?: string | null
          preferred_event_type?: string | null
          previous_purchases_count?: number | null
          state?: string | null
          tags?: string[] | null
        }
        Update: {
          archived_at?: string
          birth_date?: string | null
          city?: string | null
          classification?: string | null
          email?: string | null
          first_purchase?: boolean | null
          full_name?: string | null
          id?: string
          last_event?: string | null
          ltv?: number | null
          neighborhood?: string | null
          original_created_at?: string | null
          original_id?: string | null
          phone?: string | null
          preferred_event_type?: string | null
          previous_purchases_count?: number | null
          state?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      crm_purchases: {
        Row: {
          acquisition_channel: string | null
          attendance_status: string | null
          campaign_medium: string | null
          campaign_origin: string | null
          coupon_used: string | null
          created_at: string
          customer_id: string
          event_date: string | null
          event_name: string
          id: string
          influencer_code: string | null
          payment_method: string | null
          purchase_date: string
          quantity: number
          ticket_lot: string | null
          ticket_price: number
          ticket_type: string | null
          total_value: number
        }
        Insert: {
          acquisition_channel?: string | null
          attendance_status?: string | null
          campaign_medium?: string | null
          campaign_origin?: string | null
          coupon_used?: string | null
          created_at?: string
          customer_id: string
          event_date?: string | null
          event_name: string
          id?: string
          influencer_code?: string | null
          payment_method?: string | null
          purchase_date?: string
          quantity?: number
          ticket_lot?: string | null
          ticket_price?: number
          ticket_type?: string | null
          total_value?: number
        }
        Update: {
          acquisition_channel?: string | null
          attendance_status?: string | null
          campaign_medium?: string | null
          campaign_origin?: string | null
          coupon_used?: string | null
          created_at?: string
          customer_id?: string
          event_date?: string | null
          event_name?: string
          id?: string
          influencer_code?: string | null
          payment_method?: string | null
          purchase_date?: string
          quantity?: number
          ticket_lot?: string | null
          ticket_price?: number
          ticket_type?: string | null
          total_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_purchases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "crm_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      design_demands: {
        Row: {
          attachments: string[] | null
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string
          id: string
          priority: string | null
          publish_date: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id: string
          id?: string
          priority?: string | null
          publish_date?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string
          id?: string
          priority?: string | null
          publish_date?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_demands_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_demands_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      event_categories: {
        Row: {
          category: string
          created_at: string
          event_name: string
          id: string
        }
        Insert: {
          category: string
          created_at?: string
          event_name: string
          id?: string
        }
        Update: {
          category?: string
          created_at?: string
          event_name?: string
          id?: string
        }
        Relationships: []
      }
      event_promotion_targets: {
        Row: {
          created_at: string
          event_id: string
          id: string
          target_account_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          target_account_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          target_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_promotion_targets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_promotion_targets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_promotion_targets_target_account_id_fkey"
            columns: ["target_account_id"]
            isOneToOne: false
            referencedRelation: "promotion_target_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          api_token: string | null
          avatar_url: string | null
          created_at: string
          event_date: string | null
          id: string
          name: string
          official_revenue: number | null
          official_tickets: number | null
          platform: string | null
          status: string | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          api_token?: string | null
          avatar_url?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          name: string
          official_revenue?: number | null
          official_tickets?: number | null
          platform?: string | null
          status?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          api_token?: string | null
          avatar_url?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          name?: string
          official_revenue?: number | null
          official_tickets?: number | null
          platform?: string | null
          status?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      internal_page_state: {
        Row: {
          page_key: string
          state: Json
          updated_at: string
        }
        Insert: {
          page_key: string
          state?: Json
          updated_at?: string
        }
        Update: {
          page_key?: string
          state?: Json
          updated_at?: string
        }
        Relationships: []
      }
      maestria_birthday: {
        Row: {
          birth_date: string
          coupon: string
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          whatsapp: string
        }
        Insert: {
          birth_date: string
          coupon: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          whatsapp: string
        }
        Update: {
          birth_date?: string
          coupon?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          whatsapp?: string
        }
        Relationships: []
      }
      maestria_divulgadores: {
        Row: {
          city: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          instagram: string | null
          is_creator: boolean | null
          origin: string | null
          phone: string | null
          submitted_at: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          instagram?: string | null
          is_creator?: boolean | null
          origin?: string | null
          phone?: string | null
          submitted_at?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          instagram?: string | null
          is_creator?: boolean | null
          origin?: string | null
          phone?: string | null
          submitted_at?: string | null
        }
        Relationships: []
      }
      maestria_prevenda: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          origin: string | null
          phone: string | null
          submitted_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          origin?: string | null
          phone?: string | null
          submitted_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          origin?: string | null
          phone?: string | null
          submitted_at?: string | null
        }
        Relationships: []
      }
      meta_ads_jobs: {
        Row: {
          ai_messages: Json | null
          ai_model: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          latest_media_url: string | null
          progress: number
          result: Json | null
          status: string
          system_prompt: string | null
          tool_arguments: Json
          tool_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_messages?: Json | null
          ai_model?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          latest_media_url?: string | null
          progress?: number
          result?: Json | null
          status?: string
          system_prompt?: string | null
          tool_arguments?: Json
          tool_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_messages?: Json | null
          ai_model?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          latest_media_url?: string | null
          progress?: number
          result?: Json | null
          status?: string
          system_prompt?: string | null
          tool_arguments?: Json
          tool_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          read: boolean
          task_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          task_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          task_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          squad: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          squad?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          squad?: string | null
          username?: string | null
        }
        Relationships: []
      }
      promotion_target_accounts: {
        Row: {
          active: boolean
          created_at: string
          display_name: string | null
          id: string
          instagram_user_id: string | null
          updated_at: string
          username: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          instagram_user_id?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          instagram_user_id?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      sidebar_menu_settings: {
        Row: {
          enabled: boolean
          key: string
          label: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          label: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_tasks: {
        Row: {
          assigned_to: string | null
          attachments: string[] | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          event_id: string | null
          id: string
          priority: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attachments?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          priority?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attachments?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          priority?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      trafego_gpt_conversations: {
        Row: {
          campaign_type: string | null
          created_at: string
          event_name: string | null
          id: string
          messages: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_type?: string | null
          created_at?: string
          event_name?: string | null
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_type?: string | null
          created_at?: string
          event_name?: string | null
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_menu_overrides: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          id: string
          payload: Json
          received_at: string
          source: string
        }
        Insert: {
          id?: string
          payload: Json
          received_at?: string
          source?: string
        }
        Update: {
          id?: string
          payload?: Json
          received_at?: string
          source?: string
        }
        Relationships: []
      }
      whatsapp_bot_settings: {
        Row: {
          bot_enabled: boolean
          phone: string
          updated_at: string
        }
        Insert: {
          bot_enabled?: boolean
          phone: string
          updated_at?: string
        }
        Update: {
          bot_enabled?: boolean
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          channel: string
          contact_name: string | null
          created_at: string
          direction: string
          id: string
          media_url: string | null
          message_text: string | null
          message_type: string
          phone: string
          raw_payload: Json | null
          status: string | null
          timestamp: string
          wamid: string | null
        }
        Insert: {
          channel?: string
          contact_name?: string | null
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          message_text?: string | null
          message_type?: string
          phone: string
          raw_payload?: Json | null
          status?: string | null
          timestamp?: string
          wamid?: string | null
        }
        Update: {
          channel?: string
          contact_name?: string | null
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          message_text?: string | null
          message_type?: string
          phone?: string
          raw_payload?: Json | null
          status?: string | null
          timestamp?: string
          wamid?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      events_safe: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          event_date: string | null
          id: string | null
          name: string | null
          official_revenue: number | null
          official_tickets: number | null
          platform: string | null
          status: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          event_date?: string | null
          id?: string | null
          name?: string | null
          official_revenue?: number | null
          official_tickets?: number | null
          platform?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          event_date?: string | null
          id?: string | null
          name?: string | null
          official_revenue?: number | null
          official_tickets?: number | null
          platform?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      crm_dashboard_stats: { Args: never; Returns: Json }
      crm_top_fans: {
        Args: { lim?: number }
        Returns: {
          customer_id: string
          event_count: number
          event_names: string[]
          full_name: string
          phone: string
          total_spent: number
        }[]
      }
      crm_top_superclientes: {
        Args: { lim?: number }
        Returns: {
          customer_id: string
          event_count: number
          event_names: string[]
          full_name: string
          phone: string
          total_spent: number
        }[]
      }
      dedup_customers_batch: { Args: { batch_size?: number }; Returns: Json }
      deduplicate_purchases: { Args: never; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_orphan_customers_batch: {
        Args: { batch_size?: number }
        Returns: Json
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_email_by_username: { Args: { _username: string }; Returns: string }
      grafos_event_aggregates: {
        Args: never
        Returns: {
          channel: string
          conversion: number
          event_name: string
          volume: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_event_batch: { Args: { batch_size?: number }; Returns: Json }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      process_import_batch: { Args: { batch_size?: number }; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "partner" | "design" | "trafego"
      client_classification: "cold" | "warm" | "hot" | "vip"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "partner", "design", "trafego"],
      client_classification: ["cold", "warm", "hot", "vip"],
    },
  },
} as const
