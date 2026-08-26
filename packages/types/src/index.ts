export type Gender = 'female' | 'male';
export type GenderPreference = Gender | 'any';
export type CurrencyCode = string;
export type ProductCode = 'yeki_hast' | (string & {});
export type ServiceCode = 'human_listening' | (string & {});
export interface Money { amountMinor: number; currencyCode: CurrencyCode; }
export interface PerMinuteRate { amountMinor: number; currencyCode: CurrencyCode; billingIncrementSeconds: number; }
export interface ActivePricing { caller: PerMinuteRate; listener: PerMinuteRate; platformGrossSpread: PerMinuteRate; }
export type CallerMood = 'sad' | 'angry' | 'overwhelmed' | 'lonely' | 'just_talk' | 'other';
export type ListenerApplicationStatus = 'exploring' | 'training' | 'assessment' | 'assessment_passed' | 'kyc_pending' | 'kyc_expired' | 'agreement_pending' | 'admin_review' | 'mock_call' | 'approved' | 'active' | 'suspended' | 'rejected' | 'archived';
export type AgeVisibility = { mode: 'hidden' } | { mode: 'exact'; age: number } | { mode: 'decade'; min: number; max: number } | { mode: 'plus'; min: number };
export interface ListenerPublicProfile { id: string; nickname: string; gender: Gender; ageVisibility: AgeVisibility; languages: string[]; intro?: string; listeningTags: string[]; rating?: number; completedCalls: number; online: boolean; }
export interface ListenerWorkPreferences { acceptsCallerGenders: Gender[]; languages: string[]; }
export type ListenerPresenceStatus = 'offline' | 'online' | 'paused';
export type CallStatus = 'requested' | 'routing' | 'calling_caller' | 'caller_answered' | 'calling_listener' | 'connected' | 'completed' | 'missed' | 'failed' | 'cancelled' | 'safety_terminated';
