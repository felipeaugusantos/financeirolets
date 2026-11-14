import { useCallback, useEffect, useState } from 'react';

export const favoritesStorageKey = (userId?: string | null) => `menu-favorites:${userId ?? 'anon'}`;

export function toggleFavorite(list: string[], url: string): string[] {
  return list.includes(url) ? list.filter((u) => u !== url) : [...list, url];
}

export function useMenuFavorites(userId?: string | null) {
  const key = favoritesStorageKey(userId);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setFavorites(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setFavorites([]);
    }
  }, [key]);

  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; list: string[] }>).detail;
      if (d?.key === key) setFavorites(d.list);
    };
    window.addEventListener('menu-favorites-change', onChange);
    return () => window.removeEventListener('menu-favorites-change', onChange);
  }, [key]);

  const toggle = useCallback(
    (url: string) => {
      setFavorites((prev) => {
        const next = toggleFavorite(prev, url);
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
        setTimeout(() => window.dispatchEvent(new CustomEvent('menu-favorites-change', { detail: { key, list: next } })), 0);
        return next;
      });
    },
    [key],
  );

  return { favorites, toggle, isFavorite: (url: string) => favorites.includes(url) };
}
