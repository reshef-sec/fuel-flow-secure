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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          balance: number
          key: string
          updated_at: string
        }
        Insert: {
          balance?: number
          key: string
          updated_at?: string
        }
        Update: {
          balance?: number
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          branch: string
          can_request: boolean
          created_at: string
          first_name: string
          last_name: string
          national_id: string
          phone: string
          requires_password_change: boolean
          role: Database["public"]["Enums"]["app_role"]
          title: string
          updated_at: string
        }
        Insert: {
          branch?: string
          can_request?: boolean
          created_at?: string
          first_name?: string
          last_name?: string
          national_id: string
          phone?: string
          requires_password_change?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          title?: string
          updated_at?: string
        }
        Update: {
          branch?: string
          can_request?: boolean
          created_at?: string
          first_name?: string
          last_name?: string
          national_id?: string
          phone?: string
          requires_password_change?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      b2b_clients: {
        Row: {
          account_key: string | null
          account_name: string
          account_status: string | null
          account_type: string | null
          balance: string | null
          branch: string
          budget_section: string | null
          client_code: string
          client_name: string
          created_at: string
          id: string
          item_family: string | null
          load_type: string | null
          standard: string
          updated_at: string
        }
        Insert: {
          account_key?: string | null
          account_name: string
          account_status?: string | null
          account_type?: string | null
          balance?: string | null
          branch?: string
          budget_section?: string | null
          client_code: string
          client_name?: string
          created_at?: string
          id?: string
          item_family?: string | null
          load_type?: string | null
          standard?: string
          updated_at?: string
        }
        Update: {
          account_key?: string | null
          account_name?: string
          account_status?: string | null
          account_type?: string | null
          balance?: string | null
          branch?: string
          budget_section?: string | null
          client_code?: string
          client_name?: string
          created_at?: string
          id?: string
          item_family?: string | null
          load_type?: string | null
          standard?: string
          updated_at?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          city: string
          created_at: string
          id: string
          manager: string
          name: string
          updated_at: string
        }
        Insert: {
          city?: string
          created_at?: string
          id: string
          manager?: string
          name: string
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          manager?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      issue_reasons: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          branch: string
          created_at: string
          full_name: string
          id: string
          national_id: string
          phone: string
          requires_password_change: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          branch?: string
          created_at?: string
          full_name?: string
          id: string
          national_id: string
          phone: string
          requires_password_change?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          branch?: string
          created_at?: string
          full_name?: string
          id?: string
          national_id?: string
          phone?: string
          requires_password_change?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      regular_clients: {
        Row: {
          client_id: string
          client_name: string
          created_at: string
          id: string
          site_id: string
          site_name: string
          standard: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          client_name?: string
          created_at?: string
          id?: string
          site_id: string
          site_name?: string
          standard?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_name?: string
          created_at?: string
          id?: string
          site_id?: string
          site_name?: string
          standard?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voucher_requests: {
        Row: {
          amount: number
          approved_amount: number | null
          approver: string | null
          branch: string
          created_at: string
          created_on: string
          id: string
          reason: string
          requester: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_amount?: number | null
          approver?: string | null
          branch: string
          created_at?: string
          created_on: string
          id: string
          reason?: string
          requester: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_amount?: number | null
          approver?: string | null
          branch?: string
          created_at?: string
          created_on?: string
          id?: string
          reason?: string
          requester?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          account_name: string | null
          amount: number
          approver: string | null
          branch: string
          client: string | null
          client_code: string | null
          client_id: string | null
          created_at: string
          delivered_at: string | null
          driver_name: string | null
          license_plate: string | null
          link_id: string | null
          real_code: string
          reason: string | null
          requester: string | null
          route: string | null
          serial: string
          site_id: string | null
          site_name: string | null
          standard: string | null
          standard_name: string | null
          status: string
          supervisor: string | null
          updated_at: string
          updated_on: string
          worker_id: string | null
          worker_name: string | null
        }
        Insert: {
          account_name?: string | null
          amount?: number
          approver?: string | null
          branch?: string
          client?: string | null
          client_code?: string | null
          client_id?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_name?: string | null
          license_plate?: string | null
          link_id?: string | null
          real_code?: string
          reason?: string | null
          requester?: string | null
          route?: string | null
          serial: string
          site_id?: string | null
          site_name?: string | null
          standard?: string | null
          standard_name?: string | null
          status?: string
          supervisor?: string | null
          updated_at?: string
          updated_on?: string
          worker_id?: string | null
          worker_name?: string | null
        }
        Update: {
          account_name?: string | null
          amount?: number
          approver?: string | null
          branch?: string
          client?: string | null
          client_code?: string | null
          client_id?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_name?: string | null
          license_plate?: string | null
          link_id?: string | null
          real_code?: string
          reason?: string | null
          requester?: string | null
          route?: string | null
          serial?: string
          site_id?: string | null
          site_name?: string | null
          standard?: string | null
          standard_name?: string | null
          status?: string
          supervisor?: string | null
          updated_at?: string
          updated_on?: string
          worker_id?: string | null
          worker_name?: string | null
        }
        Relationships: []
      }
      worker_links: {
        Row: {
          created_at: string
          created_on: string
          id: string
          phone: string | null
          serials: string[]
          signed_at: string | null
          total: number
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          created_on: string
          id: string
          phone?: string | null
          serials?: string[]
          signed_at?: string | null
          total: number
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          created_on?: string
          id?: string
          phone?: string | null
          serials?: string[]
          signed_at?: string | null
          total?: number
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "branch" | "supervisor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "branch", "supervisor"],
    },
  },
} as const
