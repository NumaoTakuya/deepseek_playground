import { Box, FormControlLabel, Link, Switch, Tooltip, Typography } from "@mui/material";

export default function BuiltinTools({ searchEnabled, onSearchChange, disabled }: {
  searchEnabled: boolean;
  onSearchChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return <Box sx={{ mb: 2, pb: 1.5, borderBottom: "1px solid var(--color-border)", color: "var(--color-text)" }}>
    <Typography variant="caption" sx={{ color: "var(--color-subtext)", display: "block", mb: 0.5 }}>Built-in tools</Typography>
    <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
      <Tooltip title="The model decides when to search or read web pages using tool_choice. Retrieved content is sent back to the model.">
        <FormControlLabel label="Web Search" labelPlacement="start" sx={{ m: 0, gap: 0.5, "& .MuiFormControlLabel-label": { fontSize: 14 }, "& .MuiSwitch-switchBase.Mui-checked": { color: "var(--color-primary)" }, "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: "var(--color-primary)" } }}
          control={<Switch size="small" checked={searchEnabled} disabled={disabled} onChange={(_, checked) => onSearchChange(checked)} inputProps={{ "aria-label": "Web Search" }} />} />
      </Tooltip>
      <Link href="https://api-docs.deepseek.com/guides/search/" target="_blank" rel="noopener noreferrer" sx={{ fontSize: 12, color: "var(--color-primary)" }}>Docs</Link>
    </Box>
    <Typography variant="caption" sx={{ color: "var(--color-subtext)", display: "block" }}>Search / Fetch: $0.75 each / 1,000 successful requests + model usage</Typography>
  </Box>;
}
