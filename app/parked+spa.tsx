import { useSearchParams } from 'one'
import { ParkedScreen } from '~/components/flows/ParkedScreen'

function parseCoord(raw: string | null): number | undefined {
  if (raw === null || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export default function ParkedPage() {
  const params = useSearchParams()
  return (
    <ParkedScreen
      lat={parseCoord(params.get('lat'))}
      lon={parseCoord(params.get('lon'))}
      name={params.get('name') ?? undefined}
    />
  )
}
