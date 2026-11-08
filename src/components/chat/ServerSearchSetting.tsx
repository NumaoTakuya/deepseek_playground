import { Box, FormControlLabel, Link, Switch, Tooltip } from "@mui/material";
import { supportsServerSearch } from "../../services/deepseekRequest";

export default function ServerSearchSetting({ model, apiFormat, enabled, onChange, disabled }: {
  model: string; apiFormat: string; enabled: boolean; onChange: (enabled: boolean) => void; disabled?: boolean;
}) {
  const supported = supportsServerSearch(model, apiFormat);
  const docs = apiFormat === "messages" ? "anthropic_api" : "responses_api";
  return <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 2 }}>
    <Tooltip title={supported ? "DeepSeek executes web search on the server. Search / Fetch charges apply in addition to model usage." : "Server-side web search: Responses with deepseek-v4-pro, or Anthropic Messages with a current model."}>
      <span><FormControlLabel label="Web search (server-side)" labelPlacement="start"
        sx={{ m: 0, gap: 0.5, "& .MuiFormControlLabel-label": { fontSize: 14 }, "& .MuiSwitch-switchBase.Mui-checked": { color: "var(--color-primary)" }, "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: "var(--color-primary)" } }}
        control={<Switch size="small" checked={supported && enabled} disabled={disabled || !supported} onChange={(_, checked) => onChange(checked)} inputProps={{ "aria-label": "Web search (server-side)" }} />} /></span>
    </Tooltip>
    <Link href={`https://api-docs.deepseek.com/guides/${docs}/`} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 12, color: "var(--color-primary)" }}>Docs</Link>
  </Box>;
}
