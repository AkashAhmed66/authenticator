import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { Account, AccountDraft } from '../types/account';
import { normalizeSecret } from './totp';

const ACCOUNTS_KEY = 'authenticator.accounts';
const secretKey = (id: string) => `authenticator.secret.${id}`;

export async function loadAccounts(): Promise<Account[]> {
  const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
  return raw ? (JSON.parse(raw) as Account[]) : [];
}

export async function saveAccount(draft: AccountDraft): Promise<Account> {
  const accounts = await loadAccounts();
  const now = new Date().toISOString();
  const { secret: rawSecret, ...metadata } = draft;
  const account: Account = {
    ...metadata,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    sortOrder: accounts.length,
  };
  await SecureStore.setItemAsync(secretKey(account.id), normalizeSecret(rawSecret));
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]));
  return account;
}

export async function getSecret(id: string): Promise<string> {
  const secret = await SecureStore.getItemAsync(secretKey(id));
  if (!secret) throw new Error('The secure secret for this account is unavailable.');
  return secret;
}

export async function deleteAccount(id: string): Promise<void> {
  const accounts = (await loadAccounts()).filter((account) => account.id !== id);
  await SecureStore.deleteItemAsync(secretKey(id));
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export async function updateAccount(account: Account): Promise<void> {
  const accounts = await loadAccounts();
  await AsyncStorage.setItem(
    ACCOUNTS_KEY,
    JSON.stringify(accounts.map((item) => (item.id === account.id ? { ...account, updatedAt: new Date().toISOString() } : item))),
  );
}
