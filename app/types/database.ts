export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: "14.18";
	};
	public: {
		Tables: {
			annotations: {
				Row: {
					anomaly_reason: string | null;
					anomaly_type: string | null;
					category: string | null;
					confidence: number | null;
					created_at: string;
					created_by: string;
					entity_id: string;
					entity_type: string;
					id: string;
				};
				Insert: {
					anomaly_reason?: string | null;
					anomaly_type?: string | null;
					category?: string | null;
					confidence?: number | null;
					created_at?: string;
					created_by?: string;
					entity_id: string;
					entity_type: string;
					id?: string;
				};
				Update: {
					anomaly_reason?: string | null;
					anomaly_type?: string | null;
					category?: string | null;
					confidence?: number | null;
					created_at?: string;
					created_by?: string;
					entity_id?: string;
					entity_type?: string;
					id?: string;
				};
				Relationships: [];
			};
			audit_log: {
				Row: {
					action_type: string;
					created_at: string;
					details: Json | null;
					entity_id: string | null;
					entity_type: string | null;
					id: string;
					performed_by: string;
					profile_id: string;
					result: string | null;
				};
				Insert: {
					action_type: string;
					created_at?: string;
					details?: Json | null;
					entity_id?: string | null;
					entity_type?: string | null;
					id?: string;
					performed_by: string;
					profile_id: string;
					result?: string | null;
				};
				Update: {
					action_type?: string;
					created_at?: string;
					details?: Json | null;
					entity_id?: string | null;
					entity_type?: string | null;
					id?: string;
					performed_by?: string;
					profile_id?: string;
					result?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: "audit_log_profile_id_fkey";
						columns: ["profile_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			clients: {
				Row: {
					created_at: string;
					email: string | null;
					id: string;
					name: string;
					notes: string | null;
					paypal_payer_id: string | null;
					profile_id: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					email?: string | null;
					id?: string;
					name: string;
					notes?: string | null;
					paypal_payer_id?: string | null;
					profile_id: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					email?: string | null;
					id?: string;
					name?: string;
					notes?: string | null;
					paypal_payer_id?: string | null;
					profile_id?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "clients_profile_id_fkey";
						columns: ["profile_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			invoices: {
				Row: {
					amount: number;
					client_id: string;
					created_at: string;
					currency: string;
					description: string | null;
					due_date: string | null;
					id: string;
					invoice_number: string | null;
					issue_date: string | null;
					line_items: Json | null;
					paypal_invoice_id: string | null;
					profile_id: string;
					raw_paypal: Json | null;
					source: string;
					status: string;
					updated_at: string;
				};
				Insert: {
					amount: number;
					client_id: string;
					created_at?: string;
					currency?: string;
					description?: string | null;
					due_date?: string | null;
					id?: string;
					invoice_number?: string | null;
					issue_date?: string | null;
					line_items?: Json | null;
					paypal_invoice_id?: string | null;
					profile_id: string;
					raw_paypal?: Json | null;
					source?: string;
					status?: string;
					updated_at?: string;
				};
				Update: {
					amount?: number;
					client_id?: string;
					created_at?: string;
					currency?: string;
					description?: string | null;
					due_date?: string | null;
					id?: string;
					invoice_number?: string | null;
					issue_date?: string | null;
					line_items?: Json | null;
					paypal_invoice_id?: string | null;
					profile_id?: string;
					raw_paypal?: Json | null;
					source?: string;
					status?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "invoices_client_id_fkey";
						columns: ["client_id"];
						isOneToOne: false;
						referencedRelation: "clients";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "invoices_profile_id_fkey";
						columns: ["profile_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			matches: {
				Row: {
					amount_matched: number;
					confidence: number | null;
					created_at: string;
					created_by: string;
					id: string;
					invoice_id: string;
					match_type: string;
					reasoning: string | null;
					status: string;
					transaction_id: string;
				};
				Insert: {
					amount_matched: number;
					confidence?: number | null;
					created_at?: string;
					created_by?: string;
					id?: string;
					invoice_id: string;
					match_type: string;
					reasoning?: string | null;
					status?: string;
					transaction_id: string;
				};
				Update: {
					amount_matched?: number;
					confidence?: number | null;
					created_at?: string;
					created_by?: string;
					id?: string;
					invoice_id?: string;
					match_type?: string;
					reasoning?: string | null;
					status?: string;
					transaction_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "matches_invoice_id_fkey";
						columns: ["invoice_id"];
						isOneToOne: false;
						referencedRelation: "invoices";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "matches_transaction_id_fkey";
						columns: ["transaction_id"];
						isOneToOne: false;
						referencedRelation: "transactions";
						referencedColumns: ["id"];
					},
				];
			};
			pending_actions: {
				Row: {
					action_type: string;
					decided_at: string | null;
					decided_by: string | null;
					id: string;
					payload: Json;
					profile_id: string;
					proposed_at: string;
					reasoning: string | null;
					related_invoice_id: string | null;
					related_transaction_id: string | null;
					status: string;
				};
				Insert: {
					action_type: string;
					decided_at?: string | null;
					decided_by?: string | null;
					id?: string;
					payload: Json;
					profile_id: string;
					proposed_at?: string;
					reasoning?: string | null;
					related_invoice_id?: string | null;
					related_transaction_id?: string | null;
					status?: string;
				};
				Update: {
					action_type?: string;
					decided_at?: string | null;
					decided_by?: string | null;
					id?: string;
					payload?: Json;
					profile_id?: string;
					proposed_at?: string;
					reasoning?: string | null;
					related_invoice_id?: string | null;
					related_transaction_id?: string | null;
					status?: string;
				};
				Relationships: [
					{
						foreignKeyName: "pending_actions_decided_by_fkey";
						columns: ["decided_by"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "pending_actions_profile_id_fkey";
						columns: ["profile_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "pending_actions_related_invoice_id_fkey";
						columns: ["related_invoice_id"];
						isOneToOne: false;
						referencedRelation: "invoices";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "pending_actions_related_transaction_id_fkey";
						columns: ["related_transaction_id"];
						isOneToOne: false;
						referencedRelation: "transactions";
						referencedColumns: ["id"];
					},
				];
			};
			profiles: {
				Row: {
					created_at: string;
					email: string | null;
					full_name: string | null;
					id: string;
					paypal_merchant_id: string | null;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					email?: string | null;
					full_name?: string | null;
					id: string;
					paypal_merchant_id?: string | null;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					email?: string | null;
					full_name?: string | null;
					id?: string;
					paypal_merchant_id?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			transactions: {
				Row: {
					amount: number;
					client_id: string | null;
					created_at: string;
					currency: string;
					fee_amount: number | null;
					id: string;
					net_amount: number | null;
					payer_email: string | null;
					payer_name: string | null;
					paypal_transaction_id: string | null;
					profile_id: string;
					raw_paypal: Json | null;
					source: string;
					status: string | null;
					transaction_date: string | null;
					type: string | null;
					updated_at: string;
				};
				Insert: {
					amount: number;
					client_id?: string | null;
					created_at?: string;
					currency?: string;
					fee_amount?: number | null;
					id?: string;
					net_amount?: number | null;
					payer_email?: string | null;
					payer_name?: string | null;
					paypal_transaction_id?: string | null;
					profile_id: string;
					raw_paypal?: Json | null;
					source?: string;
					status?: string | null;
					transaction_date?: string | null;
					type?: string | null;
					updated_at?: string;
				};
				Update: {
					amount?: number;
					client_id?: string | null;
					created_at?: string;
					currency?: string;
					fee_amount?: number | null;
					id?: string;
					net_amount?: number | null;
					payer_email?: string | null;
					payer_name?: string | null;
					paypal_transaction_id?: string | null;
					profile_id?: string;
					raw_paypal?: Json | null;
					source?: string;
					status?: string | null;
					transaction_date?: string | null;
					type?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "transactions_client_id_fkey";
						columns: ["client_id"];
						isOneToOne: false;
						referencedRelation: "clients";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "transactions_profile_id_fkey";
						columns: ["profile_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			webhook_events: {
				Row: {
					event_type: string;
					id: string;
					payload: Json;
					paypal_event_id: string | null;
					processed: boolean;
					processed_at: string | null;
					processing_error: string | null;
					received_at: string;
				};
				Insert: {
					event_type: string;
					id?: string;
					payload: Json;
					paypal_event_id?: string | null;
					processed?: boolean;
					processed_at?: string | null;
					processing_error?: string | null;
					received_at?: string;
				};
				Update: {
					event_type?: string;
					id?: string;
					payload?: Json;
					paypal_event_id?: string | null;
					processed?: boolean;
					processed_at?: string | null;
					processing_error?: string | null;
					received_at?: string;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			[_ in never]: never;
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
		: never) = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
		? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never) = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never) = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
	EnumName extends (DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
		: never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
		? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
		: never) = never,
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
		? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {},
	},
} as const;
