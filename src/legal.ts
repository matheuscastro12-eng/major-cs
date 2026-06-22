export type LegalKind = 'privacy' | 'terms' | 'refund';

export const LEGAL_PATHS: Record<LegalKind, string> = {
  privacy: '/privacidade',
  terms: '/termos',
  refund: '/reembolso',
};
