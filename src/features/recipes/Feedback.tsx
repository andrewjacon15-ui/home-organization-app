import { SearchIcon } from '../../components/Icons'

/**
 * While the mic is on: moving sound bars, and the words heard so far, so you can see it's
 * catching what you say. The bars jump each time a new word arrives.
 */
export function ListeningPanel({ preparing, heard }: { preparing: boolean; heard: string }) {
  return (
    <div className={`listening${preparing ? ' listening--preparing' : ''}`} role="status">
      <span className="listening__bars" key={heard.length} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} />
        ))}
      </span>
      <span className="listening__text">
        {preparing ? (
          'Getting voice ready… The first time, this downloads about 40 MB to this screen.'
        ) : heard ? (
          <>
            <span className="listening__label">Heard</span> “{heard}”
          </>
        ) : (
          'Listening… say what you have, like “chicken, rice, broccoli”.'
        )}
      </span>
    </div>
  )
}

/** While a web search runs: a moving magnifier and placeholder cards where the results will go. */
export function SearchingPanel({ what }: { what: string }) {
  return (
    <div className="searching" role="status">
      <p className="searching__head">
        <span className="searching__icon" aria-hidden>
          <SearchIcon size={20} />
        </span>
        Searching {what}…
      </p>
      <ol className="searching__cards" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="searching__card">
            <span className="searching__line searching__line--title" />
            <span className="searching__line" />
            <span className="searching__line searching__line--short" />
          </li>
        ))}
      </ol>
    </div>
  )
}
