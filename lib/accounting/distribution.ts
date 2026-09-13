import 'server-only';

/**
 * Server-side entry point for allocation maths.
 *
 * The implementation lives in ./allocate so the Monthly Profit form can
 * preview the identical split in the browser; this module keeps the
 * 'server-only' guard for everything that runs in a server action.
 */
export { round2, allocateLargestRemainder } from './allocate';
