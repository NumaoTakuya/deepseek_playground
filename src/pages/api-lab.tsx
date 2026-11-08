import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Link, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";
import PlayArrow from "@mui/icons-material/PlayArrow";
import Stop from "@mui/icons-material/Stop";
import Refresh from "@mui/icons-material/Refresh";
import UploadFile from "@mui/icons-material/UploadFile";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import ContentCopy from "@mui/icons-material/ContentCopy";
import { useApiKey } from "../contexts/ApiKeyContext";
import { useTheme } from "../contexts/ThemeContext";
import { defaultLabBody, emptyLabResult, IMAGE_ACCEPT, inlineImage, LAB_BASE, LAB_PATHS, labCurl, labFiles, parseLabBody, redactLab, runLab, validateImage, visionBlock } from "../services/deepseekLab";
import type { FileList, JsonObject, LabEndpoint, LabFile, LabModel, LabResult } from "../services/deepseekLab";

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
  const [imageMode, setImageMode] = useState<"url" | "file" | "inline">("url");
  const [imageValue, setImageValue] = useState(exampleUrl);
  const [localImage, setLocalImage] = useState("");
  const [imageName, setImageName] = useState("");
  const [prompt, setPrompt] = useState("Describe this image and read any visible text.");
  const [detail, setDetail] = useState("auto");
  const [preview, setPreview] = useState("");
  const [files, setFiles] = useState<LabFile[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [upload, setUpload] = useState<File>();
  const [expiry, setExpiry] = useState("86400");
  const [pendingDelete, setPendingDelete] = useState<LabFile>();
  const [fileRaw, setFileRaw] = useState<unknown>();
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const imageGeneration = useRef(0);
  const uploadGeneration = useRef(0);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); imageGeneration.current++; uploadGeneration.current++; }; }, []);
  // Do not retain results or account file metadata when the active credential changes.
  useEffect(() => {
    generation.current++; controller.current?.abort(); setBusy(false);
    setFiles([]); setFilesLoaded(false); setFileRaw(undefined); setHasMore(false); setCursor(undefined);
    setResult(emptyLabResult()); setEvents([]); setError(""); setStatus("Idle"); setPendingDelete(undefined);
  }, [key]);

  let body: JsonObject | undefined, parseError = "";
  try { body = parseLabBody(source); } catch (e) { parseError = e instanceof Error ? e.message : "Invalid JSON"; }
  const safe = (value: string) => redactLab(value, key);
  const curl = body ? labCurl(endpoint, body, key) : "";

  function changeEndpoint(next: LabEndpoint) {
    const nextModel = next === "vision" ? "deepseek-flash" : model;
    setEndpoint(next); setModel(nextModel); setStream(true);
    setSource(pretty(defaultLabBody(next, nextModel))); setPreview(""); setError("");
    setResult(emptyLabResult()); setEvents([]); setNotice(""); setStatus("Idle");
  }
  function patchBody(patch: JsonObject) {
    try { setSource(pretty({ ...parseLabBody(source), ...patch })); }
    catch { setError("Fix the JSON before changing request controls."); }
  }
  function applyVision() {
    try {
      const value = imageMode === "inline" ? localImage : imageValue;
      const block = visionBlock(imageMode, value, detail);
      const current = parseLabBody(source);
      setSource(pretty({ ...current, model: "deepseek-flash", messages: [{ role: "user", content: [{ type: "text", text: prompt }, block] }] }));
      setModel("deepseek-flash"); setPreview(imageMode === "file" ? "" : value); setError("");
    } catch (e) { setError(safe(e instanceof Error ? e.message : "Invalid image input.")); }
  }
  async function selectInline(file?: File) {
    const token = ++imageGeneration.current; setLocalImage(""); setPreview(""); setImageName("");
    if (!file) return;
    try {
      const data = await inlineImage(file);
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => reject(new Error("Image cannot be decoded.")); img.src = data;
      });
      if (dimensions.width > 8192 || dimensions.height > 8192) throw new Error("Image dimensions must be at most 8192 px per side.");
      if (mounted.current && token === imageGeneration.current) { setLocalImage(data); setPreview(data); setImageName(`${file.name} (${dimensions.width} x ${dimensions.height})`); }
    } catch (e) { if (mounted.current && token === imageGeneration.current) setError(e instanceof Error ? e.message : "Cannot read image."); }
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
  async function fileAction(operation: "list" | "upload" | "delete", more = false) {
    if (busy) return;
    const token = ++generation.current, abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setNotice("");
    try {
      const raw = await labFiles(key, operation, { file: upload, id: pendingDelete?.id, after: more ? cursor : undefined, expires: expiry === "" ? undefined : Number(expiry), signal: abort.signal });
      if (!mounted.current || token !== generation.current) return;
      setFileRaw(raw);
      if (operation === "list") {
        const page = raw as FileList;
        setFiles(prev => more ? [...prev, ...page.data.filter(f => !prev.some(old => old.id === f.id))] : page.data);
        setHasMore(page.has_more); setCursor(page.last_id); setFilesLoaded(true);
      } else if (operation === "upload") {
        const file = raw as LabFile;
        setFiles(prev => [file, ...prev.filter(old => old.id !== file.id)]);
        setNotice(`Uploaded ${file.filename}: ${file.id}`); setUpload(undefined);
      } else {
        const deleted = raw as { deleted?: boolean };
        if (!deleted.deleted) throw new Error("Server did not confirm deletion.");
        setFiles(prev => prev.filter(f => f.id !== pendingDelete?.id)); setNotice("File deleted."); setPendingDelete(undefined);
      }
    } catch (e) { if (mounted.current && token === generation.current) setError(abort.signal.aborted ? "Operation stopped. Refresh files to verify server state." : safe(e instanceof Error ? e.message : "File request failed.")); }
    finally { if (mounted.current && token === generation.current) setBusy(false); }
  }
  function useFile(file: LabFile) {
    const current = defaultLabBody("vision");
    current.messages = [{ role: "user", content: [{ type: "text", text: prompt }, visionBlock("file", file.id)] }];
    setEndpoint("vision"); setModel("deepseek-flash"); setStream(true); setSource(pretty(current)); setImageMode("file"); setImageValue(file.id); setPreview("");
  }
  async function copyCurl() {
    try { await navigator.clipboard.writeText(curl); setNotice("cURL copied with credential placeholder."); }
    catch { setError("Clipboard unavailable. Select the cURL text below."); }
  }

  return <Box sx={{ p: { xs: 2, md: 4 }, pt: { xs: 8, md: 4 }, maxWidth: 1500, mx: "auto", color: "var(--color-text)", colorScheme: darkMode ? "dark" : "light", "& .MuiInputBase-root, & .MuiInputLabel-root, & .MuiFormLabel-root, & .MuiTab-root, & .MuiFormControlLabel-root": { color: "var(--color-text)" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-border)" }, "& .MuiFormHelperText-root": { color: "var(--color-text)", opacity: .7 } }}>
    <Head><title>API Lab | DeepSeek Playground</title></Head>
    <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3, flexWrap: "wrap", gap: 1 }}><Typography variant="h4" component="h1" sx={{ fontSize: 28 }}>DeepSeek API Lab</Typography><Chip size="small" label={status} /></Stack>
    <Stack spacing={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <FormControlLabel control={<Checkbox checked={useContext} onChange={e => setUseContext(e.target.checked)} />} label={`Use app API key${apiKey ? " (available)" : " (not configured)"}`} />
        {!useContext && <TextField label="Session API key" type="password" value={sessionKey} onChange={e => setSessionKey(e.target.value)} autoComplete="off" helperText="Memory only" size="small" />}
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField select label="Image source" size="small" fullWidth value={imageMode} onChange={e => { const next = e.target.value as typeof imageMode; setImageMode(next); setImageValue(next === "url" ? exampleUrl : ""); setPreview(next === "inline" ? localImage : ""); }}><MenuItem value="url">Public URL</MenuItem><MenuItem value="file">Uploaded file ID</MenuItem><MenuItem value="inline">Local inline image</MenuItem></TextField>
              <TextField select label="Detail" size="small" fullWidth disabled={imageMode === "file"} value={detail} onChange={e => setDetail(e.target.value)}>{["auto", "low", "high", "original"].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField>
            </Stack>
            {imageMode === "inline" ? <><Button component="label" startIcon={<UploadFile />}>Choose image<input hidden type="file" accept={IMAGE_ACCEPT} onChange={e => { void selectInline(e.target.files?.[0]); e.target.value = ""; }} /></Button>{imageName && <Typography variant="caption">{safe(imageName)}</Typography>}</> : <TextField label={imageMode === "file" ? "File ID" : "Image URL"} size="small" value={imageValue} onChange={e => setImageValue(e.target.value)} />}
            <Button variant="outlined" disabled={busy} onClick={applyVision}>Apply Image to JSON</Button>
            {preview && <Box component="img" src={preview} alt="Selected image preview" referrerPolicy="no-referrer" onError={() => { setPreview(""); setNotice(""); setError("Image preview unavailable; remote host may block browser loading."); }} sx={{ width: "100%", height: 180, objectFit: "contain", bgcolor: "var(--color-panel)" }} />}
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
        <Stack direction="row" alignItems="center" spacing={1}><Typography variant="h6" component="h2">Files</Typography><Tooltip title="Refresh files"><span><IconButton aria-label="Refresh files" disabled={busy || !key} onClick={() => void fileAction("list")}><Refresh /></IconButton></span></Tooltip></Stack>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ my: 2 }} alignItems={{ md: "center" }}>
          <Button component="label" startIcon={<UploadFile />} disabled={busy}>Choose Image<input hidden type="file" accept={IMAGE_ACCEPT} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; const token = ++uploadGeneration.current; setUpload(undefined); if (file) { try { await validateImage(file, true); if (mounted.current && token === uploadGeneration.current) setUpload(file); } catch (err) { if (mounted.current && token === uploadGeneration.current) setError(err instanceof Error ? err.message : "Invalid image"); } } }} /></Button>
          <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{upload ? safe(`${upload.name} (${upload.size.toLocaleString()} bytes)`) : "No image selected"}</Typography>
          <TextField label="Expiry (seconds)" type="number" size="small" value={expiry} onChange={e => setExpiry(e.target.value)} helperText="3600-2592000; blank = permanent" slotProps={{ htmlInput: { min: 3600, max: 2592000, step: 1 } }} />
          <Button variant="outlined" startIcon={<UploadFile />} disabled={busy || !key || !upload} onClick={() => void fileAction("upload")}>Upload</Button>
        </Stack>
        <Typography variant="caption">Images only, up to 64 MiB. Purpose: user_data. Files are stored by DeepSeek and shared across API keys on your account.</Typography>
        {!files.length && <Typography sx={{ my: 2 }} variant="body2">{filesLoaded ? "No files returned." : "Files not loaded."}</Typography>}
        {files.map(file => <Box key={file.id} sx={{ py: 1.5, borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 220px", minWidth: 0, overflowWrap: "anywhere" }}><Typography variant="body2">{safe(file.filename)}</Typography><Typography variant="caption">{safe(file.id)} / {file.bytes.toLocaleString()} bytes{file.expires_at ? ` / expires ${new Date(file.expires_at * 1000).toLocaleString()}` : " / permanent"}</Typography></Box>
          <Button size="small" disabled={busy} onClick={() => useFile(file)}>Use in Vision</Button>
          <Tooltip title="Delete file"><span><IconButton aria-label={`Delete ${file.filename}`} disabled={busy || !key} onClick={() => setPendingDelete(file)}><DeleteOutline /></IconButton></span></Tooltip>
        </Box>)}
        {hasMore && <Button disabled={busy || !cursor} onClick={() => void fileAction("list", true)}>Load More</Button>}
        {fileRaw !== undefined && <Box component="details" sx={{ mt: 2 }}><summary>Files response JSON</summary><Box component="pre" sx={codeStyle}>{safe(pretty(fileRaw))}</Box></Box>}
      </Box>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
        {[["Responses", "responses_api"], ["Messages", "anthropic_api"], ["Vision", "vision"], ["Files", "files_api"]].map(([label, path]) => <Link key={path} href={`https://api-docs.deepseek.com/guides/${path}/`} target="_blank" rel="noreferrer">{label} docs</Link>)}
      </Stack>
    </Stack>
    <Dialog open={!!pendingDelete} onClose={() => { if (!busy) setPendingDelete(undefined); }}><DialogTitle>Delete Image?</DialogTitle><DialogContent sx={{ overflowWrap: "anywhere" }}>{safe(pendingDelete?.filename || "")} will be permanently deleted from your DeepSeek account.</DialogContent><DialogActions><Button disabled={busy} onClick={() => setPendingDelete(undefined)}>Cancel</Button><Button color="error" startIcon={<DeleteOutline />} disabled={busy} onClick={() => void fileAction("delete")}>Delete</Button></DialogActions></Dialog>
  </Box>;
}
