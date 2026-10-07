import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '~/packages/contract/src/client'

export interface GeoResult {
  name: string
  lat: number
  lon: number
}

// Destination search input. Debounce lives in the change handler (an event
// handler is a sanctioned side-effect site) — the query keys on the
// debounced value, so no useEffect is needed.
export function GeocodeSearch(props: {
  onPick: (result: GeoResult) => void
  placeholder?: string
}) {
  const [input, setInput] = useState('')
  const [debounced, setDebounced] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const query = useQuery({
    queryKey: ['geocode', debounced],
    queryFn: () => api.geocode(debounced),
    enabled: debounced.trim().length >= 3,
    staleTime: 30_000,
  })

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setInput(next)
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(next), 300)
  }

  function handlePick(result: GeoResult) {
    setInput(result.name)
    setDebounced('')
    props.onPick(result)
  }

  const results = query.data?.results ?? []
  const showResults =
    debounced.trim().length >= 3 && (query.isFetching || results.length > 0 || query.isFetched)

  return (
    <div className="relative">
      <input
        value={input}
        onChange={handleChange}
        placeholder={props.placeholder ?? 'Where are you parking near?'}
        autoFocus
        inputMode="search"
        className="h-14 w-full rounded-2xl border border-ink-dim/25 bg-surface-2 px-4 text-lg text-ink placeholder:text-ink-dim/60 outline-none focus:border-accent"
      />
      {showResults ? (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-ink-dim/15 bg-surface-2">
          {query.isFetching && results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-dim">searching…</li>
          ) : null}
          {results.map((r) => (
            <li key={`${r.lat},${r.lon},${r.name}`}>
              <button
                type="button"
                onClick={() => handlePick(r)}
                className="block w-full px-4 py-3 text-left text-base text-ink hover:bg-surface active:bg-surface"
              >
                {r.name}
              </button>
            </li>
          ))}
          {query.isFetched && !query.isFetching && results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-dim">no matches in Málaga</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
