// src/hooks/useChatWindow.ts

import { useState, useEffect, useRef } from "react";
import { db, analytics, logEvent } from "../services/firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import {
  listenMessages,
  createMessage,
  updateMessage,
  deleteMessages,
} from "../services/message";
import { fetchTokenCount } from "../services/tokenizer";
import {
  callDeepseekFim,
  streamDeepseek,
  type ChatCompletionMessageParam,
  type NativeChunk,
} from "../services/deepseek";
import type { Message } from "../types/index";
import { useTranslation } from "../contexts/LanguageContext";
import { createThread } from "../services/thread";
import { replayMessage, runToolConversation, parseRequestOptions, type ToolPass } from "./toolConversation";
import { withSearchTools, searchHandlers } from "../services/deepseekSearch";
import { attachmentBlocks, type Attachment } from "../services/deepseekAttachments";
import { DEFAULT_MODEL, getModelLimits } from "../services/deepseekModels";

type ChatRole = "system" | "user" | "assistant";
type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export function useChatWindow(
  threadId: string,
  apiKey: string,
  userId?: string
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant."
  );
  const [systemMsgId, setSystemMsgId] = useState<string | null>(null);
  const [threadTitle, setThreadTitle] = useState("New Chat");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<"low" | "high" | "max">("high");
  const [toolChoice, setToolChoice] = useState("auto");
  const [input, setInput] = useState("");
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [waitingForFirstChunk, setWaitingForFirstChunk] = useState(false);
  const [showSystemBox, setShowSystemBox] = useState(false);
  const [frequencyPenalty, setFrequencyPenalty] = useState(0);
  const [presencePenalty, setPresencePenalty] = useState(0);
  const [temperature, setTemperature] = useState(1);
  const [topP, setTopP] = useState(1);
  const [maxTokens, setMaxTokens] = useState(
    getModelLimits(DEFAULT_MODEL).defaultMaxTokens
  );
  const [toolsJson, setToolsJson] = useState("");
  const [toolsStrict, setToolsStrict] = useState(false);
  const [toolsJsonError, setToolsJsonError] = useState<string | null>(null);
  const [toolHandlersJson, setToolHandlersJson] = useState("");
  const [toolHandlersJsonError, setToolHandlersJsonError] = useState<
    string | null
  >(null);
  const [jsonOutput, setJsonOutput] = useState(false);
  const [prefixCompletionEnabled, setPrefixCompletionEnabled] = useState(false);
  const [cumulativeInputTokens, setCumulativeInputTokens] = useState(0);
  const [cumulativeOutputTokens, setCumulativeOutputTokens] = useState(0);
  const [systemPromptTokenCount, setSystemPromptTokenCount] = useState<
    number | null
  >(null);
  const [systemPromptTokenText, setSystemPromptTokenText] = useState("");
  const [stopSequencesRaw, setStopSequencesRaw] = useState("");
  const [fimPrefix, setFimPrefix] = useState("");
  const [fimSuffix, setFimSuffix] = useState("");
  const [fimMaxTokens, setFimMaxTokens] = useState(128);
  const toolsJsonDraftRef = useRef(false);
  const toolHandlersDraftRef = useRef(false);
  const stopSequencesDraftRef = useRef(false);
  const fimPrefixDraftRef = useRef(false);
  const fimSuffixDraftRef = useRef(false);
  const fimMaxTokensDraftRef = useRef(false);

  /**
   * “いま生成中のアシスタントメッセージID”
   *  - MessageListに渡して応答待ちの表示に使用
   */
  const [assistantMsgId, setAssistantMsgId] = useState<string | null>(null);

  /**
   * “ローカルだけで保持する、途中生成中のアシスタントの本文”
   *  - contentに対するreasoning_contentに相当する
   *  - Firestoreには保存しない
   */
  const [assistantCoT, setAssistantCoT] = useState<string | null>(null);
  /**
   * “ローカルだけで保持する、途中生成中のアシスタントの本文”
   *  - Streamの途中経過をリアルタイムでUI表示するために使う
   *  - Firestoreに書くのは最後1回
   */
  const [assistantDraft, setAssistantDraft] = useState("");
  const [assistantFinishReason, setAssistantFinishReason] = useState<
    string | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiFormat, setApiFormat] = useState<"chat" | "responses" | "messages">("chat");
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [requestOptionsJson, setRequestOptionsJson] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [settingsLoadedThread, setSettingsLoadedThread] = useState<string | null>(null);
  const attachmentDraftThreadRef = useRef<string | null>(null);
  const { t } = useTranslation();
  const { defaultMaxTokens, maxTokensLimit } = getModelLimits(model);
  const previousDefaultMaxTokensRef = useRef(defaultMaxTokens);
  const settingsThreadRef = useRef<string | null>(null);

  useEffect(() => {
    const previousDefault = previousDefaultMaxTokensRef.current;
    const shouldReplaceDefault = maxTokens === previousDefault;
    const shouldClamp = maxTokens > maxTokensLimit;
    if (shouldReplaceDefault || shouldClamp) {
      setMaxTokens(Math.min(maxTokensLimit, defaultMaxTokens));
    }
    previousDefaultMaxTokensRef.current = defaultMaxTokens;
  }, [defaultMaxTokens, maxTokens, maxTokensLimit]);

  const settingsRef = useRef({
    apiFormat, streamEnabled, requestOptionsJson, searchEnabled,
    model,
    frequencyPenalty,
    presencePenalty,
    temperature,
    topP,
    maxTokens,
    thinkingEnabled,
    reasoningEffort,
    toolChoice,
    systemPrompt,
    toolsJson,
    toolsStrict,
    toolHandlersJson,
    jsonOutput,
    prefixCompletionEnabled,
    stopSequencesRaw,
    fimPrefix,
    fimSuffix,
    fimMaxTokens,
  });

  const generationRef = useRef<AbortController | null>(null);

  function validateGeneration(settings: typeof settingsRef.current, imageAttachments: Attachment[] = []) {
    parseRequestOptions(settings.requestOptionsJson);
    if (settings.apiFormat !== "chat" && (settings.prefixCompletionEnabled || settings.fimPrefix.trim() || settings.fimSuffix.trim())) {
      throw new Error("Prefix completion and FIM require the chat API format.");
    }
    if ((settings.fimPrefix.trim() || settings.fimSuffix.trim()) && imageAttachments.length) {
      throw new Error("FIM does not support image attachments.");
    }
  }

  useEffect(() => () => {
    generationRef.current?.abort();
    chatStreamRef.current?.abort();
  }, [threadId]);

  const chatStreamRef = useRef<Awaited<
    ReturnType<typeof streamDeepseek>
  > | null>(null);

  const buildDraftKey = (suffix: string) => `thread-${threadId}-draft-${suffix}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(buildDraftKey("attachments"));
      const draft: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(draft)) throw new Error("Invalid attachment draft.");
      attachmentBlocks(draft);
      setAttachments(draft);
    } catch (error) {
      setAttachments([]);
      setErrorMessage(error instanceof Error ? error.message : "Invalid attachment draft.");
    }
  }, [threadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (attachmentDraftThreadRef.current !== threadId) {
      attachmentDraftThreadRef.current = threadId;
      return;
    }
    if (attachments.length) {
      window.localStorage.setItem(buildDraftKey("attachments"), JSON.stringify(attachments));
    } else {
      window.localStorage.removeItem(buildDraftKey("attachments"));
    }
  }, [threadId, attachments]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draftToolsJson = window.localStorage.getItem(buildDraftKey("toolsJson"));
    const draftToolHandlersJson = window.localStorage.getItem(
      buildDraftKey("toolHandlersJson")
    );
    const draftStopSequencesRaw = window.localStorage.getItem(
      buildDraftKey("stopSequencesRaw")
    );
    const draftFimPrefix = window.localStorage.getItem(buildDraftKey("fimPrefix"));
    const draftFimSuffix = window.localStorage.getItem(buildDraftKey("fimSuffix"));
    const draftFimMaxTokens = window.localStorage.getItem(buildDraftKey("fimMaxTokens"));
    const draftInput = window.localStorage.getItem(buildDraftKey("input"));

    if (draftToolsJson !== null) {
      toolsJsonDraftRef.current = true;
      setToolsJson(draftToolsJson);
    } else {
      toolsJsonDraftRef.current = false;
    }
    if (draftToolHandlersJson !== null) {
      toolHandlersDraftRef.current = true;
      setToolHandlersJson(draftToolHandlersJson);
    } else {
      toolHandlersDraftRef.current = false;
    }
    if (draftStopSequencesRaw !== null) {
      stopSequencesDraftRef.current = true;
      setStopSequencesRaw(draftStopSequencesRaw);
    } else {
      stopSequencesDraftRef.current = false;
    }
    if (draftFimPrefix !== null) {
      fimPrefixDraftRef.current = true;
      setFimPrefix(draftFimPrefix);
    } else {
      fimPrefixDraftRef.current = false;
    }
    if (draftFimSuffix !== null) {
      fimSuffixDraftRef.current = true;
      setFimSuffix(draftFimSuffix);
    } else {
      fimSuffixDraftRef.current = false;
    }
    if (draftFimMaxTokens !== null) {
      fimMaxTokensDraftRef.current = true;
      const parsed = Number.parseInt(draftFimMaxTokens, 10);
      if (!Number.isNaN(parsed)) {
        setFimMaxTokens(parsed);
      }
    } else {
      fimMaxTokensDraftRef.current = false;
    }
    if (draftInput !== null) {
      setInput(draftInput);
    }
  }, [threadId, setInput, setToolHandlersJson, setToolsJson]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(buildDraftKey("toolsJson"), toolsJson);
  }, [threadId, toolsJson]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(buildDraftKey("toolHandlersJson"), toolHandlersJson);
  }, [threadId, toolHandlersJson]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(buildDraftKey("stopSequencesRaw"), stopSequencesRaw);
  }, [threadId, stopSequencesRaw]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(buildDraftKey("fimPrefix"), fimPrefix);
  }, [threadId, fimPrefix]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(buildDraftKey("fimSuffix"), fimSuffix);
  }, [threadId, fimSuffix]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(buildDraftKey("fimMaxTokens"), String(fimMaxTokens));
  }, [threadId, fimMaxTokens]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(buildDraftKey("input"), input);
  }, [threadId, input]);

  useEffect(() => {
    settingsRef.current = {
      apiFormat, streamEnabled, requestOptionsJson, searchEnabled,
      model,
      frequencyPenalty,
      presencePenalty,
      temperature,
      topP,
      maxTokens,
      thinkingEnabled,
      reasoningEffort,
      toolChoice,
      systemPrompt,
      toolsJson,
      toolsStrict,
      toolHandlersJson,
      jsonOutput,
      prefixCompletionEnabled,
      stopSequencesRaw,
      fimPrefix,
      fimSuffix,
      fimMaxTokens,
    };
    if (settingsThreadRef.current !== threadId) return;
    const timeout = setTimeout(() => {
      const { systemPrompt: _systemPrompt, ...settings } = settingsRef.current;
      void updateDoc(doc(db, "threads", threadId), settings).catch((error) => {
        console.error("[saveThreadSettings] Failed:", error);
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [
    apiFormat, streamEnabled, requestOptionsJson, searchEnabled,
    threadId,
    model,
    frequencyPenalty,
    presencePenalty,
    temperature,
    topP,
    maxTokens,
    thinkingEnabled,
    reasoningEffort,
    toolChoice,
    systemPrompt,
    toolsJson,
    toolsStrict,
    toolHandlersJson,
    jsonOutput,
    prefixCompletionEnabled,
    stopSequencesRaw,
    fimPrefix,
    fimSuffix,
    fimMaxTokens,
  ]);

  const parseToolsJson = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { tools: undefined };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        return { error: t("common.toolsJsonInvalid") };
      }
      return { tools: parsed };
    } catch (error) {
      return { error: t("common.toolsJsonInvalid") };
    }
  };

  const parseToolHandlersJson = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { handlers: undefined };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: t("common.toolHandlersJsonInvalid") };
      }
      return { handlers: parsed as Record<string, unknown> };
    } catch (error) {
      return { error: t("common.toolHandlersJsonInvalid") };
    }
  };

  const applyStrictToTools = (tools: unknown[], strict: boolean) => {
    if (!strict) return tools;
    return tools.map((tool) => {
      if (!tool || typeof tool !== "object") return tool;
      const record = tool as Record<string, unknown>;
      if (record.type !== "function") return tool;
      const fn = record.function;
      if (!fn || typeof fn !== "object") return tool;
      return {
        ...record,
        function: {
          ...(fn as Record<string, unknown>),
          strict: true,
        },
      };
    });
  };

  type ToolingResult = {
    toolConfig?: { tools?: unknown[]; strict?: boolean };
    error?: string;
  };

  const buildToolConfig = (
    rawJson: string,
    strict: boolean,
    enableSearch = searchEnabled
  ): ToolingResult => {
    const parsed = parseToolsJson(rawJson);
    if (parsed.error) {
      setErrorMessage(parsed.error);
      setToolsJsonError(parsed.error);
      return { error: parsed.error };
    }
    setToolsJsonError(null);
    let tools: unknown[];
    try {
      tools = withSearchTools(parsed.tools, enableSearch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToolsJsonError(message);
      setErrorMessage(message);
      return { error: message };
    }
    if (tools.length === 0) {
      return { toolConfig: undefined };
    }
    return {
      toolConfig: {
        tools: applyStrictToTools(tools, strict),
        strict,
      },
    };
  };

  const buildToolHandlers = (rawJson: string, enableSearch = searchEnabled) => {
    const parsed = parseToolHandlersJson(rawJson);
    if (parsed.error) {
      setErrorMessage(parsed.error);
      setToolHandlersJsonError(parsed.error);
      return { error: parsed.error };
    }
    setToolHandlersJsonError(null);
    return { handlers: enableSearch ? {
      ...parsed.handlers, ...searchHandlers(apiKey, generationRef.current?.signal),
    } : parsed.handlers };
  };

  const parseStopSequences = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => typeof item === "string");
        }
      } catch {
        return undefined;
      }
    }
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  const buildRequestConfig = (
    toolConfig: { tools?: unknown[]; strict?: boolean } | undefined,
    jsonOutputEnabled: boolean,
    stopRaw: string,
    useBeta: boolean
  ) => ({
    ...(toolConfig ?? {}),
    toolChoice: settingsRef.current.toolChoice,
    responseFormat: jsonOutputEnabled ? { type: "json_object" } : undefined,
    stop: parseStopSequences(stopRaw),
    useBeta,
  });

  const applyPrefixCompletion = (
    conversation:
      | ChatCompletionMessageParam[]
      | { role: ChatRole; content: string }[],
    enabled: boolean
  ): ChatCompletionMessageParam[] => {
    if (!enabled) {
      return conversation as ChatCompletionMessageParam[];
    }
    const base = conversation as ChatCompletionMessageParam[];
    const last = base[base.length - 1];
    if (!last || last.role !== "assistant") {
      return [
        ...base,
        {
          role: "assistant",
          content: "",
          prefix: true,
        },
      ];
    }
    return [
      ...base.slice(0, -1),
      {
        ...last,
        prefix: true,
      },
    ];
  };

  const resolveToolCalls = async (
    toolCalls: ToolCall[],
    handlers: Record<string, unknown> | undefined
  ) => {
    if (!handlers) {
      throw new Error(t("chat.errors.toolHandlersNotConfigured"));
    }

    const toolMessages = [];
    for (const toolCall of toolCalls) {
      if (generationRef.current?.signal.aborted) {
        throw new DOMException("Generation stopped", "AbortError");
      }
      const handler = handlers[toolCall.function.name];
      if (handler === undefined) {
        throw new Error(
          t("chat.errors.toolHandlerMissing", {
            name: toolCall.function.name,
          })
        );
      }
      let args: unknown = {};
      try {
        args = toolCall.function.arguments
          ? JSON.parse(toolCall.function.arguments)
          : {};
      } catch (error) {
        throw new Error(t("chat.errors.toolArgsInvalid"));
      }

      const result =
        typeof handler === "function"
          ? await (
              handler as (input: unknown) => Promise<unknown> | unknown
            )(args)
          : handler;
      const content =
        typeof result === "string" ? result : JSON.stringify(result ?? null);
      toolMessages.push({
        role: "tool" as const,
        tool_call_id: toolCall.id,
        content,
      });
    }
    return toolMessages;
  };

  const streamWithToolCalls = async (
    conversation: { role: ChatRole; content: string }[] | ChatCompletionMessageParam[],
    modelName: string,
    parameters: {
      frequencyPenalty?: number;
      presencePenalty?: number;
      temperature?: number;
      topP?: number;
      maxTokens?: number;
      thinkingEnabled?: boolean;
      reasoningEffort?: "low" | "high" | "max";
    },
    toolConfig?: { tools?: unknown[]; strict?: boolean },
    draftPrefix: string = "",
    signal = generationRef.current?.signal,
    requestSettings = settingsRef.current
  ) => {
    if (signal?.aborted) throw new DOMException("Generation stopped", "AbortError");
    const chatStream = await streamDeepseek(apiKey, conversation, modelName, {
      ...parameters,
      apiFormat: requestSettings.apiFormat,
      stream: requestSettings.streamEnabled,
      extraBody: parseRequestOptions(requestSettings.requestOptionsJson),
    }, toolConfig);
    if (signal?.aborted) {
      chatStream.abort();
      throw new DOMException("Generation stopped", "AbortError");
    }
    chatStreamRef.current = chatStream;

    let partialReasoningContent = "";
    let partialContent = "";
    let finalFinishReason: string | null = null;
    let providerData: ToolPass["providerData"];
    let first = true;
    const toolCallsByIndex = new Map<number, ToolCall>();

    for await (const chunk of chatStream) {
      const nativeChunk = chunk as NativeChunk;
      if (nativeChunk.provider_data) providerData = nativeChunk.provider_data;
      if (signal?.aborted) throw new DOMException("Generation stopped", "AbortError");
      interface Delta {
        reasoning_content?: string;
        content?: string;
        tool_calls?: Array<{
          index?: number;
          id?: string;
          type?: "function";
          function?: { name?: string; arguments?: string };
        }>;
      }

      const delta = (chunk.choices[0]?.delta ?? {}) as Delta;
      const finishReason = chunk.choices[0]?.finish_reason;
      const delta_reasoning_content = delta.reasoning_content ?? "";
      const delta_content = delta.content ?? "";
      if (finishReason) {
        finalFinishReason = finishReason;
        setAssistantFinishReason(finishReason);
      }
      if (delta_reasoning_content) {
        partialReasoningContent += delta_reasoning_content;
        if (first) {
          setWaitingForFirstChunk(false);
          first = false;
        }
        setAssistantCoT(partialReasoningContent);
      }
      if (delta_content) {
        partialContent += delta_content;
        if (first) {
          setWaitingForFirstChunk(false);
          first = false;
        }
        setAssistantDraft(`${draftPrefix}${partialContent}`);
      }
      if (Array.isArray(delta.tool_calls)) {
        setWaitingForFirstChunk(false);
        for (const call of delta.tool_calls) {
          const index = typeof call.index === "number" ? call.index : toolCallsByIndex.size;
          const existing = toolCallsByIndex.get(index) ?? {
            id: "",
            type: "function" as const,
            function: { name: "", arguments: "" },
          };
          if (typeof call.id === "string") {
            existing.id = call.id;
          }
          if (call.type) {
            existing.type = call.type;
          }
          if (call.function?.name) {
            existing.function.name += call.function.name;
          }
          if (typeof call.function?.arguments === "string") {
            existing.function.arguments += call.function.arguments;
          }
          toolCallsByIndex.set(index, existing);
        }
      }
    }

    const toolCalls = Array.from(toolCallsByIndex.entries())
      .sort((a, b) => a[0] - b[0])
      .map((entry) => entry[1]);

    void addUsageFromTexts(buildInputText(conversation), partialContent);

    return {
      partialContent,
      partialReasoningContent,
      finalFinishReason,
      toolCalls,
      providerData,
    };
  };

  // -- メッセージ購読 --
  useEffect(() => {
    const unsubscribe = listenMessages(threadId, (fetched) => {
      const sorted = [...fetched].sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return a.createdAt - b.createdAt;
      });
      setMessages(sorted);

      const sys = sorted.find((m) => m.role === "system");
      if (sys) {
        setSystemMsgId(sys.id);
        setSystemPrompt(sys.content);
      } else {
        setSystemMsgId(null);
        setSystemPrompt("You are a helpful assistant.");
      }
    });
    return () => unsubscribe();
  }, [threadId]);

  // -- thread購読 (model/parametersなど) --
  useEffect(() => {
    settingsThreadRef.current = null;
    setSettingsLoadedThread(null);
    const unsub = onSnapshot(doc(db, "threads", threadId), (snapshot) => {
      if (snapshot.exists()) {
        settingsThreadRef.current = threadId;
        const data = snapshot.data() as {
          title?: string;
          apiFormat?: "chat" | "responses" | "messages";
          streamEnabled?: boolean;
          searchEnabled?: boolean;
          requestOptionsJson?: string;
          model?: string;
          thinkingEnabled?: boolean;
          reasoningEffort?: "low" | "high" | "max";
          toolChoice?: string;
          frequencyPenalty?: number;
          presencePenalty?: number;
          temperature?: number;
          topP?: number;
          maxTokens?: number;
          cumulativeInputTokens?: number;
          cumulativeOutputTokens?: number;
          systemPromptTokenCount?: number;
          systemPromptTokenText?: string;
          toolsJson?: string;
          toolsStrict?: boolean;
          toolHandlersJson?: string;
          jsonOutput?: boolean;
          prefixCompletionEnabled?: boolean;
          stopSequencesRaw?: string;
          fimPrefix?: string;
          fimSuffix?: string;
          fimMaxTokens?: number;
        };
        setModel(data.model ?? "deepseek-chat");
        setApiFormat(data.apiFormat ?? "chat");
        setStreamEnabled(data.streamEnabled ?? true);
        setSearchEnabled(data.searchEnabled ?? false);
        setRequestOptionsJson(data.requestOptionsJson ?? "");
        setSettingsLoadedThread(threadId);
        setThinkingEnabled(data.thinkingEnabled ?? false);
        setReasoningEffort(data.reasoningEffort ?? "high");
        setToolChoice(data.toolChoice ?? "auto");
        if (typeof data.title === "string") {
          setThreadTitle(data.title);
        }
        if (typeof data.frequencyPenalty === "number") {
          setFrequencyPenalty(data.frequencyPenalty);
        }
        if (typeof data.presencePenalty === "number") {
          setPresencePenalty(data.presencePenalty);
        }
        if (typeof data.temperature === "number") {
          setTemperature(data.temperature);
        }
        if (typeof data.topP === "number") {
          setTopP(data.topP);
        }
        const limits = getModelLimits(data.model ?? "deepseek-chat");
        setMaxTokens(typeof data.maxTokens === "number"
          ? Math.min(limits.maxTokensLimit, Math.max(1, data.maxTokens))
          : limits.defaultMaxTokens);
        if (typeof data.cumulativeInputTokens === "number") {
          setCumulativeInputTokens(data.cumulativeInputTokens);
        }
        if (typeof data.cumulativeOutputTokens === "number") {
          setCumulativeOutputTokens(data.cumulativeOutputTokens);
        }
        if (typeof data.systemPromptTokenCount === "number") {
          setSystemPromptTokenCount(data.systemPromptTokenCount);
        } else if (data.systemPromptTokenCount === null) {
          setSystemPromptTokenCount(null);
        }
        if (typeof data.systemPromptTokenText === "string") {
          setSystemPromptTokenText(data.systemPromptTokenText);
        }
        if (typeof data.toolsJson === "string" && !toolsJsonDraftRef.current) {
          setToolsJson(data.toolsJson);
        }
        if (typeof data.toolsStrict === "boolean") {
          setToolsStrict(data.toolsStrict);
        }
        if (
          typeof data.toolHandlersJson === "string" &&
          !toolHandlersDraftRef.current
        ) {
          setToolHandlersJson(data.toolHandlersJson);
        }
        if (typeof data.jsonOutput === "boolean") {
          setJsonOutput(data.jsonOutput);
        }
        if (typeof data.prefixCompletionEnabled === "boolean") {
          setPrefixCompletionEnabled(data.prefixCompletionEnabled);
        }
        if (
          typeof data.stopSequencesRaw === "string" &&
          !stopSequencesDraftRef.current
        ) {
          setStopSequencesRaw(data.stopSequencesRaw);
        }
        if (typeof data.fimPrefix === "string" && !fimPrefixDraftRef.current) {
          setFimPrefix(data.fimPrefix);
        }
        if (typeof data.fimSuffix === "string" && !fimSuffixDraftRef.current) {
          setFimSuffix(data.fimSuffix);
        }
        if (
          typeof data.fimMaxTokens === "number" &&
          !fimMaxTokensDraftRef.current
        ) {
          setFimMaxTokens(data.fimMaxTokens);
        }
      }
    });
    return () => unsub();
  }, [threadId]);

  // -- systemPrompt更新 --
  async function handleSystemPromptUpdate() {
    if (!systemMsgId) {
      await createMessage(threadId, "system", systemPrompt);
    } else {
      await updateMessage(threadId, systemMsgId, systemPrompt);
    }
  }

  const buildInputText = (
    conversation: Array<{ content?: string | null | Array<{ type?: string; text?: string }> }>
  ): string =>
    conversation
      .map((message) => {
        if (typeof message.content === "string") return message.content;
        if (Array.isArray(message.content)) {
          return message.content
            .map((part) =>
              part?.type === "text" && typeof part.text === "string"
                ? part.text
                : ""
            )
            .filter((text) => text.length > 0)
            .join("\n");
        }
        return "";
      })
      .filter((content) => content.length > 0)
      .join("\n\n");

  async function updateMessageTokenCount(messageId: string, text: string) {
    const tokenCount = await fetchTokenCount(text);
    if (tokenCount === null) return;
    try {
      await updateMessage(
        threadId,
        messageId,
        undefined,
        undefined,
        undefined,
        undefined,
        tokenCount
      );
    } catch (error) {
      console.error("[updateMessageTokenCount] Failed:", error);
    }
  }

  async function addUsageCounts(
    inputTokens: number | null,
    outputTokens: number | null
  ) {
    const payload: Record<string, ReturnType<typeof increment>> = {};
    if (typeof inputTokens === "number") {
      payload.cumulativeInputTokens = increment(inputTokens);
    }
    if (typeof outputTokens === "number") {
      payload.cumulativeOutputTokens = increment(outputTokens);
    }
    if (Object.keys(payload).length === 0) return;
    try {
      await updateDoc(doc(db, "threads", threadId), payload);
    } catch (error) {
      console.error("[addUsageCounts] Failed:", error);
    }
  }

  async function addUsageFromTexts(
    inputText: string | null,
    outputText: string | null
  ) {
    const [inputTokens, outputTokens] = await Promise.all([
      inputText !== null ? fetchTokenCount(inputText) : Promise.resolve(null),
      outputText !== null ? fetchTokenCount(outputText) : Promise.resolve(null),
    ]);
    await addUsageCounts(inputTokens, outputTokens);
  }

  async function ensureSystemPromptTokenCount(promptText: string) {
    if (promptText === systemPromptTokenText) return;
    const tokenCount = await fetchTokenCount(promptText);
    if (tokenCount === null) return;
    try {
      await updateDoc(doc(db, "threads", threadId), {
        systemPromptTokenCount: tokenCount,
        systemPromptTokenText: promptText,
      });
      setSystemPromptTokenCount(tokenCount);
      setSystemPromptTokenText(promptText);
    } catch (error) {
      console.error("[ensureSystemPromptTokenCount] Failed:", error);
    }
  }

  async function deletePendingAssistantMessages(messageIds: Set<string>) {
    if (messageIds.size === 0) return;
    try {
      await deleteMessages(threadId, Array.from(messageIds));
    } catch (error) {
      console.error("[deletePendingAssistantMessages] Failed:", error);
    }
  }

  // -- model変更 --
  async function handleModelChange(newModel: string) {
    setModel(newModel);
    await updateDoc(doc(db, "threads", threadId), { model: newModel });
  }

  async function handleJsonOutputToggle(enabled: boolean) {
    setJsonOutput(enabled);
    await updateDoc(doc(db, "threads", threadId), { jsonOutput: enabled });
  }

  async function handleToolsStrictToggle(enabled: boolean) {
    setToolsStrict(enabled);
    await updateDoc(doc(db, "threads", threadId), { toolsStrict: enabled });
  }

  async function handlePrefixCompletionToggle(enabled: boolean) {
    setPrefixCompletionEnabled(enabled);
    await updateDoc(doc(db, "threads", threadId), {
      prefixCompletionEnabled: enabled,
    });
  }

  // -- 送信 --
  async function handleSend() {
    // 送信中なら→停止
    if (assistantThinking) {
      generationRef.current?.abort();
      if (chatStreamRef.current) {
        chatStreamRef.current.abort();
      }
      return;
    }
    if (!input.trim() && !attachments.length) return;

    setErrorMessage(null);

    const userText = input.trim();
    const startTime = Date.now();
    // メッセージ送信開始イベント
    if (analytics) {
      logEvent(analytics, "message_send_start", {
        threadId,
        model: model ?? "unknown",
        messageLength: userText.length,
      });
    }
    const generation = new AbortController();
    generationRef.current = generation;
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);
    setAssistantCoT(null);
    setAssistantDraft("");
    setAssistantFinishReason(null);
    const pendingAssistantMessageIds = new Set<string>();

    try {
      validateGeneration(settingsRef.current, attachments);
      attachmentBlocks(attachments);
      if (attachments.some((attachment) => attachment.value.startsWith("data:"))) {
        throw new Error("Upload local images as provider files before sending.");
      }
      const hasFim =
        fimPrefix.trim().length > 0 || fimSuffix.trim().length > 0;
      const tooling = hasFim
        ? { toolConfig: undefined }
        : buildToolConfig(toolsJson, toolsStrict);
      if (!hasFim && tooling.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      const handlersResult = hasFim
        ? { handlers: undefined }
        : buildToolHandlers(toolHandlersJson);
      if (!hasFim && handlersResult.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      // 1) systemPromptをFirestoreへ
      await handleSystemPromptUpdate();
      void ensureSystemPromptTokenCount(systemPrompt);

      // 2) userメッセージ
      const userMsgId = await createMessage(threadId, "user", userText, undefined, undefined, { attachments });
      setInput("");
      setAttachments([]);
      if (typeof window !== "undefined") window.localStorage.removeItem(buildDraftKey("attachments"));
      void updateMessageTokenCount(userMsgId, userText);

      // 3) 空のassistantメッセージ (Firestore) → ID取得
      const newAssistantMsgId = await createMessage(threadId, "assistant", "");
      pendingAssistantMessageIds.add(newAssistantMsgId);
      setAssistantMsgId(newAssistantMsgId); // thinking対象

      // 4) 過去の会話づくり
      const conversation = [
        { role: "system", content: systemPrompt },
        ...messages
          .filter((m) => m.role !== "system")
          .flatMap(replayMessage),
        ...replayMessage({ id: userMsgId, threadId, role: "user", content: userText, attachments }),
      ] as ChatCompletionMessageParam[];

      await updateDoc(doc(db, "threads", threadId), {
        apiFormat, streamEnabled, requestOptionsJson, searchEnabled,
        frequencyPenalty,
        presencePenalty,
        temperature,
        topP,
        maxTokens,
        thinkingEnabled,
        reasoningEffort,
        toolChoice,
        toolsJson,
        toolsStrict,
        toolHandlersJson,
        jsonOutput,
        prefixCompletionEnabled,
        stopSequencesRaw,
        fimPrefix,
        fimSuffix,
        fimMaxTokens,
      });

      if (hasFim) {
        const fimPrompt = `${fimPrefix}${userText}`;
        const normalizedFimMaxTokens = Math.min(4096, Math.max(1, fimMaxTokens));
        const completion = await callDeepseekFim(
          apiKey,
          fimPrompt,
          fimSuffix || undefined,
          model,
          { maxTokens: normalizedFimMaxTokens }
        );
        setWaitingForFirstChunk(false);
        setAssistantDraft(completion);
        await updateMessage(threadId, newAssistantMsgId, completion, null, null);
        pendingAssistantMessageIds.delete(newAssistantMsgId);
        void updateMessageTokenCount(newAssistantMsgId, completion);
        void addUsageFromTexts(
          `${fimPrefix}${userText}${fimSuffix ?? ""}`,
          completion
        );
        setAssistantFinishReason(null);

        if (analytics) {
          logEvent(analytics, "message_send_success", {
            threadId,
            model,
            messageLength: userText.length,
            responseLength: completion.length,
            duration: Date.now() - startTime,
          });
        }
        return;
      }

      // 5) ストリーミング
      const finalPass = await runToolConversation({
        conversation,
        signal: generation.signal,
        stream: (history) => streamWithToolCalls(
          history,
          model,
          {
            frequencyPenalty,
            presencePenalty,
            temperature,
            topP,
            maxTokens,
            thinkingEnabled,
            reasoningEffort,
          },
          buildRequestConfig(
            tooling.toolConfig,
            jsonOutput,
            stopSequencesRaw,
            tooling.toolConfig?.strict === true
          ),
          "",
          generation.signal,
          { ...settingsRef.current, apiFormat, streamEnabled, requestOptionsJson }
        ),
        resolve: async (calls) => {
          try {
            return await resolveToolCalls(calls, handlersResult.handlers);
          } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            setErrorMessage(errorText);
            return calls.map((call) => ({
              role: "tool" as const, tool_call_id: call.id,
              content: JSON.stringify({ error: errorText }),
            }));
          }
        },
        persist: async (pass, history) => {
          const content = pass.partialContent;
          await updateMessage(
            threadId, newAssistantMsgId, content,
            pass.partialReasoningContent || null, pass.finalFinishReason,
            undefined, undefined, history
          );
          pendingAssistantMessageIds.delete(newAssistantMsgId);
          void updateMessageTokenCount(newAssistantMsgId, content);
          setAssistantCoT(pass.partialReasoningContent || null);
          setAssistantFinishReason(pass.finalFinishReason);
        },
      });
      const finalResponseLength = finalPass.partialContent.length;

      // メッセージ送信成功イベント
      if (analytics) {
        logEvent(analytics, "message_send_success", {
          threadId,
          model,
          messageLength: userText.length,
          responseLength: finalResponseLength,
          duration: Date.now() - startTime,
        });
      }
    } catch (err) {
      console.error("handleSend error (stream)", err);
      const msg =
        err instanceof Error ? err.message : t("chat.errors.stream");
      setErrorMessage(msg);
      await deletePendingAssistantMessages(pendingAssistantMessageIds);
      // メッセージ送信失敗イベント
      if (analytics) {
        logEvent(analytics, "message_send_failure", {
          threadId,
          model,
          messageLength: userText.length,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setWaitingForFirstChunk(false);
      setAssistantThinking(false);
      chatStreamRef.current = null;
      setAssistantMsgId(null);
      setAssistantFinishReason(null);
    }
  }

  async function handleEditMessage(messageId: string, newContent: string) {
    const trimmed = newContent.trim();
    if (!trimmed && !messages.find((message) => message.id === messageId)?.attachments?.length) return;

    const currentSettings = settingsRef.current;

    if (assistantThinking) {
      generationRef.current?.abort();
      chatStreamRef.current?.abort();
      return;
    }

    setErrorMessage(null);
    const generation = new AbortController();
    generationRef.current = generation;
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);
    setAssistantCoT(null);
    setAssistantDraft("");
    setAssistantFinishReason(null);
    const pendingAssistantMessageIds = new Set<string>();

    const targetIndex = messages.findIndex((msg) => msg.id === messageId);
    if (targetIndex === -1) {
      setAssistantThinking(false);
      return;
    }
    const target = messages[targetIndex];
    if (target.role !== "user") {
      setAssistantThinking(false);
      return;
    }

    try {
      validateGeneration(currentSettings, target.attachments);
      const hasFim =
        currentSettings.fimPrefix.trim().length > 0 ||
        currentSettings.fimSuffix.trim().length > 0;
      const tooling = hasFim
        ? { toolConfig: undefined }
        : buildToolConfig(
            currentSettings.toolsJson,
            currentSettings.toolsStrict,
            currentSettings.searchEnabled
          );
      if (!hasFim && tooling.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      const handlersResult = hasFim
        ? { handlers: undefined }
        : buildToolHandlers(currentSettings.toolHandlersJson, currentSettings.searchEnabled);
      if (!hasFim && handlersResult.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      await handleSystemPromptUpdate();
      void ensureSystemPromptTokenCount(currentSettings.systemPrompt);
      await updateMessage(threadId, messageId, trimmed);
      void updateMessageTokenCount(messageId, trimmed);

      const toDelete = messages.slice(targetIndex + 1).map((msg) => msg.id);
      await deleteMessages(threadId, toDelete);

      const newAssistantMsgId = await createMessage(threadId, "assistant", "");
      pendingAssistantMessageIds.add(newAssistantMsgId);
      setAssistantMsgId(newAssistantMsgId);

      const conversation = [
        { role: "system", content: currentSettings.systemPrompt },
        ...messages
          .slice(0, targetIndex + 1)
          .filter((m) => m.role !== "system")
          .flatMap((m) => replayMessage(m.id === messageId ? { ...m, content: trimmed, api_messages: undefined } : m)),
      ] as ChatCompletionMessageParam[];

      await updateDoc(doc(db, "threads", threadId), {
        apiFormat: currentSettings.apiFormat,
        streamEnabled: currentSettings.streamEnabled,
        requestOptionsJson: currentSettings.requestOptionsJson,
        model: currentSettings.model,
        frequencyPenalty: currentSettings.frequencyPenalty,
        presencePenalty: currentSettings.presencePenalty,
        temperature: currentSettings.temperature,
        topP: currentSettings.topP,
        maxTokens: currentSettings.maxTokens,
        thinkingEnabled: currentSettings.thinkingEnabled,
        reasoningEffort: currentSettings.reasoningEffort,
        toolChoice: currentSettings.toolChoice,
        toolsJson: currentSettings.toolsJson,
        toolsStrict: currentSettings.toolsStrict,
        toolHandlersJson: currentSettings.toolHandlersJson,
        jsonOutput: currentSettings.jsonOutput,
        prefixCompletionEnabled: currentSettings.prefixCompletionEnabled,
        stopSequencesRaw: currentSettings.stopSequencesRaw,
        fimPrefix: currentSettings.fimPrefix,
        fimSuffix: currentSettings.fimSuffix,
        fimMaxTokens: currentSettings.fimMaxTokens,
      });

      if (hasFim) {
        const fimPrompt = `${currentSettings.fimPrefix}${trimmed}`;
        const normalizedFimMaxTokens = Math.min(
          4096,
          Math.max(1, currentSettings.fimMaxTokens)
        );
        const completion = await callDeepseekFim(
          apiKey,
          fimPrompt,
          currentSettings.fimSuffix || undefined,
          currentSettings.model,
          { maxTokens: normalizedFimMaxTokens }
        );
        setWaitingForFirstChunk(false);
        setAssistantDraft(completion);
        await updateMessage(threadId, newAssistantMsgId, completion, null, null);
        pendingAssistantMessageIds.delete(newAssistantMsgId);
        void updateMessageTokenCount(newAssistantMsgId, completion);
        void addUsageFromTexts(
          `${currentSettings.fimPrefix}${trimmed}${
            currentSettings.fimSuffix ?? ""
          }`,
          completion
        );
        setAssistantFinishReason(null);
        return;
      }

      await runToolConversation({
        conversation,
        signal: generation.signal,
        stream: (history) => streamWithToolCalls(
          history,
          currentSettings.model,
          {
            frequencyPenalty: currentSettings.frequencyPenalty,
            presencePenalty: currentSettings.presencePenalty,
            temperature: currentSettings.temperature,
            topP: currentSettings.topP,
            maxTokens: currentSettings.maxTokens,
            thinkingEnabled: currentSettings.thinkingEnabled,
            reasoningEffort: currentSettings.reasoningEffort,
          },
          buildRequestConfig(
            tooling.toolConfig,
            currentSettings.jsonOutput,
            currentSettings.stopSequencesRaw,
            tooling.toolConfig?.strict === true
          ),
          "",
          generation.signal,
          currentSettings
        ),
        resolve: async (calls) => {
          try {
            return await resolveToolCalls(calls, handlersResult.handlers);
          } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            setErrorMessage(errorText);
            return calls.map((call) => ({
              role: "tool" as const, tool_call_id: call.id,
              content: JSON.stringify({ error: errorText }),
            }));
          }
        },
        persist: async (pass, history) => {
          const content = pass.partialContent;
          await updateMessage(
            threadId, newAssistantMsgId, content,
            pass.partialReasoningContent || null, pass.finalFinishReason,
            undefined, undefined, history
          );
          pendingAssistantMessageIds.delete(newAssistantMsgId);
          void updateMessageTokenCount(newAssistantMsgId, content);
          setAssistantCoT(pass.partialReasoningContent || null);
          setAssistantFinishReason(pass.finalFinishReason);
        },
      });

    } catch (err) {
      console.error("handleEditMessage error (stream)", err);
      const msg =
        err instanceof Error ? err.message : t("chat.errors.stream");
      setErrorMessage(msg);
      await deletePendingAssistantMessages(pendingAssistantMessageIds);
    } finally {
      setWaitingForFirstChunk(false);
      setAssistantThinking(false);
      chatStreamRef.current = null;
      setAssistantMsgId(null);
    }
  }

  async function handleBranchMessage(messageId: string): Promise<string | null> {
    if (!userId) {
      setErrorMessage(t("chat.errors.branch"));
      return null;
    }

    const targetIndex = messages.findIndex((msg) => msg.id === messageId);
    if (targetIndex === -1) return null;
    const target = messages[targetIndex];
    if (target.role !== "assistant") return null;

    const branchTitle = `Branch - ${threadTitle}`;
    const branchCreatedAt = new Date().toISOString();

    try {
      const newThreadId = await createThread(userId, branchTitle);
      await updateDoc(doc(db, "threads", newThreadId), {
        apiFormat, streamEnabled, requestOptionsJson, searchEnabled,
        parentThreadId: threadId,
        branchFromMessageId: messageId,
        branchFromTitle: threadTitle,
        branchedAt: serverTimestamp(),
        model,
        frequencyPenalty,
        presencePenalty,
        temperature,
        topP,
        maxTokens,
        thinkingEnabled,
        reasoningEffort,
        toolChoice,
        toolsJson,
        toolsStrict,
        toolHandlersJson,
        jsonOutput,
        prefixCompletionEnabled,
        stopSequencesRaw,
        fimPrefix,
        fimSuffix,
        fimMaxTokens,
      });

      await createMessage(newThreadId, "system", systemPrompt);

      const seedMessages = messages
        .slice(0, targetIndex + 1)
        .filter((msg) => msg.role !== "system");
      for (const msg of seedMessages) {
        const branchMeta =
          msg.id === messageId
            ? {
                branchThreadId: newThreadId,
                branchThreadTitle: branchTitle,
                branchFromMessageId: messageId,
                branchCreatedAt,
              }
            : undefined;
        if (msg.role === "assistant") {
          await createMessage(
            newThreadId,
            msg.role,
            msg.content,
            msg.thinking_content ?? null,
            msg.finish_reason ?? null,
            branchMeta,
            msg.token_count,
            msg.api_messages
          );
        } else {
          await createMessage(
            newThreadId,
            msg.role,
            msg.content,
            undefined,
            undefined,
            { attachments: msg.attachments },
            msg.token_count
          );
        }
      }

      await updateMessage(
        threadId,
        messageId,
        undefined,
        undefined,
        undefined,
        {
          branchThreadId: newThreadId,
          branchThreadTitle: branchTitle,
          branchFromMessageId: messageId,
          branchCreatedAt,
        }
      );
      return newThreadId;
    } catch (err) {
      console.error("handleBranchMessage error", err);
      const msg =
        err instanceof Error ? err.message : t("chat.errors.branch");
      setErrorMessage(msg);
      return null;
    }
  }

  async function handleRegenerateMessage(messageId: string) {
    const currentSettings = settingsRef.current;

    if (assistantThinking) {
      generationRef.current?.abort();
      chatStreamRef.current?.abort();
      return;
    }

    setErrorMessage(null);
    const generation = new AbortController();
    generationRef.current = generation;
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);
    setAssistantCoT(null);
    setAssistantDraft("");
    setAssistantFinishReason(null);
    const pendingAssistantMessageIds = new Set<string>();

    const targetIndex = messages.findIndex((msg) => msg.id === messageId);
    if (targetIndex === -1) {
      setAssistantThinking(false);
      return;
    }
    const target = messages[targetIndex];
    if (target.role !== "assistant") {
      setAssistantThinking(false);
      return;
    }

    try {
      validateGeneration(currentSettings);
      const tooling = buildToolConfig(
        currentSettings.toolsJson,
        currentSettings.toolsStrict,
        currentSettings.searchEnabled
      );
      if (tooling.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      const handlersResult = buildToolHandlers(currentSettings.toolHandlersJson, currentSettings.searchEnabled);
      if (handlersResult.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      await handleSystemPromptUpdate();
      void ensureSystemPromptTokenCount(currentSettings.systemPrompt);
      const toDelete = messages.slice(targetIndex + 1).map((msg) => msg.id);
      await deleteMessages(threadId, toDelete);

      setAssistantMsgId(messageId);

      const conversation = [
        { role: "system", content: currentSettings.systemPrompt },
        ...messages
          .slice(0, targetIndex)
          .filter((m) => m.role !== "system")
          .flatMap(replayMessage),
      ] as ChatCompletionMessageParam[];

      await updateDoc(doc(db, "threads", threadId), {
        apiFormat: currentSettings.apiFormat,
        streamEnabled: currentSettings.streamEnabled,
        requestOptionsJson: currentSettings.requestOptionsJson,
        model: currentSettings.model,
        frequencyPenalty: currentSettings.frequencyPenalty,
        presencePenalty: currentSettings.presencePenalty,
        temperature: currentSettings.temperature,
        topP: currentSettings.topP,
        maxTokens: currentSettings.maxTokens,
        thinkingEnabled: currentSettings.thinkingEnabled,
        reasoningEffort: currentSettings.reasoningEffort,
        toolChoice: currentSettings.toolChoice,
        toolsJson: currentSettings.toolsJson,
        toolsStrict: currentSettings.toolsStrict,
        toolHandlersJson: currentSettings.toolHandlersJson,
        jsonOutput: currentSettings.jsonOutput,
        prefixCompletionEnabled: currentSettings.prefixCompletionEnabled,
        stopSequencesRaw: currentSettings.stopSequencesRaw,
        fimPrefix: currentSettings.fimPrefix,
        fimSuffix: currentSettings.fimSuffix,
        fimMaxTokens: currentSettings.fimMaxTokens,
      });

      await runToolConversation({
        conversation,
        signal: generation.signal,
        stream: (history) => streamWithToolCalls(
          history,
          currentSettings.model,
          {
            frequencyPenalty: currentSettings.frequencyPenalty,
            presencePenalty: currentSettings.presencePenalty,
            temperature: currentSettings.temperature,
            topP: currentSettings.topP,
            maxTokens: currentSettings.maxTokens,
            thinkingEnabled: currentSettings.thinkingEnabled,
            reasoningEffort: currentSettings.reasoningEffort,
          },
          buildRequestConfig(
            tooling.toolConfig,
            currentSettings.jsonOutput,
            currentSettings.stopSequencesRaw,
            tooling.toolConfig?.strict === true
          ),
          "",
          generation.signal,
          currentSettings
        ),
        resolve: async (calls) => {
          try {
            return await resolveToolCalls(calls, handlersResult.handlers);
          } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            setErrorMessage(errorText);
            return calls.map((call) => ({
              role: "tool" as const, tool_call_id: call.id,
              content: JSON.stringify({ error: errorText }),
            }));
          }
        },
        persist: async (pass, history) => {
          const content = pass.partialContent;
          await updateMessage(
            threadId, messageId, content,
            pass.partialReasoningContent || null, pass.finalFinishReason,
            undefined, undefined, history
          );
          pendingAssistantMessageIds.delete(messageId);
          void updateMessageTokenCount(messageId, content);
          setAssistantCoT(pass.partialReasoningContent || null);
          setAssistantFinishReason(pass.finalFinishReason);
        },
      });

    } catch (err) {
      console.error("handleRegenerateMessage error (stream)", err);
      const msg =
        err instanceof Error ? err.message : t("chat.errors.stream");
      setErrorMessage(msg);
      await deletePendingAssistantMessages(pendingAssistantMessageIds);
    } finally {
      setWaitingForFirstChunk(false);
      setAssistantThinking(false);
      chatStreamRef.current = null;
      setAssistantMsgId(null);
    }
  }

  async function handleCompleteMessage(messageId: string) {
    if (!prefixCompletionEnabled) {
      return;
    }

    if (assistantThinking) {
      generationRef.current?.abort();
      chatStreamRef.current?.abort();
      return;
    }

    const targetIndex = messages.findIndex((msg) => msg.id === messageId);
    if (targetIndex === -1) {
      return;
    }
    const target = messages[targetIndex];
    if (target.role !== "assistant") {
      return;
    }

    const baseContent = target.content ?? "";

    setErrorMessage(null);
    const generation = new AbortController();
    generationRef.current = generation;
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);
    setAssistantCoT(null);
    setAssistantDraft(baseContent);
    setAssistantFinishReason(null);
    setAssistantMsgId(messageId);

    try {
      validateGeneration({ ...settingsRef.current, apiFormat, streamEnabled, requestOptionsJson });
      const tooling = buildToolConfig(toolsJson, toolsStrict);
      if (tooling.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      const handlersResult = buildToolHandlers(toolHandlersJson);
      if (handlersResult.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }

      const conversation = applyPrefixCompletion(
        [
          { role: "system", content: systemPrompt },
          ...messages
            .slice(0, targetIndex + 1)
            .filter((m) => m.role !== "system")
            .flatMap(replayMessage),
        ] as ChatCompletionMessageParam[],
        prefixCompletionEnabled
      );
      void ensureSystemPromptTokenCount(systemPrompt);

      await updateDoc(doc(db, "threads", threadId), {
        apiFormat, streamEnabled, requestOptionsJson, searchEnabled,
        model,
        frequencyPenalty,
        presencePenalty,
        temperature,
        topP,
        maxTokens,
        thinkingEnabled,
        reasoningEffort,
        toolChoice,
        toolsJson,
        toolsStrict,
        toolHandlersJson,
        jsonOutput,
        prefixCompletionEnabled,
        stopSequencesRaw,
        fimPrefix,
        fimSuffix,
        fimMaxTokens,
      });

      await runToolConversation({
        conversation,
        signal: generation.signal,
        history: target.api_messages?.slice(0, -1),
        prefix: baseContent,
        stream: (history) => streamWithToolCalls(
          history,
          model,
          {
            frequencyPenalty,
            presencePenalty,
            temperature,
            topP,
            maxTokens,
            thinkingEnabled,
            reasoningEffort,
          },
          buildRequestConfig(
            tooling.toolConfig,
            jsonOutput,
            stopSequencesRaw,
            prefixCompletionEnabled || tooling.toolConfig?.strict === true
          ),
          baseContent,
          generation.signal,
          { ...settingsRef.current, apiFormat, streamEnabled, requestOptionsJson }
        ),
        resolve: async (calls) => {
          try {
            return await resolveToolCalls(calls, handlersResult.handlers);
          } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);
            setErrorMessage(errorText);
            return calls.map((call) => ({
              role: "tool" as const, tool_call_id: call.id,
              content: JSON.stringify({ error: errorText }),
            }));
          }
        },
        persist: async (pass, history) => {
          const content = baseContent + pass.partialContent;
          await updateMessage(
            threadId, messageId, content,
            pass.partialReasoningContent || null, pass.finalFinishReason,
            undefined, undefined, history
          );
            void updateMessageTokenCount(messageId, content);
          setAssistantCoT(pass.partialReasoningContent || null);
          setAssistantFinishReason(pass.finalFinishReason);
        },
      });

    } catch (err) {
      console.error("handleCompleteMessage error (stream)", err);
      const msg =
        err instanceof Error ? err.message : t("chat.errors.stream");
      setErrorMessage(msg);
    } finally {
      setWaitingForFirstChunk(false);
      setAssistantThinking(false);
      chatStreamRef.current = null;
      setAssistantMsgId(null);
    }
  }

  return {
    settingsLoaded: settingsLoadedThread === threadId,
    apiFormat, setApiFormat,
    streamEnabled, setStreamEnabled,
    searchEnabled, setSearchEnabled,
    requestOptionsJson, setRequestOptionsJson,
    attachments, setAttachments,
    messages,
    input,
    setInput,
    model,
    setModel,
    frequencyPenalty,
    setFrequencyPenalty,
    presencePenalty,
    setPresencePenalty,
    temperature,
    setTemperature,
    topP,
    setTopP,
    maxTokens,
    thinkingEnabled,
    reasoningEffort,
    toolChoice,
    setMaxTokens,
    setThinkingEnabled,
    setReasoningEffort,
    setToolChoice,
    toolsJson,
    setToolsJson,
    toolsStrict,
    setToolsStrict,
    toolsJsonError,
    setToolsJsonError,
    toolHandlersJson,
    setToolHandlersJson,
    toolHandlersJsonError,
    setToolHandlersJsonError,
    jsonOutput,
    setJsonOutput,
    handleJsonOutputToggle,
    prefixCompletionEnabled,
    setPrefixCompletionEnabled,
    stopSequencesRaw,
    setStopSequencesRaw,
    fimPrefix,
    setFimPrefix,
    fimSuffix,
    setFimSuffix,
    fimMaxTokens,
    setFimMaxTokens,
    handlePrefixCompletionToggle,
    systemPrompt,
    setSystemPrompt,
    showSystemBox,
    setShowSystemBox,
    handleModelChange,
    handleToolsStrictToggle,
    handleSend,
    waitingForFirstChunk,
    assistantThinking,
    assistantMsgId,
    assistantCoT,
    assistantDraft,
    assistantFinishReason,
    errorMessage,
    handleEditMessage,
    handleRegenerateMessage,
    handleCompleteMessage,
    handleBranchMessage,
    cumulativeInputTokens,
    cumulativeOutputTokens,
    systemPromptTokenCount,
  };
}
