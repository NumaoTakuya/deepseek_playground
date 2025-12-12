import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  Card,
  CardContent,
  TextField,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
} from "@mui/material";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import GitHubIcon from "@mui/icons-material/GitHub";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useRouter } from "next/router";
import { getUserCount } from "../services/firebase";
import Head from "next/head";
import { useApiKey } from "../contexts/ApiKeyContext";
import { streamDeepseek } from "../services/deepseek";
import { SelectChangeEvent } from "@mui/material/Select";
import LanguageSelector from "../components/common/LanguageSelector";
import { useTranslation } from "../contexts/LanguageContext";

export default function LandingPage() {
  const [userCount, setUserCount] = useState(0);
  const { apiKey, setApiKey } = useApiKey();
  const [testInput, setTestInput] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [testThinking, setTestThinking] = useState("");
  const [testError, setTestError] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testModel, setTestModel] = useState("deepseek-chat");
  const [testSystemPrompt, setTestSystemPrompt] = useState(
    "You are a helpful assistant."
  );
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [waitingForFirstChunk, setWaitingForFirstChunk] = useState(false);

  const streamRef = useRef<
    Awaited<ReturnType<typeof streamDeepseek>> | null
  >(null);
  const { t } = useTranslation();

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

  const handleApiKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    setApiKey(event.target.value);
  };

  const handleTestInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setTestInput(event.target.value);
  };

  const handleSystemPromptChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setTestSystemPrompt(event.target.value);
  };

  const handleModelChange = (event: SelectChangeEvent<string>) => {
    setTestModel(event.target.value);
  };

  const toggleSystemPrompt = () => {
    setShowSystemPrompt((prev) => !prev);
  };

  const handleQuickTest = async () => {
    setTestError("");
    setTestResponse("");
    setTestThinking("");
    setWaitingForFirstChunk(false);

    if (streamRef.current) {
      streamRef.current.abort();
      streamRef.current = null;
    }

    if (!apiKey.trim()) {
      setTestError(t("landing.quickTest.error.missingKey"));
      return;
    }

    if (!testInput.trim()) {
      setTestError(t("landing.quickTest.error.missingPrompt"));
      return;
    }

    setTestLoading(true);
    setWaitingForFirstChunk(true);
    let aborted = false;
    try {
      const stream = await streamDeepseek(
        apiKey.trim(),
        [
          { role: "system", content: testSystemPrompt.trim() },
          { role: "user", content: testInput.trim() },
        ],
        testModel
      );
      streamRef.current = stream;

      let partialReasoning = "";
      let partialContent = "";
      let firstChunk = true;

      for await (const chunk of stream) {
        interface Delta {
          reasoning_content?: string;
          content?: string;
        }

        const delta = chunk.choices[0]?.delta as Delta | undefined;
        const deltaReasoning = delta?.reasoning_content ?? "";
        const deltaContent = delta?.content ?? "";

        if (deltaReasoning) {
          partialReasoning += deltaReasoning;
          setTestThinking(partialReasoning);
        }

        if (deltaContent) {
          partialContent += deltaContent;
          setTestResponse(partialContent);
        }

        if (firstChunk && (deltaReasoning || deltaContent)) {
          setWaitingForFirstChunk(false);
          firstChunk = false;
        }
      }
    } catch (error) {
      console.error("Failed to call Deepseek API:", error);
      if (error instanceof Error && error.name === "AbortError") {
        aborted = true;
      } else {
        setTestError(t("landing.quickTest.error.generic"));
      }
    } finally {
      setTestLoading(false);
      setWaitingForFirstChunk(false);
      if (streamRef.current) {
        streamRef.current = null;
      }
      if (aborted) {
        setTestError("");
      }
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.abort();
        streamRef.current = null;
      }
    };
  }, []);

  const accentColor = "var(--color-primary)";
  const accentHover = "var(--color-hover)";
  const textColor = "var(--color-text)";
  const subtextColor = "var(--color-subtext)";
  const heroOverlay = "var(--hero-overlay)";
  const heroTitleShadow = "var(--hero-title-shadow)";
  const heroSubtitleShadow = "var(--hero-subtitle-shadow)";
  const outlinedFieldSx = {
    "& .MuiOutlinedInput-root": {
      backgroundColor: "var(--color-sidebar)",
      "& fieldset": { borderColor: "var(--color-border)" },
      "&:hover fieldset": { borderColor: accentColor },
      "&.Mui-focused fieldset": { borderColor: accentColor },
    },
    "& .MuiInputBase-input": { color: textColor },
    "& .MuiInputLabel-root": { color: subtextColor },
    "& .MuiInputLabel-root.Mui-focused": { color: textColor },
  };
  const selectSx = {
    "& .MuiOutlinedInput-root": {
      backgroundColor: "var(--color-sidebar)",
      "& fieldset": { borderColor: "var(--color-border)" },
      "&:hover fieldset": { borderColor: accentColor },
      "&.Mui-focused fieldset": { borderColor: accentColor },
    },
    "& .MuiSelect-select": { color: textColor },
  };

  return (
    <>
      <Head>
        <title>{t("common.appNameUnofficial")}</title>
        <meta name="description" content={t("landing.meta.description")} />
        <meta property="og:title" content={t("common.appNameUnofficial")} />
        <meta property="og:description" content={t("landing.meta.preview")} />
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
        <meta name="twitter:title" content={t("common.appNameUnofficial")} />
        <meta name="twitter:description" content={t("landing.meta.twitter")} />
        <meta
          name="twitter:image"
          content="https://deepseek-playground.vercel.app/images/screenshot-small.png"
        />
      </Head>

      <Box
        sx={{
          backgroundColor: "var(--color-bg)",
          color: textColor,
        }}
      >
        <AppBar
          position="static"
          sx={{
            backgroundColor: "var(--color-sidebar)",
            color: textColor,
            boxShadow: "none",
          }}
        >
          <Toolbar sx={{ flexWrap: "wrap", gap: 1 }}>
            {/* アイコン画像を左に配置 */}
            <Box
              component="img"
              src="/favicon.png"
              alt="App Logo"
              sx={{ width: 28, height: 28, mr: 1 }}
            />
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
              {t("common.appNameUnofficial")}
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              <LanguageSelector
                disableLabel
                sx={{ minWidth: 140, mr: { xs: 0, sm: 1 } }}
              />
              <Button
                onClick={handleLogin}
                sx={{
                  fontSize: "1.1rem",
                  borderRadius: "2rem",
                  color: "#ffffff",
                  textTransform: "none",
                  fontWeight: 600,
                  px: 3,
                  py: 1,
                  backgroundColor: accentColor,
                  "&:hover": { backgroundColor: accentHover },
                }}
                endIcon={<ArrowOutwardIcon />}
              >
                {t("common.actions.try")}
              </Button>
              <Button
                variant="outlined"
                onClick={handleDonate}
                sx={{
                  color: textColor,
                  borderColor: textColor,
                  textTransform: "none",
                  fontWeight: 600,
                }}
              >
                {t("common.actions.donate")}
              </Button>
            </Box>
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
              backgroundColor: heroOverlay,
            }}
          />
          <Container
            sx={{
              position: "relative",
              textAlign: "center",
              zIndex: 1,
              color: textColor,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 2,
              }}
            >
              <Box
                component="img"
                src="/favicon.png"
                alt="App Logo"
                sx={{ width: 48, height: 48, mr: 2 }}
              />
              <Typography
                variant="h2"
                sx={{
                  fontWeight: 700,
                  textShadow: heroTitleShadow,
                }}
              >
                {t("common.appName")}
              </Typography>
            </Box>
            <Typography
              variant="h5"
              sx={{
                mb: 4,
                opacity: 0.9,
                textShadow: heroSubtitleShadow,
                color: textColor,
              }}
            >
              {t("landing.hero.tagline")}
            </Typography>
            <Button
              variant="contained"
              onClick={handleLogin}
              sx={{
                fontSize: "1.1rem",
                borderRadius: "2rem",
                backgroundColor: accentColor,
                "&:hover": { backgroundColor: accentHover },
                color: "#ffffff",
                textTransform: "none",
                fontWeight: 600,
                px: 3,
                py: 1,
              }}
              endIcon={<ArrowOutwardIcon />}
            >
              {t("common.actions.try")}
            </Button>
            <Typography
              variant="body1"
              sx={{
                mt: 2,
                opacity: 0.8,
                textShadow: heroSubtitleShadow,
              }}
            >
              {t("landing.hero.userCount", { count: userCount.toLocaleString() })}
            </Typography>
          </Container>
        </Box>

        {/* Quick API Test */}
        <Box
          sx={{
            backgroundColor: "var(--color-panel)",
            color: textColor,
            py: { xs: 6, md: 8 },
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <Container
            maxWidth="lg"
            disableGutters
            sx={{
              px: { xs: 0, sm: 4, md: 6 },
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: { xs: 4, md: 6 },
                justifyItems: "center",
                alignItems: "stretch",
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  maxWidth: { xs: "100%", md: 560 },
                  backgroundColor: {
                    xs: "transparent",
                    md: "var(--color-sidebar)",
                  },
                  borderRadius: { xs: 0, md: 3 },
                  border: { xs: "none", md: "1px solid var(--color-border)" },
                  boxShadow: {
                    xs: "none",
                    md: "0 24px 50px rgba(0, 0, 0, 0.18)",
                  },
                  px: { xs: 3, md: 5 },
                  py: { xs: 4, md: 5 },
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  color: textColor,
                  textAlign: "left",
                  justifyContent: "center",
                }}
              >
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <Typography
                    variant="h4"
                    sx={{ fontWeight: 700, color: textColor }}
                  >
                    {t("landing.quickTest.title")}
                  </Typography>
                  <Typography variant="body1" sx={{ color: subtextColor }}>
                    {t("landing.quickTest.subtitle")}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    justifyContent: "flex-start",
                    flexGrow: 1,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      gap: 2,
                      width: "100%",
                    }}
                  >
                    <TextField
                      label={t("common.deepseekApiKey")}
                      type="password"
                      value={apiKey}
                      onChange={handleApiKeyChange}
                      fullWidth
                      size="small"
                      autoComplete="off"
                      sx={outlinedFieldSx}
                    />
                    <FormControl
                      fullWidth
                      size="small"
                      sx={{ minWidth: { sm: 200 } }}
                    >
                      <InputLabel
                        sx={{
                          color: subtextColor,
                          "&.Mui-focused": { color: textColor },
                        }}
                      >
                        {t("common.model")}
                      </InputLabel>
                      <Select
                        value={testModel}
                        label={t("common.model")}
                        onChange={handleModelChange}
                        sx={selectSx}
                      >
                        <MenuItem value="deepseek-chat">deepseek-chat</MenuItem>
                        <MenuItem value="deepseek-reasoner">
                          deepseek-reasoner
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      backgroundColor: {
                        xs: "rgba(0, 0, 0, 0.14)",
                        md: "rgba(0, 0, 0, 0.22)",
                      },
                      borderRadius: 1,
                      px: 2,
                      py: 1,
                      color: textColor,
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {t("common.systemPrompt")}
                    </Typography>
                    <IconButton
                      onClick={toggleSystemPrompt}
                      sx={{ color: textColor, ml: "auto" }}
                      size="small"
                    >
                      {showSystemPrompt ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>
                  {showSystemPrompt && (
                    <TextField
                      label={t("common.systemPrompt")}
                      placeholder={t("common.systemPromptPlaceholder")}
                      multiline
                      minRows={2}
                      fullWidth
                      value={testSystemPrompt}
                      onChange={handleSystemPromptChange}
                      InputLabelProps={{ shrink: true }}
                      sx={outlinedFieldSx}
                    />
                  )}

                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      gap: 2,
                      alignItems: { xs: "stretch", sm: "center" },
                      width: "100%",
                    }}
                  >
                    <TextField
                      label={t("common.prompt")}
                      placeholder={t("common.promptPlaceholder")}
                      fullWidth
                      value={testInput}
                      onChange={handleTestInputChange}
                      InputLabelProps={{ shrink: true }}
                      sx={{ flexGrow: 1, ...outlinedFieldSx }}
                    />
                    <Button
                      variant="contained"
                      onClick={handleQuickTest}
                      disabled={testLoading}
                      sx={{
                        borderRadius: "1.5rem",
                        backgroundColor: accentColor,
                        "&:hover": { backgroundColor: accentHover },
                        textTransform: "none",
                        fontWeight: 600,
                        px: 3,
                        alignSelf: { xs: "stretch", sm: "center" },
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 48,
                        height: { sm: 56 },
                      }}
                    >
                      {t("common.getApiResponse")}
                    </Button>
                  </Box>

                  {testLoading && waitingForFirstChunk && (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: { xs: "center", sm: "flex-start" },
                      }}
                    >
                      <CircularProgress size={22} sx={{ mt: 1 }} />
                    </Box>
                  )}

                  {testError && <Alert severity="error">{testError}</Alert>}

                  {testThinking && (
                    <Box
                      sx={{
                        mt: 2,
                        px: 2,
                        py: 2,
                        borderRadius: 1,
                        border: "1px solid var(--color-border)",
                        backgroundColor: "var(--color-sidebar)",
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ color: subtextColor, mb: 1 }}
                      >
                        {t("common.thinking")}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: textColor, whiteSpace: "pre-wrap" }}
                      >
                        {testThinking}
                      </Typography>
                    </Box>
                  )}

                  {(testLoading || testResponse) && (
                    <Box
                      sx={{
                        mt: 2,
                        px: 2,
                        py: 2,
                        borderRadius: 1,
                        border: "1px solid var(--color-border)",
                        backgroundColor: "var(--color-sidebar)",
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ color: subtextColor, mb: 1 }}
                      >
                        {t("common.response")}
                      </Typography>
                      {testResponse ? (
                        <Typography
                          variant="body2"
                          sx={{ color: textColor, whiteSpace: "pre-wrap" }}
                        >
                          {testResponse}
                        </Typography>
                      ) : (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            color: subtextColor,
                          }}
                        >
                          <CircularProgress size={16} thickness={5} />
                          <Typography variant="body2" sx={{ color: subtextColor }}>
                            {t("common.waitingForResponse")}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              </Box>

              <Box
                sx={{
                  width: "100%",
                  maxWidth: { xs: "100%", md: 560 },
                  backgroundColor: {
                    xs: "transparent",
                    md: "var(--color-sidebar)",
                  },
                  borderRadius: { xs: 0, md: 3 },
                  border: { xs: "none", md: "1px solid var(--color-border)" },
                  boxShadow: {
                    xs: "none",
                    md: "0 24px 50px rgba(0, 0, 0, 0.18)",
                  },
                  px: { xs: 3, md: 5 },
                  py: { xs: 4, md: 5 },
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  color: textColor,
                  alignItems: "center",
                  textAlign: "center",
                  justifyContent: "center",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    width: "100%",
                    alignItems: "center",
                  }}
                >
                  <Typography
                    variant="h4"
                    sx={{ fontWeight: 700, color: textColor }}
                  >
                    {t("landing.register.title")}
                  </Typography>
                  <Box
                    component="ul"
                    sx={{
                      pl: 2,
                      pr: 2,
                      m: 0,
                      color: textColor,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2.5,
                      fontSize: "1.05rem",
                      listStylePosition: "outside",
                      maxWidth: 380,
                      width: "100%",
                      textAlign: "left",
                      mx: "auto",
                      flexGrow: 1,
                      justifyContent: "center",
                    }}
                  >
                    <Typography component="li" variant="body1">
                      {t("landing.register.bulletHistory")}
                    </Typography>
                    <Typography component="li" variant="body1">
                      {t("landing.register.bulletMultiTurn")}
                    </Typography>
                    <Typography component="li" variant="body1">
                      {t("landing.register.bulletThreads")}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "center", width: "100%" }}>
                    <Button
                      variant="contained"
                      onClick={handleLogin}
                      sx={{
                        fontSize: "1.1rem",
                        borderRadius: "2rem",
                        backgroundColor: accentColor,
                        "&:hover": { backgroundColor: accentHover },
                        color: "#ffffff",
                        textTransform: "none",
                        fontWeight: 600,
                        px: 3,
                        py: 1,
                      }}
                      endIcon={<ArrowOutwardIcon />}
                    >
                      {t("common.actions.try")}
                    </Button>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Container>
        </Box>

        {/* Features */}
        <Container maxWidth="lg" sx={{ py: 8 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              mb: 4,
              textAlign: "center",
              color: textColor,
            }}
          >
            {t("landing.features.title")}
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              justifyContent: "center",
            }}
          >
            <Card
              sx={{
                maxWidth: 300,
                backgroundColor: "var(--color-panel)",
                border: "1px solid var(--color-border)",
              }}
            >
              <CardContent>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 600, mb: 1, color: textColor }}
                >
                  {t("landing.features.apiKeyTitle")}
                </Typography>
                <Typography variant="body2" sx={{ color: subtextColor }}>
                  {t("landing.features.apiKeyBody")}
                </Typography>
              </CardContent>
            </Card>

            <Card
              sx={{
                maxWidth: 300,
                backgroundColor: "var(--color-panel)",
                border: "1px solid var(--color-border)",
              }}
            >
              <CardContent>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 600, mb: 1, color: textColor }}
                >
                  {t("landing.features.systemMessageTitle")}
                </Typography>
                <Typography variant="body2" sx={{ color: subtextColor }}>
                  {t("landing.features.systemMessageBody")}
                </Typography>
              </CardContent>
            </Card>

            <Card
              sx={{
                maxWidth: 300,
                backgroundColor: "var(--color-panel)",
                border: "1px solid var(--color-border)",
              }}
            >
              <CardContent>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 600, mb: 1, color: textColor }}
                >
                  {t("landing.features.openSourceTitle")}
                </Typography>
                <Typography variant="body2" sx={{ color: subtextColor }}>
                  {t("landing.features.openSourceBody")}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Container>

        {/* Footer */}
        <Box sx={{ backgroundColor: "var(--color-sidebar)", py: 4 }}>
          <Container maxWidth="lg" sx={{ textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: subtextColor, mb: 1 }}>
              {t("landing.footer.unofficial")}
            </Typography>
            <Typography variant="body2" sx={{ color: subtextColor, mb: 2 }}>
              {t("landing.footer.contact")}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: accentColor, fontWeight: 600 }}
            >
              numaothe@gmail.com
            </Typography>
            <Button
              component="a"
              href="https://github.com/NumaoTakuya/deepseek_playground"
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<GitHubIcon />}
              sx={{
                mt: 3,
                color: textColor,
                borderColor: textColor,
                textTransform: "none",
                fontWeight: 600,
              }}
              variant="outlined"
            >
              {t("landing.footer.github")}
            </Button>
          </Container>
        </Box>
      </Box>
    </>
  );
}
