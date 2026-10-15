import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import Ifood from '@/pages/Ifood';

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; });

describe('página iFood', () => {
  it('mostra o título e o aviso de implantação', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    act(() => root!.render(<Ifood />));
    expect(el.querySelector('h1')?.textContent).toBe('iFood');
    expect(el.textContent).toContain('Em implantação');
  });
});
