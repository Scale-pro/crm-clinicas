export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          actor_id: string | null
          clinic_id: string
          contact_id: string | null
          id: string
          occurred_at: string
          opportunity_id: string | null
          payload: Json
          type: string
        }
        Insert: {
          actor_id?: string | null
          clinic_id: string
          contact_id?: string | null
          id?: string
          occurred_at?: string
          opportunity_id?: string | null
          payload?: Json
          type: string
        }
        Update: {
          actor_id?: string | null
          clinic_id?: string
          contact_id?: string | null
          id?: string
          occurred_at?: string
          opportunity_id?: string | null
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_fkey"
            columns: ["clinic_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "activities_opportunity_fkey"
            columns: ["clinic_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          access_level:
            | Database["public"]["Enums"]["support_access_level"]
            | null
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          clinic_id: string | null
          entity: string
          entity_id: string | null
          id: string
          occurred_at: string
          reason: string | null
          support_grant_id: string | null
          via: string
        }
        Insert: {
          access_level?:
            | Database["public"]["Enums"]["support_access_level"]
            | null
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          clinic_id?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          support_grant_id?: string | null
          via: string
        }
        Update: {
          access_level?:
            | Database["public"]["Enums"]["support_access_level"]
            | null
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          clinic_id?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          support_grant_id?: string | null
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_support_grant_id_fkey"
            columns: ["support_grant_id"]
            isOneToOne: false
            referencedRelation: "support_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_features: {
        Row: {
          clinic_id: string
          config: Json
          enabled: boolean
          feature_key: string
        }
        Insert: {
          clinic_id: string
          config?: Json
          enabled?: boolean
          feature_key: string
        }
        Update: {
          clinic_id?: string
          config?: Json
          enabled?: boolean
          feature_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_features_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_limits: {
        Row: {
          clinic_id: string
          limit_key: string
          limit_value: number
        }
        Insert: {
          clinic_id: string
          limit_key: string
          limit_value: number
        }
        Update: {
          clinic_id?: string
          limit_key?: string
          limit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "clinic_limits_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_members: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_members_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      clinics: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          name: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          archived_at: string | null
          clinic_id: string
          created_at: string
          created_by: string
          full_name: string
          id: string
          idempotency_key: string | null
          notes: string | null
          owner_user_id: string | null
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          clinic_id: string
          created_at?: string
          created_by: string
          full_name: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          owner_user_id?: string | null
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string
          full_name?: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          owner_user_id?: string | null
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contacts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_member_fkey"
            columns: ["clinic_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "clinic_members"
            referencedColumns: ["clinic_id", "user_id"]
          },
        ]
      }
      invitations: {
        Row: {
          clinic_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      lead_sources: {
        Row: {
          archived_at: string | null
          clinic_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          amount_cents: number | null
          assigned_to_user_id: string | null
          board_position: number
          clinic_id: string
          close_reason: string | null
          closed_at: string | null
          contact_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          initial_source_id: string | null
          pipeline_id: string
          stage_id: string
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          amount_cents?: number | null
          assigned_to_user_id?: string | null
          board_position: number
          clinic_id: string
          close_reason?: string | null
          closed_at?: string | null
          contact_id: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          initial_source_id?: string | null
          pipeline_id: string
          stage_id: string
          status?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          amount_cents?: number | null
          assigned_to_user_id?: string | null
          board_position?: number
          clinic_id?: string
          close_reason?: string | null
          closed_at?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          initial_source_id?: string | null
          pipeline_id?: string
          stage_id?: string
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_assignee_fkey"
            columns: ["clinic_id", "assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "clinic_members"
            referencedColumns: ["clinic_id", "user_id"]
          },
          {
            foreignKeyName: "opportunities_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_fkey"
            columns: ["clinic_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "opportunities_pipeline_fkey"
            columns: ["clinic_id", "pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "opportunities_source_fkey"
            columns: ["clinic_id", "initial_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "opportunities_stage_status_fkey"
            columns: ["pipeline_id", "stage_id", "status"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["pipeline_id", "id", "stage_kind"]
          },
        ]
      }
      opportunity_stage_events: {
        Row: {
          actor_id: string | null
          clinic_id: string
          from_stage_id: string | null
          from_status: string | null
          id: string
          occurred_at: string
          opportunity_id: string
          reason: string | null
          to_stage_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          clinic_id: string
          from_stage_id?: string | null
          from_status?: string | null
          id?: string
          occurred_at?: string
          opportunity_id: string
          reason?: string | null
          to_stage_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          clinic_id?: string
          from_stage_id?: string | null
          from_status?: string | null
          id?: string
          occurred_at?: string
          opportunity_id?: string
          reason?: string | null
          to_stage_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_stage_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_from_stage_fkey"
            columns: ["clinic_id", "from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_opportunity_fkey"
            columns: ["clinic_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_to_stage_fkey"
            columns: ["clinic_id", "to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      patients: {
        Row: {
          became_patient_at: string
          clinic_id: string
          contact_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          became_patient_at?: string
          clinic_id: string
          contact_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          became_patient_at?: string
          clinic_id?: string
          contact_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_contact_fkey"
            columns: ["clinic_id", "contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      permissions: {
        Row: {
          key: string
        }
        Insert: {
          key: string
        }
        Update: {
          key?: string
        }
        Relationships: []
      }
      person_contacts: {
        Row: {
          archived_at: string | null
          clinic_id: string
          contact_id: string
          created_at: string
          id: string
          is_primary: boolean
          is_whatsapp: boolean
          kind: string
          label: string | null
          normalized_value: string
          raw_value: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          clinic_id: string
          contact_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          is_whatsapp?: boolean
          kind: string
          label?: string | null
          normalized_value: string
          raw_value: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          clinic_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          is_whatsapp?: boolean
          kind?: string
          label?: string | null
          normalized_value?: string
          raw_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_contacts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_contacts_contact_fkey"
            columns: ["clinic_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          name: string
          pipeline_id: string
          position: number
          stage_kind: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          name: string
          pipeline_id: string
          position: number
          stage_kind: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          name?: string
          pipeline_id?: string
          position?: number
          stage_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_fkey"
            columns: ["clinic_id", "pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      pipelines: {
        Row: {
          archived_at: string | null
          clinic_id: string
          created_at: string
          creation_idempotency_key: string | null
          duplicated_from_pipeline_id: string | null
          duplication_idempotency_key: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          clinic_id: string
          created_at?: string
          creation_idempotency_key?: string | null
          duplicated_from_pipeline_id?: string | null
          duplication_idempotency_key?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          clinic_id?: string
          created_at?: string
          creation_idempotency_key?: string | null
          duplicated_from_pipeline_id?: string | null
          duplication_idempotency_key?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_duplicated_from_fkey"
            columns: ["clinic_id", "duplicated_from_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      procedures: {
        Row: {
          archived_at: string | null
          base_price_cents: number
          category: string | null
          clinic_id: string
          color: string
          created_at: string
          created_by: string
          creation_idempotency_key: string
          default_duration_minutes: number
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          base_price_cents: number
          category?: string | null
          clinic_id: string
          color?: string
          created_at?: string
          created_by: string
          creation_idempotency_key: string
          default_duration_minutes: number
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          base_price_cents?: number
          category?: string | null
          clinic_id?: string
          color?: string
          created_at?: string
          created_by?: string
          creation_idempotency_key?: string
          default_duration_minutes?: number
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "procedures_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_procedures: {
        Row: {
          archived_at: string | null
          clinic_id: string
          created_at: string
          duration_minutes_override: number | null
          id: string
          price_cents_override: number | null
          procedure_id: string
          professional_id: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          clinic_id: string
          created_at?: string
          duration_minutes_override?: number | null
          id?: string
          price_cents_override?: number | null
          procedure_id: string
          professional_id: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          clinic_id?: string
          created_at?: string
          duration_minutes_override?: number | null
          id?: string
          price_cents_override?: number | null
          procedure_id?: string
          professional_id?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "professional_procedures_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_procedures_procedure_fk"
            columns: ["clinic_id", "procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "professional_procedures_professional_fk"
            columns: ["clinic_id", "professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      professional_specialties: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          name: string
          professional_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          name: string
          professional_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          name?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_specialties_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_specialties_professional_fk"
            columns: ["clinic_id", "professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      professional_weekly_availability: {
        Row: {
          clinic_id: string
          created_at: string
          end_minute: number
          id: string
          professional_id: string
          start_minute: number
          updated_at: string
          weekday: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          end_minute: number
          id?: string
          professional_id: string
          start_minute: number
          updated_at?: string
          weekday: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          end_minute?: number
          id?: string
          professional_id?: string
          start_minute?: number
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "professional_weekly_availability_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_weekly_availability_professional_fk"
            columns: ["clinic_id", "professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      professionals: {
        Row: {
          archived_at: string | null
          clinic_id: string
          color: string
          created_at: string
          created_by: string
          creation_idempotency_key: string
          display_name: string
          email: string | null
          id: string
          notes: string | null
          phone: string | null
          professional_registration_number: string | null
          professional_registration_type: string | null
          status: string
          updated_at: string
          updated_by: string
          user_id: string | null
          version: number
        }
        Insert: {
          archived_at?: string | null
          clinic_id: string
          color?: string
          created_at?: string
          created_by: string
          creation_idempotency_key: string
          display_name: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          professional_registration_number?: string | null
          professional_registration_type?: string | null
          status?: string
          updated_at?: string
          updated_by: string
          user_id?: string | null
          version?: number
        }
        Update: {
          archived_at?: string | null
          clinic_id?: string
          color?: string
          created_at?: string
          created_by?: string
          creation_idempotency_key?: string
          display_name?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          professional_registration_number?: string | null
          professional_registration_type?: string | null
          status?: string
          updated_at?: string
          updated_by?: string
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "professionals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_clinic_user_fk"
            columns: ["clinic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "clinic_members"
            referencedColumns: ["clinic_id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission: string
          role: string
        }
        Insert: {
          permission: string
          role: string
        }
        Update: {
          permission?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      roles: {
        Row: {
          key: string
        }
        Insert: {
          key: string
        }
        Update: {
          key?: string
        }
        Relationships: []
      }
      support_grants: {
        Row: {
          access_level: Database["public"]["Enums"]["support_access_level"]
          admin_user_id: string
          clinic_id: string
          created_at: string
          expires_at: string
          id: string
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          write_justification: string | null
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["support_access_level"]
          admin_user_id: string
          clinic_id: string
          created_at?: string
          expires_at: string
          id?: string
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          write_justification?: string | null
        }
        Update: {
          access_level?: Database["public"]["Enums"]["support_access_level"]
          admin_user_id?: string
          clinic_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          write_justification?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_grants_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { token_hash: string }; Returns: string }
      add_contact_method: {
        Args: {
          clinic_id: string
          contact_id: string
          is_primary?: boolean
          is_whatsapp?: boolean
          kind: string
          label?: string | null
          normalized_value: string
          raw_value: string
        }
        Returns: string
      }
      archive_contact: {
        Args: { clinic_id: string; contact_id: string }
        Returns: boolean
      }
      archive_contact_method: {
        Args: { clinic_id: string; contact_method_id: string }
        Returns: boolean
      }
      archive_lead_source: {
        Args: { clinic_id: string; lead_source_id: string }
        Returns: boolean
      }
      archive_pipeline: {
        Args: { clinic_id: string; pipeline_id: string }
        Returns: boolean
      }
      archive_procedure: {
        Args: { clinic_id: string; procedure_id: string }
        Returns: boolean
      }
      archive_professional: {
        Args: { clinic_id: string; professional_id: string }
        Returns: boolean
      }
      archive_professional_procedure: {
        Args: { clinic_id: string; professional_procedure_id: string }
        Returns: boolean
      }
      assign_contact_owner: {
        Args: { clinic_id: string; contact_id: string; owner_user_id: string }
        Returns: boolean
      }
      assign_opportunity: {
        Args: {
          assigned_to_user_id: string
          clinic_id: string
          expected_version: number
          opportunity_id: string
        }
        Returns: number
      }
      close_opportunity: {
        Args: {
          clinic_id: string
          close_reason: string | null
          expected_version: number
          opportunity_id: string
          target_status: string
        }
        Returns: number
      }
      create_clinic_with_owner: {
        Args: {
          clinic_name: string
          clinic_slug: string
          clinic_timezone: string
        }
        Returns: string
      }
      create_contact: {
        Args: {
          clinic_id: string
          full_name: string
          idempotency_key?: string
          link_as_patient?: boolean
          methods?: Json
          notes?: string | null
        }
        Returns: string
      }
      create_lead_source: {
        Args: { clinic_id: string; name: string }
        Returns: string
      }
      create_opportunity: {
        Args: {
          amount_cents?: number | null
          clinic_id: string
          confirmed_existing_open?: boolean
          contact_id: string
          idempotency_key?: string
          initial_source_id?: string | null
          pipeline_id?: string | null
          title: string
        }
        Returns: {
          has_existing_open: boolean
          opportunity_id: string
        }[]
      }
      create_pipeline: {
        Args: { clinic_id: string; idempotency_key: string; name: string }
        Returns: string
      }
      create_pipeline_stage: {
        Args: { clinic_id: string; name: string; pipeline_id?: string | null }
        Returns: string
      }
      create_procedure: {
        Args: {
          base_price_cents: number
          category: string | null
          clinic_id: string
          color: string
          default_duration_minutes: number
          description: string | null
          idempotency_key: string
          name: string
        }
        Returns: string
      }
      create_professional: {
        Args: {
          clinic_id: string
          color: string
          display_name: string
          email: string | null
          idempotency_key: string
          notes: string | null
          phone: string | null
          professional_registration_number: string | null
          professional_registration_type: string | null
        }
        Returns: string
      }
      create_support_grant: {
        Args: {
          access_level: Database["public"]["Enums"]["support_access_level"]
          clinic_id: string
          expires_at: string
          reason: string
        }
        Returns: string
      }
      current_user_clinic_ids: { Args: never; Returns: string[] }
      current_user_has_permission: {
        Args: { clinic_id: string; permission_key: string }
        Returns: boolean
      }
      current_user_is_platform_admin: { Args: never; Returns: boolean }
      current_user_requires_mfa: { Args: never; Returns: boolean }
      duplicate_pipeline: {
        Args: {
          clinic_id: string
          idempotency_key: string
          name: string
          source_pipeline_id: string
        }
        Returns: string
      }
      invite_member: {
        Args: {
          clinic_id: string
          expires_at: string
          member_email: string
          member_role: string
          token_hash: string
        }
        Returns: string
      }
      is_valid_iana_timezone: { Args: { value: string }; Returns: boolean }
      link_contact_as_patient: {
        Args: { clinic_id: string; contact_id: string }
        Returns: boolean
      }
      link_professional_user: {
        Args: {
          clinic_id: string
          linked_user_id: string
          professional_id: string
        }
        Returns: boolean
      }
      move_opportunity: {
        Args: {
          after_opportunity_id?: string | null
          before_opportunity_id?: string | null
          clinic_id: string
          expected_version: number
          opportunity_id: string
          target_stage_id: string
        }
        Returns: number
      }
      platform_list_clinics: {
        Args: never
        Returns: {
          clinic_id: string
          created_at: string
          name: string
          slug: string
          status: string
          timezone: string
        }[]
      }
      platform_read_clinic_audit: {
        Args: { clinic_id: string; grant_id: string }
        Returns: {
          action: string
          actor_id: string
          audit_id: string
          entity: string
          entity_id: string
          occurred_at: string
          via: string
        }[]
      }
      platform_read_clinic_configuration: {
        Args: { clinic_id: string; grant_id: string }
        Returns: {
          config: Json
          enabled: boolean
          key: string
          kind: string
          limit_value: number
        }[]
      }
      platform_read_clinic_invitations: {
        Args: { clinic_id: string; grant_id: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          invitation_id: string
          role: string
          status: string
        }[]
      }
      platform_read_clinic_members: {
        Args: { clinic_id: string; grant_id: string }
        Returns: {
          created_at: string
          member_id: string
          role: string
          status: string
          user_id: string
        }[]
      }
      remove_member: {
        Args: { clinic_id: string; member_id: string }
        Returns: boolean
      }
      rename_pipeline: {
        Args: { clinic_id: string; name: string; pipeline_id: string }
        Returns: boolean
      }
      reopen_opportunity: {
        Args: {
          clinic_id: string
          expected_version: number
          opportunity_id: string
          reason: string
          target_stage_id: string
        }
        Returns: number
      }
      reorder_pipeline_stages: {
        Args: { clinic_id: string; stage_ids: string[] }
        Returns: boolean
      }
      revoke_invitation: {
        Args: { clinic_id: string; invitation_id: string }
        Returns: boolean
      }
      revoke_support_grant: { Args: { grant_id: string }; Returns: boolean }
      search_contacts: {
        Args: {
          p_clinic_id: string
          p_include_archived: boolean
          p_limit: number
          p_normalized_value: string | null
          p_owner_user_id: string | null
          p_search_term: string
        }
        Returns: {
          archived_at: string
          created_at: string
          full_name: string
          id: string
          notes: string
          owner_user_id: string
          version: number
        }[]
      }
      search_opportunity_board: {
        Args: {
          p_assigned_to_user_id: string | null
          p_clinic_id: string
          p_initial_source_id: string | null
          p_page: number
          p_page_size: number
          p_pipeline_id: string | null
          p_search_term: string
          p_status: string | null
        }
        Returns: {
          amount_cents: number
          assigned_to_user_id: string
          board_position: number
          clinic_id: string
          close_reason: string
          closed_at: string
          contact_id: string
          contact_name: string
          created_at: string
          id: string
          idempotency_key: string
          initial_source_id: string
          pipeline_archived_at: string
          pipeline_id: string
          pipeline_name: string
          stage_id: string
          stage_position: number
          status: string
          title: string
          updated_at: string
          version: number
        }[]
      }
      search_procedures: {
        Args: {
          p_clinic_id: string
          p_page: number
          p_page_size: number
          p_search_term: string
          p_status: string | null
        }
        Returns: {
          base_price_cents: number
          category: string
          color: string
          default_duration_minutes: number
          id: string
          name: string
          status: string
          total_count: number
        }[]
      }
      search_professional_procedures: {
        Args: {
          p_clinic_id: string
          p_page: number
          p_page_size: number
          p_procedure_id: string | null
          p_professional_id: string | null
        }
        Returns: {
          base_price_cents: number
          default_duration_minutes: number
          effective_duration_minutes: number
          effective_price_cents: number
          has_duration_override: boolean
          has_price_override: boolean
          id: string
          procedure_id: string
          procedure_name: string
          professional_id: string
          professional_name: string
          total_count: number
          version: number
        }[]
      }
      search_professionals: {
        Args: {
          p_clinic_id: string
          p_page: number
          p_page_size: number
          p_search_term: string
          p_specialty: string | null
          p_status: string | null
        }
        Returns: {
          color: string
          display_name: string
          id: string
          specialties: string[]
          status: string
          total_count: number
        }[]
      }
      set_default_pipeline: {
        Args: { clinic_id: string; pipeline_id: string }
        Returns: boolean
      }
      set_primary_contact_method: {
        Args: { clinic_id: string; contact_method_id: string }
        Returns: boolean
      }
      set_professional_procedure: {
        Args: {
          clinic_id: string
          duration_minutes_override: number | null
          price_cents_override: number | null
          procedure_id: string
          professional_id: string
        }
        Returns: string
      }
      set_professional_specialties: {
        Args: { clinic_id: string; professional_id: string; specialties: Json }
        Returns: boolean
      }
      set_professional_weekly_availability: {
        Args: { availability: Json; clinic_id: string; professional_id: string }
        Returns: boolean
      }
      suspend_member: {
        Args: { clinic_id: string; member_id: string }
        Returns: boolean
      }
      unlink_contact_as_patient: {
        Args: { clinic_id: string; contact_id: string }
        Returns: boolean
      }
      unlink_professional_user: {
        Args: { clinic_id: string; professional_id: string }
        Returns: boolean
      }
      update_clinic_settings: {
        Args: {
          clinic_id: string
          clinic_name: string
          clinic_timezone: string
        }
        Returns: boolean
      }
      update_contact: {
        Args: {
          clinic_id: string
          contact_id: string
          expected_version: number
          full_name: string
          notes: string | null
        }
        Returns: number
      }
      update_contact_method: {
        Args: {
          clinic_id: string
          contact_method_id: string
          is_whatsapp?: boolean
          kind: string
          label?: string | null
          normalized_value: string
          raw_value: string
        }
        Returns: boolean
      }
      update_lead_source: {
        Args: { clinic_id: string; lead_source_id: string; name: string }
        Returns: boolean
      }
      update_member_role: {
        Args: { clinic_id: string; member_id: string; target_role: string }
        Returns: boolean
      }
      update_opportunity: {
        Args: {
          amount_cents: number | null
          clinic_id: string
          expected_version: number
          initial_source_id: string | null
          opportunity_id: string
          title: string
        }
        Returns: number
      }
      update_pipeline_stage: {
        Args: { clinic_id: string; name: string; pipeline_stage_id: string }
        Returns: boolean
      }
      update_procedure: {
        Args: {
          base_price_cents: number
          category: string | null
          clinic_id: string
          color: string
          default_duration_minutes: number
          description: string | null
          expected_version: number
          name: string
          procedure_id: string
          status: string
        }
        Returns: number
      }
      update_professional: {
        Args: {
          clinic_id: string
          color: string
          display_name: string
          email: string | null
          expected_version: number
          notes: string | null
          phone: string | null
          professional_id: string
          professional_registration_number: string | null
          professional_registration_type: string | null
          status: string
        }
        Returns: number
      }
    }
    Enums: {
      support_access_level:
        | "read_only"
        | "support_operations"
        | "restricted_write"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      support_access_level: [
        "read_only",
        "support_operations",
        "restricted_write",
      ],
    },
  },
} as const
