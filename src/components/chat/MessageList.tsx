// src/components/chat/MessageList.tsx
import React, { useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  TextField,
  Tooltip,
} from "@mui/material";
import {
  ExpandMore,
  ExpandLess,
  ContentCopy,
  Edit,
  Refresh,
  CallSplit,
} from "@mui/icons-material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { Pluggable } from "unified";

import type { Message } from "../../types";
import { useTranslation } from "../../contexts/LanguageContext";

interface MessageListProps {
  messages: Message[];
  streamingAssistantId?: string | null;
  waitingForFirstChunk: boolean;
  assistantCoT?: string | null;
  assistantDraft?: string;
  assistantFinishReason?: string | null;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onRegenerateMessage?: (messageId: string) => Promise<void>;
  onBranchMessage?: (messageId: string) => Promise<void>;
  onScrollStateChange?: (isAtBottom: boolean) => void;
  onRegisterScrollToBottom?: (fn: (smooth?: boolean) => void) => void;
}

/**
 * 1) `\( ...\)` / `\[ ...\]` → `$...$` / `$$...$$`
 *    これにより remark-math が標準対応する数式記法に変換する
 */
function convertRoundBracketsToDollar(str: string) {
  str = str.replace(
    /\\\[((?:\\.|[\s\S])+?)\\\]/g,
    (_m, inner) => `$$${inner}$$`
  );
  str = str.replace(/\\\(((?:\\.|[\s\S])+?)\\\)/g, (_m, inner) => `$${inner}$`);
  return str;
}

function formatQuote(text: string): string {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim() !== "");
  const quotedParagraphs = paragraphs.map((paragraph) => {
    return paragraph
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  });
  return quotedParagraphs.join("\n\n");
}

type MarkdownBlockProps = {
  text: string;
  remarkPlugins: Pluggable[];
  rehypePlugins: Pluggable[];
};

type MarkdownBlockState = {
  hasError: boolean;
  lastText: string;
};

class MarkdownBlock extends React.Component<MarkdownBlockProps, MarkdownBlockState> {
  state: MarkdownBlockState = {
    hasError: false,
    lastText: this.props.text,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[markdown] render failed, falling back to plain text", error);
  }

  componentDidUpdate(prevProps: MarkdownBlockProps) {
    if (prevProps.text !== this.props.text) {
      this.setState({ hasError: false, lastText: this.props.text });
    }
  }

  render() {
    const { text, remarkPlugins, rehypePlugins } = this.props;
    if (this.state.hasError) {
      return (
        <Box className="react-markdown" sx={{ whiteSpace: "pre-wrap" }}>
          {text}
        </Box>
      );
    }
    return (
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        className="react-markdown"
      >
        {text}
      </ReactMarkdown>
    );
  }
}

