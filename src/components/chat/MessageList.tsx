import React, { useEffect, useRef } from "react";
import { Box, CircularProgress } from "@mui/material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// KaTeX関連
import "katex/dist/katex.min.css";
import renderMathInElement from "katex/dist/contrib/auto-render.mjs";

import type { Message } from "../../types";

/**
 * 親コンポーネントから渡す `streamingAssistantId` は
 *   「いまストリーミング中のアシスタントメッセージのID」
 * `waitingForFirstChunk` は
 *   「最初のチャンクを受信していない段階かどうか」
 * などを示す想定。
 */
interface MessageListProps {
  messages: Message[];
  streamingAssistantId?: string | null;
  waitingForFirstChunk: boolean;
  assistantDraft?: string;
}

/**
 * (1) Markdownにかける前に:
 *   - \(...\) / \[...\] / \) / \] を二重バックスラッシュにしておく
 *   - 例: \(\frac{a}{b}\) → \\(\frac{a}{b}\\)
 *         \[x^2\]        → \\[x^2\\]
 */
function escapeLaTeXDelimiters(text: string) {
  return text
    .replace(/\\\(/g, "\\\\(")
    .replace(/\\\)/g, "\\\\)")
    .replace(/\\\[/g, "\\\\[")
    .replace(/\\\]/g, "\\\\]");
}

/**
 * (3) KaTeX 変換されなかった部分に残った \\( や \\) を再び \(...\) に戻す
 *     => "ユーザーに単なる文字列として見せたい場合" に戻すため
 */
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

/**
 * MessageListコンポーネント:
 * - messages: 表示するメッセージ一覧
 * - streamingAssistantId: “Thinking...” を表示中のアシスタントメッセージのID
 * - waitingForFirstChunk: 最初のチャンクが来る前かどうか
 */
export default function MessageList({
  messages,
  streamingAssistantId,
  waitingForFirstChunk,
  assistantDraft,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    renderMathInElement(containerRef.current, {
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
    revertDoubleBackslashes(containerRef.current);
  }, [messages, assistantDraft]);

  return (
    <Box ref={containerRef} flex="1" overflow="auto" p={2}>
      {messages.map((msg) => {
        if (msg.role === "system") return null;

        const isAssistant = msg.role === "assistant";
        // streaming中かどうか
        const isStreaming = isAssistant && streamingAssistantId === msg.id;

        // 現在メッセージのテキストは msg.content だが
        // もし streaming中なら “assistantDraft” を表示
        const textToShow = isStreaming ? assistantDraft ?? "" : msg.content;

        // “Thinking...” は
        //  - streamingAssistantId がこのメッセージ
        //  - かつ waitingForFirstChunk === true
        const showThinking = isStreaming && waitingForFirstChunk;

        const escapedContent = escapeLaTeXDelimiters(textToShow || "");

        return (
          <Box className="bubble-container" key={msg.id}>
            <Box
              className={`bubble ${msg.role === "user" ? "user" : "assistant"}`}
            >
              <div
                className="bubble-label"
                style={{ color: msg.role === "user" ? "#F0F0F0" : "#ccc" }}
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
