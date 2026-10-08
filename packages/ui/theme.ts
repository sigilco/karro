// Theme store — light/dark switching without useEffect.
// Applies to document.documentElement.dataset.theme so Tailwind v4
// @theme var overrides flip every token at once; persists to localStorage.

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "karro_theme";

function readInitial(): Theme {
  // localStorage can be missing entirely (SSR), undefined (RN Hermes), or
  // null (android WebView with domStorageEnabled off) — any access may
  // throw, so a plain typeof guard is not enough.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

let current: Theme = readInitial();
const listeners = new Set<() => void>();

function applyToDom(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme): void {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // private-mode storage — theme still applies for the session
  }
  applyToDom(theme);
  for (const fn of listeners) fn();
}

export function toggleTheme(): void {
  setTheme(current === "dark" ? "light" : "dark");
}

export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function serverTheme(): Theme {
  return "dark";
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme, serverTheme);
}

// Pre-paint inline bootstrap for _layout <head> — sets dataset.theme before
// first paint so there's no light/dark flash on reload.
export const THEME_BOOTSTRAP_JS = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(!t){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){}})()`;
