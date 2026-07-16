"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { demoState } from "./demo-data";
import type {
  Alert,
  AppState,
  FinancialProfile,
  Goal,
  Transaction,
  Watchlist,
} from "./types";

type Store = {
  state: AppState;
  hydrated: boolean;
  resetDemo: () => void;
  setProfile: (profile: FinancialProfile) => void;
  setUserName: (name: string) => void;
  setOnboarded: (value: boolean) => void;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  importTransactions: (txs: Omit<Transaction, "id">[]) => void;
  updateTransaction: (tx: Transaction) => void;
  deleteTransaction: (id: string) => void;
  addGoal: (goal: Omit<Goal, "id">) => void;
  updateGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;
  addAlert: (alert: Omit<Alert, "id">) => void;
  toggleAlert: (id: string) => void;
  deleteAlert: (id: string) => void;
  addWatchlist: (name: string) => void;
  toggleWatchAsset: (watchlistId: string, assetId: string) => void;
  markNotificationsRead: () => void;
};

const StoreContext = createContext<Store | null>(null);
const KEY = "finpilot-demo-v1";
const cloneDemo = () => JSON.parse(JSON.stringify(demoState)) as AppState;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(cloneDemo);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setState(JSON.parse(saved));
    } catch {
      /* Invalid local data falls back to demo. */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const mutate = useCallback(
    (fn: (current: AppState) => AppState) => setState((current) => fn(current)),
    [],
  );
  const value = useMemo<Store>(
    () => ({
      state,
      hydrated,
      resetDemo: () => setState(cloneDemo()),
    setProfile: (profile) => mutate((s) => ({ ...s, profile })),
    setUserName: (userName) => mutate((s) => ({ ...s, userName })),
      setOnboarded: (onboarded) => mutate((s) => ({ ...s, onboarded })),
      addTransaction: (tx) =>
        mutate((s) => ({
          ...s,
          transactions: [{ ...tx, id: crypto.randomUUID() }, ...s.transactions],
        })),
      importTransactions: (txs) =>
        mutate((s) => ({
          ...s,
          transactions: [
            ...txs.map((tx) => ({ ...tx, id: crypto.randomUUID() })),
            ...s.transactions,
          ],
        })),
      updateTransaction: (tx) =>
        mutate((s) => ({
          ...s,
          transactions: s.transactions.map((item) =>
            item.id === tx.id ? tx : item,
          ),
        })),
      deleteTransaction: (id) =>
        mutate((s) => ({
          ...s,
          transactions: s.transactions.filter((item) => item.id !== id),
        })),
      addGoal: (goal) =>
        mutate((s) => ({
          ...s,
          goals: [...s.goals, { ...goal, id: crypto.randomUUID() }],
        })),
      updateGoal: (goal) =>
        mutate((s) => ({
          ...s,
          goals: s.goals.map((item) => (item.id === goal.id ? goal : item)),
        })),
      deleteGoal: (id) =>
        mutate((s) => ({
          ...s,
          goals: s.goals.filter((item) => item.id !== id),
        })),
      addAlert: (alert) =>
        mutate((s) => ({
          ...s,
          alerts: [...s.alerts, { ...alert, id: crypto.randomUUID() }],
        })),
      toggleAlert: (id) =>
        mutate((s) => ({
          ...s,
          alerts: s.alerts.map((item) =>
            item.id === id ? { ...item, enabled: !item.enabled } : item,
          ),
        })),
      deleteAlert: (id) =>
        mutate((s) => ({
          ...s,
          alerts: s.alerts.filter((item) => item.id !== id),
        })),
      addWatchlist: (name) =>
        mutate((s) => ({
          ...s,
          watchlists: [
            ...s.watchlists,
            { id: crypto.randomUUID(), name, assetIds: [] },
          ],
        })),
      toggleWatchAsset: (watchlistId, assetId) =>
        mutate((s) => ({
          ...s,
          watchlists: s.watchlists.map((w: Watchlist) =>
            w.id !== watchlistId
              ? w
              : {
                  ...w,
                  assetIds: w.assetIds.includes(assetId)
                    ? w.assetIds.filter((id) => id !== assetId)
                    : [...w.assetIds, assetId],
                },
          ),
        })),
      markNotificationsRead: () =>
        mutate((s) => ({
          ...s,
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),
    }),
    [state, hydrated, mutate],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreProvider missing");
  return store;
}
