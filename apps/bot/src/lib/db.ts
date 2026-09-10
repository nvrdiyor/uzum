/**
 * Bazaga yagona kirish nuqtasi.
 * Prisma klienti `@savdoiq/db` paketidan olinadi (bitta global instansiya).
 */
export { prisma, disconnectDb } from '@savdoiq/db';
export type { User, Company, Membership, Subscription, UzumAccount } from '@savdoiq/db';
