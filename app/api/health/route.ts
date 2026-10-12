const RAG_API_URL = (process.env.RAG_API_URL ?? "http://127.0.0.1:3001").replace(
  /\/+$/,
  "",
);

export async function GET() {
  try {
    const response = await fetch(`${RAG_API_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      return Response.json(
        { error: `RAG API health check failed (HTTP ${response.status}).` },
        { status: 502 },
      );
    }

    return Response.json({ status: "ok" });
  } catch {
    return Response.json(
      {
        error: `Could not reach the RAG API at ${RAG_API_URL}. Start it with \`npm run dev:api\` from the ai-assistant project.`,
      },
      { status: 503 },
    );
  }
}
