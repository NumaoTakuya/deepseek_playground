import React, { useEffect, useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  Card,
  CardContent,
} from "@mui/material";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import { useRouter } from "next/router";
import { getUserCount } from "../services/firebase";
import Head from "next/head";

export default function LandingPage() {
  const [userCount, setUserCount] = useState(0);

  useEffect(() => {
    const fetchUserCount = async () => {
      try {
        const count = await getUserCount();
        setUserCount(count);
      } catch (error) {
        console.error("Failed to fetch user count:", error);
      }
    };
    fetchUserCount();
  }, []);
  const router = useRouter();

  const handleLogin = () => {
    router.push("/login");
  };

  const handleDonate = () => {
    router.push("/donate");
  };

  return (
    <>
      <Head>
        <title>Deepseek Playground (Unofficial)</title>
        <meta
          name="description"
          content="An open-source unofficial AI chat playground using Deepseek. Create new chats, customize system prompts, and get quick AI responses."
        />
        <meta property="og:title" content="Deepseek Playground (Unofficial)" />
        <meta
          property="og:description"
          content="Try out an AI chat with your own Deepseek API key. Non-official, built with Next.js & Firebase."
        />
        <meta
          property="og:image"
          content="https://deepseek-playground.vercel.app/images/screenshot-small.png"
        />
        <meta
          property="og:url"
          content="https://deepseek-playground.vercel.app/"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Deepseek Playground (Unofficial)" />
        <meta
          name="twitter:description"
          content="Experience AI chat with custom system prompts. Non-official, user-friendly interface."
        />
        <meta
          name="twitter:image"
          content="https://deepseek-playground.vercel.app/images/screenshot-small.png"
        />
      </Head>

      <Box
        sx={{
          fontFamily: "Inter, sans-serif",
          backgroundColor: "#1F2023",
          color: "#ECECF1",
        }}
      >
        <AppBar position="static" sx={{ backgroundColor: "#2C2D31" }}>
          <Toolbar>
            {/* アイコン画像を左に配置 */}
            <Box
              component="img"
              src="/favicon.png"
              alt="App Logo"
              sx={{ width: 28, height: 28, mr: 1 }}
            />
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
              Deepseek Playground (Unofficial)
            </Typography>
            <Button
              onClick={handleLogin}
              sx={{
                fontSize: "1.1rem",
                borderRadius: "2rem",
                color: "#fff",
                textTransform: "none",
                fontWeight: 600,
                mr: 2,
                px: 3,
                py: 1,
                backgroundColor: "#00B8D9",
                "&:hover": { backgroundColor: "#00A0BD" },
              }}
              endIcon={<ArrowOutwardIcon />}
            >
              Try Freely
            </Button>
            <Button
              variant="outlined"
              onClick={handleDonate}
              sx={{
                color: "#ECECF1",
                borderColor: "#ECECF1",
                textTransform: "none",
                fontWeight: 600,
              }}
            >
              Donate
            </Button>
          </Toolbar>
        </AppBar>

        {/* Hero Section */}
        <Box
          sx={{
            position: "relative",
            height: "70vh",
            background: `url("/images/deepseek-playground-demo.gif") center/cover no-repeat`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.7)",
            }}
          />
          <Container
            sx={{
              position: "relative",
              textAlign: "center",
              zIndex: 1,
            }}
          >
            <Typography
              variant="h2"
              sx={{
                fontWeight: 700,
                mb: 2,
                textShadow: "0 0 50px rgba(0,0,0,1)",
              }}
            >
              Deepseek Playground
            </Typography>
            <Typography
              variant="h5"
              sx={{
                mb: 4,
                opacity: 0.9,
                textShadow: "0 0 30px rgba(0,0,0,1)",
              }}
            >
              An Open-Source Unofficial Demo for Flexible AI Chat
            </Typography>
            <Button
              variant="contained"
              onClick={handleLogin}
              sx={{
                fontSize: "1.1rem",
                borderRadius: "2rem",
                backgroundColor: "#00B8D9",
                "&:hover": { backgroundColor: "#00A0BD" },
                textTransform: "none",
                fontWeight: 600,
                px: 3,
                py: 1,
              }}
              endIcon={<ArrowOutwardIcon />}
            >
              Try Freely
            </Button>
            <Typography
              variant="body1"
              sx={{
                mt: 2,
                opacity: 0.8,
                textShadow: "0 0 30px rgba(0,0,0,1)",
              }}
            >
              {userCount} users are already exploring!
            </Typography>
          </Container>
        </Box>

        {/* Features */}
        <Container maxWidth="lg" sx={{ py: 8 }}>
          <Typography
            variant="h4"
            sx={{ fontWeight: 700, mb: 4, textAlign: "center" }}
          >
            Features
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              justifyContent: "center",
            }}
          >
            <Card sx={{ maxWidth: 300, backgroundColor: "#2C2D31" }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  Use Your Own API Key
                </Typography>
                <Typography variant="body2" color="#bfbfbf">
                  Bring your personal Deepseek key, stored locally on your
                  device to keep it secure.
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ maxWidth: 300, backgroundColor: "#2C2D31" }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  System Message Support
                </Typography>
                <Typography variant="body2" color="#bfbfbf">
                  Fine-tune your AI assistant’s behavior with a dedicated system
                  role message.
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ maxWidth: 300, backgroundColor: "#2C2D31" }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  Open-Source
                </Typography>
                <Typography variant="body2" color="#bfbfbf">
                  Fully transparent and customizable. Contribute or adapt the
                  code to suit your needs.
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Container>

        {/* Footer */}
        <Box sx={{ backgroundColor: "#2C2D31", py: 4 }}>
          <Container maxWidth="lg" sx={{ textAlign: "center" }}>
            <Typography variant="body2" color="#bfbfbf" sx={{ mb: 1 }}>
              This project is <strong>unofficial</strong> and not affiliated
              with Deepseek Inc.
            </Typography>
            <Typography variant="body2" color="#bfbfbf" sx={{ mb: 2 }}>
              If you have any questions or find any bugs, please contact us at:
            </Typography>
            <Typography variant="body2" color="#00B8D9">
              numaothe@gmail.com
            </Typography>
          </Container>
        </Box>
      </Box>
    </>
  );
}
