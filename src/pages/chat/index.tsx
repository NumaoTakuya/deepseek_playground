// pages/chat/index.tsx
import React, { useState } from "react";
import {
  Box,
  TextField,
  IconButton,
  Alert,
  Typography,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  CircularProgress,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useRouter } from "next/router";
import { useAuth } from "../../contexts/AuthContext";
import { useApiKey } from "../../contexts/ApiKeyContext";
import { createThread } from "../../services/thread";
import { createMessage } from "../../services/message";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import Head from "next/head";

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

  // Deepseekモデル選択
  const [model, setModel] = useState("deepseek-chat");

  if (!user) return null;

  const handleSend = async () => {
    setError("");
    if (!apiKey.trim()) {
      setError(
        "No API Key provided. Enter it in the sidebar. You can obtain it from https://platform.deepseek.com/api_keys"
      );
      return;
    }
    if (!userInput.trim()) return;

    const inputValue = userInput.trim();
    setUserInput("");
    setLoading(true);

    try {
      // 1) 新規スレッド作成
      const newThreadId = await createThread(user.uid, "New Thread");

      // 2) system/userメッセージ保存
      await createMessage(newThreadId, "system", systemInput);
      await createMessage(newThreadId, "user", inputValue);

      // 3) modelだけFirestoreに書く (タイトル生成は後でバックグラウンド)
      await updateDoc(doc(db, "threads", newThreadId), {
        model,
      });

      // 4) 即座にチャット画面へ遷移 (スピナー等は出さない)
      router.push(`/chat/${newThreadId}`);
    } catch (err) {
      console.error("Error in handleSend:", err);
      setError("Error occurred while creating the thread.");
    }
  };

  const handleKeyDownUser = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <Head>
        <title>Create a New Chat - Deepseek Playground</title>
        {/* OGPやmetaタグは元のコードを残す */}
        <meta
          name="description"
          content="Create a new chat conversation on Deepseek Playground."
        />
        <meta
          property="og:title"
          content="Create a New Chat - Deepseek Playground"
        />
        <meta
          property="og:description"
          content="Start a new conversation using Deepseek. Save messages in Firestore, adjust system prompts."
        />
        <meta
          property="og:image"
          content="https://deepseek-playground.vercel.app/images/screenshot-small.png"
        />
        <meta
          property="og:url"
          content="https://deepseek-playground.vercel.app/chat"
        />
        <meta property="og:type" content="website" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Create a New Chat - Deepseek Playground"
        />
        <meta
          name="twitter:description"
          content="Start a new conversation using Deepseek."
        />
        <meta
          name="twitter:image"
          content="https://deepseek-playground.vercel.app/images/screenshot-small.png"
        />
      </Head>

      {/* 全体ラッパ */}
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
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap={2}
          >
            <CircularProgress />
            <div>
              Creating new thread... it may take a few minutes if prompt is
              long.
            </div>
          </Box>
        ) : (
          <Box width="100%" maxWidth="600px">
            {/* モデル選択 */}
            <Box mb={2}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Choose Model
              </Typography>
              <FormControl
                variant="outlined"
                size="small"
                sx={{
                  minWidth: 180,
                  backgroundColor: "transparent",
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": { borderColor: "#555" },
                    "&:hover fieldset": { borderColor: "#888" },
                    "&.Mui-focused fieldset": { borderColor: "#aaa" },
                    "& .MuiSelect-select": {
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    },
                  },
                  "& .MuiFormLabel-root": { color: "#ddd" },
                  "& .MuiFormLabel-root.Mui-focused": { color: "#ddd" },
                }}
              >
                <InputLabel shrink sx={{ color: "#ddd" }}>
                  Model
                </InputLabel>
                <Select
                  label="Model"
                  value={model}
                  onChange={(e) => setModel(e.target.value as string)}
                >
                  <MenuItem value="deepseek-chat">deepseek-chat</MenuItem>
                  <MenuItem value="deepseek-reasoner">
                    deepseek-reasoner
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* System Prompt */}
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
                      "& fieldset": { borderColor: "#555" },
                      "&:hover fieldset": { borderColor: "#888" },
                      "&.Mui-focused fieldset": { borderColor: "#aaa" },
                    },
                    "& .MuiInputLabel-root": { color: "#ddd" },
                    "& .MuiOutlinedInput-input": { color: "#fff" },
                  }}
                />
              </Box>
            )}

            {/* ユーザーの最初のメッセージ */}
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
                    "& fieldset": { borderColor: "var(--color-border)" },
                    "&:hover fieldset": { borderColor: "var(--color-hover)" },
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
    </>
  );
}
