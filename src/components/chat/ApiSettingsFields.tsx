import { useId } from "react";
import { Box, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Switch, TextField } from "@mui/material";

type Props = {
  apiFormat: "chat" | "responses" | "messages";
  onApiFormatChange: (value: Props["apiFormat"]) => void;
  streamEnabled: boolean;
  onStreamChange: (value: boolean) => void;
  thinkingEnabled: boolean;
  onThinkingChange: (value: boolean) => void;
  reasoningEffort: "low" | "high" | "max";
  onReasoningEffortChange: (value: Props["reasoningEffort"]) => void;
  requestOptionsJson: string;
  onRequestOptionsChange: (value: string) => void;
  showThinking: boolean;
  disabled?: boolean;
  streamDisabled?: boolean;
};

const menuProps = {
  PaperProps: { sx: {
    backgroundColor: "var(--color-panel)", color: "var(--color-text)",
    border: "1px solid var(--color-border)",
    "& .MuiMenuItem-root.Mui-selected, & .MuiMenuItem-root:hover": { backgroundColor: "var(--color-sidebar)" },
  } },
};
const toggleStyle = {
  m: 0, gap: 0.5, flex: "0 0 auto", justifyContent: "flex-start",
  "& .MuiFormControlLabel-label": { fontSize: 14 },
  "& .MuiSwitch-switchBase.Mui-checked": { color: "var(--color-primary)" },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: "var(--color-primary)" },
};

export default function ApiSettingsFields(props: Props) {
  const id = useId();
  return <Box sx={{
    containerType: "inline-size", color: "var(--color-text)",
    "& .MuiInputBase-root": { color: "var(--color-text)" },
    "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
    "& .MuiSelect-icon": { color: "var(--color-text)" },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-border)" },
  }}>
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, "@container (min-width: 440px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } }}>
      <FormControl fullWidth size="small" disabled={props.disabled}>
        <InputLabel id={`${id}-format`}>API Format</InputLabel>
        <Select labelId={`${id}-format`} label="API Format" value={props.apiFormat} MenuProps={menuProps}
          onChange={(event) => props.onApiFormatChange(event.target.value as Props["apiFormat"])}>
          <MenuItem value="chat">Chat Completions</MenuItem>
          <MenuItem value="responses">Responses</MenuItem>
          <MenuItem value="messages">Anthropic Messages</MenuItem>
        </Select>
      </FormControl>
      {props.showThinking && <FormControl fullWidth size="small" disabled={props.disabled || !props.thinkingEnabled}>
        <InputLabel id={`${id}-effort`}>reasoning_effort</InputLabel>
        <Select labelId={`${id}-effort`} label="reasoning_effort" value={props.reasoningEffort} MenuProps={menuProps}
          onChange={(event) => props.onReasoningEffortChange(event.target.value as Props["reasoningEffort"])}>
          {["low", "high", "max"].map((effort) => <MenuItem key={effort} value={effort}>{effort}</MenuItem>)}
        </Select>
      </FormControl>}
    </Box>
    <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 3, rowGap: 1, my: 2 }}>
      <FormControlLabel label="Stream" labelPlacement="start" sx={toggleStyle}
        control={<Switch size="small" checked={props.streamEnabled} disabled={props.disabled || props.streamDisabled} onChange={(_, checked) => props.onStreamChange(checked)} inputProps={{ "aria-label": "Stream" }} />} />
      {props.showThinking && <FormControlLabel label="Thinking" labelPlacement="start" sx={toggleStyle}
        control={<Switch size="small" checked={props.thinkingEnabled} disabled={props.disabled} onChange={(_, checked) => props.onThinkingChange(checked)} inputProps={{ "aria-label": "Thinking" }} />} />}
    </Box>
    <TextField label="Additional API Parameters (JSON)" value={props.requestOptionsJson}
      onChange={(event) => props.onRequestOptionsChange(event.target.value)} disabled={props.disabled}
      slotProps={{ inputLabel: { shrink: true }, input: { sx: { fontFamily: "monospace", fontSize: 13 } } }}
      multiline minRows={2} fullWidth size="small" />
  </Box>;
}
