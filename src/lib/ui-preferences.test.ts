import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STUDIO_PREFERENCES,
  parseStudioPreferences,
  preferredChoice,
  readStudioPreferences,
  sanitizeStudioPreferences,
  serializeStudioPreferences,
  STUDIO_PREFERENCES_STORAGE_KEY,
} from './ui-preferences.ts'

describe('remembered studio preferences', () => {
  it('falls back to shipped defaults for missing or corrupt payloads', () => {
    expect(parseStudioPreferences(null)).toEqual(DEFAULT_STUDIO_PREFERENCES)
    expect(parseStudioPreferences('')).toEqual(DEFAULT_STUDIO_PREFERENCES)
    expect(parseStudioPreferences('{oops')).toEqual(DEFAULT_STUDIO_PREFERENCES)
    expect(parseStudioPreferences('[1,2,3]')).toEqual(DEFAULT_STUDIO_PREFERENCES)
    expect(parseStudioPreferences(`{"preferences":{"engine":"${'x'.repeat(9000)}"}}`)).toEqual(DEFAULT_STUDIO_PREFERENCES)
  })

  it('round-trips every remembered control', () => {
    const saved = serializeStudioPreferences({
      engine: 'supertonic',
      voiceId: 'af_bella',
      speed: 1.25,
      separateLines: true,
      streamPlay: false,
      useWorker: false,
      wordTimestamps: true,
      dialogMode: true,
      narratorMode: true,
      audioCleanupEnabled: true,
      audioFormat: 'mp3',
      mp3Bitrate: 192,
      loudnessPreset: 'audiobook-mono',
      pauseDuration: 2,
      showAdvanced: true,
      showSystemTools: true,
      showPronunciations: true,
      epubPanelMode: 'mapping',
      epubPanelOpen: false,
      epubChapterFilter: 'unread',
      epubChapterSort: 'longest',
      epubLoadMode: 'append',
      epubAutoAdvance: true,
      epubShowPreview: false,
    })
    const restored = parseStudioPreferences(saved)
    expect(restored.engine).toBe('supertonic')
    expect(restored.voiceId).toBe('af_bella')
    expect(restored.speed).toBe(1.25)
    expect(restored.separateLines).toBe(true)
    expect(restored.streamPlay).toBe(false)
    expect(restored.audioFormat).toBe('mp3')
    expect(restored.mp3Bitrate).toBe(192)
    expect(restored.epubChapterFilter).toBe('unread')
    expect(restored.epubChapterSort).toBe('longest')
    expect(restored.epubLoadMode).toBe('append')
    expect(restored.epubAutoAdvance).toBe(true)
    expect(restored.epubShowPreview).toBe(false)
    expect(JSON.parse(saved).version).toBe(1)
  })

  it('rejects out-of-range, wrong-typed, and unknown values', () => {
    const sanitized = sanitizeStudioPreferences({
      engine: 'definitely-not-an-engine',
      voiceId: '   ',
      speed: 99,
      mp3Bitrate: 12.7,
      pauseDuration: -4,
      separateLines: 'yes',
      audioFormat: 'wma',
      epubChapterFilter: 'archived',
      unknownKey: true,
    })
    expect(sanitized.engine).toBe('kokoro')
    expect(sanitized.voiceId).toBe('af_heart')
    expect(sanitized.speed).toBe(4)
    expect(sanitized.mp3Bitrate).toBe(32)
    expect(sanitized.pauseDuration).toBe(0.1)
    expect(sanitized.separateLines).toBe(false)
    expect(sanitized.audioFormat).toBe('wav')
    expect(sanitized.epubChapterFilter).toBe('all')
    expect('unknownKey' in sanitized).toBe(false)
  })

  it('accepts a bare legacy object without the version envelope', () => {
    expect(parseStudioPreferences('{"epubAutoAdvance":true}').epubAutoAdvance).toBe(true)
  })

  it('reads through browser storage without throwing when it is blocked', () => {
    const map = new Map<string, string>([[STUDIO_PREFERENCES_STORAGE_KEY, serializeStudioPreferences({ showAdvanced: true })]])
    expect(readStudioPreferences({ getItem: (key) => map.get(key) ?? null }).showAdvanced).toBe(true)
    expect(readStudioPreferences(null)).toEqual(DEFAULT_STUDIO_PREFERENCES)
    expect(readStudioPreferences({ getItem: () => { throw new Error('blocked') } })).toEqual(DEFAULT_STUDIO_PREFERENCES)
  })

  it('only restores choices the running build still offers', () => {
    expect(preferredChoice('piper', ['kokoro', 'piper'] as const, 'kokoro')).toBe('piper')
    expect(preferredChoice('piper', ['kokoro'] as const, 'kokoro')).toBe('kokoro')
  })
})
