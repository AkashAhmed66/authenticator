import type { Account } from '../types/account';

export type BackupPayload = {
  format: 'authenticator-backup';
  version: 1;
  exportedAt: string;
  accounts: Account[];
};

export function createBackup(accounts: Account[]): BackupPayload {
  return { format: 'authenticator-backup', version: 1, exportedAt: new Date().toISOString(), accounts };
}
