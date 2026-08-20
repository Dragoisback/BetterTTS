// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEpubMapping } from '../lib/epub-mapping.ts'
import { EpubChapterPanel, type EpubChapterPanelProps } from './EpubChapterPanel.tsx'

const chapters = createEpubMapping([
  { title: 'Prologue', text: 'The harbour light turned twice before midnight.' },
  { title: 'Chapter One', text: `${'word '.repeat(320)}`.trim() },
  { title: 'Chapter Two', text: 'A short bridge between two longer nights.' },
])

function renderPanel(root: Root, overrides: Partial<EpubChapterPanelProps> = {}) {
  const props: EpubChapterPanelProps = {
    title: 'Harbour Lights',
    fileName: 'harbour.epub',
    chapters,
    completedIds: [],
    selectedChapterId: chapters[0].id,
    speed: 1,
    busy: false,
    filter: 'all',
    sort: 'reading-order',
    loadMode: 'replace',
    autoAdvance: false,
    showPreview: true,
    onFilterChange: vi.fn(),
    onSortChange: vi.fn(),
    onLoadModeChange: vi.fn(),
    onAutoAdvanceChange: vi.fn(),
    onShowPreviewChange: vi.fn(),
    onLoadChapter: vi.fn(),
    onToggleInclude: vi.fn(),
    onToggleCompleted: vi.fn(),
    onBulkInclude: vi.fn(),
    onInvertInclude: vi.fn(),
    onStepChapter: vi.fn(),
    onQueueSelection: vi.fn(),
    onOpenMapping: vi.fn(),
    onClose: vi.fn(),
    onCloseBook: vi.fn(),
    ...overrides,
  }
  act(() => root.render(<EpubChapterPanel {...props} />))
  return props
}

describe('EPUB chapter panel', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  function mount() {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    return { root: root!, container: container! }
  }

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  })

  it('lists every chapter with its size and duration estimate', () => {
    const view = mount()
    renderPanel(view.root)
    const rows = view.container.querySelectorAll('.epub-chapter-row')
    expect(rows).toHaveLength(3)
    expect(view.container.textContent).toContain('Prologue')
    expect(view.container.textContent).toContain('Chapter Two')
    // 320 words at 155 wpm rounds to just over two minutes.
    expect(view.container.textContent).toContain('~2m 4s')
    expect(view.container.querySelector('.epub-chapter-row.active')?.textContent).toContain('Prologue')
  })

  it('loads the whole chapter into the script box on click, appending when Alt is held', () => {
    const view = mount()
    const props = renderPanel(view.root)
    const buttons = view.container.querySelectorAll<HTMLButtonElement>('.epub-chapter-open')
    act(() => buttons[1].click())
    expect(props.onLoadChapter).toHaveBeenCalledWith(chapters[1].id, 'replace')

    act(() => buttons[2].dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true })))
    expect(props.onLoadChapter).toHaveBeenLastCalledWith(chapters[2].id, 'append')
  })

  it('keeps the ticks and the done markers under the reader control', () => {
    const view = mount()
    const props = renderPanel(view.root, { completedIds: [chapters[0].id] })
    const tick = view.container.querySelector<HTMLInputElement>('.epub-chapter-tick input')!
    expect(tick.checked).toBe(true)
    act(() => tick.click())
    expect(props.onToggleInclude).toHaveBeenCalledWith(chapters[0].id, false)

    const doneButton = view.container.querySelector<HTMLButtonElement>('.epub-chapter-row-actions button')!
    expect(doneButton.textContent).toContain('Done')
    act(() => doneButton.click())
    expect(props.onToggleCompleted).toHaveBeenCalledWith(chapters[0].id, false)
    expect(view.container.textContent).toContain('1 / 3 generated (33%)')
  })

  it('filters chapters by search text and scopes bulk actions to the matches', () => {
    const view = mount()
    const props = renderPanel(view.root)
    const search = view.container.querySelector<HTMLInputElement>('.epub-chapter-search input')!
    act(() => {
      // React tracks the DOM value, so a controlled input needs the native setter.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'harbour light')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(view.container.querySelectorAll('.epub-chapter-row')).toHaveLength(1)

    const bulkButtons = view.container.querySelectorAll<HTMLButtonElement>('.epub-chapter-bulk button')
    expect(bulkButtons[0].textContent).toContain('Tick shown')
    act(() => bulkButtons[1].click())
    expect(props.onBulkInclude).toHaveBeenCalledWith(false, [chapters[0].id])
  })

  it('disables chapter loading while a render is running', () => {
    const view = mount()
    renderPanel(view.root, { busy: true })
    const buttons = view.container.querySelectorAll<HTMLButtonElement>('.epub-chapter-open')
    expect([...buttons].every((button) => button.disabled)).toBe(true)
  })

  it('reports the ticked selection in the queue action', () => {
    const view = mount()
    const props = renderPanel(view.root, {
      chapters: chapters.map((chapter, index) => ({ ...chapter, included: index !== 1 })),
    })
    const queueButton = [...view.container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Queue 2 ticked chapters'))
    expect(queueButton).toBeTruthy()
    act(() => queueButton!.click())
    expect(props.onQueueSelection).toHaveBeenCalledTimes(1)
  })
})
