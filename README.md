# Papertrail

Papertrail is a Next.js chat UI for the existing Docling RAG backend in the
`ai-assistant` project. Upload a document to index it, then ask questions in the
chat box. The backend retrieves relevant indexed chunks from PostgreSQL/pgvector
and asks the configured Ollama model to answer with sources.

## Run locally

Start the RAG API from the `ai-assistant` project:

```bash
cd /path/to/ai-assistant
npm run dev:api
```

The API calls `.venv-docling/bin/python` itself by default. You do not need to
activate the virtual environment in the Next.js terminal; make sure the venv
dependencies are installed and PostgreSQL/pgvector and Ollama are running.
See the `ai-assistant` README for setup and document-ingestion details.

Then, from this project, point the server-side Next.js routes to the API and
start the chat UI:

```bash
cd /path/to/aichat
RAG_API_URL=http://127.0.0.1:3001 npm run dev
```

Alternatively, put the API URL in `.env.local`:

```env
RAG_API_URL=http://127.0.0.1:3001
```

The UI uploads documents to the API for Docling parsing and indexing, then sends
chat prompts to its `/chat` endpoint. The API URL is only used server-side and
does not need browser CORS access.

Supported uploads are PDF, DOCX, PPTX, XLSX, HTML, Markdown, and plain text,
up to 25 MB. Answers include the retrieved source chunks when available.
