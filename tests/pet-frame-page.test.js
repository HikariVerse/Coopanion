import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

let dom;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); dom?.window.close(); });

async function page(hz) {
  vi.resetModules();
  dom = new JSDOM(readFileSync(new URL('../packages/cortico-world-desktop-pet/web/pet.html', import.meta.url), 'utf8'),
    { url: 'http://127.0.0.1:7797/pet', pretendToBeVisual: true });
  const win = dom.window;
  const sockets = [];
  class Socket {
    readyState = 1;
    sent = [];
    constructor() { sockets.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
  }
  let callback, now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  for (const [key, value] of Object.entries({ window: win, document: win.document, location: win.location,
    innerWidth: 1000, innerHeight: 800, addEventListener: win.addEventListener.bind(win),
    getComputedStyle: win.getComputedStyle.bind(win), WebSocket: Socket,
    requestAnimationFrame: fn => { callback = fn; return 1; } })) vi.stubGlobal(key, value);
  const pet = win.document.querySelector('#pet');
  const drawing = vi.spyOn(pet, 'setAttribute');
  await import('../packages/cortico-world-desktop-pet/web/pet-app.js');
  const order = data => sockets[0].onmessage({ data: JSON.stringify(data) });
  const advance = seconds => {
    const end = now + seconds * 1000;
    while (now + 1000 / hz <= end + 1e-7) { now += 1000 / hz; callback(now); }
  };
  const count = () => drawing.mock.calls.filter(([name]) => name === 'transform').length;
  order({ t: 'prefs', roam: 'off', sound: false });
  advance(4); // initial drop and its expression/settling have completed
  return { win, sockets, order, advance, count, pet };
}

describe('real pet page frame loop and UI', () => {
  for (const hz of [60, 120, 144, 165]) {
    it(`${hz} Hz throttles idle, wakes for walking, and applies fixed-60 prefs`, async () => {
      const p = await page(hz);
      let start = p.count(); p.advance(2);
      expect(p.count() - start).toBeGreaterThanOrEqual(59);
      expect(p.count() - start).toBeLessThanOrEqual(61);
      p.order({ t: 'walk', id: 'page-walk', to: .2, run: false });
      start = p.count(); p.advance(2);
      expect(p.count() - start).toBeGreaterThanOrEqual(119);
      expect(p.count() - start).toBeLessThanOrEqual(121);
      p.advance(8);
      expect(p.sockets[0].sent.filter(m => m.t === 'arrived' && m.walkId === 'page-walk')).toHaveLength(1);
      p.order({ t: 'prefs', fixed60Fps: true });
      start = p.count(); p.advance(2);
      expect(p.count() - start).toBeGreaterThanOrEqual(119);
      p.order({ t: 'prefs', fixed60Fps: false });
      start = p.count(); p.advance(2);
      expect(p.count() - start).toBeLessThanOrEqual(61);
    });
  }
  it('menu toggle sends and immediately applies the persistent preference', async () => {
    const p = await page(144);
    // Read the real figure transform for its current screen-space center.
    const transform = p.pet.getAttribute('transform');
    const [, x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform);
    p.win.document.dispatchEvent(new p.win.MouseEvent('contextmenu', { clientX: +x, clientY: +y - 54, bubbles: true }));
    const button = p.win.document.querySelector('[data-action="framerate"]');
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    expect(p.sockets[0].sent.at(-1)).toEqual({ t: 'prefs', fixed60Fps: true });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    const count = p.count(); p.advance(2);
    expect(p.count() - count).toBeGreaterThanOrEqual(119);
  });
});
