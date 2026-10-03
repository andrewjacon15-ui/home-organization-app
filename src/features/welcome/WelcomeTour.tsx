import { useState } from 'react'
import type { Tab } from '../../components/navTabs'
import type { TourStep } from './welcome'
import { BackIcon, NextIcon } from '../../components/Icons'

interface Props {
  steps: TourStep[]
  onNavigate: (tab: Tab) => void
  onClose: () => void
}

/** A short walkthrough, one card at a time. Skip, Back and Next; the last card closes it. */
export function WelcomeTour({ steps, onNavigate, onClose }: Props) {
  const [i, setI] = useState(0)
  const step = steps[i]
  const last = i === steps.length - 1
  return (
    <div className="overlay welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="overlay__panel welcome__card">
        <p className="welcome__count">
          {i + 1} of {steps.length}
        </p>
        <h2 id="welcome-title">{step.title}</h2>
        <p className="welcome__text">{step.text}</p>
        {step.go && (
          <button
            type="button"
            className="link welcome__go"
            onClick={() => {
              onNavigate(step.go!.tab)
              onClose()
            }}
          >
            {step.go.label}
          </button>
        )}
        <div className="welcome__dots" aria-hidden>
          {steps.map((_, k) => (
            <span key={k} className={`welcome__dot${k === i ? ' welcome__dot--on' : ''}`} />
          ))}
        </div>
        <div className="welcome__nav">
          <button type="button" className="link" onClick={onClose}>
            {last ? 'Close' : 'Skip'}
          </button>
          <span className="row">
            {i > 0 && (
              <button type="button" className="button" onClick={() => setI(i - 1)}>
                <BackIcon size={18} /> Back
              </button>
            )}
            <button type="button" className="button button--primary" onClick={() => (last ? onClose() : setI(i + 1))}>
              {last ? 'Get started' : 'Next'} {!last && <NextIcon size={18} />}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
