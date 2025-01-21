import { Box, CircularProgress } from "@mui/material";
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
  return (
    <Box flex="1" overflow="auto" p={2}>
      {messages.map((msg) => {
        if (msg.role === "system") return null;
        const isUser = msg.role === "user";
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
            </Box>
          </Box>
        );
      })}

      {assistantThinking && (
        <Box className="bubble-container">
          <Box className="bubble assistant">
            <div className="bubble-label" style={{ color: "#ccc" }}>
              assistant
            </div>
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={16} />
              <span>Thinking...</span>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
