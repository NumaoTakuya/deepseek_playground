// src/hooks/useChatWindow.ts

import { useState, useEffect, useRef } from "react";
import { db, analytics, logEvent } from "../services/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
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
} from "../services/deepseek";
import type { Message } from "../types/index";
import { useTranslation } from "../contexts/LanguageContext";
import { createThread } from "../services/thread";

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
  const [model, setModel] = useState("deepseek-chat");
  const [input, setInput] = useState("");
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [waitingForFirstChunk, setWaitingForFirstChunk] = useState(false);
  const [showSystemBox, setShowSystemBox] = useState(false);
  const [frequencyPenalty, setFrequencyPenalty] = useState(0);
  const [presencePenalty, setPresencePenalty] = useState(0);
  const [temperature, setTemperature] = useState(1);
  const [topP, setTopP] = useState(1);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [toolsJson, setToolsJson] = useState("");
  const [toolsStrict, setToolsStrict] = useState(false);
  const [toolsJsonError, setToolsJsonError] = useState<string | null>(null);
  const [toolHandlersJson, setToolHandlersJson] = useState("");
  const [toolHandlersJsonError, setToolHandlersJsonError] = useState<
    string | null
  >(null);
  const [jsonOutput, setJsonOutput] = useState(false);
  const [prefixCompletionEnabled, setPrefixCompletionEnabled] = useState(false);
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
   *  - MessageListに渡して "Thinking..." を表示
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
  const { t } = useTranslation();
  const getMaxTokensDefaults = (selectedModel: string) => {
    if (selectedModel === "deepseek-reasoner") {
      return { defaultMaxTokens: 32768, maxTokensLimit: 65536 };
    }
    return { defaultMaxTokens: 4096, maxTokensLimit: 8192 };
  };

  const { defaultMaxTokens, maxTokensLimit } = getMaxTokensDefaults(model);
  const previousDefaultMaxTokensRef = useRef(defaultMaxTokens);

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
    model,
    frequencyPenalty,
    presencePenalty,
    temperature,
    topP,
    maxTokens,
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

  const chatStreamRef = useRef<Awaited<
    ReturnType<typeof streamDeepseek>
  > | null>(null);

  const buildDraftKey = (suffix: string) => `thread-${threadId}-draft-${suffix}`;

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
      model,
      frequencyPenalty,
      presencePenalty,
      temperature,
      topP,
      maxTokens,
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
  }, [
    model,
    frequencyPenalty,
    presencePenalty,
    temperature,
    topP,
    maxTokens,
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

  const buildToolConfig = (rawJson: string, strict: boolean) => {
    const parsed = parseToolsJson(rawJson);
    if (parsed.error) {
      setErrorMessage(parsed.error);
      setToolsJsonError(parsed.error);
      return { error: parsed.error };
    }
    setToolsJsonError(null);
    if (!parsed.tools || parsed.tools.length === 0) {
      return { toolConfig: undefined };
    }
    return {
      toolConfig: {
        tools: applyStrictToTools(parsed.tools, strict),
        strict,
      },
    };
  };

  const buildToolHandlers = (rawJson: string) => {
    const parsed = parseToolHandlersJson(rawJson);
    if (parsed.error) {
      setErrorMessage(parsed.error);
      setToolHandlersJsonError(parsed.error);
      return { error: parsed.error };
    }
    setToolHandlersJsonError(null);
    return { handlers: parsed.handlers };
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
    },
    toolConfig?: { tools?: unknown[]; strict?: boolean },
    draftPrefix: string = ""
  ) => {
    const chatStream = await streamDeepseek(apiKey, conversation, modelName, parameters, toolConfig);
    chatStreamRef.current = chatStream;

    let partialReasoningContent = "";
    let partialContent = "";
    let finalFinishReason: string | null = null;
    let first = true;
    const toolCallsByIndex = new Map<number, ToolCall>();

    for await (const chunk of chatStream) {
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

      const delta = chunk.choices[0]?.delta as Delta;
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
            existing.function.name = call.function.name;
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

    return {
      partialContent,
      partialReasoningContent,
      finalFinishReason,
      toolCalls,
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
    const unsub = onSnapshot(doc(db, "threads", threadId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as {
          title?: string;
          model?: string;
          frequencyPenalty?: number;
          presencePenalty?: number;
          temperature?: number;
          topP?: number;
          maxTokens?: number;
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
        if (typeof data.maxTokens === "number") {
          setMaxTokens(data.maxTokens);
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
      if (chatStreamRef.current) {
        chatStreamRef.current.abort();
      }
      return;
    }
    if (!input.trim()) return;

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
    setInput("");
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);
    setAssistantCoT(null);
    setAssistantDraft("");
    setAssistantFinishReason(null);

    try {
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

      // 2) userメッセージ
      const userMsgId = await createMessage(threadId, "user", userText);
      void updateMessageTokenCount(userMsgId, userText);

      // 3) 空のassistantメッセージ (Firestore) → ID取得
      const newAssistantMsgId = await createMessage(threadId, "assistant", "");
      setAssistantMsgId(newAssistantMsgId); // thinking対象

      // 4) 過去の会話づくり
      const conversation = [
        { role: "system", content: systemPrompt },
        ...messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role,
            content: m.content,
          })),
        { role: "user", content: userText },
      ] as { role: ChatRole; content: string }[];

      await updateDoc(doc(db, "threads", threadId), {
        frequencyPenalty,
        presencePenalty,
        temperature,
        topP,
        maxTokens,
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
        void updateMessageTokenCount(newAssistantMsgId, completion);
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
      const firstPass = await streamWithToolCalls(
        conversation,
        model,
        {
          frequencyPenalty,
          presencePenalty,
          temperature,
          topP,
          maxTokens,
        },
        buildRequestConfig(
          tooling.toolConfig,
          jsonOutput,
          stopSequencesRaw,
          tooling.toolConfig?.strict === true
        )
      );

      let finalResponseLength = 0;

      if (
        firstPass.finalFinishReason === "tool_calls" &&
        firstPass.toolCalls.length > 0
      ) {
        const assistantToolMessage: ChatCompletionMessageParam = {
          role: "assistant",
          content: firstPass.partialContent ?? "",
          tool_calls: firstPass.toolCalls,
        };

        let toolMessages: ChatCompletionMessageParam[];
        try {
          toolMessages = await resolveToolCalls(
            firstPass.toolCalls,
            handlersResult.handlers
          );
        } catch (toolError) {
          const msg =
            toolError instanceof Error
              ? toolError.message
              : t("chat.errors.toolCallFailed");
          setErrorMessage(msg);
          await updateMessage(
            threadId,
            newAssistantMsgId,
            firstPass.partialContent,
            firstPass.partialReasoningContent.trim()
              ? firstPass.partialReasoningContent
              : null,
            firstPass.finalFinishReason
          );
          void updateMessageTokenCount(
            newAssistantMsgId,
            firstPass.partialContent ?? ""
          );
          setAssistantCoT(
            firstPass.partialReasoningContent.trim()
              ? firstPass.partialReasoningContent
              : null
          );
          setAssistantFinishReason(firstPass.finalFinishReason);
          return;
        }

        const firstThinkingContent = firstPass.partialReasoningContent.trim()
          ? firstPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          newAssistantMsgId,
          firstPass.partialContent,
          firstThinkingContent,
          firstPass.finalFinishReason
        );
        void updateMessageTokenCount(
          newAssistantMsgId,
          firstPass.partialContent ?? ""
        );

        const secondAssistantMsgId = await createMessage(
          threadId,
          "assistant",
          ""
        );
        setAssistantMsgId(secondAssistantMsgId);
        setWaitingForFirstChunk(true);
        setAssistantCoT(null);
        setAssistantDraft("");

        const secondConversation = [
          ...conversation,
          assistantToolMessage,
          ...toolMessages,
        ];

        const secondPass = await streamWithToolCalls(
          secondConversation,
          model,
          {
            frequencyPenalty,
            presencePenalty,
            temperature,
            topP,
            maxTokens,
          },
          buildRequestConfig(
            tooling.toolConfig,
            jsonOutput,
            stopSequencesRaw,
            tooling.toolConfig?.strict === true
          )
        );

        const finalThinkingContent = secondPass.partialReasoningContent.trim()
          ? secondPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          secondAssistantMsgId,
          secondPass.partialContent,
          finalThinkingContent,
          secondPass.finalFinishReason
        );
        void updateMessageTokenCount(
          secondAssistantMsgId,
          secondPass.partialContent ?? ""
        );
        setAssistantCoT(finalThinkingContent);
        setAssistantFinishReason(secondPass.finalFinishReason);
        finalResponseLength = secondPass.partialContent.length;
      } else {
        // 6) ストリーム完了: Firestoreにまとめて書き込み
        const finalThinkingContent = firstPass.partialReasoningContent.trim()
          ? firstPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          newAssistantMsgId,
          firstPass.partialContent,
          finalThinkingContent,
          firstPass.finalFinishReason
        );
        void updateMessageTokenCount(
          newAssistantMsgId,
          firstPass.partialContent ?? ""
        );
        setAssistantCoT(finalThinkingContent);
        setAssistantFinishReason(firstPass.finalFinishReason);
        finalResponseLength = firstPass.partialContent.length;
      }

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
      setAssistantThinking(false);
      chatStreamRef.current = null;
      setAssistantMsgId(null);
      setAssistantFinishReason(null);
    }
  }

  async function handleEditMessage(messageId: string, newContent: string) {
    const trimmed = newContent.trim();
    if (!trimmed) return;

    const currentSettings = settingsRef.current;

    if (assistantThinking && chatStreamRef.current) {
      chatStreamRef.current.abort();
    }

    setErrorMessage(null);
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);
    setAssistantCoT(null);
    setAssistantDraft("");
    setAssistantFinishReason(null);

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
      const hasFim =
        currentSettings.fimPrefix.trim().length > 0 ||
        currentSettings.fimSuffix.trim().length > 0;
      const tooling = hasFim
        ? { toolConfig: undefined }
        : buildToolConfig(
            currentSettings.toolsJson,
            currentSettings.toolsStrict
          );
      if (!hasFim && tooling.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      const handlersResult = hasFim
        ? { handlers: undefined }
        : buildToolHandlers(currentSettings.toolHandlersJson);
      if (!hasFim && handlersResult.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      await handleSystemPromptUpdate();
      await updateMessage(threadId, messageId, trimmed);
      void updateMessageTokenCount(messageId, trimmed);

      const toDelete = messages.slice(targetIndex + 1).map((msg) => msg.id);
      await deleteMessages(threadId, toDelete);

      const newAssistantMsgId = await createMessage(threadId, "assistant", "");
      setAssistantMsgId(newAssistantMsgId);

      const conversation = [
        { role: "system", content: currentSettings.systemPrompt },
        ...messages
          .slice(0, targetIndex + 1)
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role,
            content: m.id === messageId ? trimmed : m.content,
          })),
      ] as { role: ChatRole; content: string }[];

      await updateDoc(doc(db, "threads", threadId), {
        model: currentSettings.model,
        frequencyPenalty: currentSettings.frequencyPenalty,
        presencePenalty: currentSettings.presencePenalty,
        temperature: currentSettings.temperature,
        topP: currentSettings.topP,
        maxTokens: currentSettings.maxTokens,
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
        void updateMessageTokenCount(newAssistantMsgId, completion);
        setAssistantFinishReason(null);
        return;
      }

      const firstPass = await streamWithToolCalls(
        conversation,
        currentSettings.model,
        {
          frequencyPenalty: currentSettings.frequencyPenalty,
          presencePenalty: currentSettings.presencePenalty,
          temperature: currentSettings.temperature,
          topP: currentSettings.topP,
          maxTokens: currentSettings.maxTokens,
        },
        buildRequestConfig(
          tooling.toolConfig,
          currentSettings.jsonOutput,
          currentSettings.stopSequencesRaw,
          tooling.toolConfig?.strict === true
        )
      );

      if (
        firstPass.finalFinishReason === "tool_calls" &&
        firstPass.toolCalls.length > 0
      ) {
        const assistantToolMessage: ChatCompletionMessageParam = {
          role: "assistant",
          content: firstPass.partialContent ?? "",
          tool_calls: firstPass.toolCalls,
        };

        let toolMessages: ChatCompletionMessageParam[];
        try {
          toolMessages = await resolveToolCalls(
            firstPass.toolCalls,
            handlersResult.handlers
          );
        } catch (toolError) {
          const msg =
            toolError instanceof Error
              ? toolError.message
              : t("chat.errors.toolCallFailed");
          setErrorMessage(msg);
          await updateMessage(
            threadId,
            newAssistantMsgId,
            firstPass.partialContent,
            firstPass.partialReasoningContent.trim()
              ? firstPass.partialReasoningContent
              : null,
            firstPass.finalFinishReason
          );
          void updateMessageTokenCount(
            newAssistantMsgId,
            firstPass.partialContent ?? ""
          );
          setAssistantCoT(
            firstPass.partialReasoningContent.trim()
              ? firstPass.partialReasoningContent
              : null
          );
          setAssistantFinishReason(firstPass.finalFinishReason);
          return;
        }

        const firstThinkingContent = firstPass.partialReasoningContent.trim()
          ? firstPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          newAssistantMsgId,
          firstPass.partialContent,
          firstThinkingContent,
          firstPass.finalFinishReason
        );
        void updateMessageTokenCount(
          newAssistantMsgId,
          firstPass.partialContent ?? ""
        );

        const secondAssistantMsgId = await createMessage(
          threadId,
          "assistant",
          ""
        );
        setAssistantMsgId(secondAssistantMsgId);
        setWaitingForFirstChunk(true);
        setAssistantCoT(null);
        setAssistantDraft("");

        const secondConversation = [
          ...conversation,
          assistantToolMessage,
          ...toolMessages,
        ];

        const secondPass = await streamWithToolCalls(
          secondConversation,
          currentSettings.model,
          {
            frequencyPenalty: currentSettings.frequencyPenalty,
            presencePenalty: currentSettings.presencePenalty,
            temperature: currentSettings.temperature,
            topP: currentSettings.topP,
            maxTokens: currentSettings.maxTokens,
          },
          buildRequestConfig(
            tooling.toolConfig,
            currentSettings.jsonOutput,
            currentSettings.stopSequencesRaw,
            tooling.toolConfig?.strict === true
          )
        );

        const finalThinkingContent = secondPass.partialReasoningContent.trim()
          ? secondPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          secondAssistantMsgId,
          secondPass.partialContent,
          finalThinkingContent,
          secondPass.finalFinishReason
        );
        void updateMessageTokenCount(
          secondAssistantMsgId,
          secondPass.partialContent ?? ""
        );
        setAssistantCoT(finalThinkingContent);
        setAssistantFinishReason(secondPass.finalFinishReason);
      } else {
        const finalThinkingContent = firstPass.partialReasoningContent.trim()
          ? firstPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          newAssistantMsgId,
          firstPass.partialContent,
          finalThinkingContent,
          firstPass.finalFinishReason
        );
        void updateMessageTokenCount(
          newAssistantMsgId,
          firstPass.partialContent ?? ""
        );
        setAssistantCoT(finalThinkingContent);
        setAssistantFinishReason(firstPass.finalFinishReason);
      }
    } catch (err) {
      console.error("handleEditMessage error (stream)", err);
      const msg =
        err instanceof Error ? err.message : t("chat.errors.stream");
      setErrorMessage(msg);
    } finally {
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
            msg.token_count
          );
        } else {
          await createMessage(
            newThreadId,
            msg.role,
            msg.content,
            undefined,
            undefined,
            undefined,
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

    if (assistantThinking && chatStreamRef.current) {
      chatStreamRef.current.abort();
    }

    setErrorMessage(null);
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);
    setAssistantCoT(null);
    setAssistantDraft("");
    setAssistantFinishReason(null);

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
      const tooling = buildToolConfig(
        currentSettings.toolsJson,
        currentSettings.toolsStrict
      );
      if (tooling.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      const handlersResult = buildToolHandlers(currentSettings.toolHandlersJson);
      if (handlersResult.error) {
        setAssistantThinking(false);
        setWaitingForFirstChunk(false);
        return;
      }
      await handleSystemPromptUpdate();
      const toDelete = messages.slice(targetIndex + 1).map((msg) => msg.id);
      await deleteMessages(threadId, toDelete);

      setAssistantMsgId(messageId);

      const conversation = [
        { role: "system", content: currentSettings.systemPrompt },
        ...messages
          .slice(0, targetIndex)
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role,
            content: m.content,
          })),
      ] as { role: ChatRole; content: string }[];

      await updateDoc(doc(db, "threads", threadId), {
        model: currentSettings.model,
        frequencyPenalty: currentSettings.frequencyPenalty,
        presencePenalty: currentSettings.presencePenalty,
        temperature: currentSettings.temperature,
        topP: currentSettings.topP,
        maxTokens: currentSettings.maxTokens,
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

      const firstPass = await streamWithToolCalls(
        conversation,
        currentSettings.model,
        {
          frequencyPenalty: currentSettings.frequencyPenalty,
          presencePenalty: currentSettings.presencePenalty,
          temperature: currentSettings.temperature,
          topP: currentSettings.topP,
          maxTokens: currentSettings.maxTokens,
        },
        buildRequestConfig(
          tooling.toolConfig,
          currentSettings.jsonOutput,
          currentSettings.stopSequencesRaw,
          tooling.toolConfig?.strict === true
        )
      );

      if (
        firstPass.finalFinishReason === "tool_calls" &&
        firstPass.toolCalls.length > 0
      ) {
        const assistantToolMessage: ChatCompletionMessageParam = {
          role: "assistant",
          content: firstPass.partialContent ?? "",
          tool_calls: firstPass.toolCalls,
        };

        let toolMessages: ChatCompletionMessageParam[];
        try {
          toolMessages = await resolveToolCalls(
            firstPass.toolCalls,
            handlersResult.handlers
          );
        } catch (toolError) {
          const msg =
            toolError instanceof Error
              ? toolError.message
              : t("chat.errors.toolCallFailed");
          setErrorMessage(msg);
          await updateMessage(
            threadId,
            messageId,
            firstPass.partialContent,
            firstPass.partialReasoningContent.trim()
              ? firstPass.partialReasoningContent
              : null,
            firstPass.finalFinishReason
          );
          void updateMessageTokenCount(
            messageId,
            firstPass.partialContent ?? ""
          );
          setAssistantCoT(
            firstPass.partialReasoningContent.trim()
              ? firstPass.partialReasoningContent
              : null
          );
          setAssistantFinishReason(firstPass.finalFinishReason);
          return;
        }

        const firstThinkingContent = firstPass.partialReasoningContent.trim()
          ? firstPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          messageId,
          firstPass.partialContent,
          firstThinkingContent,
          firstPass.finalFinishReason
        );
        void updateMessageTokenCount(messageId, firstPass.partialContent ?? "");

        const secondAssistantMsgId = await createMessage(
          threadId,
          "assistant",
          ""
        );
        setAssistantMsgId(secondAssistantMsgId);
        setWaitingForFirstChunk(true);
        setAssistantCoT(null);
        setAssistantDraft("");

        const secondConversation = [
          ...conversation,
          assistantToolMessage,
          ...toolMessages,
        ];

        const secondPass = await streamWithToolCalls(
          secondConversation,
          currentSettings.model,
          {
            frequencyPenalty: currentSettings.frequencyPenalty,
            presencePenalty: currentSettings.presencePenalty,
            temperature: currentSettings.temperature,
            topP: currentSettings.topP,
            maxTokens: currentSettings.maxTokens,
          },
          buildRequestConfig(
            tooling.toolConfig,
            currentSettings.jsonOutput,
            currentSettings.stopSequencesRaw,
            tooling.toolConfig?.strict === true
          )
        );

        const finalThinkingContent = secondPass.partialReasoningContent.trim()
          ? secondPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          secondAssistantMsgId,
          secondPass.partialContent,
          finalThinkingContent,
          secondPass.finalFinishReason
        );
        void updateMessageTokenCount(
          secondAssistantMsgId,
          secondPass.partialContent ?? ""
        );
        setAssistantCoT(finalThinkingContent);
        setAssistantFinishReason(secondPass.finalFinishReason);
      } else {
        const finalThinkingContent = firstPass.partialReasoningContent.trim()
          ? firstPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          messageId,
          firstPass.partialContent,
          finalThinkingContent,
          firstPass.finalFinishReason
        );
        void updateMessageTokenCount(messageId, firstPass.partialContent ?? "");
        setAssistantCoT(finalThinkingContent);
        setAssistantFinishReason(firstPass.finalFinishReason);
      }
    } catch (err) {
      console.error("handleRegenerateMessage error (stream)", err);
      const msg =
        err instanceof Error ? err.message : t("chat.errors.stream");
      setErrorMessage(msg);
    } finally {
      setAssistantThinking(false);
      chatStreamRef.current = null;
      setAssistantMsgId(null);
    }
  }

  async function handleCompleteMessage(messageId: string) {
    if (!prefixCompletionEnabled) {
      return;
    }

    if (assistantThinking && chatStreamRef.current) {
      chatStreamRef.current.abort();
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
    setAssistantThinking(true);
    setWaitingForFirstChunk(true);
    setAssistantCoT(null);
    setAssistantDraft(baseContent);
    setAssistantFinishReason(null);
    setAssistantMsgId(messageId);

    try {
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
            .map((m) => ({
              role: m.role,
              content: m.content,
            })),
        ] as { role: ChatRole; content: string }[],
        prefixCompletionEnabled
      );

      await updateDoc(doc(db, "threads", threadId), {
        model,
        frequencyPenalty,
        presencePenalty,
        temperature,
        topP,
        maxTokens,
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

      const firstPass = await streamWithToolCalls(
        conversation,
        model,
        {
          frequencyPenalty,
          presencePenalty,
          temperature,
          topP,
          maxTokens,
        },
        buildRequestConfig(
          tooling.toolConfig,
          jsonOutput,
          stopSequencesRaw,
          prefixCompletionEnabled || tooling.toolConfig?.strict === true
        ),
        baseContent
      );

      if (
        firstPass.finalFinishReason === "tool_calls" &&
        firstPass.toolCalls.length > 0
      ) {
        const assistantToolMessage: ChatCompletionMessageParam = {
          role: "assistant",
          content: firstPass.partialContent ?? "",
          tool_calls: firstPass.toolCalls,
        };

        let toolMessages: ChatCompletionMessageParam[];
        try {
          toolMessages = await resolveToolCalls(
            firstPass.toolCalls,
            handlersResult.handlers
          );
        } catch (toolError) {
          const msg =
            toolError instanceof Error
              ? toolError.message
              : t("chat.errors.toolCallFailed");
          setErrorMessage(msg);
          await updateMessage(
            threadId,
            messageId,
            `${baseContent}${firstPass.partialContent}`,
            firstPass.partialReasoningContent.trim()
              ? firstPass.partialReasoningContent
              : null,
            firstPass.finalFinishReason
          );
          void updateMessageTokenCount(
            messageId,
            `${baseContent}${firstPass.partialContent ?? ""}`
          );
          setAssistantCoT(
            firstPass.partialReasoningContent.trim()
              ? firstPass.partialReasoningContent
              : null
          );
          setAssistantFinishReason(firstPass.finalFinishReason);
          return;
        }

        await updateMessage(
          threadId,
          messageId,
          `${baseContent}${firstPass.partialContent}`,
          firstPass.partialReasoningContent.trim()
            ? firstPass.partialReasoningContent
            : null,
          firstPass.finalFinishReason
        );
        void updateMessageTokenCount(
          messageId,
          `${baseContent}${firstPass.partialContent ?? ""}`
        );

        const secondConversation = applyPrefixCompletion(
          [
            ...conversation,
            assistantToolMessage,
            ...toolMessages,
          ],
          prefixCompletionEnabled
        );

        const secondPass = await streamWithToolCalls(
          secondConversation,
          model,
          {
            frequencyPenalty,
            presencePenalty,
            temperature,
            topP,
            maxTokens,
          },
          buildRequestConfig(
            tooling.toolConfig,
            jsonOutput,
            stopSequencesRaw,
            prefixCompletionEnabled || tooling.toolConfig?.strict === true
          ),
          baseContent
        );

        const finalThinkingContent = secondPass.partialReasoningContent.trim()
          ? secondPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          messageId,
          `${baseContent}${secondPass.partialContent}`,
          finalThinkingContent,
          secondPass.finalFinishReason
        );
        void updateMessageTokenCount(
          messageId,
          `${baseContent}${secondPass.partialContent ?? ""}`
        );
        setAssistantCoT(finalThinkingContent);
        setAssistantFinishReason(secondPass.finalFinishReason);
      } else {
        const finalThinkingContent = firstPass.partialReasoningContent.trim()
          ? firstPass.partialReasoningContent
          : null;
        await updateMessage(
          threadId,
          messageId,
          `${baseContent}${firstPass.partialContent}`,
          finalThinkingContent,
          firstPass.finalFinishReason
        );
        void updateMessageTokenCount(
          messageId,
          `${baseContent}${firstPass.partialContent ?? ""}`
        );
        setAssistantCoT(finalThinkingContent);
        setAssistantFinishReason(firstPass.finalFinishReason);
      }
    } catch (err) {
      console.error("handleCompleteMessage error (stream)", err);
      const msg =
        err instanceof Error ? err.message : t("chat.errors.stream");
      setErrorMessage(msg);
    } finally {
      setAssistantThinking(false);
      chatStreamRef.current = null;
      setAssistantMsgId(null);
    }
  }

  return {
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
    setMaxTokens,
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
  };
}
