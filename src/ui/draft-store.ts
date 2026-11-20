"use client";

// Browser storage as an external store for React (useSyncExternalStore), so
// saved corrections have one source of truth and every view of them stays in
// step. When storage is blocked (some private windows), an in-memory copy
// keeps corrections working for the visit.

import { useSyncExternalStore } from "react";
import type { StorageLike } from "./corrections";

const listeners = new Set<() => void>();
const memory = new Map<string, string>();
const emit = () => listeners.forEach((listener) => listener());

export const draftStorage: StorageLike = {
  getItem(key) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) return value;
    } catch {
      // Blocked storage: fall back to memory.
    }
    return memory.get(key) ?? null;
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
      memory.delete(key);
    } catch {
      memory.set(key, value);
    }
    emit();
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing stored there.
    }
    memory.delete(key);
    emit();
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The raw stored value for a key; null on the server and when nothing is stored. */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => draftStorage.getItem(key),
    () => null,
  );
}
