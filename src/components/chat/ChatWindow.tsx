// src/components/chat/ChatWindow.tsx

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Alert,
  IconButton,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Button,
  TextField,
  Switch,
  Divider,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CloseIcon from "@mui/icons-material/Close";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import CodeIcon from "@mui/icons-material/Code";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useChatWindow } from "../../hooks/useChatWindow";
import { useApiKey } from "../../contexts/ApiKeyContext";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/router";
import SystemPromptSection from "./SystemPromptSection";
import MessageList from "./MessageList";
import InputSection from "./InputSection";
import { useTranslation } from "../../contexts/LanguageContext";

interface Props {
  threadId: string;
}

export default function ChatWindow({ threadId }: Props) {
  const router = useRouter();
  const { apiKey } = useApiKey();
  const { user } = useAuth();
  const { t } = useTranslation();
  const {
    messages,
    input,
    setInput,
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
    stopSequencesRaw,
    setStopSequencesRaw,
    fimPrefix,
    setFimPrefix,
    fimSuffix,
    setFimSuffix,
    fimMaxTokens,
    setFimMaxTokens,
    handlePrefixCompletionToggle,
    handleToolsStrictToggle,
    systemPrompt,
    setSystemPrompt,
    model,
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
    handleCompleteMessage,
    handleBranchMessage,
    cumulativeInputTokens,
    cumulativeOutputTokens,
    systemPromptTokenCount,
  } = useChatWindow(threadId, apiKey, user?.uid);

  const handleBranchMessageAndNavigate = async (messageId: string) => {
    const newThreadId = await handleBranchMessage(messageId);
    if (newThreadId) {
      router.push(`/chat/${newThreadId}`);
    }
  };

  const [isFirstTime, setIsFirstTime] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showParametersBox, setShowParametersBox] = useState(false);
  const [showAdvancedBox, setShowAdvancedBox] = useState(false);
  const [showToolsBox, setShowToolsBox] = useState(false);
  const [showPrefixBox, setShowPrefixBox] = useState(false);
  const [showFimBox, setShowFimBox] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [codeViewType, setCodeViewType] = useState<"curl" | "python" | "node">(
    "curl"
  );
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const [isStreamEnabled, setIsStreamEnabled] = useState(false);
  const scrollToBottomRef = React.useRef<(smooth?: boolean) => void>(() => {});

  const sidebarWidth = isSidebarOpen ? 360 : 48;
  const totalTokens = cumulativeInputTokens + cumulativeOutputTokens;
  const costLower =
    (cumulativeInputTokens * 0.028 + cumulativeOutputTokens * 0.42) / 1_000_000;
  const costUpper =
    (cumulativeInputTokens * 0.28 + cumulativeOutputTokens * 0.42) / 1_000_000;
  const formatCost = (value: number) => value.toFixed(6);
  const formatCount = (value: number) => value.toLocaleString();

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

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

  const toolsForSnippet = useMemo(() => {
    const trimmed = toolsJson.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return undefined;
      const adjusted = applyStrictToTools(parsed, toolsStrict);
      return adjusted.length > 0 ? adjusted : undefined;
    } catch {
      return undefined;
    }
  }, [toolsJson, toolsStrict]);

  const stopSequences = useMemo(
    () => parseStopSequences(stopSequencesRaw),
    [stopSequencesRaw]
  );

  const useBeta = prefixCompletionEnabled || (toolsStrict && !!toolsForSnippet);

  type CodeMessage = { role: string; content: string; prefix?: boolean };

  const conversationForSnippet = useMemo(() => {
    const trimmedSystemPrompt = systemPrompt.trim();
    const baseMessages: CodeMessage[] = messages
      .filter((m) => m.role !== "system" && m.kind !== "branch_marker")
      .filter((m) => m.content && m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));
    const seeded =
      trimmedSystemPrompt.length > 0
        ? [{ role: "system" as const, content: trimmedSystemPrompt }, ...baseMessages]
        : baseMessages;

    if (!prefixCompletionEnabled || seeded.length === 0) {
      return seeded;
    }
    const last = seeded[seeded.length - 1];
    if (last.role === "assistant") {
      return [
        ...seeded.slice(0, -1),
        {
          ...last,
          prefix: true,
        },
      ];
    }
    return [...seeded, { role: "assistant", content: "", prefix: true }];
  }, [messages, systemPrompt, prefixCompletionEnabled]);

  const lastUserMessage = useMemo(() => {
    const candidates = messages.filter((m) => m.role === "user");
    const last = candidates[candidates.length - 1];
    return last?.content ?? "";
  }, [messages]);

  const fimActive = fimPrefix.trim().length > 0 || fimSuffix.trim().length > 0;
  const normalizedFimMaxTokens = Math.min(4096, Math.max(1, fimMaxTokens));

  const chatPayloadObject = useMemo(() => {
    const payload: Record<string, unknown> = {
      model,
      messages: conversationForSnippet,
      stream: isStreamEnabled,
    };
    if (typeof frequencyPenalty === "number") {
      payload.frequency_penalty = frequencyPenalty;
    }
    if (typeof presencePenalty === "number") {
      payload.presence_penalty = presencePenalty;
    }
    if (typeof temperature === "number") {
      payload.temperature = temperature;
    }
    if (typeof topP === "number") {
      payload.top_p = topP;
    }
    if (typeof maxTokens === "number") {
      payload.max_tokens = maxTokens;
    }
    if (toolsForSnippet) {
      payload.tools = toolsForSnippet;
    }
    if (jsonOutput) {
      payload.response_format = { type: "json_object" };
    }
    if (stopSequences && stopSequences.length > 0) {
      payload.stop = stopSequences;
    }
    return payload;
  }, [
    model,
    conversationForSnippet,
    isStreamEnabled,
    frequencyPenalty,
    presencePenalty,
    temperature,
    topP,
    maxTokens,
    toolsForSnippet,
    jsonOutput,
    stopSequences,
  ]);

  const fimPayloadObject = useMemo(() => {
    const promptBase = fimPrefix + (lastUserMessage || "");
    const payload: Record<string, unknown> = {
      model,
      prompt: promptBase,
      stream: isStreamEnabled,
      max_tokens: normalizedFimMaxTokens,
    };
    if (fimSuffix.trim().length > 0) {
      payload.suffix = fimSuffix;
    }
    return payload;
  }, [
    fimPrefix,
    fimSuffix,
    lastUserMessage,
    model,
    normalizedFimMaxTokens,
    isStreamEnabled,
  ]);

  const payloadJson = useMemo(() => {
    return JSON.stringify(fimActive ? fimPayloadObject : chatPayloadObject, null, 2);
  }, [fimActive, fimPayloadObject, chatPayloadObject]);

  const escapeForPython = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

  const toPythonLiteral = (value: unknown) => {
    const json = JSON.stringify(value, null, 2);
    if (!json) return "None";
    return json
      .replace(/\btrue\b/g, "True")
      .replace(/\bfalse\b/g, "False")
      .replace(/\bnull\b/g, "None");
  };

  const indentPython = (value: string, spaces: number) =>
    value
      .split("\n")
      .map((line) => `${" ".repeat(spaces)}${line}`)
      .join("\n");

  const pythonMessagesSnippet = useMemo(() => {
    if (conversationForSnippet.length === 0) {
      return "[]";
    }
    const lines = conversationForSnippet.map((message) => {
      const base = `{"role": "${message.role}", "content": "${escapeForPython(
        message.content
      )}"`;
      if (message.prefix) {
        return `        ${base}, "prefix": True}`;
      }
      return `        ${base}}`;
    });
    return `[\n${lines.join(",\n")}\n    ]`;
  }, [conversationForSnippet]);

  const curlSnippet = useMemo(() => {
    const baseUrl = fimActive
      ? "https://api.deepseek.com/beta"
      : useBeta
      ? "https://api.deepseek.com/beta"
      : "https://api.deepseek.com";
    const endpoint = fimActive
      ? `${baseUrl}/completions`
      : `${baseUrl}/chat/completions`;
    return `curl ${endpoint} \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer \${DEEPSEEK_API_KEY}" \\\n  -d '${payloadJson}'`;
  }, [payloadJson, fimActive, useBeta]);

  const pythonSnippet = useMemo(() => {
    const pythonTools = toolsForSnippet
      ? `\n${indentPython(toPythonLiteral(toolsForSnippet), 4)}`
      : null;
    const pythonResponseFormat = jsonOutput
      ? `\n${indentPython(toPythonLiteral({ type: "json_object" }), 4)}`
      : null;
    const pythonStop =
      stopSequences && stopSequences.length > 0
        ? `\n${indentPython(toPythonLiteral(stopSequences), 4)}`
        : null;
    const baseUrl = fimActive
      ? "https://api.deepseek.com/beta"
      : useBeta
      ? "https://api.deepseek.com/beta"
      : "https://api.deepseek.com";
    if (fimActive) {
      if (!isStreamEnabled) {
        return `# Please install OpenAI SDK first: \`pip3 install openai\`
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get('DEEPSEEK_API_KEY'), base_url="${baseUrl}")

response = client.completions.create(
    model="${model}",
    prompt="${escapeForPython(fimPrefix + (lastUserMessage || ""))}",
    ${fimSuffix.trim().length > 0 ? `suffix="${escapeForPython(fimSuffix)}",\n    ` : ""}max_tokens=${normalizedFimMaxTokens},
    stream=False
)

print(response.choices[0].text)`;
      }
      return `# Please install OpenAI SDK first: \`pip3 install openai\`
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get('DEEPSEEK_API_KEY'), base_url="${baseUrl}")

stream = client.completions.create(
    model="${model}",
    prompt="${escapeForPython(fimPrefix + (lastUserMessage || ""))}",
    ${fimSuffix.trim().length > 0 ? `suffix="${escapeForPython(fimSuffix)}",\n    ` : ""}max_tokens=${normalizedFimMaxTokens},
    stream=True
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].text:
        print(chunk.choices[0].text, end="", flush=True)`;
    }
    if (!isStreamEnabled) {
      return `# Please install OpenAI SDK first: \`pip3 install openai\`
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get('DEEPSEEK_API_KEY'), base_url="${baseUrl}")

response = client.chat.completions.create(
    model="${model}",
    messages=${pythonMessagesSnippet},
    frequency_penalty=${frequencyPenalty},
    presence_penalty=${presencePenalty},
    temperature=${temperature},
    top_p=${topP},
    max_tokens=${maxTokens},
    ${pythonTools ? `tools=${pythonTools},\n    ` : ""}${pythonResponseFormat ? `response_format=${pythonResponseFormat},\n    ` : ""}${pythonStop ? `stop=${pythonStop},\n    ` : ""}stream=False,
)

print(response.choices[0].message.content)`;
    }
    return `# Please install OpenAI SDK first: \`pip3 install openai\`
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get('DEEPSEEK_API_KEY'), base_url="${baseUrl}")

stream = client.chat.completions.create(
    model="${model}",
    messages=${pythonMessagesSnippet},
    frequency_penalty=${frequencyPenalty},
    presence_penalty=${presencePenalty},
    temperature=${temperature},
    top_p=${topP},
    max_tokens=${maxTokens},
    ${pythonTools ? `tools=${pythonTools},\n    ` : ""}${pythonResponseFormat ? `response_format=${pythonResponseFormat},\n    ` : ""}${pythonStop ? `stop=${pythonStop},\n    ` : ""}stream=True,
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`;
  }, [
    model,
    pythonMessagesSnippet,
    fimActive,
    useBeta,
    fimPrefix,
    fimSuffix,
    lastUserMessage,
    normalizedFimMaxTokens,
    toolsForSnippet,
    jsonOutput,
    stopSequences,
    isStreamEnabled,
    frequencyPenalty,
    presencePenalty,
    temperature,
    topP,
    maxTokens,
  ]);

  const nodeSnippet = useMemo(() => {
    const baseUrl = fimActive
      ? "https://api.deepseek.com/beta"
      : useBeta
      ? "https://api.deepseek.com/beta"
      : "https://api.deepseek.com";
    const messagesJson = JSON.stringify(conversationForSnippet, null, 2);
    const toolsJson = toolsForSnippet
      ? JSON.stringify(toolsForSnippet, null, 2)
      : null;
    const responseFormatJson = jsonOutput
      ? JSON.stringify({ type: "json_object" }, null, 2)
      : null;
    const stopJson =
      stopSequences && stopSequences.length > 0
        ? JSON.stringify(stopSequences, null, 2)
        : null;
    if (fimActive) {
      if (!isStreamEnabled) {
        return `// Please install OpenAI SDK first: \`npm install openai\`

import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function main() {
  const completion = await openai.completions.create({
    model: "${model}",
    prompt: ${JSON.stringify(fimPrefix + (lastUserMessage || ""), null, 2)},
    ${fimSuffix.trim().length > 0 ? `suffix: ${JSON.stringify(fimSuffix)},\n    ` : ""}max_tokens: ${normalizedFimMaxTokens},
    stream: false,
  });

  console.log(completion.choices[0].text);
}

main();`;
      }
      return `// Please install OpenAI SDK first: \`npm install openai\`

import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function main() {
  const stream = await openai.completions.create({
    model: "${model}",
    prompt: ${JSON.stringify(fimPrefix + (lastUserMessage || ""), null, 2)},
    ${fimSuffix.trim().length > 0 ? `suffix: ${JSON.stringify(fimSuffix)},\n    ` : ""}max_tokens: ${normalizedFimMaxTokens},
    stream: true,
  });

  for await (const chunk of stream) {
    if (chunk.choices?.[0]?.text) {
      process.stdout.write(chunk.choices[0].text);
    }
  }
}

main();`;
    }
    if (!isStreamEnabled) {
      return `// Please install OpenAI SDK first: \`npm install openai\`

import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "${model}",
    messages: ${messagesJson},
    frequency_penalty: ${frequencyPenalty},
    presence_penalty: ${presencePenalty},
    temperature: ${temperature},
    top_p: ${topP},
    max_tokens: ${maxTokens},
    ${toolsJson ? `tools: ${toolsJson},\n    ` : ""}${responseFormatJson ? `response_format: ${responseFormatJson},\n    ` : ""}${stopJson ? `stop: ${stopJson},\n    ` : ""}stream: false,
  });

  console.log(completion.choices[0].message.content);
}

main();`;
    }
    return `// Please install OpenAI SDK first: \`npm install openai\`

import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function main() {
  const stream = await openai.chat.completions.create({
    model: "${model}",
    messages: ${messagesJson},
    frequency_penalty: ${frequencyPenalty},
    presence_penalty: ${presencePenalty},
    temperature: ${temperature},
    top_p: ${topP},
    max_tokens: ${maxTokens},
    ${toolsJson ? `tools: ${toolsJson},\n    ` : ""}${responseFormatJson ? `response_format: ${responseFormatJson},\n    ` : ""}${stopJson ? `stop: ${stopJson},\n    ` : ""}stream: true,
  });

  for await (const chunk of stream) {
    if (chunk.choices?.[0]?.delta?.content) {
      process.stdout.write(chunk.choices[0].delta.content);
    }
  }
}

main();`;
  }, [
    conversationForSnippet,
    model,
    fimActive,
    useBeta,
    fimPrefix,
    fimSuffix,
    lastUserMessage,
    normalizedFimMaxTokens,
    toolsForSnippet,
    jsonOutput,
    stopSequences,
    isStreamEnabled,
    frequencyPenalty,
    presencePenalty,
    temperature,
    topP,
    maxTokens,
  ]);

  const codeSnippet = useMemo(() => {
    if (codeViewType === "python") return pythonSnippet;
    if (codeViewType === "node") return nodeSnippet;
    return curlSnippet;
  }, [codeViewType, curlSnippet, nodeSnippet, pythonSnippet]);

  const codeLanguage = useMemo(() => {
    if (codeViewType === "python") return "python";
    if (codeViewType === "node") return "javascript";
    return "bash";
  }, [codeViewType]);

  useEffect(() => {
    if (!isCodeCopied) return;
    const timer = window.setTimeout(() => setIsCodeCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [isCodeCopied]);

  useEffect(() => {
    setIsCodeCopied(false);
  }, [codeSnippet]);

  const handleCopyCode = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(codeSnippet);
      setIsCodeCopied(true);
    } catch {
      setIsCodeCopied(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sidebarOpenKey = `thread-${threadId}-ui-right-sidebar-open`;
    const paramsOpenKey = `thread-${threadId}-ui-parameters-open`;
    const advancedOpenKey = `thread-${threadId}-ui-advanced-open`;
    const toolsOpenKey = `thread-${threadId}-ui-tools-open`;
    const prefixOpenKey = `thread-${threadId}-ui-prefix-open`;
    const fimOpenKey = `thread-${threadId}-ui-fim-open`;
    const sidebarOpen = window.localStorage.getItem(sidebarOpenKey);
    const paramsOpen = window.localStorage.getItem(paramsOpenKey);
    const advancedOpen = window.localStorage.getItem(advancedOpenKey);
    const toolsOpen = window.localStorage.getItem(toolsOpenKey);
    const prefixOpen = window.localStorage.getItem(prefixOpenKey);
    const fimOpen = window.localStorage.getItem(fimOpenKey);
    if (sidebarOpen !== null) {
      setIsSidebarOpen(sidebarOpen === "true");
    }
    if (paramsOpen !== null) {
      setShowParametersBox(paramsOpen === "true");
    }
    if (advancedOpen !== null) {
      setShowAdvancedBox(advancedOpen === "true");
    }
    if (toolsOpen !== null) {
      setShowToolsBox(toolsOpen === "true");
    }
    if (prefixOpen !== null) {
      setShowPrefixBox(prefixOpen === "true");
    }
    if (fimOpen !== null) {
      setShowFimBox(fimOpen === "true");
    }
  }, [threadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `thread-${threadId}-ui-right-sidebar-open`,
      String(isSidebarOpen)
    );
  }, [isSidebarOpen, threadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `thread-${threadId}-ui-parameters-open`,
      String(showParametersBox)
    );
  }, [showParametersBox, threadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `thread-${threadId}-ui-advanced-open`,
      String(showAdvancedBox)
    );
  }, [showAdvancedBox, threadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `thread-${threadId}-ui-tools-open`,
      String(showToolsBox)
    );
  }, [showToolsBox, threadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `thread-${threadId}-ui-prefix-open`,
      String(showPrefixBox)
    );
  }, [showPrefixBox, threadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `thread-${threadId}-ui-fim-open`,
      String(showFimBox)
    );
  }, [showFimBox, threadId]);

  const getMaxTokensDefaults = (selectedModel: string) => {
    if (selectedModel === "deepseek-reasoner") {
      return { defaultMaxTokens: 32768, maxTokensLimit: 65536 };
    }
    return { defaultMaxTokens: 4096, maxTokensLimit: 8192 };
  };

  const { defaultMaxTokens, maxTokensLimit } = getMaxTokensDefaults(model);

  const resetParameters = () => {
    setFrequencyPenalty(0);
    setPresencePenalty(0);
    setTemperature(1);
    setTopP(1);
    setMaxTokens(defaultMaxTokens);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // モデル変更ハンドラのラッパー
  const handleModelChangeWrapper = (newModel: string) => {
    handleModelChange(newModel); // 常にモデルを更新
    // if (newModel === "deepseek-reasoner") {
    //   setError(
    //     "Currently, due to attacks on Deepseek servers, the deepseek-reasoner API might be unstable. If it doesn't work, please switch back to deepseek-chat."
    //   );
    // } else {
    //   setError(""); // 他のモデル選択時は警告をクリア
    // }
  };

  // ローカルストレージから初期値を読み込む
  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissed = window.localStorage.getItem(
        "dec12UpdateDismissed"
      );
      setShowUpdateBanner(dismissed !== "true");
    }

    const storedModel = localStorage.getItem(`thread-${threadId}-model`);
    const storedInput = localStorage.getItem(`thread-${threadId}-inputValue`);
    const storedSystemInput = localStorage.getItem(
      `thread-${threadId}-systemInput`
    );
    const storedFrequencyPenalty = localStorage.getItem(
      `thread-${threadId}-frequencyPenalty`
    );
    const storedPresencePenalty = localStorage.getItem(
      `thread-${threadId}-presencePenalty`
    );
    const storedTemperature = localStorage.getItem(
      `thread-${threadId}-temperature`
    );
    const storedTopP = localStorage.getItem(`thread-${threadId}-topP`);
    const storedMaxTokens = localStorage.getItem(
      `thread-${threadId}-maxTokens`
    );
    const storedFimPrefix = localStorage.getItem(
      `thread-${threadId}-fimPrefix`
    );
    const storedFimSuffix = localStorage.getItem(
      `thread-${threadId}-fimSuffix`
    );
    const storedFimMaxTokens = localStorage.getItem(
      `thread-${threadId}-fimMaxTokens`
    );
    const storedToolsJson = localStorage.getItem(
      `thread-${threadId}-toolsJson`
    );
    const storedToolsStrict = localStorage.getItem(
      `thread-${threadId}-toolsStrict`
    );
    const storedToolHandlersJson = localStorage.getItem(
      `thread-${threadId}-toolHandlersJson`
    );
    const storedJsonOutput = localStorage.getItem(
      `thread-${threadId}-jsonOutput`
    );

    if (storedModel && storedInput && storedSystemInput) {
      setModel(storedModel);
      setInput(storedInput);
      setSystemPrompt(storedSystemInput);
      localStorage.removeItem(`thread-${threadId}-model`);
      localStorage.removeItem(`thread-${threadId}-inputValue`);
      localStorage.removeItem(`thread-${threadId}-systemInput`);
    } else if (
      isFirstTime &&
      !storedModel &&
      !storedInput &&
      !storedSystemInput
    ) {
      setIsFirstTime(false);
    }

    if (storedFrequencyPenalty) {
      const parsed = Number.parseFloat(storedFrequencyPenalty);
      if (!Number.isNaN(parsed)) {
        setFrequencyPenalty(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-frequencyPenalty`);
    }
    if (storedPresencePenalty) {
      const parsed = Number.parseFloat(storedPresencePenalty);
      if (!Number.isNaN(parsed)) {
        setPresencePenalty(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-presencePenalty`);
    }
    if (storedTemperature) {
      const parsed = Number.parseFloat(storedTemperature);
      if (!Number.isNaN(parsed)) {
        setTemperature(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-temperature`);
    }
    if (storedTopP) {
      const parsed = Number.parseFloat(storedTopP);
      if (!Number.isNaN(parsed)) {
        setTopP(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-topP`);
    }
    if (storedMaxTokens) {
      const parsed = Number.parseInt(storedMaxTokens, 10);
      if (!Number.isNaN(parsed)) {
        setMaxTokens(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-maxTokens`);
    }
    if (storedFimPrefix !== null) {
      setFimPrefix(storedFimPrefix);
      localStorage.removeItem(`thread-${threadId}-fimPrefix`);
    }
    if (storedFimSuffix !== null) {
      setFimSuffix(storedFimSuffix);
      localStorage.removeItem(`thread-${threadId}-fimSuffix`);
    }
    if (storedFimMaxTokens) {
      const parsed = Number.parseInt(storedFimMaxTokens, 10);
      if (!Number.isNaN(parsed)) {
        setFimMaxTokens(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-fimMaxTokens`);
    }
    if (storedToolsJson) {
      setToolsJson(storedToolsJson);
      localStorage.removeItem(`thread-${threadId}-toolsJson`);
    }
    if (storedToolsStrict) {
      setToolsStrict(storedToolsStrict === "true");
      localStorage.removeItem(`thread-${threadId}-toolsStrict`);
    }
    if (storedToolHandlersJson) {
      setToolHandlersJson(storedToolHandlersJson);
      localStorage.removeItem(`thread-${threadId}-toolHandlersJson`);
    }
    if (storedJsonOutput) {
      setJsonOutput(storedJsonOutput === "true");
      localStorage.removeItem(`thread-${threadId}-jsonOutput`);
    }
  }, [
    threadId,
    setInput,
    setModel,
    setSystemPrompt,
    isFirstTime,
    setFrequencyPenalty,
    setPresencePenalty,
    setTemperature,
    setTopP,
    setMaxTokens,
    setFimPrefix,
    setFimSuffix,
    setFimMaxTokens,
    setToolsJson,
    setToolsStrict,
    setToolHandlersJson,
    setJsonOutput,
  ]);

  // 初回自動送信
  useEffect(() => {
    if (isFirstTime && model && input && systemPrompt) {
      setIsFirstTime(false);
      handleSend();
      return;
    }
  }, [model, input, systemPrompt, isFirstTime, handleSend]);

  const emailAddress = "numaothe@gmail.com";
  const githubUrl = "https://github.com/NumaoTakuya/deepseek_playground";
  const EMAIL_PLACEHOLDER = "__EMAIL_LINK__";
  const GITHUB_PLACEHOLDER = "__GITHUB_LINK__";
  const bannerText = t("chat.banner.update", {
    email: EMAIL_PLACEHOLDER,
    github: GITHUB_PLACEHOLDER,
  });
  const [bannerBeforeEmail, bannerAfterEmailRaw] = bannerText.split(EMAIL_PLACEHOLDER);
  const [bannerBetweenLinks, bannerAfterGithub = ""] = (bannerAfterEmailRaw || "").split(
    GITHUB_PLACEHOLDER
  );

  return (
    <Box display="flex" height="100%" position="relative">
      <Box flex="1" display="flex" flexDirection="column" minWidth={0}>
        {errorMessage && (
          <Alert severity="error" sx={{ mx: 2, my: 1 }}>
            {errorMessage}
          </Alert>
        )}

        <Box
          flex="1"
          minHeight={0}
          position="relative"
          display="flex"
          flexDirection="column"
        >
        <MessageList
          messages={messages}
          streamingAssistantId={assistantMsgId}
          assistantCoT={assistantCoT}
          assistantDraft={assistantDraft}
          assistantFinishReason={assistantFinishReason}
          waitingForFirstChunk={waitingForFirstChunk}
          prefixCompletionEnabled={prefixCompletionEnabled}
          onEditMessage={handleEditMessage}
          onRegenerateMessage={handleRegenerateMessage}
          onCompleteMessage={handleCompleteMessage}
          onBranchMessage={handleBranchMessageAndNavigate}
          onScrollStateChange={setIsAtBottom}
          onRegisterScrollToBottom={(fn) => {
              scrollToBottomRef.current = fn;
            }}
          />

          {!isAtBottom && (
            <Box
              sx={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: 16,
                zIndex: 2,
              }}
            >
              <IconButton
                className="scroll-to-bottom-inline"
                color="inherit"
                aria-label={t("chat.scrollToBottom")}
                onClick={() => scrollToBottomRef.current(true)}
                sx={{
                  color: "var(--color-subtext)",
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "none",
                  "&:hover": {
                    backgroundColor: "var(--color-panel)",
                  },
                }}
              >
                <ArrowDownwardIcon fontSize="inherit" sx={{ color: "inherit" }} />
              </IconButton>
            </Box>
          )}
        </Box>

        <InputSection
          input={input}
          setInput={setInput}
          handleSend={handleSend}
          handleKeyDown={handleKeyDown}
          assistantThinking={assistantThinking}
        />

        {showUpdateBanner && (
          <Box
            sx={{
              borderTop: "1px solid var(--color-border)",
              backgroundColor: "var(--color-panel)",
              color: "var(--color-text)",
              px: 2,
              py: 1.5,
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
            }}
          >
            <Typography variant="body2" sx={{ flex: 1 }}>
              {bannerBeforeEmail}
              <Box
                component="a"
                href={`mailto:${emailAddress}`}
                sx={{
                  color: "var(--color-primary)",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                {emailAddress}
              </Box>
              {bannerBetweenLinks}
              <Box
                component="a"
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: "var(--color-primary)",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                {t("common.github")}
              </Box>
              {bannerAfterGithub}
            </Typography>
            <IconButton
              size="small"
              aria-label={t("chat.banner.dismiss")}
              onClick={() => {
                setShowUpdateBanner(false);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(
                    "dec12UpdateDismissed",
                    "true"
                  );
                }
              }}
              sx={{ color: "var(--color-text)" }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          width: sidebarWidth,
          transition: "width 0.2s ease",
          borderLeft: "1px solid var(--color-border)",
          backgroundColor: "var(--color-panel)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            p: 1,
            gap: 1,
          }}
        >
          <IconButton
            onClick={toggleSidebar}
            size="small"
            sx={{ color: "var(--color-text)" }}
            aria-label={isSidebarOpen ? t("chat.controls.collapse") : t("chat.controls.expand")}
          >
            {isSidebarOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
          {isSidebarOpen && (
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t("chat.controls.chatSettings")}
            </Typography>
          )}
        </Box>
        {isSidebarOpen && (
          <Box sx={{ px: 2, pt: 1, pb: 2, overflowY: "auto", flex: 1 }}>
            <Box sx={{ mb: 2 }}>
              <FormControl
                fullWidth
                size="small"
                sx={{
                  backgroundColor: "transparent",
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": { borderColor: "var(--color-border)" },
                    "&:hover fieldset": { borderColor: "var(--color-hover)" },
                    "&.Mui-focused fieldset": {
                      borderColor: "var(--color-hover)",
                    },
                    "& .MuiSelect-select": {
                      color: "var(--color-text)",
                    },
                  },
                  "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: "var(--color-text)",
                  },
                }}
              >
                <InputLabel id="chat-settings-model-label">
                  {t("common.model")}
                </InputLabel>
                <Select
                  labelId="chat-settings-model-label"
                  label={t("common.model")}
                  value={model}
                  onChange={(e) =>
                    handleModelChangeWrapper(e.target.value as string)
                  }
                >
                  <MenuItem value="deepseek-chat">deepseek-chat</MenuItem>
                  <MenuItem value="deepseek-reasoner">deepseek-reasoner</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ mb: 2 }}>
              <SystemPromptSection
                systemPrompt={systemPrompt}
                setSystemPrompt={setSystemPrompt}
              />
              {typeof systemPromptTokenCount === "number" && (
                <Typography
                  variant="caption"
                  sx={{ color: "var(--color-subtext)", mt: 0.5, display: "block" }}
                >
                  {t("common.systemPromptTokens", {
                    count: formatCount(systemPromptTokenCount),
                  })}
                </Typography>
              )}
            </Box>

            <Box
              sx={{
                border: "1px solid var(--color-border)",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "var(--color-panel)",
                  color: "var(--color-text)",
                  p: 1,
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t("common.parameters")}
                </Typography>
                <IconButton
                  onClick={() => setShowParametersBox((prev) => !prev)}
                  sx={{ color: "var(--color-text)", ml: "auto" }}
                >
                  {showParametersBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>

              <Collapse in={showParametersBox} timeout={200} unmountOnExit>
                <Box sx={{ p: 2 }}>
                  <Box sx={{ mb: 3 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ color: "var(--color-text)" }}
                      >
                        {t("common.frequencyPenalty")}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: "var(--color-subtext)" }}
                      >
                        {frequencyPenalty.toFixed(1)}
                      </Typography>
                    </Box>
                    <Slider
                      value={frequencyPenalty}
                      onChange={(_, value) =>
                        setFrequencyPenalty(
                          Array.isArray(value) ? value[0] : value
                        )
                      }
                      min={-2}
                      max={2}
                      step={0.1}
                      sx={{ color: "var(--color-primary)" }}
                      aria-label="frequency penalty"
                    />
                    <Typography
                      variant="caption"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {t("common.frequencyPenaltyDescription")}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ color: "var(--color-text)" }}
                      >
                        {t("common.presencePenalty")}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: "var(--color-subtext)" }}
                      >
                        {presencePenalty.toFixed(1)}
                      </Typography>
                    </Box>
                    <Slider
                      value={presencePenalty}
                      onChange={(_, value) =>
                        setPresencePenalty(
                          Array.isArray(value) ? value[0] : value
                        )
                      }
                      min={-2}
                      max={2}
                      step={0.1}
                      sx={{ color: "var(--color-primary)" }}
                      aria-label="presence penalty"
                    />
                    <Typography
                      variant="caption"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {t("common.presencePenaltyDescription")}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ color: "var(--color-text)" }}
                      >
                        {t("common.temperature")}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: "var(--color-subtext)" }}
                      >
                        {temperature.toFixed(1)}
                      </Typography>
                    </Box>
                    <Slider
                      value={temperature}
                      onChange={(_, value) =>
                        setTemperature(Array.isArray(value) ? value[0] : value)
                      }
                      min={0}
                      max={2}
                      step={0.1}
                      sx={{ color: "var(--color-primary)" }}
                      aria-label="temperature"
                    />
                    <Typography
                      variant="caption"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {t("common.temperatureDescription")}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ color: "var(--color-text)" }}
                      >
                        {t("common.topP")}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: "var(--color-subtext)" }}
                      >
                        {topP.toFixed(2)}
                      </Typography>
                    </Box>
                    <Slider
                      value={topP}
                      onChange={(_, value) =>
                        setTopP(Array.isArray(value) ? value[0] : value)
                      }
                      min={0}
                      max={1}
                      step={0.05}
                      sx={{ color: "var(--color-primary)" }}
                      aria-label="top p"
                    />
                    <Typography
                      variant="caption"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {t("common.topPDescription")}
                    </Typography>
                  </Box>

                  <Box>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ color: "var(--color-text)" }}
                      >
                        {t("common.maxTokens")}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: "var(--color-subtext)" }}
                      >
                        {maxTokens}
                      </Typography>
                    </Box>
                    <Slider
                      value={maxTokens}
                      onChange={(_, value) =>
                        setMaxTokens(Array.isArray(value) ? value[0] : value)
                      }
                      min={1}
                      max={maxTokensLimit}
                      step={64}
                      sx={{ color: "var(--color-primary)" }}
                      aria-label="max tokens"
                    />
                    <Typography
                      variant="caption"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {t("common.maxTokensDescription")}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mt: 3,
                      gap: 2,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {t("common.toolsInfo")}
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={resetParameters}
                      sx={{
                        color: "var(--color-text)",
                        borderColor: "var(--color-border)",
                        minWidth: "64px",
                      }}
                    >
                      {t("common.reset")}
                    </Button>
                  </Box>
                </Box>
              </Collapse>
            </Box>

            <Box
              sx={{
                border: "1px solid var(--color-border)",
                mt: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "var(--color-panel)",
                  color: "var(--color-text)",
                  p: 1,
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t("common.advancedSettings")}
                </Typography>
                <IconButton
                  onClick={() => setShowAdvancedBox((prev) => !prev)}
                  sx={{ color: "var(--color-text)", ml: "auto" }}
                >
                  {showAdvancedBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>

              <Collapse in={showAdvancedBox} timeout={200} unmountOnExit>
                <Box sx={{ p: 2 }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      gap: 1,
                      mb: 0.5,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{ color: "var(--color-text)", fontWeight: 600 }}
                    >
                      {t("common.jsonOutput")}
                    </Typography>
                    <Switch
                      checked={jsonOutput}
                      onChange={(e) => handleJsonOutputToggle(e.target.checked)}
                      color="primary"
                    />
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--color-subtext)", display: "block", mb: 2 }}
                  >
                    {t("common.jsonOutputDescription")}
                  </Typography>
                  <Divider sx={{ my: 2, borderColor: "var(--color-border)" }} />
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color: "var(--color-text)",
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{ color: "var(--color-text)", fontWeight: 600 }}
                    >
                      {t("common.tools")}
                    </Typography>
                    <IconButton
                      onClick={() => setShowToolsBox((prev) => !prev)}
                      size="small"
                      sx={{ color: "var(--color-text)", ml: "auto" }}
                      aria-label={
                        showToolsBox
                          ? t("chat.controls.collapse")
                          : t("chat.controls.expand")
                      }
                    >
                      {showToolsBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>
                  <Collapse in={showToolsBox} timeout={200} unmountOnExit>
                    <Box
                      sx={{
                        pl: 2,
                        borderLeft: "1px solid var(--color-border)",
                      }}
                    >
                      <TextField
                        fullWidth
                        multiline
                        minRows={5}
                        label={t("common.toolsJson")}
                        placeholder={t("common.toolsJsonPlaceholder")}
                        value={toolsJson}
                        onChange={(e) => {
                          setToolsJson(e.target.value);
                          if (toolsJsonError) {
                            setToolsJsonError(null);
                          }
                        }}
                        error={Boolean(toolsJsonError)}
                        helperText={
                          toolsJsonError ?? t("common.toolsJsonDescription")
                        }
                        variant="outlined"
                        sx={{
                          mb: 2,
                          "& .MuiOutlinedInput-root": {
                            "& fieldset": { borderColor: "var(--color-border)" },
                            "&:hover fieldset": { borderColor: "var(--color-hover)" },
                            "&.Mui-focused fieldset": {
                              borderColor: "var(--color-hover)",
                            },
                          },
                          "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                          "& .MuiOutlinedInput-input": {
                            color: "var(--color-text)",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                          },
                          "& .MuiFormHelperText-root": {
                            color: "var(--color-subtext)",
                          },
                        }}
                      />
                      <TextField
                        fullWidth
                        multiline
                        minRows={4}
                        label={t("common.toolHandlersJson")}
                        placeholder={t("common.toolHandlersJsonPlaceholder")}
                        value={toolHandlersJson}
                        onChange={(e) => {
                          setToolHandlersJson(e.target.value);
                          if (toolHandlersJsonError) {
                            setToolHandlersJsonError(null);
                          }
                        }}
                        error={Boolean(toolHandlersJsonError)}
                        helperText={
                          toolHandlersJsonError ??
                          t("common.toolHandlersJsonDescription")
                        }
                        variant="outlined"
                        sx={{
                          mb: 2,
                          "& .MuiOutlinedInput-root": {
                            "& fieldset": { borderColor: "var(--color-border)" },
                            "&:hover fieldset": { borderColor: "var(--color-hover)" },
                            "&.Mui-focused fieldset": {
                              borderColor: "var(--color-hover)",
                            },
                          },
                          "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                          "& .MuiOutlinedInput-input": {
                            color: "var(--color-text)",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                          },
                          "& .MuiFormHelperText-root": {
                            color: "var(--color-subtext)",
                          },
                        }}
                      />
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-start",
                          gap: 1,
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          sx={{ color: "var(--color-text)", fontWeight: 600 }}
                        >
                          {t("common.strictMode")}
                        </Typography>
                        <Switch
                          checked={toolsStrict}
                          onChange={(e) =>
                            handleToolsStrictToggle(e.target.checked)
                          }
                          color="primary"
                        />
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{ color: "var(--color-subtext)", display: "block" }}
                      >
                        {t("common.strictModeDescription")}
                      </Typography>
                    </Box>
                  </Collapse>

                  <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid var(--color-border)" }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        color: "var(--color-text)",
                        mb: 1,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ color: "var(--color-text)", fontWeight: 600 }}
                      >
                        {t("common.prefixCompletionTitle")}
                      </Typography>
                      <Switch
                        checked={prefixCompletionEnabled}
                        onChange={(e) =>
                          handlePrefixCompletionToggle(e.target.checked)
                        }
                        color="primary"
                        sx={{ ml: 1 }}
                      />
                      <IconButton
                        onClick={() => setShowPrefixBox((prev) => !prev)}
                        size="small"
                        sx={{ color: "var(--color-text)", ml: "auto" }}
                        aria-label={
                          showPrefixBox
                            ? t("chat.controls.collapse")
                            : t("chat.controls.expand")
                        }
                      >
                        {showPrefixBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Box>
                    <Collapse in={showPrefixBox} timeout={200} unmountOnExit>
                      <Box sx={{ pl: 2, borderLeft: "1px solid var(--color-border)" }}>
                        <TextField
                          fullWidth
                          label={t("common.stopSequencesLabel")}
                          placeholder={t("common.stopSequencesPlaceholder")}
                          value={stopSequencesRaw}
                          onChange={(e) => setStopSequencesRaw(e.target.value)}
                          helperText={t("common.stopSequencesHelper")}
                          variant="outlined"
                          sx={{
                            "& .MuiOutlinedInput-root": {
                              "& fieldset": { borderColor: "var(--color-border)" },
                              "&:hover fieldset": { borderColor: "var(--color-hover)" },
                              "&.Mui-focused fieldset": {
                                borderColor: "var(--color-hover)",
                              },
                            },
                            "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                            "& .MuiOutlinedInput-input": {
                              color: "var(--color-text)",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                            },
                            "& .MuiFormHelperText-root": {
                              color: "var(--color-subtext)",
                            },
                          }}
                        />
                      </Box>
                    </Collapse>
                  </Box>

                  <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid var(--color-border)" }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        color: "var(--color-text)",
                        mb: 1,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ color: "var(--color-text)", fontWeight: 600 }}
                      >
                        {t("common.fimCompletionTitle")}
                      </Typography>
                      <IconButton
                        onClick={() => setShowFimBox((prev) => !prev)}
                        size="small"
                        sx={{ color: "var(--color-text)", ml: "auto" }}
                        aria-label={
                          showFimBox
                            ? t("chat.controls.collapse")
                            : t("chat.controls.expand")
                        }
                      >
                        {showFimBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Box>
                    <Collapse in={showFimBox} timeout={200} unmountOnExit>
                      <Box sx={{ pl: 2, borderLeft: "1px solid var(--color-border)" }}>
                        <TextField
                          fullWidth
                          multiline
                          minRows={3}
                          label={t("common.fimPrefixLabel")}
                          placeholder={t("common.fimPrefixPlaceholder")}
                          value={fimPrefix}
                          onChange={(e) => setFimPrefix(e.target.value)}
                          variant="outlined"
                          sx={{
                            mb: 2,
                            "& .MuiOutlinedInput-root": {
                              "& fieldset": { borderColor: "var(--color-border)" },
                              "&:hover fieldset": { borderColor: "var(--color-hover)" },
                              "&.Mui-focused fieldset": {
                                borderColor: "var(--color-hover)",
                              },
                            },
                            "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                            "& .MuiOutlinedInput-input": {
                              color: "var(--color-text)",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                            },
                          }}
                        />
                        <TextField
                          fullWidth
                          multiline
                          minRows={3}
                          label={t("common.fimSuffixLabel")}
                          placeholder={t("common.fimSuffixPlaceholder")}
                          value={fimSuffix}
                          onChange={(e) => setFimSuffix(e.target.value)}
                          variant="outlined"
                          sx={{
                            mb: 2,
                            "& .MuiOutlinedInput-root": {
                              "& fieldset": { borderColor: "var(--color-border)" },
                              "&:hover fieldset": { borderColor: "var(--color-hover)" },
                              "&.Mui-focused fieldset": {
                                borderColor: "var(--color-hover)",
                              },
                            },
                            "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                            "& .MuiOutlinedInput-input": {
                              color: "var(--color-text)",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                            },
                          }}
                        />
                        <Box sx={{ mb: 1 }}>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              mb: 1,
                            }}
                          >
                            <Typography
                              variant="subtitle2"
                              sx={{ color: "var(--color-text)" }}
                            >
                              {t("common.fimMaxTokensLabel")}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ color: "var(--color-subtext)" }}
                            >
                              {fimMaxTokens}
                            </Typography>
                          </Box>
                          <Slider
                            value={fimMaxTokens}
                            onChange={(_, value) =>
                              setFimMaxTokens(
                                Array.isArray(value) ? value[0] : value
                              )
                            }
                            min={1}
                            max={4096}
                            step={64}
                            sx={{ color: "var(--color-primary)" }}
                            aria-label="fim max tokens"
                          />
                        </Box>
                      </Box>
                    </Collapse>
                  </Box>
                </Box>
              </Collapse>
            </Box>

          </Box>
        )}
        {isSidebarOpen && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Divider sx={{ mb: 2, borderColor: "var(--color-border)" }} />
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 1,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ color: "var(--color-text)" }}
              >
                {t("common.tokenUsageTotal")}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "var(--color-subtext)" }}
              >
                {formatCount(totalTokens)}
              </Typography>
            </Box>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 0.5,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ color: "var(--color-text)" }}
              >
                {t("common.tokenUsageCostRange")}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "var(--color-subtext)" }}
              >
                ${formatCost(costLower)} – ${formatCost(costUpper)}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: "var(--color-subtext)" }}>
              {t("common.tokenUsageCostNote")}
            </Typography>
            <Divider sx={{ my: 2, borderColor: "var(--color-border)" }} />
            <Button
              fullWidth
              variant="outlined"
              onClick={() => setIsCodeModalOpen(true)}
              sx={{
                color: "var(--color-text)",
                borderColor: "var(--color-border)",
                textTransform: "none",
                fontWeight: 600,
              }}
              startIcon={<CodeIcon />}
            >
              {t("chat.viewCode")}
            </Button>
          </Box>
        )}
      </Box>

      <Dialog
        open={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        fullWidth
        maxWidth="lg"
        PaperProps={{
          sx: {
            backgroundColor: "var(--color-panel)",
            color: "var(--color-text)",
            height: "80vh",
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          {t("chat.viewCodeTitle")}
          <IconButton
            size="small"
            onClick={() => setIsCodeModalOpen(false)}
            sx={{ color: "var(--color-text)" }}
            aria-label={t("common.close")}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            height: "100%",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "nowrap",
            }}
          >
            <ToggleButtonGroup
              value={codeViewType}
              exclusive
              onChange={(_, value) => {
                if (value) setCodeViewType(value as "curl" | "python" | "node");
              }}
              size="small"
              sx={{
                "& .MuiToggleButton-root": {
                  color: "var(--color-text)",
                  borderColor: "var(--color-border)",
                  textTransform: "none",
                  fontWeight: 600,
                },
                "& .MuiToggleButton-root.Mui-selected": {
                  backgroundColor: "var(--color-hover)",
                  color: "var(--color-text)",
                },
              }}
            >
              <ToggleButton value="curl">curl</ToggleButton>
              <ToggleButton value="python">python</ToggleButton>
              <ToggleButton value="node">nodejs</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" sx={{ color: "var(--color-subtext)" }}>
                stream
              </Typography>
              <Switch
                checked={isStreamEnabled}
                onChange={(e) => setIsStreamEnabled(e.target.checked)}
                color="primary"
              />
            </Box>
            <Tooltip
              title={isCodeCopied ? t("common.copied") : t("common.copy")}
              arrow
            >
              <IconButton
                onClick={handleCopyCode}
                sx={{
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 1,
                }}
                aria-label={t("common.copy")}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Box
            sx={{
              flex: 1,
              overflow: "hidden",
              border: "1px solid var(--color-border)",
              borderRadius: 1,
            }}
          >
            <SyntaxHighlighter
              language={codeLanguage}
              style={oneDark}
              showLineNumbers={false}
              customStyle={{
                margin: 0,
                height: "100%",
                overflow: "auto",
                background: "var(--color-bg)",
                padding: "16px",
                fontSize: "0.85rem",
                lineHeight: 1.6,
              }}
              codeTagProps={{
                style: {
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                },
              }}
            >
              {codeSnippet}
            </SyntaxHighlighter>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
