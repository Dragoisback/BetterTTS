import { describe, expect, it } from 'vitest'
import { createEpubMapping } from './epub-mapping.ts'
import {
  applyEpubBookProgress,
  buildEpubChapterRows,
  chapterPreview,
  countWords,
  epubBookKey,
  epubBookStorageKey,
  estimateSpeechSeconds,
  excludedEpubChapterIds,
  formatEstimatedDuration,
  invertEpubChapterInclusion,
  loadEpubBookProgress,
  serializeEpubBookProgress,
  setEpubChaptersIncluded,
  stepEpubChapterId,
  summarizeEpubBook,
  toggleCompletedChapter,
} from './epub-library.ts'

const source = [
  { title: 'Prologue', text: 'The lighthouse blinked twice across the harbour.' },
  { title: 'Chapter One', text: `${'word '.repeat(310)}`.trim() },
  { title: 'Chapter Two', text: 'A short bridge between two longer nights.' },
]

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  }
}

describe('EPUB chapter library', () => {
  it('counts words and estimates duration against the speaking rate', () => {
    expect(countWords('Two words')).toBe(2)
    expect(countWords("  don't  stop—now ")).toBe(3)
    expect(countWords('   ')).toBe(0)

    // 310 words at 155 wpm is two minutes; doubling speed halves the estimate.
    expect(estimateSpeechSeconds(source[1].text)).toBe(120)
    expect(estimateSpeechSeconds(source[1].text, 2)).toBe(60)
    expect(estimateSpeechSeconds('', 1)).toBe(0)
    expect(estimateSpeechSeconds(source[1].text, Number.NaN)).toBe(120)
  })

  it('formats duration estimates for the chapter list', () => {
    expect(formatEstimatedDuration(0)).toBe('0s')
    expect(formatEstimatedDuration(-5)).toBe('0s')
    expect(formatEstimatedDuration(45)).toBe('45s')
    expect(formatEstimatedDuration(150)).toBe('2m 30s')
    expect(formatEstimatedDuration(3600)).toBe('1h')
    expect(formatEstimatedDuration(4500)).toBe('1h 15m')
  })

  it('derives a stable book key from metadata and chapter sizes only', () => {
    const key = epubBookKey({ title: 'Harbour Lights', fileName: 'harbour.epub', chapters: source })
    expect(key).toBe(epubBookKey({ title: 'Harbour Lights', fileName: 'harbour.epub', chapters: source }))
    expect(key).not.toBe(epubBookKey({ title: 'Other Book', fileName: 'harbour.epub', chapters: source }))
    expect(key.startsWith('epub-')).toBe(true)
    expect(epubBookStorageKey(key)).toBe(`bettertts-epub-book-v1:${key}`)
  })

  it('summarizes only the ticked chapters', () => {
    const chapters = setEpubChaptersIncluded(createEpubMapping(source), false, ['epub-chapter-3'])
    const summary = summarizeEpubBook(chapters, { completedIds: ['epub-chapter-1'] })
    expect(summary.chapters).toBe(3)
    expect(summary.included).toBe(2)
    expect(summary.completed).toBe(1)
    expect(summary.percentComplete).toBe(50)
    expect(summary.includedSeconds).toBe(estimateSpeechSeconds(source[0].text) + estimateSpeechSeconds(source[1].text))
    expect(summarizeEpubBook([]).percentComplete).toBe(0)
  })

  it('searches, filters, and sorts chapter rows while keeping reading-order numbers', () => {
    const chapters = setEpubChaptersIncluded(createEpubMapping(source), false, ['epub-chapter-2'])
    expect(buildEpubChapterRows(chapters, { query: 'lighthouse' }).map((row) => row.index)).toEqual([0])
    expect(buildEpubChapterRows(chapters, { query: 'Chapter T' }).map((row) => row.index)).toEqual([2])
    expect(buildEpubChapterRows(chapters, { filter: 'excluded' }).map((row) => row.index)).toEqual([1])
    expect(buildEpubChapterRows(chapters, { filter: 'included' }).map((row) => row.index)).toEqual([0, 2])
    expect(buildEpubChapterRows(chapters, { filter: 'done', completedIds: ['epub-chapter-3'] }).map((row) => row.index)).toEqual([2])
    expect(buildEpubChapterRows(chapters, { filter: 'unread', completedIds: ['epub-chapter-3'] }).map((row) => row.index)).toEqual([0, 1])
    expect(buildEpubChapterRows(chapters, { sort: 'longest' }).map((row) => row.index)).toEqual([1, 0, 2])
    expect(buildEpubChapterRows(chapters, { sort: 'shortest' }).map((row) => row.index)).toEqual([2, 0, 1])
    expect(buildEpubChapterRows(chapters, { sort: 'title' }).map((row) => row.chapter.title)).toEqual(['Chapter One', 'Chapter Two', 'Prologue'])
    expect(buildEpubChapterRows(chapters)[2].completed).toBe(false)
  })

  it('steps through chapters, optionally skipping excluded and finished ones', () => {
    const chapters = setEpubChaptersIncluded(createEpubMapping(source), false, ['epub-chapter-2'])
    expect(stepEpubChapterId(chapters, 'epub-chapter-1', 1)).toBe('epub-chapter-2')
    expect(stepEpubChapterId(chapters, 'epub-chapter-1', 1, { includedOnly: true })).toBe('epub-chapter-3')
    expect(stepEpubChapterId(chapters, 'epub-chapter-3', 1)).toBeNull()
    expect(stepEpubChapterId(chapters, 'epub-chapter-3', -1, { includedOnly: true })).toBe('epub-chapter-1')
    expect(stepEpubChapterId(chapters, null, 1)).toBe('epub-chapter-1')
    expect(stepEpubChapterId(chapters, 'missing', 1, { includedOnly: true })).toBe('epub-chapter-1')
    expect(stepEpubChapterId(chapters, 'epub-chapter-1', 1, {
      includedOnly: true,
      skipCompleted: true,
      completedIds: ['epub-chapter-3'],
    })).toBeNull()
    expect(stepEpubChapterId([], null, 1)).toBeNull()
  })

  it('toggles inclusion in bulk and inverts a filtered scope', () => {
    const chapters = createEpubMapping(source)
    expect(setEpubChaptersIncluded(chapters, false).every((chapter) => !chapter.included)).toBe(true)
    const inverted = invertEpubChapterInclusion(chapters, ['epub-chapter-2'])
    expect(inverted.map((chapter) => chapter.included)).toEqual([true, false, true])
    expect(chapters.map((chapter) => chapter.included)).toEqual([true, true, true])
    expect(excludedEpubChapterIds(inverted)).toEqual(['epub-chapter-2'])
  })

  it('remembers ticks, the open chapter, and finished chapters per book', () => {
    const storage = memoryStorage()
    const key = epubBookKey({ title: 'Harbour Lights', fileName: 'harbour.epub', chapters: source })
    storage.setItem(epubBookStorageKey(key), serializeEpubBookProgress({
      excludedIds: ['epub-chapter-2', 'epub-chapter-2', '  '],
      completedIds: ['epub-chapter-1'],
      selectedChapterId: 'epub-chapter-3',
    }))

    const progress = loadEpubBookProgress(key, storage)
    expect(progress.excludedIds).toEqual(['epub-chapter-2'])
    expect(progress.completedIds).toEqual(['epub-chapter-1'])
    expect(progress.selectedChapterId).toBe('epub-chapter-3')
    expect(progress.updatedAt).toBeGreaterThan(0)

    const restored = applyEpubBookProgress(createEpubMapping(source), progress)
    expect(restored.map((chapter) => chapter.included)).toEqual([true, false, true])
  })

  it('never throws on unavailable or corrupt stored progress', () => {
    const key = 'epub-broken'
    expect(loadEpubBookProgress(key, null)).toEqual({ excludedIds: [], completedIds: [], selectedChapterId: null, updatedAt: 0 })
    expect(loadEpubBookProgress('', memoryStorage())).toEqual({ excludedIds: [], completedIds: [], selectedChapterId: null, updatedAt: 0 })
    const storage = memoryStorage({ [epubBookStorageKey(key)]: '{not json' })
    expect(loadEpubBookProgress(key, storage).excludedIds).toEqual([])
    const listStorage = memoryStorage({ [epubBookStorageKey(key)]: '["nope"]' })
    expect(loadEpubBookProgress(key, listStorage).selectedChapterId).toBeNull()
    const throwing = { getItem: () => { throw new Error('blocked') } }
    expect(loadEpubBookProgress(key, throwing).completedIds).toEqual([])
    expect(applyEpubBookProgress(createEpubMapping(source), loadEpubBookProgress(key, throwing)).every((chapter) => chapter.included)).toBe(true)
  })

  it('tracks finished chapters without duplicates', () => {
    const first = toggleCompletedChapter([], 'epub-chapter-1', true)
    const second = toggleCompletedChapter(first, 'epub-chapter-1', true)
    expect(second).toEqual(['epub-chapter-1'])
    expect(toggleCompletedChapter(second, 'epub-chapter-1', false)).toEqual([])
  })

  it('previews chapter text on a single line', () => {
    expect(chapterPreview('Line one.\n\nLine two.')).toBe('Line one. Line two.')
    const preview = chapterPreview(source[1].text, 40)
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.length).toBeLessThanOrEqual(41)
  })
})
