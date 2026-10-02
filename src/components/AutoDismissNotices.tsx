'use client';

import { useEffect } from 'react';

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function scheduleNotice(el: HTMLElement) {
  const previous = timers.get(el);
  if (previous) clearTimeout(previous);

  el.classList.remove('cx-notice-pop', 'cx-notice-hide');
  void el.offsetWidth;
  el.classList.add('cx-notice-pop');

  const text = (el.textContent || '').toLocaleLowerCase('pt-BR');
  const isError = /erro|falha|negado|bloqueou|informe|obrigat/.test(text);
  const delay = isError ? 6000 : 2600;

  const timer = setTimeout(() => {
    el.classList.add('cx-notice-hide');
  }, delay);
  timers.set(el, timer);
}

export default function AutoDismissNotices() {
  useEffect(() => {
    const scan = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.matches('.notice')) scheduleNotice(root);
      root.querySelectorAll?.<HTMLElement>('.notice').forEach(scheduleNotice);
    };

    scan(document);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node instanceof HTMLElement) scan(node);
          });
        }
        const target = mutation.target instanceof HTMLElement
          ? mutation.target.closest('.notice') as HTMLElement | null
          : mutation.target.parentElement?.closest('.notice') as HTMLElement | null;
        if (target) scheduleNotice(target);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
