import { useState } from 'react'
import { metricText, toMetric } from '@shared/recipes/metric.js'
import { scaleLine } from '@shared/recipes/scaler.js'

const METRIC_KEY = 'recipe-metric'

/** Metric or US amounts, remembered on this device. */
export function useMetric(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(METRIC_KEY) === '1'
    } catch {
      return false
    }
  })
  const set = (v: boolean) => {
    setOn(v)
    try {
      if (v) localStorage.setItem(METRIC_KEY, '1')
      else localStorage.removeItem(METRIC_KEY)
    } catch {
      // Remembering is a convenience.
    }
  }
  return [on, set]
}

/** An ingredient line at this scale, in metric if asked. */
export const amountText = (line: string, factor: number, metric: boolean) => (metric ? toMetric(scaleLine(line, factor)) : scaleLine(line, factor))
/** A step, with its oven temperature and pan size in metric if asked. */
export const stepText = (step: string, metric: boolean) => (metric ? metricText(step) : step)

/** Smallest and largest batch: an eighth to sixteen times the recipe. */
export const clampScale = (f: number) => Math.max(0.125, Math.min(16, Math.round(f * 1000) / 1000))
