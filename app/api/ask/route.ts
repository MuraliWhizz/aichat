const RAG_API_URL = (process.env.RAG_API_URL ?? "http://127.0.0.1:3001").replace(
  /\/+$/,
  "",
);

type RagSource = {
  source: string;
  chunk: number;
  similarity: number;
};

type RagResponse = {
  answer: string;
  sources: RagSource[];
};

type ApiError = {
  message?: unknown;
};

function getApiError(payload: unknown, status: number) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload
  ) {
    const message = (payload as ApiError).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
      return message.join(", ");
    }
  }

  return `The RAG API could not answer the question (HTTP ${status}).`;
}

function isRagResponse(payload: unknown): payload is RagResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "answer" in payload &&
    typeof payload.answer === "string" &&
    "sources" in payload &&
    Array.isArray(payload.sources) &&
    payload.sources.every(
      (source) =>
        typeof source === "object" &&
        source !== null &&
        "source" in source &&
        typeof source.source === "string" &&
        "chunk" in source &&
        typeof source.chunk === "number" &&
        "similarity" in source &&
        typeof source.similarity === "number",
    )
  );
}

export async function POST(request: Request) {
  let body: { question?: unknown };
  try {
    body = (await request.json()) as { question?: unknown };
  } catch {
    return Response.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    typeof body.question !== "string" ||
    !body.question.trim() ||
    body.question.length > 4000
  ) {
    return Response.json(
      { error: "Enter a question of up to 4000 characters." },
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch(`${RAG_API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: body.question.trim() }),
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(10 * 60 * 1000),
      ]),
    });
  } catch {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    return Response.json(
      {
        error: `Could not reach the RAG API at ${RAG_API_URL}. Start it from the ai-assistant project with \`npm run dev:api\`.`,
      },
      { status: 502 },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return Response.json(
      { error: "The RAG API returned an invalid answer response." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return Response.json(
      { error: getApiError(payload, response.status) },
      { status: response.status },
    );
  }

  if (!isRagResponse(payload)) {
    return Response.json(
      { error: "The RAG API returned an unexpected answer response." },
      { status: 502 },
    );
  }

  return Response.json(payload);
}
