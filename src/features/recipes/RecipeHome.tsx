import type { ReactNode } from 'react'
import { BackIcon, BookIcon, ChefHatIcon, GlobeIcon, NextIcon, PencilIcon, StarIcon } from '../../components/Icons'
import type { CatalogEntry } from './catalog'

export type RecipeView = 'home' | 'book' | 'kitchen' | 'web'

const TITLES: Record<Exclude<RecipeView, 'home'>, string> = {
  book: 'Our recipes',
  kitchen: "What's in my kitchen",
  web: 'Search the web',
}

/** "‹ Recipes  /  Our recipes": always one tap back to the three choices. */
export function RecipeTrail({ view, onHome }: { view: Exclude<RecipeView, 'home'>; onHome: () => void }) {
  return (
    <nav className="recipe-trail" aria-label="Recipes">
      <button type="button" className="recipe-trail__back" onClick={onHome}>
        <BackIcon size={20} /> Recipes
      </button>
      <h1 className="page-title recipe-trail__title">{TITLES[view]}</h1>
    </nav>
  )
}

function Choice({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" className="recipe-choice" onClick={onClick}>
      <span className="recipe-choice__icon" aria-hidden>
        {icon}
      </span>
      <span className="recipe-choice__text">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
      <NextIcon className="recipe-choice__go" size={22} />
    </button>
  )
}

/** The Recipes start: clear ways in (or write your own), and favorites one tap away. */
export function RecipeHome({ entries, onlineReady, onPick, onOpen, onNew }: { entries: CatalogEntry[] | null; onlineReady: boolean; onPick: (v: Exclude<RecipeView, 'home'>) => void; onOpen: (id: string) => void; onNew: () => void }) {
  const count = entries?.length ?? 0
  const favorites = (entries ?? []).filter((e) => e.f).slice(0, 8)
  return (
    <section className="recipe-home" aria-label="Recipes">
      <h1 className="page-title">Recipes</h1>
      <p className="muted recipe-home__ask">What would you like to do?</p>
      <div className="recipe-choices">
        <Choice
          icon={<BookIcon size={28} />}
          title="Our recipes"
          text={entries === null ? 'Loading…' : count ? `Browse and search the ${count} recipe${count === 1 ? '' : 's'} we've saved` : 'Add family favorites or upload a cookbook'}
          onClick={() => onPick('book')}
        />
        <Choice icon={<ChefHatIcon size={28} />} title="What's in my kitchen" text="Tell us what you have and get the best matches" onClick={() => onPick('kitchen')} />
        <Choice
          icon={<GlobeIcon size={28} />}
          title="Search the web"
          text={onlineReady ? 'Find a new recipe by name, or paste a link' : 'Paste a link to any recipe page'}
          onClick={() => onPick('web')}
        />
        <Choice icon={<PencilIcon size={28} />} title="Write a recipe" text="Add your own, one ingredient and one step at a time" onClick={onNew} />
      </div>
      {favorites.length > 0 && (
        <div className="recipe-home__favorites">
          <h2 className="recipe-home__sub">
            <StarIcon size={18} fill="currentColor" /> Favorites
          </h2>
          <div className="row recipe-home__chips">
            {favorites.map((e) => (
              <button key={e.id} type="button" className="chip" onClick={() => onOpen(e.id)}>
                {e.t}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
