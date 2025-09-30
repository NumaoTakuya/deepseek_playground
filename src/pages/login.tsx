import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { signInWithGoogle, incrementUserCount } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { Box, Typography, Button } from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";

export default function Login() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/chat");
    }
  }, [loading, user, router]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
      await incrementUserCount();
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const accentColor = "var(--color-primary)";
  const accentHover = "var(--color-hover)";
  const textColor = "var(--color-text)";
  const subtextColor = "var(--color-subtext)";
  const panelBg = "var(--color-panel)";
  const heroOverlay = "var(--hero-overlay)";

  if (loading)
    return (
      <Box
        sx={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--color-bg)",
          color: textColor,
          fontSize: "1.1rem",
        }}
      >
        Loading...
      </Box>
    );

  return (
    <Box
      sx={{
        display: "flex",
        // スマホでは縦並び、MD以上では横並び
        flexDirection: { xs: "column", md: "row" },
        minHeight: "100vh",
        backgroundColor: "var(--color-bg)",
        color: textColor,
      }}
    >
      {/* 左カラム：大きな背景＆テキスト */}
      <Box
        sx={{
          flex: 1,
          position: "relative",
          // スマホで高さを少し確保、MD以上では自動
          height: { xs: "40vh", md: "auto" },
          background:
            'url("/images/deepseek-playground-demo.gif") center/cover no-repeat',
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            backgroundColor: heroOverlay,
          }}
        />
        <Box
          sx={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            height: "100%",
            p: { xs: 2, sm: 4 },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
            <Box
              component="img"
              src="/favicon.png"
              alt="App Logo"
              sx={{ width: 40, height: 40, mr: 2 }}
            />
            <Typography
              variant="h2"
              sx={{
                fontWeight: 700,
                color: textColor,
                // スマホでやや小さめ
                fontSize: { xs: "1.8rem", sm: "2.5rem" },
                lineHeight: 1.2,
              }}
            >
              Welcome
            </Typography>
          </Box>

          <Typography
            variant="h6"
            sx={{
              color: textColor,
              maxWidth: 500,
              fontSize: { xs: "1rem", sm: "1.125rem" },
            }}
          >
            Experience flexible AI chat with Deepseek.
            <br />
            Set your system prompt, chat freely, and have fun.
          </Typography>
        </Box>
      </Box>

      {/* 右カラム：ログインオプション */}
      <Box
        sx={{
          flex: 1,
          backgroundColor: "var(--color-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 2, sm: 4 },
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: 400,
            backgroundColor: panelBg,
            borderRadius: 3,
            boxShadow: 4,
            textAlign: "center",
            p: { xs: 3, sm: 4 },
            color: textColor,
          }}
        >
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              mb: 2,
              fontSize: { xs: "1.25rem", sm: "1.5rem" },
            }}
          >
            Sign In
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mb: 3,
              color: subtextColor,
              fontSize: { xs: "0.95rem", sm: "1rem" },
            }}
          >
            Your comfort and security matter to us.
            <br />
            Please sign in to continue.
          </Typography>
          <Button
            variant="contained"
            fullWidth
            onClick={handleLogin}
            startIcon={<GoogleIcon />}
            sx={{
              backgroundColor: accentColor,
              "&:hover": { backgroundColor: accentHover },
              color: "#ffffff",
              fontWeight: 600,
              textTransform: "none",
              borderRadius: 2,
              px: { xs: 2, sm: 3 },
              py: { xs: 1, sm: 1.2 },
              fontSize: { xs: "0.95rem", sm: "1rem" },
            }}
          >
            Login with Google
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
