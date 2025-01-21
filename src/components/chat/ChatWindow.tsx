// src/components/chat/ChatWindow.tsx
import React, { useState, useEffect } from "react";
import {
  Box,
  TextField,
  IconButton,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import {
  listenMessages,
  createMessage,
  updateMessage,
} from "../../services/message";
import { callDeepseek } from "../../services/deepseek";
import type { Message } from "../../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApiKey } from "../../contexts/ApiKeyContext";

interface Props {
  threadId: string;
}

export default function ChatWindow({ threadId }: Props) {
  const { apiKey } = useApiKey();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [assistantThinking, setAssistantThinking] = useState(false);

  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant."
  );
  const [systemMsgId, setSystemMsgId] = useState<string | null>(null);
  const [showSystemBox, setShowSystemBox] = useState(false);

  // Deepseekのモデル切り替え
  const [model, setModel] = useState("deepseek-chat");

  useEffect(() => {
    const unsubscribe = listenMessages(threadId, (fetched) => {
      const withThread = fetched.map((msg) => ({ ...msg, threadId }));
      setMessages(withThread);

      // systemメッセージがあれば state に反映
      const sys = withThread.find((m) => m.role === "system");
      if (sys) {
        setSystemMsgId(sys.id);
        setSystemPrompt(sys.content);
      } else {
        setSystemMsgId(null);
        setSystemPrompt("You are a helpful assistant.");
      }
    });
    return () => unsubscribe();
  }, [threadId]);

  const handleSend = async () => {
    if (!apiKey.trim()) {
      alert("No API Key provided. Enter it in the sidebar.");
      return;
    }
    if (!input.trim()) return;

    try {
      setAssistantThinking(true);
      const userInput = input.trim();
      setInput("");

      // systemメッセージがあれば更新、なければ作成
      if (systemMsgId) {
        await updateMessage(threadId, systemMsgId, systemPrompt);
      } else {
        const newSysId = await createMessage(threadId, "system", systemPrompt);
        setSystemMsgId(newSysId);
      }

      // ユーザーメッセージ
      await createMessage(threadId, "user", userInput);

      // 過去ログを組み立て
      const prev = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        }));

      const conversation = [
        { role: "system" as const, content: systemPrompt },
        ...prev,
        { role: "user" as const, content: userInput },
      ];

      // Deepseek呼び出し
      const assistantContent = await callDeepseek(apiKey, conversation, model);

      // assistantメッセージ保存
      await createMessage(threadId, "assistant", assistantContent);
    } catch (err) {
      console.error("Failed to call Deepseek or send message:", err);
      alert("Deepseek error. See console.");
    } finally {
      setAssistantThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box display="flex" flexDirection="column" height="100%">
      {!apiKey?.trim() && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          No API Key provided. Enter it in the sidebar. You can obtain it from{" "}
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#fff", textDecoration: "underline" }}
          >
            https://platform.deepseek.com/api_keys
          </a>
        </Alert>
      )}

      {/* System Prompt トグルバー */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          backgroundColor: "#333",
          color: "#fff",
          p: 1,
        }}
      >
        <Box sx={{ fontWeight: 600 }}>System Prompt</Box>
        <IconButton
          onClick={() => setShowSystemBox(!showSystemBox)}
          sx={{ color: "#fff", ml: "auto" }}
        >
          {showSystemBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {/* System Prompt 編集欄 */}
      {showSystemBox && (
        <Box sx={{ backgroundColor: "#2e2e2e", p: 2 }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            label="System Prompt"
            variant="outlined"
            sx={{
              "& .MuiOutlinedInput-root": {
                "& fieldset": { borderColor: "#555" },
                "&:hover fieldset": { borderColor: "#888" },
                "&.Mui-focused fieldset": { borderColor: "#aaa" },
              },
              "& .MuiInputLabel-root": {
                color: "#ddd",
              },
              // Label フォーカス時の青色を抑える
              "& .MuiInputLabel-root.Mui-focused": {
                color: "#ddd",
              },
              "& .MuiOutlinedInput-input": {
                color: "#fff",
              },
            }}
          />
        </Box>
      )}

      {/* メッセージリスト */}
      <Box flex="1" overflow="auto" p={2}>
        {messages.map((msg) => {
          if (msg.role === "system") return null; // systemは別管理
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

      {/* 入力＆送信ボタン */}
      <Box p={2}>
        <Box display="flex" gap={1} sx={{ m: 0 }}>
          {/* モデル選択プルダウン */}
          <FormControl
            variant="outlined"
            margin="none"
            size="small"
            sx={{
              minWidth: 160,
              backgroundColor: "transparent",
              "& .MuiOutlinedInput-root": {
                backgroundColor: "transparent",
                "& fieldset": { borderColor: "#555" },
                "&:hover fieldset": { borderColor: "#888" },
                "&.Mui-focused fieldset": { borderColor: "#aaa" },
                "& .MuiSelect-select": {
                  color: "#fff",
                  // 長い文字を「...」で省略
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  padding: "6px 8px",
                },
              },
              "& .MuiFormLabel-root": {
                backgroundColor: "transparent",
                color: "#ddd",
              },
              // Select Label フォーカス時も青色にしない
              "& .MuiInputLabel-root.Mui-focused": {
                color: "#ddd",
              },
            }}
          >
            <InputLabel shrink>Model</InputLabel>
            <Select
              label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value as string)}
            >
              <MenuItem value="deepseek-chat">deepseek-chat</MenuItem>
              <MenuItem value="deepseek-reasoner">deepseek-reasoner</MenuItem>
            </Select>
          </FormControl>

          {/* ユーザー入力欄 */}
          <TextField
            margin="none"
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
                "& fieldset": { borderColor: "#555" },
                "&:hover fieldset": { borderColor: "#888" },
                "&.Mui-focused fieldset": { borderColor: "#aaa" },
              },
              "& .MuiInputLabel-root": { color: "#ddd" },
              // Label フォーカス時の青色を抑える
              "& .MuiInputLabel-root.Mui-focused": {
                color: "#ddd",
              },
              "& .MuiOutlinedInput-input": {
                color: "#fff",
                fontSize: "0.9rem",
                lineHeight: 1.4,
              },
            }}
          />

          {/* 送信アイコンボタン */}
          <IconButton
            onClick={handleSend}
            sx={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              "&:hover": { backgroundColor: "var(--color-hover)" },
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowUpwardIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
