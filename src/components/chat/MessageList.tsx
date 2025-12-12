// src/components/chat/MessageList.tsx
import React, { useState } from "react";
import { Box, CircularProgress, Collapse, IconButton } from "@mui/material";
import { ExpandMore, ExpandLess } from "@mui/icons-material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import type { Message } from "../../types";
import { useTranslation } from "../../contexts/LanguageContext";

interface MessageListProps {
  messages: Message[];
  streamingAssistantId?: string | null;
  waitingForFirstChunk: boolean;
  assistantCoT?: string | null;
  assistantDraft?: string;
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

export default function MessageList({
  messages,
  streamingAssistantId,
  waitingForFirstChunk,
  assistantCoT,
  assistantDraft,
}: MessageListProps) {
  const [expandedCoTs, setExpandedCoTs] = useState<Record<string, boolean>>({});
  const { t } = useTranslation();

  const toggleCoT = (messageId: string) => {
    setExpandedCoTs((prev) => ({
      ...prev,
      [messageId]: !(prev[messageId] ?? true),
    }));
  };

  return (
    <Box flex="1" overflow="auto" p={2}>
      {messages.map((msg) => {
        if (msg.role === "system") return null;

        const isAssistant = msg.role === "assistant";
        const isStreaming = isAssistant && msg.id === streamingAssistantId;
        const textToShow = isStreaming ? assistantDraft ?? "" : msg.content;
        const showThinking = isStreaming && waitingForFirstChunk;
        const convertedText = convertRoundBracketsToDollar(textToShow);
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
        const roleLabel =
          msg.role === "assistant"
            ? t("chat.roles.assistant")
            : msg.role === "user"
            ? t("chat.roles.user")
            : msg.role;

        return (
          <Box className="bubble-container" key={msg.id}>
            <Box className={`bubble ${isAssistant ? "assistant" : "user"}`}>
              <div className="bubble-label">
                {roleLabel}
              </div>

              {isAssistant && hasThinkingContent && (
                <Box sx={{ mt: 1 }}>
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
                  <Collapse in={isCoTExpanded}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      className="react-markdown"
                    >
                      {formatQuote(thinkingText)}
                    </ReactMarkdown>
                  </Collapse>
                </Box>
              )}

              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                className="react-markdown"
              >
                {convertedText}
              </ReactMarkdown>

              {showThinking && (
                <Box display="flex" alignItems="center" gap={1} mt={1}>
                  <CircularProgress size={16} thickness={5} />
                  <span>{t("chat.messages.thinking")}</span>
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
