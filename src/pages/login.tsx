// src/pages/login.tsx

import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { signInWithGoogle } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { Button, Box, Card, CardContent, Typography } from "@mui/material";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // ユーザーがログイン済みなら /chat へ飛ばす
  useEffect(() => {
    if (!loading && user) {
      router.replace("/chat");
    }
  }, [loading, user, router]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  // ログインしていなければカードを表示
  return (
    <Box
      height="100vh"
      display="flex"
      justifyContent="center"
      alignItems="center"
    >
      <Card sx={{ minWidth: 300, p: 2 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Welcome to Our Chat
          </Typography>
          <Typography variant="body2" paragraph>
            Enjoy the chat experience using Deepseek.
          </Typography>
          <Button variant="contained" onClick={handleLogin} fullWidth>
            Login with Google
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