export default function MessageList({
  messages,
  streamingAssistantId,
  waitingForFirstChunk,
  assistantCoT,
  assistantDraft,
  assistantFinishReason,
  onEditMessage,
  onRegenerateMessage,
  onBranchMessage,
  onScrollStateChange,
  onRegisterScrollToBottom,
}: MessageListProps) {
  const [expandedCoTs, setExpandedCoTs] = useState<Record<string, boolean>>({});
  const [copiedState, setCopiedState] = useState<Record<string, boolean>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingPendingId, setEditingPendingId] = useState<string | null>(null);
  const copyTimeoutsRef = useRef<Record<string, number>>({});
  const isAtBottomRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation();
  const katexPlugins: Pluggable[] = [
    [
      rehypeKatex,
      {
        throwOnError: false,
        strict: "ignore",
      },
    ],
  ];

  const toggleCoT = (messageId: string) => {
    setExpandedCoTs((prev) => ({
      ...prev,
      [messageId]: !(prev[messageId] ?? true),
    }));
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  const markCopied = (key: string) => {
    setCopiedState((prev) => ({ ...prev, [key]: true }));
    const existing = copyTimeoutsRef.current[key];
    if (existing) {
      window.clearTimeout(existing);
    }
    copyTimeoutsRef.current[key] = window.setTimeout(() => {
      setCopiedState((prev) => ({ ...prev, [key]: false }));
      delete copyTimeoutsRef.current[key];
    }, 1500);
  };

  const formatTimestamp = (value: Message["createdAt"]) => {
    if (!value) return "";
    if (typeof value === "object" && "toDate" in value) {
      return value.toDate().toLocaleString();
    }
    return "";
  };

  const formatBranchTimestamp = (value?: string) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  const startEditing = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingValue(content);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingValue("");
  };

  const submitEditing = async (messageId: string) => {
    if (!onEditMessage) return;
    const content = editingValue;
    setEditingMessageId(null);
    setEditingValue("");
    setEditingPendingId(messageId);
    try {
      await onEditMessage(messageId, content);
    } finally {
      setEditingPendingId(null);
    }
  };

  const updateIsAtBottom = () => {
    const container = scrollRef.current;
    if (!container) return;
    const threshold = 48;
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
    isAtBottomRef.current = atBottom;
    onScrollStateChange?.(atBottom);
  };

  const scrollToBottom = (smooth = false) => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  React.useEffect(() => {
    onRegisterScrollToBottom?.(scrollToBottom);
  }, [onRegisterScrollToBottom]);

  React.useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom(false);
    }
    updateIsAtBottom();
  }, [messages, assistantDraft, assistantCoT, waitingForFirstChunk]);

  return (
    <Box flex="1" minHeight={0} position="relative">
      <Box
        ref={scrollRef}
        onScroll={updateIsAtBottom}
        height="100%"
        overflow="auto"
        p={2}
      >
        {messages.map((msg) => {
          if (msg.role === "system") return null;

        const isAssistant = msg.role === "assistant";
        const isStreaming = isAssistant && msg.id === streamingAssistantId;
        const textToShow = isStreaming ? assistantDraft ?? "" : msg.content;
        const showThinking = isStreaming && waitingForFirstChunk;
        const convertedText = convertRoundBracketsToDollar(textToShow);
        const isEditing = editingMessageId === msg.id;
        const rawThinkingContent = isStreaming
          ? assistantCoT
          : msg.thinking_content ?? null;
        const hasThinkingContent =
          typeof rawThinkingContent === "string" &&
          rawThinkingContent.trim().length > 0;
        const isCoTExpanded = expandedCoTs[msg.id] ?? true;
        const thinkingText = hasThinkingContent
          ? (rawThinkingContent as string).trim()
          : "";
        const finishReason = isStreaming
          ? assistantFinishReason
          : msg.finish_reason ?? null;
        const isLengthFinish = finishReason === "length";
        const roleLabel =
          msg.role === "assistant"
            ? t("chat.roles.assistant")
            : msg.role === "user"
            ? t("chat.roles.user")
            : msg.role;
        const copyMessageKey = `${msg.id}-content`;
        const copyThinkingKey = `${msg.id}-thinking`;
        const messageCopyLabel = copiedState[copyMessageKey]
          ? t("chat.copy.content.copied")
          : t("chat.copy.content");
        const thinkingCopyLabel = copiedState[copyThinkingKey]
          ? t("chat.copy.thinking.copied")
          : t("chat.copy.thinking");

        return (
          <React.Fragment key={msg.id}>
            <Box className="bubble-container">
              <Box className={`bubble-stack ${isAssistant ? "assistant" : "user"}`}>
                <Box className={`bubble ${isAssistant ? "assistant" : "user"}`}>
                <div className="bubble-label">{roleLabel}</div>

                {isAssistant && hasThinkingContent && (
                  <Box sx={{ mt: 1 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          color: "#666",
                          "&:hover": { backgroundColor: "rgba(0,0,0,0.05)" },
                          borderRadius: 1,
                          p: 0.5,
                          width: "fit-content",
                        }}
                        onClick={() => toggleCoT(msg.id)}
                      >
                        <IconButton
                          size="small"
                          sx={{
                            p: 0.5,
                            color: "inherit",
                            "&:hover": { backgroundColor: "transparent" },
                          }}
                        >
                          {isCoTExpanded ? <ExpandLess /> : <ExpandMore />}
                        </IconButton>
                        <span
                          style={{
                            fontSize: "0.8rem",
                            userSelect: "none",
                          }}
                        >
                          {isCoTExpanded
                            ? t("chat.cot.collapse")
                            : t("chat.cot.expand")}
                        </span>
                      </Box>
                      <Tooltip title={thinkingCopyLabel}>
                        <IconButton
                          size="small"
                          className="copy-button"
                          sx={{ color: "var(--color-subtext)" }}
                          aria-label="Copy thinking content"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyToClipboard(thinkingText);
                            markCopied(copyThinkingKey);
                          }}
                        >
                          <ContentCopy fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Collapse in={isCoTExpanded}>
                      <MarkdownBlock
                        text={formatQuote(thinkingText)}
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={katexPlugins}
                      />
                    </Collapse>
                  </Box>
                )}

                {msg.role === "user" && isEditing ? (
                  <Box sx={{ mt: 0.5 }}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                      value={editingValue}
                      onChange={(event) => setEditingValue(event.target.value)}
                    />
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 1,
                        mt: 1,
                      }}
                    >
                      <Button size="small" onClick={cancelEditing}>
                        {t("common.cancel")}
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => void submitEditing(msg.id)}
                        disabled={editingPendingId === msg.id}
                      >
                        {t("common.send")}
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <MarkdownBlock
                    text={convertedText}
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={katexPlugins}
                  />
                )}

                {showThinking && (
                  <Box display="flex" alignItems="center" gap={1} mt={1}>
                    <CircularProgress size={16} thickness={5} />
                    <span>{t("chat.messages.thinking")}</span>
                  </Box>
                )}
              </Box>
                {!isEditing && (
                  <div className="bubble-footer">
                  {isAssistant && finishReason ? (
                    <div
                      className={`finish-reason${
                        isLengthFinish ? " finish-reason-length" : ""
                      }`}
                    >
                      <span>
                        {t("chat.finishReason.label", { reason: finishReason })}
                      </span>
                      {isLengthFinish && (
                        <span className="finish-reason-warning">
                          {t("chat.finishReason.lengthWarning")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span />
                  )}
                  <div className="bubble-actions">
                    {msg.role === "user" && (
                      <Tooltip title={t("common.edit")}>
                        <IconButton
                          size="small"
                          className="copy-button"
                          aria-label="Edit message"
                          onClick={() => startEditing(msg.id, msg.content)}
                        >
                          <Edit fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {isAssistant && (
                      <Tooltip title={t("chat.branch")}>
                        <IconButton
                          size="small"
                          className="copy-button"
                          aria-label="Branch thread"
                          onClick={() => onBranchMessage?.(msg.id)}
                        >
                          <CallSplit fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {isAssistant && (
                      <Tooltip title={t("chat.regenerate")}>
                        <IconButton
                          size="small"
                          className="copy-button"
                          aria-label="Regenerate message"
                          onClick={() => onRegenerateMessage?.(msg.id)}
                        >
                          <Refresh fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title={messageCopyLabel}>
                      <IconButton
                        size="small"
                        className="copy-button"
                        aria-label="Copy message"
                        onClick={() => {
                          void copyToClipboard(textToShow);
                          markCopied(copyMessageKey);
                        }}
                      >
                        <ContentCopy fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  </div>
                  </div>
                )}
              </Box>
            </Box>
            {isAssistant && msg.branch_thread_id && (
              <div className="branch-divider">
                <span className="branch-marker-line" />
                <span className="branch-marker-text">
                  {t("chat.branch.marker", {
                    title: msg.branch_thread_title ?? "",
                    date:
                      formatBranchTimestamp(msg.branch_created_at) ||
                      formatTimestamp(msg.createdAt) ||
                      t("chat.branch.unknownDate"),
                  })}
                </span>
                <span className="branch-marker-line" />
              </div>
            )}
          </React.Fragment>
        );
        })}
      </Box>
    </Box>
  );
}
