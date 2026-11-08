import { useEffect, useState } from "react";
import { Alert, Box, IconButton, Link } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NextLink from "next/link";
import { useTranslation } from "../../contexts/LanguageContext";

const NOTICE_KEY = "update-dismissed-2026-11-08-api";

export default function UpdateNotice() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try { setVisible(localStorage.getItem(NOTICE_KEY) !== "true"); }
    catch { setVisible(true); }
  }, []);
  if (!visible) return null;
  return <Alert severity="info" sx={{ borderRadius: 0, flexShrink: 0, pl: { xs: 7, md: 2 }, "& .MuiAlert-message": { minWidth: 0, overflowWrap: "anywhere" } }} action={
    <IconButton size="small" aria-label={t("chat.banner.dismiss")} onClick={() => {
      setVisible(false);
      try { localStorage.setItem(NOTICE_KEY, "true"); } catch {}
    }}><CloseIcon fontSize="small" /></IconButton>
  }>
    {t("chat.banner.update", { email: "numaothe@gmail.com", github: "GitHub" })}
    <Box><Link component={NextLink} href="/api-lab">API Lab</Link></Box>
  </Alert>;
}
