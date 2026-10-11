import { Component, type ErrorInfo, type ReactNode } from 'react'
import { isStaleBuildError, reloadForNewBuild } from '../lib/staleBuild'
import { reloadToLatest } from '../lib/version'

/** How long a broken page waits before trying again by itself (the wall display has nobody to tap). */
export const RETRY_MS = 60_000

interface Props {
  children: ReactNode
  /** Covers the whole screen (the app itself broke), rather than one page. */
  full?: boolean
}

interface State {
  error: Error | null
}

/**
 * Keeps one broken page (bad data, a bug) from blanking the whole app: the side bar stays, the
 * page says what happened and tries again by itself a minute later. A page whose files a new
 * release replaced reloads into that release instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  private retry: ReturnType<typeof setTimeout> | undefined

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
    if (isStaleBuildError(error) && reloadForNewBuild()) return
    clearTimeout(this.retry)
    this.retry = setTimeout(this.reset, RETRY_MS)
  }

  componentWillUnmount() {
    clearTimeout(this.retry)
  }

  reset = () => {
    clearTimeout(this.retry)
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const box = (
      <div className="crash card" role="alert">
        <h2 className="crash__title">Something went wrong here.</h2>
        <p>It will try again by itself in a minute. Everything your household has added is safe.</p>
        <div className="row">
          <button type="button" className="button button--primary" onClick={this.reset}>
            Try again
          </button>
          <button type="button" className="button" onClick={() => void reloadToLatest()}>
            Reload the app
          </button>
        </div>
        <p className="crash__detail">{error.message}</p>
      </div>
    )
    return this.props.full ? <main className="center-screen">{box}</main> : box
  }
}
