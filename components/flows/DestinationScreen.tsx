import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'one'
import type { Facility } from '~/packages/contract/src/index'
import { api } from '~/packages/contract/src/client'
import { Chip } from '~/packages/ui'
import { GeocodeSearch, type GeoResult } from './GeocodeSearch'
import { FacilityDifficultyList } from './FacilityDifficultyList'

// F1 pre-drive pick: search → difficulty-at-ETA panel → GO. ≤3 taps to a
// decision, no account, no mode chooser.
export function DestinationScreen() {
  const router = useRouter()
  const [picked, setPicked] = useState<GeoResult | undefined>(undefined)

  const facilitiesQ = useQuery({
    queryKey: ['facilities'],
    queryFn: api.facilities,
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: 1,
  })
  const facilities = facilitiesQ.data?.facilities ?? []

  function handleGo(facility: Facility) {
    if (!picked) return
    const params = new URLSearchParams({
      to: facility.id,
      lat: String(picked.lat),
      lon: String(picked.lon),
    })
    router.push(`/drive?${params.toString()}`)
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-surface p-4">
      <header className="pb-4 pt-2">
        <h1 className="text-xl font-bold text-ink">Karro</h1>
        <p className="text-sm text-ink-dim">
          Parking that'll still be there when you arrive.
        </p>
      </header>

      <GeocodeSearch onPick={setPicked} />

      {picked ? (
        <FacilityDifficultyList
          dest={picked}
          facilities={facilities}
          onGo={handleGo}
        />
      ) : (
        <div className="mt-6 flex flex-wrap gap-2">
          <Chip onClick={() => setPicked(undefined)}>Free</Chip>
          <Chip onClick={() => setPicked(undefined)}>SARE</Chip>
          <Chip onClick={() => setPicked(undefined)}>Resident permit</Chip>
        </div>
      )}

      {facilitiesQ.isError ? (
        <p className="mt-4 text-sm text-hard">
          live feed unreachable — check the shim
        </p>
      ) : null}
    </div>
  )
}
