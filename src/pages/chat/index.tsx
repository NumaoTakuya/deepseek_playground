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
import { useApiKey } from "../../contexts/ApiKeyContext";
import { createThread } from "../../services/thread";
import { createMessage } from "../../services/message";
import { callDeepseek } from "../../services/deepseek";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../services/firebase";

/**
 * 新規チャット開始ページ
 * ユーザーの初回入力を元に:
 * 1) 新規スレッド作成
 * 2) 短いスレッドタイトル生成 (Deepseek)
 * 3) アシスタント応答生成 (Deepseek)
 * 4) メッセージに保存
 * 5) /chat/[threadId] に遷移
 */
export default function ChatHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { apiKey } = useApiKey();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!user) return null; // ログイン前は何もしない

  const handleSend = async () => {
    setError("");

    // APIキー未入力チェック
    if (!apiKey.trim()) {
      setError(
        "API Key is not input. Please enter it in the sidebar. You can obtain it from https://platform.deepseek.com/api_keys"
      );
      return;
    }
    // 入力メッセージが空
    if (!input.trim()) return;

    const userInput = input.trim();
    setInput("");
    setLoading(true);

    try {
      // 1) 新規スレッド (仮タイトル: "New Thread")
      const newThreadId = await createThread(user.uid, "New Thread");

      // 2) ユーザーの初回メッセージを保存
      await createMessage(newThreadId, "user", userInput);

      // 3) Deepseekに「短いタイトル」生成を依頼
      const promptForTitle = [
        {
          role: "system" as const,
          content:
            "You generate a short conversation title based on the user's first message. Output ONLY the title text without quotes or disclaimers.",
        },
        {
          role: "user" as const,
          content: `User's first message: ${userInput}\nPlease create a short, concise title. Just say the title without quotation.`,
        },
      ];
      const generatedTitle = await callDeepseek(apiKey, promptForTitle);
      const finalTitle = (generatedTitle || "").trim();
      const titleToUse =
        finalTitle.length > 0 ? finalTitle : userInput.slice(0, 10);

      // 4) Firestoreにタイトル反映
      await updateDoc(doc(db, "threads", newThreadId), {
        title: titleToUse,
      });

      // 5) Deepseekに「最初のアシスタント応答」を生成してもらう
      //    例: system で「You are a helpful assistant.」を指定
      const conversationForAssistant = [
        { role: "system" as const, content: "You are a helpful assistant." },
        { role: "user" as const, content: userInput },
      ];
      const assistantContent = await callDeepseek(
        apiKey,
        conversationForAssistant
      );

      // 6) アシスタントのメッセージを保存
      await createMessage(newThreadId, "assistant", assistantContent);

      // 7) 画面遷移 -> /chat/[threadId]
      router.push(`/chat/${newThreadId}`);
    } catch (err) {
      console.error("Error in handleSend:", err);
      setError(
        "An error occurred while creating the thread or generating a title/assistant response."
      );
    } finally {
      setLoading(false);
    }
  };

  // Shift+Enterで改行, Enterで送信
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
      )}
    </Box>
  );
}
