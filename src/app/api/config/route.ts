import { publicConfig } from "@/lib/config";
import { json } from "@/lib/api";

export async function GET() {
  return json(publicConfig());
}
