import React, { useState } from "react";
import {
  Box,
  TextField,
  IconButton,
  CircularProgress,
  Alert,
  Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
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
 * - 上部バーで System Prompt (折り畳み式)
 * - 下部に "Your First Message" 入力欄 + 送信ボタン
 */
export default function ChatHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { apiKey } = useApiKey();

  // system prompt
  const [systemInput, setSystemInput] = useState(
    "You are a helpful assistant."
  );
  const [showSystemBox, setShowSystemBox] = useState(false);

  // user's first message
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!user) return null;

  const handleSend = async () => {
    setError("");

    if (!apiKey.trim()) {
      setError(
        "API Key is not input. Please enter it in the sidebar. (Deepseek API)"
      );
      return;
    }
    if (!userInput.trim()) return;

    const inputValue = userInput.trim();
    setUserInput("");
    setLoading(true);

    try {
      // 1) Create thread with "New Thread"
      const newThreadId = await createThread(user.uid, "New Thread");

      // 2) Save system message
      await createMessage(newThreadId, "system", systemInput);

      // 3) Save user message
      await createMessage(newThreadId, "user", inputValue);

      // 4) Generate short title
      const promptForTitle = [
        {
          role: "system" as const,
          content:
            "You generate a short conversation title based on the user's first message. Output ONLY the title text without quotes or disclaimers.",
        },
        {
          role: "user" as const,
          content: `User's first message: ${inputValue}\nPlease create a short, concise title. Just say the title without quotation.`,
        },
      ];
      const rawTitle = await callDeepseek(apiKey, promptForTitle);
      const finalTitle = (rawTitle || "").trim();
      const titleToUse =
        finalTitle.length > 0 ? finalTitle : inputValue.slice(0, 10);

      await updateDoc(doc(db, "threads", newThreadId), { title: titleToUse });

      // 5) Generate assistant's first response
      const conversation = [
        { role: "system" as const, content: systemInput },
        { role: "user" as const, content: inputValue },
      ];
      const assistantContent = await callDeepseek(apiKey, conversation);

      // 6) Save assistant message
      await createMessage(newThreadId, "assistant", assistantContent);

      // 7) Go to /chat/[threadId]
      router.push(`/chat/${newThreadId}`);
    } catch (err) {
      console.error("Error in handleSend:", err);
      setError("Error occurred while creating the thread or calling Deepseek.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDownUser = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      minHeight="100vh"
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
          {/* --- System Prompt Bar --- */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "#333",
              color: "#fff",
              p: 1,
              mb: 2,
              borderRadius: 1,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              System Prompt
            </Typography>
            <IconButton
              onClick={() => setShowSystemBox(!showSystemBox)}
              sx={{ color: "#fff", ml: "auto" }}
            >
              {showSystemBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          {showSystemBox && (
            <Box
              sx={{
                backgroundColor: "#2e2e2e",
                p: 2,
                borderRadius: 1,
                mb: 3,
              }}
            >
              <TextField
                fullWidth
                multiline
                minRows={2}
                value={systemInput}
                onChange={(e) => setSystemInput(e.target.value)}
                label="Edit your system prompt"
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

          {/* "Your First Message" section */}
          <Typography variant="h6" sx={{ mb: 1 }}>
            Your First Message
          </Typography>

          <Box display="flex" alignItems="center" gap={1}>
            <TextField
              multiline
              minRows={1}
              maxRows={6}
              fullWidth
              label="Type your first message (Shift+Enter for newline)"
              variant="outlined"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDownUser}
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

            {/* 送信ボタン */}
            <IconButton
              onClick={handleSend}
              sx={{
                borderRadius: "50%",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                width: 48,
                height: 48,
                "&:hover": {
                  backgroundColor: "var(--color-hover)",
                },
                "&:focus": {
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
