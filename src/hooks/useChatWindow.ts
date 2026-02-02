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
import { streamDeepseek, type ChatCompletionMessageParam } from "../services/deepseek";
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
  });

  const chatStreamRef = useRef<Awaited<
    ReturnType<typeof streamDeepseek>
  > | null>(null);

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

  const buildRequestConfig = (
    toolConfig: { tools?: unknown[]; strict?: boolean } | undefined,
    jsonOutputEnabled: boolean
  ) => ({
    ...(toolConfig ?? {}),
    responseFormat: jsonOutputEnabled ? { type: "json_object" } : undefined,
  });

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
    toolConfig?: { tools?: unknown[]; strict?: boolean }
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
        setAssistantDraft(partialContent);
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
        if (typeof data.toolsJson === "string") {
          setToolsJson(data.toolsJson);
        }
        if (typeof data.toolsStrict === "boolean") {
          setToolsStrict(data.toolsStrict);
        }
        if (typeof data.toolHandlersJson === "string") {
          setToolHandlersJson(data.toolHandlersJson);
        }
        if (typeof data.jsonOutput === "boolean") {
          setJsonOutput(data.jsonOutput);
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

  // -- model変更 --
  async function handleModelChange(newModel: string) {
    setModel(newModel);
    await updateDoc(doc(db, "threads", threadId), { model: newModel });
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
      // 1) systemPromptをFirestoreへ
      await handleSystemPromptUpdate();

      // 2) userメッセージ
      await createMessage(threadId, "user", userText);

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
      });

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
        buildRequestConfig(tooling.toolConfig, jsonOutput)
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
          buildRequestConfig(tooling.toolConfig, jsonOutput)
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
      await updateMessage(threadId, messageId, trimmed);

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
        buildRequestConfig(tooling.toolConfig, currentSettings.jsonOutput)
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
          buildRequestConfig(tooling.toolConfig, currentSettings.jsonOutput)
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
            branchMeta
          );
        } else {
          await createMessage(newThreadId, msg.role, msg.content);
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
        buildRequestConfig(tooling.toolConfig, currentSettings.jsonOutput)
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
          buildRequestConfig(tooling.toolConfig, currentSettings.jsonOutput)
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
    systemPrompt,
    setSystemPrompt,
    showSystemBox,
    setShowSystemBox,
    handleModelChange,
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
    handleBranchMessage,
  };
}
