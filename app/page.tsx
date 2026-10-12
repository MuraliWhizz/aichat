"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Source = {
  source: string;
  chunk: number;
  similarity: number;
};

type Message = {
  role: "assistant" | "user";
  content: string;
  sources?: Source[];
};

type UploadResponse = {
  filename: string;
  status: "indexed" | "unchanged";
  chunks: number;
};

type AnswerResponse = {
  answer: string;
  sources: Source[];
};

type ApiStatus = "checking" | "online" | "offline";

const SUGGESTIONS = [
  "Summarize my documents",
  "What are the key points?",
  "Find important dates or numbers",
];

function isUploadResponse(value: unknown): value is UploadResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "filename" in value &&
    typeof value.filename === "string" &&
    "status" in value &&
    (value.status === "indexed" || value.status === "unchanged") &&
    "chunks" in value &&
    typeof value.chunks === "number"
  );
}

function isAnswerResponse(value: unknown): value is AnswerResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "answer" in value &&
    typeof value.answer === "string" &&
    "sources" in value &&
    Array.isArray(value.sources) &&
    value.sources.every(
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

function getErrorMessage(payload: unknown, fallback: string) {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : fallback;
}

function Icon({
  name,
  size = 20,
}: {
  name: "file" | "send" | "spark" | "moon" | "sun" | "stop";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  if (name === "send") {
    return (
      <svg {...common}>
        <path d="m5 12 14-7-4.5 14-2.5-6.5L5 12Z" />
        <path d="m12 12 7-7" />
      </svg>
    );
  }

  if (name === "spark") {
    return (
      <svg {...common}>
        <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
        <path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" />
      </svg>
    );
  }

  if (name === "moon") {
    return (
      <svg {...common}>
        <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" />
      </svg>
    );
  }

  if (name === "sun") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </svg>
    );
  }

  if (name === "stop") {
    return (
      <svg {...common}>
        <path d="M8 8h8v8H8z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M7 3.75h7l4 4v12.5H7a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" />
      <path d="M14 4v4h4M8.5 12h7M8.5 15.5h7" />
    </svg>
  );
}

export default function Home() {
  const fileInput = useRef<HTMLInputElement>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const askController = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [error, setError] = useState("");
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    let preference: string | null = null;
    try {
      preference = window.localStorage.getItem("papertrail-theme");
    } catch (themeError) {
      console.error("Could not read the saved theme preference.", themeError);
    }

    const shouldUseDarkMode =
      preference === "dark" ||
      (preference !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDarkMode(shouldUseDarkMode);
    document.documentElement.classList.toggle("dark", shouldUseDarkMode);
  }, []);

  function toggleDarkMode() {
    const nextDarkMode = !darkMode;
    setDarkMode(nextDarkMode);
    document.documentElement.classList.toggle("dark", nextDarkMode);
    try {
      window.localStorage.setItem(
        "papertrail-theme",
        nextDarkMode ? "dark" : "light",
      );
    } catch (themeError) {
      console.error("Could not save the theme preference.", themeError);
    }
  }

  useEffect(() => {
    let active = true;
    let checking = false;

    async function checkApi() {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!response.ok) throw new Error("The RAG API is unavailable.");
        if (active) setApiStatus("online");
      } catch {
        if (active) setApiStatus("offline");
      } finally {
        checking = false;
      }
    }

    void checkApi();
    const interval = window.setInterval(checkApi, 10_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  async function uploadDocument(file: File) {
    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.set("file", file);

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      const result: unknown = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(result, "Could not index this document."));
      }
      if (!isUploadResponse(result)) {
        throw new Error("The RAG API returned an unexpected indexing response.");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            result.status === "indexed"
              ? `Added ${result.filename} to your knowledge base (${result.chunks} chunks indexed). You can ask me about it now.`
              : `${result.filename} is already in your knowledge base. Ask away.`,
        },
      ]);
      setApiStatus("online");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not index this document.",
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function sendQuestion(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const currentQuestion = question.trim();
    if (!currentQuestion || asking) return;

    setQuestion("");
    setError("");
    setMessages((current) => [
      ...current,
      { role: "user", content: currentQuestion },
    ]);
    const controller = new AbortController();
    askController.current = controller;
    setAsking(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: currentQuestion }),
        signal: controller.signal,
      });
      const result: unknown = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(result, "Could not get an answer."));
      }
      if (!isAnswerResponse(result)) {
        throw new Error("The RAG API returned an unexpected answer.");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: result.answer,
          sources: result.sources,
        },
      ]);
    } catch (askError) {
      if (!controller.signal.aborted) {
        setError(
          askError instanceof Error
            ? askError.message
            : "Could not get an answer.",
        );
      }
    } finally {
      if (askController.current === controller) {
        askController.current = null;
      }
      setAsking(false);
      questionInput.current?.focus();
    }
  }

  function stopAnswer() {
    askController.current?.abort();
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendQuestion();
    }
  }

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-[#f8f8f6] text-[#22231f] dark:bg-[#171a17] dark:text-[#e8ebe6]">
      <header className="flex h-[72px] items-center justify-between border-b border-[#e8e8e3] bg-white px-6 sm:px-10 dark:border-[#303630] dark:bg-[#202520]">
        <a href="/" className="flex items-center gap-3" aria-label="Papertrail home">
          <span className="grid size-9 place-items-center rounded-xl bg-[#263e35] text-white">
            <Icon name="file" size={19} />
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.04em]">
            papertrail
          </span>
        </a>
        <div className="flex items-center gap-4">
          <span
            className="hidden items-center gap-2 text-xs font-medium text-[#777a72] dark:text-[#a5ada4] sm:flex"
            role="status"
          >
            <span
              className={`size-1.5 rounded-full ${
                apiStatus === "online"
                  ? "bg-[#658b70]"
                  : apiStatus === "offline"
                    ? "bg-[#bd5848]"
                    : "animate-pulse bg-[#c4a453]"
              }`}
            />
            {apiStatus === "online"
              ? "Knowledge base connected"
              : apiStatus === "offline"
                ? "API offline"
                : "Connecting…"}
          </span>
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
            aria-pressed={darkMode}
            title={`Switch to ${darkMode ? "light" : "dark"} mode`}
            className="grid size-10 place-items-center rounded-lg border border-[#e7e8e1] text-[#5e655e] transition hover:bg-[#f4f5f1] dark:border-[#3b443b] dark:text-[#d1d8d0] dark:hover:bg-[#2c332c]"
          >
            <Icon name={darkMode ? "sun" : "moon"} size={18} />
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-[#263e35] px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-[#345345] disabled:cursor-wait disabled:opacity-70"
          >
            {uploading ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <span aria-hidden="true">+</span>
            )}
            {uploading ? "Indexing…" : "Add document"}
          </button>
        </div>
      </header>

      <input
        ref={fileInput}
        type="file"
        className="sr-only"
        accept=".pdf,.docx,.pptx,.xlsx,.html,.md,.txt"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadDocument(file);
        }}
      />

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-5 pt-8 sm:px-8 sm:pt-12">
        <div className="mb-7 text-center">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#718175] dark:text-[#a1b6a5]">
            Your documents, understood
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.055em] sm:text-[40px]">
            Ask your documents anything.
          </h1>
          <p className="mt-3 text-sm text-[#777a72] dark:text-[#a5ada4] sm:text-base">
            Chat with your Docling-indexed knowledge base. Add a document any
            time.
          </p>
        </div>

        <section className="flex min-h-[430px] flex-1 flex-col overflow-hidden rounded-2xl border border-[#e7e8e1] bg-white shadow-[0_18px_60px_-42px_rgba(29,41,32,0.28)] dark:border-[#303630] dark:bg-[#202520]">
          <div className="flex items-center justify-between border-b border-[#eeefea] px-5 py-3.5 sm:px-6 dark:border-[#303630]">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-[#edf2ed] text-[#385647] dark:bg-[#303b32] dark:text-[#b1c6b4]">
                <Icon name="spark" size={17} />
              </span>
              <div>
                <p className="text-sm font-medium">Knowledge base chat</p>
                <p className="text-[11px] text-[#81847b] dark:text-[#a5ada4]">
                  {apiStatus === "online"
                    ? "Ask across all indexed documents"
                    : "Connect the RAG API to ask questions"}
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-6 sm:px-7"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className="m-auto flex w-full max-w-lg flex-col items-center py-8 text-center">
                <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-[#edf2ed] text-[#385647] dark:bg-[#303b32] dark:text-[#b1c6b4]">
                  <Icon name="spark" size={21} />
                </span>
                <h2 className="text-lg font-semibold tracking-[-0.03em]">
                  What would you like to know?
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#7b7e76] dark:text-[#a5ada4]">
                  Ask about documents you have already indexed, or add a new
                  file above. No upload is needed to start a chat.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setQuestion(suggestion);
                        questionInput.current?.focus();
                      }}
                      className="rounded-full border border-[#e7e8e1] bg-white px-3.5 py-2 text-xs text-[#5e655e] transition hover:border-[#b8c7ba] hover:bg-[#f8faf7] dark:border-[#3b443b] dark:bg-[#252b25] dark:text-[#c4ccc3] dark:hover:border-[#596b5b] dark:hover:bg-[#2c332c]"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#263e35] text-white">
                      <Icon name="spark" size={14} />
                    </span>
                  )}
                  <div className="max-w-[85%]">
                    <p
                      className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                        message.role === "user"
                          ? "rounded-br-md bg-[#263e35] text-white"
                          : "rounded-bl-md bg-[#f4f5f1] text-[#34362f] dark:bg-[#303630] dark:text-[#e0e5dd]"
                      }`}
                    >
                      {message.content}
                    </p>
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.sources.map((source, sourceIndex) => (
                          <span
                            key={`${source.source}-${source.chunk}-${sourceIndex}`}
                            title={`Similarity ${source.similarity.toFixed(3)}`}
                            className="rounded-full border border-[#e7e8e1] bg-white px-2.5 py-1 text-[11px] text-[#777a72] dark:border-[#3b443b] dark:bg-[#252b25] dark:text-[#b5bdb4]"
                          >
                            Source {sourceIndex + 1} · chunk {source.chunk}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {asking && (
              <div className="flex items-center gap-3">
                <span className="grid size-7 place-items-center rounded-lg bg-[#263e35] text-white">
                  <Icon name="spark" size={14} />
                </span>
                <span className="flex gap-1 rounded-2xl rounded-bl-md bg-[#f4f5f1] px-4 py-4 dark:bg-[#303630]">
                  <span className="size-1.5 animate-bounce rounded-full bg-[#89978c] [animation-delay:-0.2s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-[#89978c] [animation-delay:-0.1s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-[#89978c]" />
                </span>
              </div>
            )}
            <div ref={conversationEnd} />
          </div>

          {apiStatus === "offline" && (
            <div
              role="status"
              className="mx-4 mb-3 rounded-lg border border-[#f0dfd9] bg-[#fff7f4] px-4 py-3 text-xs leading-5 text-[#8b493d] sm:mx-6 dark:border-[#654139] dark:bg-[#382722] dark:text-[#e3a89b]"
            >
              RAG API is not connected. Start it from{" "}
              <code className="rounded bg-white/70 px-1 py-0.5">
                ~/Develop/ai-assistant
              </code>{" "}
              with <code className="rounded bg-white/70 px-1 py-0.5">npm run dev:api</code>.
              This page will reconnect automatically.
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mx-4 mb-3 rounded-lg bg-[#fff2ef] px-4 py-3 text-sm text-[#a33d2d] sm:mx-6 dark:bg-[#382522] dark:text-[#f0a99d]"
            >
              {error}
            </p>
          )}

          <form
            onSubmit={(event) => void sendQuestion(event)}
            className="border-t border-[#eeefea] p-4 sm:px-6 sm:py-5 dark:border-[#303630]"
          >
            <div className="flex items-end gap-2 rounded-xl border border-[#e4e6df] bg-white p-1.5 pl-4 transition focus-within:border-[#9cad9f] dark:border-[#3b443b] dark:bg-[#252b25] dark:focus-within:border-[#718875]">
              <textarea
                ref={questionInput}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleQuestionKeyDown}
                placeholder="Message your knowledge base…"
                aria-label="Message your knowledge base"
                maxLength={4000}
                rows={1}
                disabled={asking}
                className="max-h-36 min-h-10 min-w-0 flex-1 resize-y bg-transparent py-2.5 text-sm leading-5 outline-none placeholder:text-[#a1a39c] disabled:opacity-60 dark:placeholder:text-[#838d83]"
              />
              <button
                type={asking ? "button" : "submit"}
                onClick={asking ? stopAnswer : undefined}
                disabled={!asking && !question.trim()}
                aria-label={asking ? "Stop generating answer" : "Send message"}
                title={asking ? "Stop generating answer" : "Send message"}
                className={`grid size-9 shrink-0 place-items-center rounded-lg text-white transition ${
                  asking
                    ? "bg-[#a33d2d] hover:bg-[#8f3427]"
                    : "bg-[#263e35] hover:bg-[#345345] disabled:cursor-not-allowed disabled:bg-[#e4e7e1] disabled:text-[#a0a49c]"
                }`}
              >
                {asking ? (
                  <Icon name="stop" size={17} />
                ) : (
                  <Icon name="send" size={17} />
                )}
              </button>
            </div>
            <p             className="mt-3 text-center text-[11px] text-[#9a9c95] dark:text-[#8f998f]">
              Enter to send · Shift+Enter for a new line · Answers cite retrieved
              document chunks.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
