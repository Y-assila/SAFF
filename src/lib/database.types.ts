
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "notifications": {
                  Row: {
                    "attempts": number,"created_at": string,"dedupe_key": string,"delivered_at": string | null,"error_code": string | null,"error_message": string | null,"failed_at": string | null,"id": string,"locked_at": string | null,"next_attempt_at": string,"notification_type": Database["public"]['Enums']["notification_type"],"provider_message_id": string | null,"read_at": string | null,"recipient_phone": string | null,"sent_at": string | null,"shop_id": string,"status": Database["public"]['Enums']["notification_status"],"template_language": string | null,"template_name": string | null,"ticket_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"dedupe_key"?: string,"delivered_at"?: string | null,"error_code"?: string | null,"error_message"?: string | null,"failed_at"?: string | null,"id"?: string,"locked_at"?: string | null,"next_attempt_at"?: string,"notification_type": Database["public"]['Enums']["notification_type"],"provider_message_id"?: string | null,"read_at"?: string | null,"recipient_phone"?: string | null,"sent_at"?: string | null,"shop_id": string,"status"?: Database["public"]['Enums']["notification_status"],"template_language"?: string | null,"template_name"?: string | null,"ticket_id": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"dedupe_key"?: string,"delivered_at"?: string | null,"error_code"?: string | null,"error_message"?: string | null,"failed_at"?: string | null,"id"?: string,"locked_at"?: string | null,"next_attempt_at"?: string,"notification_type"?: Database["public"]['Enums']["notification_type"],"provider_message_id"?: string | null,"read_at"?: string | null,"recipient_phone"?: string | null,"sent_at"?: string | null,"shop_id"?: string,"status"?: Database["public"]['Enums']["notification_status"],"template_language"?: string | null,"template_name"?: string | null,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_ticket_id_shop_id_fkey"
      columns: ["ticket_id","shop_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id","shop_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string | null,"id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name"?: string | null,"id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string | null,"id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"queue_events": {
                  Row: {
                    "actor_type": string,"actor_user_id": string | null,"created_at": string,"event_type": string,"id": number,"metadata": NonNullable<Json>,"new_status": string | null,"old_status": string | null,"queue_session_id": string | null,"reason": string | null,"shop_id": string,"ticket_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_type": string,"actor_user_id"?: string | null,"created_at"?: string,"event_type": string,"id"?: never,"metadata"?: NonNullable<Json>,"new_status"?: string | null,"old_status"?: string | null,"queue_session_id"?: string | null,"reason"?: string | null,"shop_id": string,"ticket_id"?: string | null
                  }
                  Update: {
                    "actor_type"?: string,"actor_user_id"?: string | null,"created_at"?: string,"event_type"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"new_status"?: string | null,"old_status"?: string | null,"queue_session_id"?: string | null,"reason"?: string | null,"shop_id"?: string,"ticket_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "queue_events_queue_session_id_fkey"
      columns: ["queue_session_id"]
isOneToOne: false
      referencedRelation: "queue_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "queue_events_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "queue_events_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"queue_sessions": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"created_at": string,"id": string,"last_ticket_number": number,"queue_date": string,"shop_id": string,"started_at": string,"started_by": string | null,"status": Database["public"]['Enums']["queue_status"],"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"id"?: string,"last_ticket_number"?: number,"queue_date": string,"shop_id": string,"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["queue_status"],"version"?: number
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"id"?: string,"last_ticket_number"?: number,"queue_date"?: string,"shop_id"?: string,"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["queue_status"],"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "queue_sessions_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hits"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"shop_members": {
                  Row: {
                    "created_at": string,"id": string,"role": Database["public"]['Enums']["shop_role"],"shop_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["shop_role"],"shop_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["shop_role"],"shop_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_members_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id"]
    }
                  ]
                },"shop_settings": {
                  Row: {
                    "default_service_minutes": number,"grace_period_minutes": number,"max_active_tickets": number,"pii_retention_days": number,"require_phone_verification": boolean,"shop_id": string,"updated_at": string,"whatsapp_enabled": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "default_service_minutes"?: number,"grace_period_minutes"?: number,"max_active_tickets"?: number,"pii_retention_days"?: number,"require_phone_verification"?: boolean,"shop_id": string,"updated_at"?: string,"whatsapp_enabled"?: boolean
                  }
                  Update: {
                    "default_service_minutes"?: number,"grace_period_minutes"?: number,"max_active_tickets"?: number,"pii_retention_days"?: number,"require_phone_verification"?: boolean,"shop_id"?: string,"updated_at"?: string,"whatsapp_enabled"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_settings_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: true
      referencedRelation: "shops"
      referencedColumns: ["id"]
    }
                  ]
                },"shops": {
                  Row: {
                    "address": string | null,"created_at": string,"default_locale": string,"id": string,"is_active": boolean,"logo_url": string | null,"name": string,"phone": string | null,"slug": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"default_locale"?: string,"id"?: string,"is_active"?: boolean,"logo_url"?: string | null,"name": string,"phone"?: string | null,"slug": string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"default_locale"?: string,"id"?: string,"is_active"?: boolean,"logo_url"?: string | null,"name"?: string,"phone"?: string | null,"slug"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ticket_transitions": {
                  Row: {
                    "actors": (string)[],"from_status": Database["public"]['Enums']["ticket_status"],"to_status": Database["public"]['Enums']["ticket_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actors": (string)[],"from_status": Database["public"]['Enums']["ticket_status"],"to_status": Database["public"]['Enums']["ticket_status"]
                  }
                  Update: {
                    "actors"?: (string)[],"from_status"?: Database["public"]['Enums']["ticket_status"],"to_status"?: Database["public"]['Enums']["ticket_status"]
                  }
                  Relationships: [
                    
                  ]
                },"tickets": {
                  Row: {
                    "anonymized_at": string | null,"arrived_at": string | null,"called_at": string | null,"cancelled_at": string | null,"client_request_id": string | null,"completed_at": string | null,"consent_at": string,"consent_text_version": string,"created_at": string,"customer_name": string | null,"customer_phone": string | null,"expired_at": string | null,"id": string,"joined_at": string,"locale": string,"on_the_way_at": string | null,"queue_session_id": string,"service_started_at": string | null,"shop_id": string,"skipped_at": string | null,"status": Database["public"]['Enums']["ticket_status"],"status_reason": string | null,"ticket_number": number,"token_version": number,"updated_at": string,"whatsapp_consent": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymized_at"?: string | null,"arrived_at"?: string | null,"called_at"?: string | null,"cancelled_at"?: string | null,"client_request_id"?: string | null,"completed_at"?: string | null,"consent_at": string,"consent_text_version": string,"created_at"?: string,"customer_name"?: string | null,"customer_phone"?: string | null,"expired_at"?: string | null,"id"?: string,"joined_at"?: string,"locale"?: string,"on_the_way_at"?: string | null,"queue_session_id": string,"service_started_at"?: string | null,"shop_id": string,"skipped_at"?: string | null,"status"?: Database["public"]['Enums']["ticket_status"],"status_reason"?: string | null,"ticket_number": number,"token_version"?: number,"updated_at"?: string,"whatsapp_consent": boolean
                  }
                  Update: {
                    "anonymized_at"?: string | null,"arrived_at"?: string | null,"called_at"?: string | null,"cancelled_at"?: string | null,"client_request_id"?: string | null,"completed_at"?: string | null,"consent_at"?: string,"consent_text_version"?: string,"created_at"?: string,"customer_name"?: string | null,"customer_phone"?: string | null,"expired_at"?: string | null,"id"?: string,"joined_at"?: string,"locale"?: string,"on_the_way_at"?: string | null,"queue_session_id"?: string,"service_started_at"?: string | null,"shop_id"?: string,"skipped_at"?: string | null,"status"?: Database["public"]['Enums']["ticket_status"],"status_reason"?: string | null,"ticket_number"?: number,"token_version"?: number,"updated_at"?: string,"whatsapp_consent"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "tickets_queue_session_id_shop_id_fkey"
      columns: ["queue_session_id","shop_id"]
isOneToOne: false
      referencedRelation: "queue_sessions"
      referencedColumns: ["id","shop_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "barber_cancel_ticket":
{ Args: { "p_session_id": string,"p_ticket_id": string }; Returns: Json
                           },
"call_next_customer":
{ Args: { "p_session_id": string }; Returns: Json
                           },
"check_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"close_queue":
{ Args: { "p_session_id": string }; Returns: Json
                           },
"complete_service":
{ Args: { "p_session_id": string,"p_ticket_id": string }; Returns: Json
                           },
"customer_cancel_ticket":
{ Args: { "p_ticket_id": string,"p_token_version": number }; Returns: Json
                           },
"customer_confirm_on_the_way":
{ Args: { "p_ticket_id": string,"p_token_version": number }; Returns: Json
                           },
"customer_get_ticket":
{ Args: { "p_ticket_id": string,"p_token_version": number }; Returns: Json
                           },
"get_queue_stats":
{ Args: { "p_session_id": string }; Returns: Json
                           },
"join_queue":
{ Args: { "p_client_request_id": string,"p_consent": boolean,"p_consent_text_version": string,"p_locale": string,"p_name": string,"p_phone_e164": string,"p_shop_slug": string }; Returns: Json
                           },
"mark_arrived":
{ Args: { "p_session_id": string,"p_ticket_id": string }; Returns: Json
                           },
"mark_on_the_way":
{ Args: { "p_session_id": string,"p_ticket_id": string }; Returns: Json
                           },
"pause_queue":
{ Args: { "p_session_id": string }; Returns: Json
                           },
"public_get_shop":
{ Args: { "p_slug": string }; Returns: Json
                           },
"reissue_ticket_link":
{ Args: { "p_session_id": string,"p_ticket_id": string }; Returns: Json
                           },
"reopen_queue":
{ Args: { "p_session_id": string }; Returns: Json
                           },
"resume_queue":
{ Args: { "p_session_id": string }; Returns: Json
                           },
"reveal_phone":
{ Args: { "p_ticket_id": string }; Returns: Json
                           },
"skip_ticket":
{ Args: { "p_reason": Database["public"]['Enums']["skip_reason"],"p_session_id": string,"p_ticket_id": string }; Returns: Json
                           },
"start_queue":
{ Args: { "p_shop_id": string }; Returns: Json
                           },
"start_service":
{ Args: { "p_session_id": string,"p_skip_arrival"?: boolean,"p_ticket_id": string }; Returns: Json
                           }
          }
          Enums: {
            "notification_status": "pending"|"sending"|"sent"|"delivered"|"read"|"failed"|"suppressed","notification_type": "ticket_created"|"turn_approaching"|"queue_update"|"queue_closed"|"link_resent","queue_status": "open"|"paused"|"finished","shop_role": "owner"|"barber","skip_reason": "no_show_after_grace"|"unreachable"|"invalid_phone"|"barber_override","ticket_status": "waiting"|"getting_ready"|"on_the_way"|"arrived"|"in_service"|"completed"|"skipped"|"cancelled"|"expired"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "notification_status": ["pending", "sending", "sent", "delivered", "read", "failed", "suppressed"],"notification_type": ["ticket_created", "turn_approaching", "queue_update", "queue_closed", "link_resent"],"queue_status": ["open", "paused", "finished"],"shop_role": ["owner", "barber"],"skip_reason": ["no_show_after_grace", "unreachable", "invalid_phone", "barber_override"],"ticket_status": ["waiting", "getting_ready", "on_the_way", "arrived", "in_service", "completed", "skipped", "cancelled", "expired"]
          }
        }
} as const
