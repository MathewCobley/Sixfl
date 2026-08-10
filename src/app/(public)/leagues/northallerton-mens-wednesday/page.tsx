import { permanentRedirect } from "next/navigation";

const LIVE_NORTHALLERTON_LEAGUE =
  "/leagues/sixfl-mens-northallerton-wednesday-league";

export default function NorthallertonMensWednesdayLeaguePage() {
  permanentRedirect(LIVE_NORTHALLERTON_LEAGUE);
}
