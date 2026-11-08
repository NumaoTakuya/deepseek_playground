import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, IconButton, Link, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";
import PlayArrow from "@mui/icons-material/PlayArrow";
import Stop from "@mui/icons-material/Stop";
import Refresh from "@mui/icons-material/Refresh";
import ContentCopy from "@mui/icons-material/ContentCopy";
import { useApiKey } from "../contexts/ApiKeyContext";
import { useTheme } from "../contexts/ThemeContext";
import { defaultLabBody, emptyLabResult, LAB_BASE, LAB_PATHS, labCurl, parseLabBody, redactLab, runLab } from "../services/deepseekLab";
import type { JsonObject, LabEndpoint, LabFile, LabModel, LabResult } from "../services/deepseekLab";

import MediaInputs, { FilesManager } from "../components/chat/MediaInputs";
import { attachmentBlocks } from "../services/deepseekAttachments";
import type { Attachment } from "../services/deepseekAttachments";

const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const exampleUrl = "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg";
const codeStyle = { m: 0, p: 2, bgcolor: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: 1, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 440, overflow: "auto" } as const;

export default function ApiLabPage() {
  const { apiKey } = useApiKey();
  const { darkMode } = useTheme();
  const [sessionKey, setSessionKey] = useState("");
  const [useContext, setUseContext] = useState(true);
  const key = (useContext ? apiKey : sessionKey).trim();
  const [endpoint, setEndpoint] = useState<LabEndpoint>("responses");
  const [model, setModel] = useState<LabModel>("deepseek-flash");
  const [source, setSource] = useState(pretty(defaultLabBody("responses")));
  const [stream, setStream] = useState(true);
  const [result, setResult] = useState<LabResult>(emptyLabResult);
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(0);
  const [status, setStatus] = useState("Idle");
  const [attachments, setAttachments] = useState<Attachment[]>([{ id: "lab-example", kind: "url", value: exampleUrl, name: "Example image", detail: "auto" }]);
  const [prompt, setPrompt] = useState("Describe this image and read any visible text.");
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  // Do not retain results or account file metadata when the active credential changes.
  useEffect(() => {
    generation.current++; controller.current?.abort(); setBusy(false);
    setResult(emptyLabResult()); setEvents([]); setError(""); setStatus("Idle");
  }, [key]);

  let body: JsonObject | undefined, parseError = "";
  try { body = parseLabBody(source); } catch (e) { parseError = e instanceof Error ? e.message : "Invalid JSON"; }
  const safe = (value: string) => redactLab(value, key);
  const curl = body ? labCurl(endpoint, body, key) : "";

  function changeEndpoint(next: LabEndpoint) {
    const nextModel = next === "vision" ? "deepseek-flash" : model;
    setEndpoint(next); setModel(nextModel); setStream(true);
    setSource(pretty(defaultLabBody(next, nextModel))); setError("");
    setResult(emptyLabResult()); setEvents([]); setNotice(""); setStatus("Idle");
  }
  function patchBody(patch: JsonObject) {
    try { setSource(pretty({ ...parseLabBody(source), ...patch })); }
    catch { setError("Fix the JSON before changing request controls."); }
  }
  function applyVision() {
    try {
      const blocks = attachmentBlocks(attachments);
      const current = parseLabBody(source);
      setSource(pretty({ ...current, model: "deepseek-flash", messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...blocks] }] }));
      setModel("deepseek-flash"); setError("");
    } catch (e) { setError(safe(e instanceof Error ? e.message : "Invalid image input.")); }
  }
  async function execute() {
    if (!body || busy) return;
    const token = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setNotice(""); setEvents([]); setResult(emptyLabResult()); setStatus("Running");
    try {
      const final = await runLab(endpoint, key, body, abort.signal, (event, next) => {
        if (!mounted.current || token !== generation.current) return;
        if (event.event !== "__result") setEvents(prev => [...prev.slice(-199), `${event.event}${event.id ? ` (${event.id})` : ""}\n${event.data.slice(0, 24000)}`]);
        setResult(next);
      });
      if (mounted.current && token === generation.current) { setResult(final); setStatus(final.status || "Completed"); }
    } catch (e) {
      if (mounted.current && token === generation.current) {
        setStatus(abort.signal.aborted ? "Stopped" : "Failed");
        if (!abort.signal.aborted) setError(safe(e instanceof Error ? e.message : "Request failed. Browser CORS or network restrictions may apply."));
      }
    } finally { if (mounted.current && token === generation.current) setBusy(false); }
  }
  function useFile(file: LabFile) {
    const next: Attachment[] = [{ id: file.id, kind: "file", value: file.id, name: file.filename }];
    const current = defaultLabBody("vision");
    current.messages = [{ role: "user", content: [{ type: "text", text: prompt }, ...attachmentBlocks(next)] }];
    setEndpoint("vision"); setModel("deepseek-flash"); setStream(true); setSource(pretty(current)); setAttachments(next);
  }
  async function copyCurl() {
    try { await navigator.clipboard.writeText(curl); setNotice("cURL copied with credential placeholder."); }
    catch { setError("Clipboard unavailable. Select the cURL text below."); }
  }

  return <Box sx={{ p: { xs: 2, md: 4 }, pt: { xs: 8, md: 4 }, maxWidth: 1500, mx: "auto", color: "var(--color-text)", colorScheme: darkMode ? "dark" : "light", "& .MuiInputBase-root, & .MuiInputLabel-root, & .MuiFormLabel-root, & .MuiTab-root, & .MuiFormControlLabel-root": { color: "var(--color-text)" }, "& .MuiIconButton-root:not(.Mui-disabled), & .MuiChip-root": { color: "var(--color-text)" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-border)" }, "& .MuiFormHelperText-root": { color: "var(--color-text)", opacity: .7 } }}>
    <Head><title>API Lab | DeepSeek Playground</title></Head>
    <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3, flexWrap: "wrap", gap: 1 }}><Typography variant="h4" component="h1" sx={{ fontSize: 28 }}>DeepSeek API Lab</Typography><Chip size="small" label={status} /></Stack>
    <Stack spacing={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <FormControlLabel control={<Checkbox checked={useContext} onChange={e => setUseContext(e.target.checked)} />} label={`Use your saved API key${apiKey ? " (saved in this browser)" : " (not configured)"}`} />
        {!useContext && <TextField label="Your session API key" type="password" value={sessionKey} onChange={e => setSessionKey(e.target.value)} autoComplete="off" helperText="Memory only" size="small" />}
      </Box>
      {!key && <Alert severity="warning">No active API key.</Alert>}
      {error && <Alert severity="error" onClose={() => setError("")}>{safe(error)}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice("")}>{safe(notice)}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 3 }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2">Request</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField select label="Endpoint" size="small" fullWidth value={endpoint} disabled={busy} onChange={e => changeEndpoint(e.target.value as LabEndpoint)}><MenuItem value="responses">Responses API</MenuItem><MenuItem value="messages">Anthropic Messages API</MenuItem><MenuItem value="vision">Vision / Chat Completions</MenuItem></TextField>
            <TextField select label="Model" size="small" fullWidth value={model} disabled={busy} onChange={e => { const next = e.target.value as LabModel; if (body) { setModel(next); patchBody({ model: next }); } }}><MenuItem value="deepseek-flash">deepseek-flash</MenuItem><MenuItem value="deepseek-v4-pro" disabled={endpoint === "vision"}>deepseek-v4-pro</MenuItem></TextField>
          </Stack>
          <Typography variant="body2" sx={{ overflowWrap: "anywhere", fontFamily: "monospace" }}>POST {LAB_BASE}{LAB_PATHS[endpoint]}</Typography>
          {endpoint === "vision" && <Stack spacing={2} sx={{ borderLeft: "3px solid", borderColor: "primary.main", pl: 2 }}>
            <TextField label="Image prompt" value={prompt} onChange={e => setPrompt(e.target.value)} size="small" multiline />
            <MediaInputs apiKey={key} attachments={attachments} onChange={setAttachments} disabled={busy} allowInline showFiles={false} />
            <Button variant="outlined" disabled={busy} onClick={applyVision}>Apply Image to JSON</Button>
            <Typography variant="caption">JPEG / PNG / GIF / WebP. Inline and URL: 32 MiB per image; file ID: 64 MiB. Request: 48 MiB. Up to 600 images; total 64 MiB, or 200 MiB including file IDs. Maximum side: 8192 px (4096 px for 15+ images). URL: 8192 characters, 60-second fetch limit.</Typography>
          </Stack>}
          <TextField label="Request JSON" multiline minRows={15} maxRows={28} value={source} error={!!parseError} helperText={parseError || `${new TextEncoder().encode(source).byteLength.toLocaleString()} bytes`} onChange={e => { setSource(e.target.value); try { const next = parseLabBody(e.target.value); if (typeof next.stream === "boolean") setStream(next.stream); if (next.model === "deepseek-flash" || next.model === "deepseek-v4-pro") setModel(next.model); } catch {} }} slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: 13 } } }} />
          <Stack direction="row" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
            <FormControlLabel control={<Checkbox checked={stream} disabled={busy || !body} onChange={e => { setStream(e.target.checked); patchBody({ stream: e.target.checked }); }} />} label="Stream" />
            <Button startIcon={busy ? <CircularProgress size={16} /> : <PlayArrow />} variant="contained" disabled={busy || !key || !body} onClick={() => void execute()}>Send</Button>
            <Tooltip title="Stop request"><span><IconButton aria-label="Stop request" disabled={!busy} onClick={() => controller.current?.abort()}><Stop /></IconButton></span></Tooltip>
            <Tooltip title="Reset endpoint defaults"><span><IconButton aria-label="Reset endpoint defaults" disabled={busy} onClick={() => { setSource(pretty(defaultLabBody(endpoint, model))); setStream(true); }}><Refresh /></IconButton></span></Tooltip>
          </Stack>
          <Box component="details"><Box component="summary" sx={{ cursor: "pointer", mb: 1 }}>cURL</Box><Tooltip title="Copy cURL"><span><IconButton aria-label="Copy cURL" disabled={!curl} onClick={() => void copyCurl()}><ContentCopy /></IconButton></span></Tooltip><Box component="pre" sx={codeStyle}>{curl || "Invalid request JSON"}</Box></Box>
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2">Response</Typography>
          <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" scrollButtons="auto" aria-label="Response views"><Tab label="Content" /><Tab label="Usage" /><Tab label="Raw Events" /><Tab label="Raw JSON" /></Tabs>
          <Box role="tabpanel" aria-label={["Content", "Usage", "Raw Events", "Raw JSON"][tab]} aria-live={tab === 0 ? "polite" : "off"}>
            {tab === 0 && <><Box component="pre" sx={{ ...codeStyle, minHeight: 220 }}>{safe(result.content) || "No response content"}</Box>{result.reasoning && <Box component="details" sx={{ mt: 2 }}><summary>Reasoning</summary><Box component="pre" sx={codeStyle}>{safe(result.reasoning)}</Box></Box>}{result.status && <Typography variant="caption">{safe(result.status)}</Typography>}</>}
            {tab === 1 && <Box component="pre" sx={codeStyle}>{safe(pretty(result.usage))}</Box>}
            {tab === 2 && <><Typography variant="caption">Latest 200 events; each display capped at 24,000 characters.</Typography><Box component="pre" sx={codeStyle}>{safe(events.join("\n\n")) || "No stream events"}</Box></>}
            {tab === 3 && <Box component="pre" sx={codeStyle}>{safe(pretty(result.raw) || "No response")}</Box>}
          </Box>
        </Stack>
      </Box>
      <Box component="section" sx={{ borderTop: "1px solid var(--color-border)", pt: 3, mt: 2 }}>
        <FilesManager apiKey={key} disabled={busy} defaultExpiry="86400" onSelect={useFile} onDeleted={id => setAttachments(previous => previous.filter(item => item.kind !== "file" || item.value !== id))} />
      </Box>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
        {[["Responses", "responses_api"], ["Messages", "anthropic_api"], ["Vision", "vision"], ["Files", "files_api"]].map(([label, path]) => <Link key={path} href={`https://api-docs.deepseek.com/guides/${path}/`} target="_blank" rel="noreferrer">{label} docs</Link>)}
      </Stack>
    </Stack>
  </Box>;
}
