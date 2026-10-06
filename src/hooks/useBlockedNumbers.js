import { useStaleData } from './useStaleData';
import { normalizeNumber } from '../../server/shared/phone.js';

export const BLOCKED_URL = '/api/blocked';

// Numbers the WhatsApp bot ignores (managed under Handoffs -> Blocked numbers).
// Same cache key as the Handoffs page, so blocking/unblocking there shows up here.
export function useBlockedNumbers() {
  const { data, revalidating, revalidate } = useStaleData(BLOCKED_URL);
  const numbers = data?.numbers || [];
  const set = new Set(numbers.map((n) => n.phone));
  return {
    numbers,
    loading: revalidating,
    revalidate,
    isBlocked: (phone) => set.has(normalizeNumber(phone)),
  };
}
