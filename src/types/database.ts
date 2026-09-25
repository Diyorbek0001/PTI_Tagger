export type RegistrationStatus = 'registered' | 'not_registered';
export type UnitRow = { id: string; unit_number: string; company: string; registration_status: RegistrationStatus; created_at: string; updated_at: string };
export type RegistrationRow = { id: string; unit_id: string; telegram_chat_id: string; telegram_chat_title: string; telegram_chat_type: 'group' | 'supergroup'; driver_telegram_user_id: string | null; driver_username: string | null; driver_first_name: string | null; driver_last_name: string | null; registered_at: string; is_active: boolean; unregistered_at: string | null };
