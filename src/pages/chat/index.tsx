import React, { useState } from "react";
import {
  Box,
  TextField,
  IconButton,
  CircularProgress,
  Alert,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { useRouter } from "next/router";
import { useAuth } from "../../contexts/AuthContext";
import { createThread } from "../../services/thread";
import { createMessage } from "../../services/message";
import { callDeepseek } from "../../services/deepseek";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useApiKey } from "../../contexts/ApiKeyContext";

/**
 * 新規チャット開始ページ
 * - TextFieldが入力量に応じて自動拡張 (minRows=1, maxRows=6)
 * - ボタンに二重の丸枠が出ないようカスタム
 */
export default function ChatHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { apiKey } = useApiKey();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!user) return null;

  const handleSend = async () => {
    setError("");
    if (!apiKey.trim()) {
      setError(
        "API Key is not input. Please enter it in the sidebar. You can obtain it from https://platform.deepseek.com/api_keys"
      );
      return;
    }
    if (!input.trim()) return;

    const userInput = input.trim();
    setInput("");
    setLoading(true);

    try {
      // 1) 新規スレッド作成
      const newThreadId = await createThread(user.uid, "New Thread");

      // 2) userメッセージ保存
      await createMessage(newThreadId, "user", userInput);

      // 3) スレッドタイトル更新
      await updateDoc(doc(db, "threads", newThreadId), {
        title: userInput.slice(0, 10),
      });

      // 4) Deepseek呼び出し
      const conversation = [
        { role: "system" as const, content: "You are a helpful assistant." },
        { role: "user" as const, content: userInput },
      ];
      const assistantContent = await callDeepseek(apiKey, conversation);

      // 5) assistantメッセージ保存
      await createMessage(newThreadId, "assistant", assistantContent);

      // 6) 遷移
      router.push(`/chat/${newThreadId}`);
    } catch (err) {
      console.error("Error in handleSend:", err);
      setError("最初のメッセージ送信中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  // Shift+Enterで改行, Enter単独で送信
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // shiftKeyがあれば改行
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      height="100%"
      justifyContent="center"
      alignItems="center"
      p={2}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
          <CircularProgress />
          <div>Creating new thread...</div>
        </Box>
      ) : (
        <Box width="100%" maxWidth="600px">
          <Box display="flex" alignItems="center" gap={1}>
            <TextField
              multiline
              minRows={1}
              maxRows={6}
              fullWidth
              label="Type your first message (Shift+Enter for newline)"
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
                // ↓ 入力文字サイズや行間を少し小さめに
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
            {/* 送信ボタン */}
            <IconButton
              onClick={handleSend}
              sx={{
                borderRadius: "50%",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                // 2重丸枠を防ぐ
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
      )}
    </Box>
  );
}
