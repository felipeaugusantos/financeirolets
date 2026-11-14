import { describe, it, expect } from 'vitest';
import { toggleFavorite, favoritesStorageKey } from '@/hooks/useMenuFavorites';

describe('menu favorites', () => {
  it('adds and removes a favorite', () => {
    expect(toggleFavorite([], '/lancamentos')).toEqual(['/lancamentos']);
    expect(toggleFavorite(['/lancamentos', '/'], '/lancamentos')).toEqual(['/']);
  });
  it('keeps favorites separate per user', () => {
    expect(favoritesStorageKey('a')).not.toBe(favoritesStorageKey('b'));
  });
});
