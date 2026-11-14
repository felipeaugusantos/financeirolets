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

  const toggle = useCallback(
    (url: string) => {
      setFavorites((prev) => {
        const next = toggleFavorite(prev, url);
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    },
    [key],
  );

  return { favorites, toggle, isFavorite: (url: string) => favorites.includes(url) };
}
