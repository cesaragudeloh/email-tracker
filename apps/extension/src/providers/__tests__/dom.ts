import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, vi } from 'vitest';

// Cargar jsdom como módulo de test evita incluir su importación en el límite
// de arranque del worker de Vitest, especialmente en discos montados lentos.
let dom: JSDOM;

beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
});

afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});
