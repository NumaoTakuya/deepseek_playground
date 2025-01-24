import React, { useLayoutEffect, useRef } from "react";
import { Box, CircularProgress } from "@mui/material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// KaTeX auto-render
import "katex/dist/katex.min.css";
import renderMathInElement from "katex/dist/contrib/auto-render.mjs";

import type { Message } from "../../types";

interface MessageListProps {
  messages: Message[];
  streamingAssistantId?: string | null;
  waitingForFirstChunk: boolean;
  assistantDraft?: string;
}

/** \(...\)/\[...\] を二重バックスラッシュにする（元の関数） */
function escapeLaTeXDelimiters(text: string) {
  return text
    .replace(/\\\(/g, "\\\\(")
    .replace(/\\\)/g, "\\\\)")
    .replace(/\\\[/g, "\\\\[")
    .replace(/\\\]/g, "\\\\]");
}

/** auto-renderに拾われず残った “\\(” などを元に戻す（元の関数） */
function revertDoubleBackslashes(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue) {
      node.nodeValue = node.nodeValue
        .replace(/\\\\\(/g, "\\(")
        .replace(/\\\\\)/g, "\\)")
        .replace(/\\\\\[/g, "\\[")
        .replace(/\\\\\]/g, "\\]");
    }
  }
}

export default function MessageList({
  messages,
  streamingAssistantId,
  waitingForFirstChunk,
  assistantDraft,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * useLayoutEffect: “DOMが描画されてレイアウトが済んだ直後” に実行。
   * 通常のuseEffectより早いタイミングでDOMの整合を確保しやすい。
   */
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    try {
      // auto-renderで数式変換
      renderMathInElement(containerRef.current, {
        delimiters: [
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });

      // 変換されなかった“\\(” などを元に戻す
      revertDoubleBackslashes(containerRef.current);
    } catch (err) {
      // 衝突などのエラーが出るとここに来る
      console.error("KaTeX auto-render error:", err);
    }
  }, [messages, assistantDraft]);

  return (
    <Box ref={containerRef} flex="1" overflow="auto" p={2}>
      {messages.map((msg) => {
        if (msg.role === "system") return null;

        const isAssistant = msg.role === "assistant";
        const isStreaming = isAssistant && msg.id === streamingAssistantId;

        // 現在のテキスト
        const textToShow = isStreaming ? assistantDraft ?? "" : msg.content;

        // “Thinking...”
        const showThinking = isStreaming && waitingForFirstChunk;

        // Markdown前に二重バックスラッシュ
        const escapedContent = escapeLaTeXDelimiters(textToShow || "");

        return (
          <Box className="bubble-container" key={msg.id}>
            <Box className={`bubble ${isAssistant ? "assistant" : "user"}`}>
              <div
                className="bubble-label"
                style={{ color: isAssistant ? "#ccc" : "#F0F0F0" }}
              >
                {msg.role}
              </div>

              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {escapedContent}
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
