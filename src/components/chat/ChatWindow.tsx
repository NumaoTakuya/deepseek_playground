import React, { useState, useEffect } from "react";
import {
  Box,
  TextField,
  IconButton,
  Alert,
  CircularProgress,
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

/**
 * Props:
 *  - threadId: string   // which thread to show
 */
interface Props {
  threadId: string;
}

export default function ChatWindow({ threadId }: Props) {
  const { apiKey } = useApiKey();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [assistantThinking, setAssistantThinking] = useState(false);

  // system message
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant."
  );
  const [systemMsgId, setSystemMsgId] = useState<string | null>(null);
  const [showSystemBox, setShowSystemBox] = useState(false);

  useEffect(() => {
    // リアルタイム購読
    const unsubscribe = listenMessages(threadId, (fetched) => {
      const withThread = fetched.map((msg) => ({ ...msg, threadId }));
      setMessages(withThread);

      // systemメッセージがあれば state に反映
      const sys = withThread.find((m) => m.role === "system");
      if (sys) {
        setSystemMsgId(sys.id);
        setSystemPrompt(sys.content);
      } else {
        // 無ければ初期の文
        setSystemMsgId(null);
        setSystemPrompt("You are a helpful assistant.");
      }
    });
    return () => unsubscribe();
  }, [threadId]);

  // 送信ボタン
  const handleSend = async () => {
    if (!apiKey.trim()) {
      alert("API Key is not input. Please enter it in the sidebar.");
      return;
    }
    if (!input.trim()) return;

    try {
      setAssistantThinking(true);
      const userInput = input.trim();
      setInput("");

      // 1) systemメッセージの upsert (あれば update, 無ければ create)
      if (systemMsgId) {
        // 更新
        await updateMessage(threadId, systemMsgId, systemPrompt);
      } else {
        // 新規
        const newSysId = await createMessage(threadId, "system", systemPrompt);
        setSystemMsgId(newSysId);
      }

      // 2) ユーザーメッセージ保存
      await createMessage(threadId, "user", userInput);

      // 3) conversationを組み立て (最新system + 過去ログ + 今回user)
      const prev = messages
        .filter((m) => m.role !== "system") // systemは差し替える
        .map((m) => ({ role: m.role, content: m.content }));
      const conversation = [
        { role: "system" as const, content: systemPrompt },
        ...prev,
        { role: "user" as const, content: userInput },
      ];

      // 4) Deepseek呼び出し
      const assistantContent = await callDeepseek(apiKey, conversation);

      // 5) Firestoreにassistantメッセージ保存
      await createMessage(threadId, "assistant", assistantContent);
    } catch (err) {
      console.error("Failed to call Deepseek or send message:", err);
      alert("Deepseek error. See console.");
    } finally {
      setAssistantThinking(false);
    }
  };

  // Enterキー送信
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box display="flex" flexDirection="column" height="100%">
      {/* APIキー未入力の警告 */}
      {!apiKey?.trim() && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          No API Key provided. Enter it in the sidebar.
        </Alert>
      )}

      {/* --- System Prompt Bar --- */}
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

        {/* Expand/collapse */}
        <IconButton
          onClick={() => setShowSystemBox(!showSystemBox)}
          sx={{ color: "#fff", ml: "auto" }}
        >
          {showSystemBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

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
                "& fieldset": {
                  borderColor: "#555",
                },
                "&:hover fieldset": {
                  borderColor: "#888",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#aaa",
                },
              },
              "& .MuiInputLabel-root": { color: "#ddd" },
              "& .MuiOutlinedInput-input": { color: "#fff" },
            }}
          />
        </Box>
      )}

      {/* メッセージ表示領域 */}
      <Box flex="1" overflow="auto" p={2}>
        {messages.map((msg) => {
          if (msg.role === "system") {
            // systemメッセージをUIで別表示したいならここで処理
            // 例: skip or show a special block
            return null;
          }
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

      {/* 入力欄 */}
      <Box p={2}>
        <Box display="flex" gap={1}>
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
                  borderColor: "#555",
                },
                "&:hover fieldset": {
                  borderColor: "#888",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#aaa",
                },
              },
              "& .MuiInputLabel-root": {
                color: "#ddd",
              },
              "& .MuiOutlinedInput-input": {
                color: "#fff",
                fontSize: "0.9rem",
                lineHeight: 1.4,
              },
            }}
          />
          <IconButton
            onClick={handleSend}
            sx={{
              borderRadius: "50%", // ← これで正円
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              border: "none",
              outline: "none",
              boxShadow: "none",
              "&:hover": {
                backgroundColor: "var(--color-hover)",
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
