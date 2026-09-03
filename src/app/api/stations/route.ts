import { STATIONS } from "@/data/stations";
import { HOSPITALS } from "@/data/hospitals";
import { json } from "@/lib/api";

export async function GET() {
  return json({ stations: STATIONS, hospitals: HOSPITALS });
}
