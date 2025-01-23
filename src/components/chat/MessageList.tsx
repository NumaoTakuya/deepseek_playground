import React, { useEffect, useRef } from "react";
import { Box, CircularProgress } from "@mui/material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// KaTeX関連
import "katex/dist/katex.min.css";
import renderMathInElement from "katex/dist/contrib/auto-render.mjs";

import type { Message } from "../../types";

interface MessageListProps {
  messages: Message[];
  waitingForFirstChunk: boolean;
}

/**
 * (1) Markdownにかける前に:
 *   - \(...\) / \[...\] / \) / \] を二重バックスラッシュにしておく
 *   - 例: \(\frac{a}{b}\) → \\(\frac{a}{b}\\)
 *         \[x^2\]        → \\[x^2\\]
 */
function escapeLaTeXDelimiters(text: string) {
  return (
    text
      // すでに \\( ... ) のようになってる場合を考慮すると正規表現が増えるが、
      // ここでは簡易的に「単一バックスラッシュ」を「二重に」する例を示す。
      .replace(/\\\(/g, "\\\\(")
      .replace(/\\\)/g, "\\\\)")
      .replace(/\\\[/g, "\\\\[")
      .replace(/\\\]/g, "\\\\]")
  );
}

/**
 * (3) KaTeXで数式変換されなかった部分に残った \\( や \\) を再び \(...\) に戻す
 *     => "ユーザーに単なる文字列として見せたい場合" に戻すため
 */
function revertDoubleBackslashes(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    node.nodeValue = node
      .nodeValue!.replace(/\\\\\(/g, "\\(")
      .replace(/\\\\\)/g, "\\)")
      .replace(/\\\\\[/g, "\\[")
      .replace(/\\\\\]/g, "\\]");
  }
}

export default function MessageList({
  messages,
  waitingForFirstChunk,
}: MessageListProps) {
  // 最後のassistantメッセージ (もしあれば)
  const lastAssistantMsg = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const lastAssistantId = lastAssistantMsg?.id;

  // コンポーネント全体をラップし、KaTeX auto-render のターゲットにする
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // (2) KaTeX auto-render 実行
    renderMathInElement(containerRef.current, {
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });

    // (3) KaTeX 変換されずに残ったテキストの \\( などを元に戻す
    revertDoubleBackslashes(containerRef.current);
  }, [messages]);

  return (
    <Box ref={containerRef} flex="1" overflow="auto" p={2}>
      {messages.map((msg) => {
        if (msg.role === "system") return null;

        const isUser = msg.role === "user";
        const isAssistant = msg.role === "assistant";
        const isLastAssistant = msg.id === lastAssistantId;

        // (1) \(...\) -> \\(...\\) などのエスケープ
        const escapedContent = escapeLaTeXDelimiters(msg.content);

        return (
          <Box className="bubble-container" key={msg.id}>
            <Box className={`bubble ${isUser ? "user" : "assistant"}`}>
              <div
                className="bubble-label"
                style={{ color: isUser ? "#F0F0F0" : "#ccc" }}
              >
                {msg.role}
              </div>

              {/* remarkPlugins={[remarkGfm]} はMarkdown拡張でテーブルや脚注等をサポート */}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {escapedContent}
              </ReactMarkdown>

              {isAssistant && isLastAssistant && waitingForFirstChunk && (
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
