import React, { useState, useEffect } from "react";
import {
  Box,
  TextField,
  IconButton,
  Alert,
  CircularProgress,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { listenMessages, createMessage } from "../../services/message";
import { callDeepseek } from "../../services/deepseek";
import type { Message } from "../../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  threadId: string;
  apiKey: string;
}

/**
 * 既存スレッドのチャット画面
 * - minRows=1, maxRows=6で入力量に応じて高さが変わる
 * - 2重丸枠を防ぐため IconButtonをカスタム
 * - Markdown表示
 */
export default function ChatWindow({ threadId, apiKey }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [assistantThinking, setAssistantThinking] = useState(false);

  useEffect(() => {
    const unsubscribe = listenMessages(threadId, (fetched) => {
      setMessages(fetched.map((msg) => ({ ...msg, threadId })));
    });
    return () => unsubscribe();
  }, [threadId]);

  const handleSend = async () => {
    if (!apiKey.trim()) {
      alert("API Key が入力されていません。");
      return;
    }
    if (!input.trim()) return;

    const userInput = input.trim();
    setInput("");

    try {
      // 1) userメッセージ保存
      await createMessage(threadId, "user", userInput);

      // 2) アシスタント思考中フラグON
      setAssistantThinking(true);

      // 3) 全履歴 + 今の発言をDeepseek
      const conversation = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      conversation.push({ role: "user", content: userInput });

      const assistantContent = await callDeepseek(apiKey, conversation);

      // 4) assistantメッセージ保存
      await createMessage(threadId, "assistant", assistantContent);
    } catch (err) {
      console.error("Failed to call Deepseek or send message:", err);
      alert("Deepseek呼び出しでエラーが発生しました。");
    } finally {
      setAssistantThinking(false);
    }
  };

  // Shift+Enterで改行, Enter送信
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box display="flex" flexDirection="column" height="100%">
      {!apiKey.trim() && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          API Key が入力されていません。
        </Alert>
      )}

      {/* メッセージ一覧 */}
      <Box flex="1" overflow="auto" p={2}>
        {messages.map((msg) => {
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

        {/* 思考中表示 */}
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

      {/* 入力欄 */}
      <Box p={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <TextField
            multiline
            minRows={1}
            maxRows={6}
            fullWidth
            label="Type your message (Shift+Enter for newline)"
            variant="outlined"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            sx={{
              backgroundColor: "#2e2e2e",
              "& .MuiOutlinedInput-root": {
                "& fieldset": {
                  borderColor: "var(--color-border)",
                },
                "&:hover fieldset": {
                  borderColor: "var(--color-hover)",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "var(--color-hover)",
                },
              },
              "& .MuiOutlinedInput-input": {
                color: "#fff",
                fontSize: "0.9rem",
                lineHeight: 1.4,
              },
              "& .MuiInputLabel-root": {
                color: "var(--color-subtext)",
              },
              "& .MuiInputLabel-root.Mui-focused": {
                color: "#fff",
              },
            }}
          />
          <IconButton
            onClick={handleSend}
            sx={{
              borderRadius: "50%",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              border: "none",
              outline: "none",
              boxShadow: "none",
              "&:hover": {
                backgroundColor: "var(--color-hover)",
              },
              "&:focus": {
                outline: "none",
                boxShadow: "none",
              },
              "&:focus-visible": {
                outline: "none",
                boxShadow: "none",
              },
            }}
          >
            <ArrowUpwardIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
