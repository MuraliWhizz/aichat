const MAX_FILE_SIZE = 25 * 1024 * 1024;
const RAG_API_URL = (process.env.RAG_API_URL ?? "http://127.0.0.1:3001").replace(
  /\/+$/,
  "",
);

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

  return `The RAG API could not index this document (HTTP ${status}).`;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Upload a document using a multipart form." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json(
      { error: "Choose a document to upload." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: "This file is larger than the 25 MB upload limit." },
      { status: 413 },
    );
  }

  const apiFormData = new FormData();
  apiFormData.set("file", file, file.name);

  let response: Response;
  try {
    response = await fetch(`${RAG_API_URL}/documents`, {
      method: "POST",
      body: apiFormData,
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
  } catch {
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
      { error: "The RAG API returned an invalid response while indexing." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return Response.json(
      { error: getApiError(payload, response.status) },
      { status: response.status },
    );
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("document" in payload) ||
    typeof payload.document !== "object" ||
    payload.document === null ||
    !("status" in payload.document) ||
    (payload.document.status !== "indexed" &&
      payload.document.status !== "unchanged") ||
    !("chunks" in payload.document) ||
    typeof payload.document.chunks !== "number"
  ) {
    return Response.json(
      { error: "The RAG API returned an unexpected indexing response." },
      { status: 502 },
    );
  }

  return Response.json({
    filename: file.name,
    status: payload.document.status,
    chunks: payload.document.chunks,
  });
}
