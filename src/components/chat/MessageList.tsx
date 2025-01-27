// src/components/chat/MessageList.tsx

import React from "react";
import { Box, CircularProgress } from "@mui/material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css"; // KaTeX用のCSS

import type { Message } from "../../types";

/**
 * 親コンポーネントから渡す props:
 * - messages
 * - streamingAssistantId: いまストリーミング中のアシスタントメッセージID
 * - waitingForFirstChunk: 最初のチャンクをまだ受信してないかどうか
 * - assistantDraft: ストリーミング途中の文章(リアルタイム表示用)
 */
interface MessageListProps {
  messages: Message[];
  streamingAssistantId?: string | null;
  waitingForFirstChunk: boolean;
  assistantDraft?: string;
}

/**
 * 1) `\( ...\)` / `\[ ...\]` → `$...$` / `$$...$$`
 *    これにより remark-math が標準対応する数式記法に変換する
 */
function convertRoundBracketsToDollar(str: string) {
  // \[ ... \]
  str = str.replace(
    /\\\[((?:\\.|[\s\S])+?)\\\]/g,
    (_m, inner) => `$$${inner}$$`
  );
  // \( ... \)
  str = str.replace(/\\\(((?:\\.|[\s\S])+?)\\\)/g, (_m, inner) => `$${inner}$`);
  return str;
}

export default function MessageList({
  messages,
  streamingAssistantId,
  waitingForFirstChunk,
  assistantDraft,
}: MessageListProps) {
  return (
    <Box flex="1" overflow="auto" p={2}>
      {messages.map((msg) => {
        if (msg.role === "system") return null; // systemは非表示

        const isAssistant = msg.role === "assistant";
        // “ストリーミング中”かどうか
        const isStreaming = isAssistant && msg.id === streamingAssistantId;

        // テキストを表示する内容
        const textToShow = isStreaming ? assistantDraft ?? "" : msg.content;

        // “Thinking...”フラグ
        const showThinking = isStreaming && waitingForFirstChunk;

        // 2) `\(...\)` / `\[...\]` を `$...$` / `$$...$$` に置換
        const convertedText = convertRoundBracketsToDollar(textToShow);

        return (
          <Box className="bubble-container" key={msg.id}>
            <Box className={`bubble ${isAssistant ? "assistant" : "user"}`}>
              <div
                className="bubble-label"
                style={{ color: isAssistant ? "#ccc" : "#F0F0F0" }}
              >
                {msg.role}
              </div>

              {/* 3) remark-math + rehype-katex で数式パース */}
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
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
