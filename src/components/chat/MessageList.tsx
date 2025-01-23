// components/chat/MessageList.tsx
import { Box } from "@mui/material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../../types";

interface MessageListProps {
  messages: Message[];
  assistantThinking: boolean;
}

export default function MessageList({
  messages,
  assistantThinking,
}: MessageListProps) {
  // 最後のassistantメッセージ (もしあれば)
  const lastAssistantMsg = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const lastAssistantId = lastAssistantMsg?.id;

  return (
    <Box flex="1" overflow="auto" p={2}>
      {messages.map((msg) => {
        if (msg.role === "system") return null;
        const isUser = msg.role === "user";
        const isAssistant = msg.role === "assistant";
        const isLastAssistant = msg.id === lastAssistantId;

        return (
          <Box className="bubble-container" key={msg.id}>
            <Box className={`bubble ${isUser ? "user" : "assistant"}`}>
              <div
                className="bubble-label"
                style={{ color: isUser ? "#F0F0F0" : "#ccc" }}
              >
                {msg.role}
              </div>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content}
              </ReactMarkdown>

              {/* ▼ thinking中のスピナーや "Thinking..." を表示しない → この部分削除 */}
              {/* 例:
              {isAssistant && isLastAssistant && assistantThinking && (
                <Box> ...thinking... </Box>
              )}
              */}
            </Box>
          </Box>
        );
      })}

      {/* ここにも "thinkingバブル" があったが、それも削除 */}
    </Box>
  );
}
