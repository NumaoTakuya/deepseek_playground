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
  const [isCoTExpanded, setIsCoTExpanded] = useState(true);

  const toggleCoT = () => {
    setIsCoTExpanded(!isCoTExpanded);
  };

  return (
    <Box flex="1" overflow="auto" p={2}>
      {messages.map((msg, index) => {
        if (msg.role === "system") return null;

        const isAssistant = msg.role === "assistant";
        const isStreaming = isAssistant && msg.id === streamingAssistantId;
        const textToShow = isStreaming ? assistantDraft ?? "" : msg.content;
        const showThinking = isStreaming && waitingForFirstChunk;
        const convertedText = convertRoundBracketsToDollar(textToShow);

        return (
          <Box className="bubble-container" key={msg.id}>
            <Box className={`bubble ${isAssistant ? "assistant" : "user"}`}>
              <div className="bubble-label">
                {msg.role}
              </div>

              {isAssistant && index == messages.length - 1 && assistantCoT && (
                <Box sx={{ mt: 1 }}>
                  {" "}
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
                    onClick={toggleCoT}
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
                        ? "Collapse Chain of Thoughts"
                        : "Expand Chain of Thoughts"}
                    </span>
                  </Box>
                  <Collapse in={isCoTExpanded}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      className="react-markdown"
                    >
                      {formatQuote(assistantCoT)}
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
                  <span>Thinking...</span>
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
