export type Algorithm = 'sha1' | 'sha256' | 'sha512';

export type Account = {
  id: string;
  issuer: string;
  accountName: string;
  algorithm: Algorithm;
  digits: 6 | 8;
  period: number;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
};

export type AccountDraft = Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'> & {
  secret: string;
};
