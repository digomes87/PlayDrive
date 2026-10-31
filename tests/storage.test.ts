/** localStorage persistence with an in-memory store. */
import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../src/sim/storage';
import {
  DEFAULT_SETTINGS,
  loadBestResults,
  loadLanguage,
  loadSettings,
  recordResult,
  saveSettings,
} from '../src/sim/storage';

const memoryStore = (): KeyValueStore => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
};

describe('best results', () => {
  it('starts empty and keeps the higher score per mission', () => {
    const store = memoryStore();
    expect(loadBestResults(store)).toEqual({});
    const first = recordResult(store, 'dock', { score: 500, seconds: 100 });
    expect(first.dock?.score).toBe(500);
    const worse = recordResult(store, 'dock', { score: 400, seconds: 90 });
    expect(worse.dock?.score).toBe(500);
    const better = recordResult(store, 'dock', { score: 600, seconds: 120 });
    expect(better.dock).toEqual({ score: 600, seconds: 120 });
  });

  it('survives a round trip', () => {
    const store = memoryStore();
    recordResult(store, 'gate', { score: 710, seconds: 250 });
    expect(loadBestResults(store).gate).toEqual({ score: 710, seconds: 250 });
  });

  it('ignores broken stored data', () => {
    const store = memoryStore();
    store.setItem('playdrive.best.v1', '{"dock": {"score": "lots"}}');
    expect(loadBestResults(store)).toEqual({});
  });
});

describe('settings', () => {
  it('round trips and clamps', () => {
    const store = memoryStore();
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(store, { expo: 0.2, deadzone: 0.3, muted: true })).toBe(true);
    expect(loadSettings(store)).toEqual({ expo: 0.2, deadzone: 0.3, muted: true });
    store.setItem('playdrive.settings.v1', '{"expo": 9, "deadzone": -4}');
    expect(loadSettings(store).expo).toBe(1);
    expect(loadSettings(store).deadzone).toBe(0);
  });
});

describe('language', () => {
  it('falls back to English for anything unknown', () => {
    const store = memoryStore();
    expect(loadLanguage(store)).toBe('en');
    store.setItem('playdrive.language.v1', '"pt"');
    expect(loadLanguage(store)).toBe('pt');
    store.setItem('playdrive.language.v1', '"klingon"');
    expect(loadLanguage(store)).toBe('en');
  });
});
