import type { Database } from '@/integrations/supabase/types';

/** Atalhos para os enums do banco (types.ts é gerado e não deve ser editado). */
export type Enums = Database['public']['Enums'];
export type DbTxType = Enums['transaction_type'];
export type DbTxStatus = Enums['transaction_status'];
export type DbPaymentMethod = Enums['payment_method'];
