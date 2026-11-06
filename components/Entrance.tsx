'use client';
import { useEffect } from 'react';

const EXPO = 'cubic-bezier(.16,1,.3,1)';
const SOFT = 'cubic-bezier(.22,.7,.25,1)';
const GLASS = 'cubic-bezier(.2,.75,.28,1)';

// Pre-state set before first paint by the script in layout.tsx. Runs once, then removes itself so the resting page is plain CSS.
// Pages without the hero only get the header and one lift on main.
export const PRE_SCRIPT = `(function(){var d=document.documentElement;if(!('animate' in Element.prototype))return;if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.classList.add('pre');setTimeout(function(){d.classList.remove('pre')},4000)})();`;

export function Entrance() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('pre')) return;
    const s = matchMedia('(max-width: 640px)').matches ? 0.86 : 1;
    const running: Animation[] = [];
    const animate = (el: Element | null | undefined, frames: Keyframe[], dur: number, delay: number, easing: string) => {
      if (el) running.push(el.animate(frames, { duration: dur * s, delay: delay * s, easing, fill: 'both' }));
    };
    const $ = (q: string) => document.querySelector(q);
    const $$ = (q: string) => document.querySelectorAll(q);
    const rise = (el: Element | undefined, delay: number, dur: number) =>
      animate(el, [{ clipPath: 'inset(100% 0 -14% 0)', translate: '0 .16em' }, { clipPath: 'inset(-18% 0 -14% 0)', translate: '0 0' }], dur, delay, EXPO);
    const lift = (el: Element | null | undefined, delay: number, dist = '.7em', dur = 560) =>
      animate(el, [{ opacity: 0, translate: '0 ' + dist }, { opacity: 1, translate: '0 0' }], dur, delay, SOFT);
    const settle = (el: Element | null, delay: number, dur = 760, from = 0.985, dist = '1.1em') =>
      animate(el, [{ opacity: 0, scale: from, translate: '0 ' + dist }, { opacity: 1, scale: 1, translate: '0 0' }], dur, delay, GLASS);

    lift($('.brand'), 60, '.55em', 600);
    settle($('.nav'), 150, 700, 0.99, '.5em');
    settle($('.cta'), 200, 700, 0.985, '.5em');
    settle($('.burger'), 150, 700, 0.9, '.4em');
    lift($('.page-lift'), 300, '.8em', 520);
    lift($('.eyebrow'), 300, '.8em', 520);
    const lines = $$('.hx-h1 .sx');
    rise(lines[0], 380, 980);
    rise(lines[1], 470, 980);
    settle($('.play'), 720, 640, 0.88, '.3em');
    lift($('.hx-tag'), 770, '.7em', 560);
    settle($('.hx-panel'), 800, 880, 0.982, '1.4em');
    animate($('.ring'), [{ scale: 0.86 }, { scale: 1 }], 700, 1020, EXPO);
    animate($('.dot'), [{ scale: 0 }, { scale: 1 }], 520, 1080, EXPO);
    animate($('.hx-track i'), [{ scale: '0 1' }, { scale: '1 1' }], 820, 1120, EXPO);
    const nums = $$('.hx-num');
    rise(nums[0], 920, 860);
    rise(nums[1], 990, 860);
    const lbls = $$('.hx-lbl');
    lift(lbls[0], 1030, '.6em', 520);
    lift(lbls[1], 1075, '.6em', 520);
    animate($('.slash'), [{ scale: '1 0' }, { scale: '1 1' }], 700, 1010, EXPO);
    settle($('.hx-row .meet'), 1140, 820, 0.985, '1.2em');
    settle($('.hd-meet'), 260, 700, 0.985, '.5em');

    Promise.all(running.map((a) => a.finished.catch(() => {}))).then(() => {
      root.classList.remove('pre');
      running.forEach((a) => a.cancel());
    });
  }, []);
  return null;
}
