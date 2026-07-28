export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          actor_id: string | null;
          clinic_id: string;
          contact_id: string | null;
          id: string;
          occurred_at: string;
          opportunity_id: string | null;
          payload: Json;
          type: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      clinic_members: {
        Row: {
          clinic_id: string;
          created_at: string;
          id: string;
          role: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      clinics: {
        Row: {
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          id: string;
          name: string;
          slug: string;
          status: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_by: string;
          name: string;
          slug: string;
          timezone: string;
        };
        Update: {
          name?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          archived_at: string | null;
          clinic_id: string;
          created_at: string;
          created_by: string;
          full_name: string;
          id: string;
          idempotency_key: string | null;
          notes: string | null;
          owner_user_id: string | null;
          updated_at: string;
          updated_by: string;
          version: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      lead_sources: {
        Row: {
          archived_at: string | null;
          clinic_id: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      patients: {
        Row: {
          became_patient_at: string;
          clinic_id: string;
          contact_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pipelines: {
        Row: {
          archived_at: string | null;
          clinic_id: string;
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pipeline_stages: {
        Row: {
          clinic_id: string;
          created_at: string;
          id: string;
          name: string;
          pipeline_id: string;
          position: number;
          stage_kind: "open" | "won" | "lost";
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      opportunities: {
        Row: {
          amount_cents: number | null;
          assigned_to_user_id: string | null;
          board_position: number;
          clinic_id: string;
          close_reason: string | null;
          closed_at: string | null;
          contact_id: string;
          created_at: string;
          id: string;
          idempotency_key: string | null;
          initial_source_id: string | null;
          pipeline_id: string;
          stage_id: string;
          status: "open" | "won" | "lost";
          title: string;
          updated_at: string;
          version: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      opportunity_stage_events: {
        Row: {
          actor_id: string | null;
          clinic_id: string;
          from_stage_id: string | null;
          from_status: "open" | "won" | "lost" | null;
          id: string;
          occurred_at: string;
          opportunity_id: string;
          reason: string | null;
          to_stage_id: string;
          to_status: "open" | "won" | "lost";
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      person_contacts: {
        Row: {
          archived_at: string | null;
          clinic_id: string;
          contact_id: string;
          created_at: string;
          id: string;
          is_primary: boolean;
          is_whatsapp: boolean;
          kind: string;
          label: string | null;
          normalized_value: string;
          raw_value: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      add_contact_method: {
        Args: {
          clinic_id: string;
          contact_id: string;
          is_primary?: boolean;
          is_whatsapp?: boolean;
          kind: string;
          label?: string | null;
          normalized_value: string;
          raw_value: string;
        };
        Returns: string;
      };
      archive_contact: { Args: { clinic_id: string; contact_id: string }; Returns: boolean };
      archive_contact_method: { Args: { clinic_id: string; contact_method_id: string }; Returns: boolean };
      archive_lead_source: { Args: { clinic_id: string; lead_source_id: string }; Returns: boolean };
      assign_contact_owner: { Args: { clinic_id: string; contact_id: string; owner_user_id: string }; Returns: boolean };
      assign_opportunity: {
        Args: {
          assigned_to_user_id: string;
          clinic_id: string;
          expected_version: number;
          opportunity_id: string;
        };
        Returns: number;
      };
      accept_invitation: {
        Args: { token_hash: string };
        Returns: string;
      };
      create_clinic_with_owner: {
        Args: {
          clinic_name: string;
          clinic_slug: string;
          clinic_timezone: string;
        };
        Returns: string;
      };
      create_contact: {
        Args: {
          clinic_id: string;
          full_name: string;
          idempotency_key?: string | null;
          link_as_patient?: boolean;
          methods?: Json;
          notes?: string | null;
        };
        Returns: string;
      };
      create_lead_source: { Args: { clinic_id: string; name: string }; Returns: string };
      create_opportunity: {
        Args: {
          amount_cents?: number | null;
          clinic_id: string;
          confirmed_existing_open?: boolean;
          contact_id: string;
          idempotency_key?: string | null;
          initial_source_id?: string | null;
          title: string;
        };
        Returns: { has_existing_open: boolean; opportunity_id: string | null }[];
      };
      create_pipeline_stage: { Args: { clinic_id: string; name: string }; Returns: string };
      current_user_clinic_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      current_user_has_permission: {
        Args: {
          clinic_id: string;
          permission_key: string;
        };
        Returns: boolean;
      };
      current_user_is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      current_user_requires_mfa: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      invite_member: {
        Args: {
          clinic_id: string;
          expires_at: string;
          member_email: string;
          member_role: string;
          token_hash: string;
        };
        Returns: string;
      };
      link_contact_as_patient: { Args: { clinic_id: string; contact_id: string }; Returns: boolean };
      close_opportunity: {
        Args: {
          clinic_id: string;
          close_reason: string | null;
          expected_version: number;
          opportunity_id: string;
          target_status: string;
        };
        Returns: number;
      };
      move_opportunity: {
        Args: {
          after_opportunity_id?: string | null;
          before_opportunity_id?: string | null;
          clinic_id: string;
          expected_version: number;
          opportunity_id: string;
          target_stage_id: string;
        };
        Returns: number;
      };
      create_support_grant: {
        Args: {
          access_level: Database["public"]["Enums"]["support_access_level"];
          clinic_id: string;
          expires_at: string;
          reason: string;
        };
        Returns: string;
      };
      platform_list_clinics: {
        Args: Record<PropertyKey, never>;
        Returns: {
          clinic_id: string;
          created_at: string;
          name: string;
          slug: string;
          status: string;
          timezone: string;
        }[];
      };
      platform_read_clinic_audit: {
        Args: { clinic_id: string; grant_id: string };
        Returns: {
          action: string;
          actor_id: string | null;
          audit_id: string;
          entity: string;
          entity_id: string | null;
          occurred_at: string;
          via: string;
        }[];
      };
      platform_read_clinic_configuration: {
        Args: { clinic_id: string; grant_id: string };
        Returns: {
          config: Json | null;
          enabled: boolean | null;
          key: string;
          kind: string;
          limit_value: number | null;
        }[];
      };
      platform_read_clinic_invitations: {
        Args: { clinic_id: string; grant_id: string };
        Returns: {
          created_at: string;
          email: string;
          expires_at: string;
          invitation_id: string;
          role: string;
          status: string;
        }[];
      };
      platform_read_clinic_members: {
        Args: { clinic_id: string; grant_id: string };
        Returns: {
          created_at: string;
          member_id: string;
          role: string;
          status: string;
          user_id: string;
        }[];
      };
      remove_member: {
        Args: { clinic_id: string; member_id: string };
        Returns: boolean;
      };
      search_contacts: {
        Args: {
          p_clinic_id: string;
          p_include_archived: boolean;
          p_limit: number;
          p_normalized_value: string | null;
          p_owner_user_id: string | null;
          p_search_term: string;
        };
        Returns: {
          archived_at: string | null;
          created_at: string;
          full_name: string;
          id: string;
          notes: string | null;
          owner_user_id: string | null;
          version: number;
        }[];
      };
      search_opportunity_board: {
        Args: {
          p_assigned_to_user_id: string | null;
          p_clinic_id: string;
          p_initial_source_id: string | null;
          p_page: number;
          p_page_size: number;
          p_pipeline_id: string;
          p_search_term: string;
          p_status: string | null;
        };
        Returns: {
          amount_cents: number | null;
          assigned_to_user_id: string | null;
          board_position: number;
          clinic_id: string;
          close_reason: string | null;
          closed_at: string | null;
          contact_id: string;
          contact_name: string;
          created_at: string;
          id: string;
          idempotency_key: string | null;
          initial_source_id: string | null;
          pipeline_id: string;
          stage_id: string;
          stage_position: number;
          status: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      revoke_support_grant: {
        Args: { grant_id: string };
        Returns: boolean;
      };
      revoke_invitation: {
        Args: { clinic_id: string; invitation_id: string };
        Returns: boolean;
      };
      reopen_opportunity: {
        Args: {
          clinic_id: string;
          expected_version: number;
          opportunity_id: string;
          reason: string;
          target_stage_id: string;
        };
        Returns: number;
      };
      reorder_pipeline_stages: {
        Args: { clinic_id: string; stage_ids: string[] };
        Returns: boolean;
      };
      suspend_member: {
        Args: { clinic_id: string; member_id: string };
        Returns: boolean;
      };
      set_primary_contact_method: { Args: { clinic_id: string; contact_method_id: string }; Returns: boolean };
      unlink_contact_as_patient: { Args: { clinic_id: string; contact_id: string }; Returns: boolean };
      update_contact: {
        Args: {
          clinic_id: string;
          contact_id: string;
          expected_version: number;
          full_name: string;
          notes: string | null;
        };
        Returns: number;
      };
      update_contact_method: {
        Args: {
          clinic_id: string;
          contact_method_id: string;
          is_whatsapp?: boolean;
          kind: string;
          label?: string | null;
          normalized_value: string;
          raw_value: string;
        };
        Returns: boolean;
      };
      update_lead_source: { Args: { clinic_id: string; lead_source_id: string; name: string }; Returns: boolean };
      update_opportunity: {
        Args: {
          amount_cents: number | null;
          clinic_id: string;
          expected_version: number;
          initial_source_id: string | null;
          opportunity_id: string;
          title: string;
        };
        Returns: number;
      };
      update_pipeline_stage: {
        Args: { clinic_id: string; name: string; pipeline_stage_id: string };
        Returns: boolean;
      };
      update_member_role: {
        Args: { clinic_id: string; member_id: string; target_role: string };
        Returns: boolean;
      };
      update_clinic_settings: {
        Args: {
          clinic_id: string;
          clinic_name: string;
          clinic_timezone: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      support_access_level:
        | "read_only"
        | "support_operations"
        | "restricted_write";
    };
    CompositeTypes: Record<string, never>;
  };
};
