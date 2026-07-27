export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
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
      remove_member: {
        Args: { clinic_id: string; member_id: string };
        Returns: boolean;
      };
      revoke_invitation: {
        Args: { clinic_id: string; invitation_id: string };
        Returns: boolean;
      };
      suspend_member: {
        Args: { clinic_id: string; member_id: string };
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
