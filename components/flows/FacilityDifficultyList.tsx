import { useQueries } from '@tanstack/react-query'
import type { Facility } from '~/packages/contract/src/index'
import { api } from '~/packages/contract/src/client'
import { Badge, Button, Card } from '~/packages/ui'
import { nearestFacilities, projectedAtMin } from './geo'
import { toneForVerdict, verdictForProjected } from './verdict'
import type { GeoResult } from './GeocodeSearch'

// "Difficulty at arrival" panel: the three nearest facilities to the picked
// destination, each projected to the driver's ETA — not to now.
export function FacilityDifficultyList(props: {
  dest: GeoResult
  facilities: Facility[]
  onGo: (facility: Facility) => void
}) {
  const { dest, facilities, onGo } = props
  const top = nearestFacilities(facilities, dest.lat, dest.lon, 3)

  const etas = useQueries({
    queries: top.map((f) => ({
      queryKey: ['eta', dest.lat, dest.lon, f.lat, f.lon],
      queryFn: () => api.eta(dest.lat, dest.lon, f.lat, f.lon),
      staleTime: 60_000,
      retry: 1,
    })),
  })

  if (top.length === 0) {
    return (
      <Card className="mt-4">
        <p className="text-sm text-ink-dim">
          no live facilities — is the shim up?
        </p>
      </Card>
    )
  }

  return (
    <Card className="mt-4 p-0">
      <div className="border-b border-ink-dim/15 px-4 py-3">
        <p className="text-xs uppercase tracking-widest text-ink-dim">
          difficulty at your arrival — {dest.name}
        </p>
      </div>
      <ul>
        {top.map((f, i) => {
          const driveMin = etas[i]?.data?.driveMin
          const atArrival =
            driveMin !== undefined ? projectedAtMin(f, driveMin) : undefined
          const verdict =
            atArrival !== undefined ? verdictForProjected(atArrival) : undefined
          return (
            <li
              key={f.id}
              className="flex items-center gap-3 border-b border-ink-dim/10 px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-ink">
                  {f.name}
                </p>
                <p className="text-sm text-ink-dim">
                  {driveMin !== undefined ? `${Math.round(driveMin)} min` : '…'} ·{' '}
                  {atArrival !== undefined
                    ? `~${atArrival} spaces at arrival`
                    : 'projecting…'}
                </p>
              </div>
              {verdict ? (
                <Badge tone={toneForVerdict(verdict)}>{verdict}</Badge>
              ) : null}
              <Button size="md" onClick={() => onGo(f)}>
                GO
              </Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
