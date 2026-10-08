import { useSearchParams } from "one";
import { DriveScreen } from "~/components/flows/DriveScreen";

function parseCoord(raw: string | null): number | undefined {
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export default function DrivePage() {
  const params = useSearchParams();
  return (
    <DriveScreen
      targetId={params.get("to") ?? undefined}
      destLat={parseCoord(params.get("lat"))}
      destLon={parseCoord(params.get("lon"))}
    />
  );
}
