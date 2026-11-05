import { useEffect, useRef } from 'react'

/** Keeps the screen awake while a chart is being performed. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let disposed = false

    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (disposed) {
          await lock.release()
          return
        }
        sentinel = lock
      } catch {
        // Wake lock is best-effort; the iPad may refuse in some modes.
      }
    }

    void request()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => undefined)
    }
  }, [active])
}

/**
 * iOS Safari only allows the Fullscreen API for video, so charts use a CSS
 * "stage mode" instead and this is just a best-effort extra on desktop.
 */
export function requestNativeFullscreen(): void {
  const element = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>
  }
  try {
    if (element.requestFullscreen) void element.requestFullscreen().catch(() => undefined)
    else if (element.webkitRequestFullscreen) void element.webkitRequestFullscreen().catch(() => undefined)
  } catch {
    // Not supported; stage mode still hides the chrome.
  }
}

export function exitNativeFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    const webkit = (document as Document & { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen
    if (webkit) void webkit.call(document).catch(() => undefined)
  } catch {
    // Nothing to exit.
  }
}

interface ScrollOptions {
  active: boolean
  speed: number
  onFinished?: () => void
}

/** Smooth pixel-based autoscroll driven by requestAnimationFrame. */
export function useAutoscroll(
  ref: React.RefObject<HTMLElement | null>,
  { active, speed, onFinished }: ScrollOptions,
): void {
  const finished = useRef(onFinished)
  finished.current = onFinished

  useEffect(() => {
    const element = ref.current
    if (!element || !active) return

    let frame = 0
    let last = performance.now()
    let carry = 0

    const step = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1)
      last = now
      carry += delta * speed
      if (carry >= 0.5) {
        const before = element.scrollTop
        element.scrollTop = before + carry
        carry = 0
        if (element.scrollTop === before && before + element.clientHeight >= element.scrollHeight - 2) {
          finished.current?.()
          return
        }
      }
      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [ref, active, speed])
}

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return EDITABLE.has(target.tagName) || target.isContentEditable
}

export interface HotkeyHandlers {
  onToggleScroll: () => void
  onPage: (direction: -1 | 1) => void
  onNextSong?: () => void
  onPreviousSong?: () => void
  onTop?: () => void
  onBottom?: () => void
  onFullscreen?: () => void
}

/** Bluetooth page turners present as keyboards, so this covers most pedals. */
export function usePerformanceHotkeys(handlers: HotkeyHandlers): void {
  const latest = useRef(handlers)
  latest.current = handlers

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const current = latest.current

      switch (event.key) {
        case ' ':
        case 'p':
        case 'P':
          event.preventDefault()
          current.onToggleScroll()
          break
        case 'ArrowRight':
          event.preventDefault()
          if (current.onNextSong) current.onNextSong()
          else current.onPage(1)
          break
        case 'ArrowLeft':
          event.preventDefault()
          if (current.onPreviousSong) current.onPreviousSong()
          else current.onPage(-1)
          break
        case 'ArrowDown':
        case 'PageDown':
          event.preventDefault()
          current.onPage(1)
          break
        case 'ArrowUp':
        case 'PageUp':
          event.preventDefault()
          current.onPage(-1)
          break
        case 'Home':
          event.preventDefault()
          current.onTop?.()
          break
        case 'End':
          event.preventDefault()
          current.onBottom?.()
          break
        case 'f':
        case 'F':
          event.preventDefault()
          current.onFullscreen?.()
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
