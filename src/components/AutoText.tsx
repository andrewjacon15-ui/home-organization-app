import { useLayoutEffect, useRef, type ComponentProps, type Ref } from 'react'

type Props = Omit<ComponentProps<'textarea'>, 'rows'> & { ref?: Ref<HTMLTextAreaElement | null> }

/**
 * A text box that grows to show everything typed in it (one line to start), on every screen:
 * it re-measures when its text changes and when its column gets narrower or wider. It sets a
 * minimum height, not a height, so a stylesheet can still stretch it to fill a taller row.
 */
export function AutoText({ ref, className, ...rest }: Props) {
  const own = useRef<HTMLTextAreaElement | null>(null)
  // The stylesheet's own minimum, read before the first measurement replaces it.
  const floor = useRef<number | null>(null)
  const fit = () => {
    const el = own.current
    if (!el) return
    floor.current ??= parseFloat(getComputedStyle(el).minHeight) || 0
    // Squashed flat, scrollHeight is just the text (plus padding); the border is added back.
    el.style.minHeight = '0px'
    el.style.height = '0px'
    const border = el.offsetHeight - el.clientHeight
    const needed = el.scrollHeight + border
    el.style.height = ''
    el.style.minHeight = `${Math.max(needed, floor.current)}px`
  }
  useLayoutEffect(fit, [rest.value])
  useLayoutEffect(() => {
    const el = own.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <textarea
      {...rest}
      rows={1}
      className={`auto-text${className ? ` ${className}` : ''}`}
      ref={(el) => {
        own.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
    />
  )
}
