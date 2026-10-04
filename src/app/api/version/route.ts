import { getBuildInfo } from "@/lib/build-info";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = getBuildInfo();
  return Response.json(
    {
      app: info.app,
      commit: info.commit,
      builtAt: info.builtAt,
      version: info.version,
    },
    { status: 200, headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
