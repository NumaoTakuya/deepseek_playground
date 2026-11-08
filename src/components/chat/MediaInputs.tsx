import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import UploadFile from "@mui/icons-material/UploadFile";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Refresh from "@mui/icons-material/Refresh";
import Add from "@mui/icons-material/Add";
import { IMAGE_ACCEPT, inlineImage, labFiles, redactLab } from "../../services/deepseekLab";
import type { FileList, LabFile } from "../../services/deepseekLab";
import { attachmentBlocks, validateAttachmentImage } from "../../services/deepseekAttachments";
import type { Attachment, AttachmentDetail } from "../../services/deepseekAttachments";

export interface MediaInputsProps { apiKey: string; attachments: Attachment[]; onChange: (attachments: Attachment[]) => void; disabled?: boolean; allowInline?: boolean; showFiles?: boolean }

export function FilesManager({ apiKey, disabled = false, onSelect, onDeleted, defaultExpiry = "" }: { apiKey: string; disabled?: boolean; onSelect: (file: LabFile) => void; onDeleted?: (id: string) => void; defaultExpiry?: string }) {
  const [files, setFiles] = useState<LabFile[]>([]);
  const [page, setPage] = useState<FileList>();
  const [raw, setRaw] = useState<unknown>();
  const [upload, setUpload] = useState<File>();
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [pending, setPending] = useState<LabFile>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    epoch.current++; controller.current?.abort(); setFiles([]); setPage(undefined); setRaw(undefined); setPending(undefined); setUpload(undefined); setError(""); setNotice(""); setBusy(false);
    return () => { epoch.current++; controller.current?.abort(); };
  }, [apiKey]);
  const locked = disabled || busy;
  const safe = (value: string) => redactLab(value, apiKey);
  async function action(operation: "list" | "upload" | "delete", more = false) {
    if (locked) return;
    const token = ++epoch.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setNotice("");
    try {
      if (operation === "upload" && upload) await validateAttachmentImage(upload);
      if (token !== epoch.current) return;
      const result = await labFiles(apiKey, operation, { file: upload, id: pending?.id, after: more ? page?.last_id : undefined, expires: expiry === "" ? undefined : Number(expiry), signal: abort.signal });
      if (token !== epoch.current) return;
      setRaw(result);
      if (operation === "list") {
        const next = result as FileList;
        setFiles(previous => more ? [...previous, ...next.data.filter(file => !previous.some(old => old.id === file.id))] : next.data); setPage(next);
      } else if (operation === "upload") {
        const file = result as LabFile;
        attachmentBlocks([{ id: file.id, kind: "file", value: file.id, name: file.filename }]);
        setFiles(previous => [file, ...previous.filter(old => old.id !== file.id)]); setUpload(undefined); setNotice(`Uploaded ${file.filename}: ${file.id}`);
      } else {
        if (!(result as { deleted?: boolean }).deleted) throw new Error("Server did not confirm deletion.");
        const id = pending!.id;
        setFiles(previous => previous.filter(file => file.id !== id)); setPending(undefined); onDeleted?.(id); setNotice("File deleted.");
      }
    } catch (e) { if (token === epoch.current) setError(safe(e instanceof Error ? e.message : "File operation failed.")); }
    finally { if (token === epoch.current) setBusy(false); }
  }
  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <Stack direction="row" alignItems="center"><Typography variant="h6">Files</Typography><Tooltip title="Refresh files"><span><IconButton aria-label="Refresh files" disabled={locked || !apiKey.trim()} onClick={() => void action("list")}><Refresh /></IconButton></span></Tooltip></Stack>
    {error && <Alert severity="error">{error}</Alert>}{notice && <Alert severity="success">{safe(notice)}</Alert>}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
      <Button component="label" startIcon={<UploadFile />} disabled={locked}>Choose image<input hidden type="file" accept={IMAGE_ACCEPT} onChange={e => { setUpload(e.target.files?.[0]); e.target.value = ""; }} /></Button>
      <TextField label="Expiry (seconds)" size="small" type="number" disabled={locked} value={expiry} onChange={e => setExpiry(e.target.value)} helperText="3600-2592000; blank = permanent" />
      <Button startIcon={<UploadFile />} disabled={locked || !upload || !apiKey.trim()} onClick={() => void action("upload")}>Upload</Button>
    </Stack>
    {upload && <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{safe(upload.name)} ({upload.size.toLocaleString()} bytes)</Typography>}
    <Typography variant="caption">Files are hosted by DeepSeek, shared across your account, and remain until expiry or deletion. Images up to 64 MiB.</Typography>
    {!files.length && <Typography variant="body2">{page ? "No files returned." : "Files not loaded."}</Typography>}
    {files.map(file => <Stack key={file.id} direction="row" alignItems="center" spacing={1} sx={{ borderBottom: "1px solid", borderColor: "divider", py: 1 }}><Box sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}><Typography variant="body2">{safe(file.filename)}</Typography><Typography variant="caption">{safe(file.id)} / {file.bytes.toLocaleString()} bytes{file.expires_at ? ` / expires ${new Date(file.expires_at * 1000).toLocaleString()}` : " / permanent"}</Typography></Box><Tooltip title="Attach file"><span><IconButton aria-label={`Attach ${file.filename}`} disabled={locked} onClick={() => onSelect(file)}><Add /></IconButton></span></Tooltip><Tooltip title="Delete file"><span><IconButton aria-label={`Delete ${file.filename}`} disabled={locked || !apiKey.trim()} onClick={() => setPending(file)}><DeleteOutline /></IconButton></span></Tooltip></Stack>)}
    {page?.has_more && <Button disabled={locked || !page.last_id} onClick={() => void action("list", true)}>Load More</Button>}
    {raw !== undefined && <Box component="details"><summary>Files response JSON</summary><Box component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 300, overflow: "auto", fontSize: 12 }}>{safe(JSON.stringify(raw, null, 2))}</Box></Box>}
    <Dialog open={!!pending} onClose={() => { if (!locked) setPending(undefined); }}><DialogTitle>Delete Image?</DialogTitle><DialogContent sx={{ overflowWrap: "anywhere" }}>{safe(pending?.filename || "")} will be permanently deleted from your DeepSeek account. Existing references will stop working.</DialogContent><DialogActions><Button disabled={locked} onClick={() => setPending(undefined)}>Cancel</Button><Button color="error" startIcon={<DeleteOutline />} disabled={locked} onClick={() => void action("delete")}>Delete</Button></DialogActions></Dialog>
  </Stack>;
}

export function MediaInputs({ apiKey, attachments, onChange, disabled = false, allowInline = false, showFiles = true }: MediaInputsProps) {
  const [mode, setMode] = useState("url");
  const [value, setValue] = useState("");
  const [detail, setDetail] = useState<AttachmentDetail>("auto");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const latest = useRef({ attachments, onChange }); latest.current = { attachments, onChange };
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { generation.current++; abort.current?.abort(); setBusy(false); setError(""); return () => { generation.current++; abort.current?.abort(); }; }, [apiKey]);
  const locked = disabled || busy;
  function attach(attachment: Attachment) {
    const next = [...latest.current.attachments, attachment]; attachmentBlocks(next); latest.current.onChange(next);
  }
  async function local(file?: File) {
    if (!file || locked) return;
    const token = ++generation.current; const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError("");
    try {
      const inline = mode === "inline" && allowInline;
      await validateAttachmentImage(file, !inline, latest.current.attachments.length + 1);
      if (token !== generation.current) return;
      if (inline) {
        const data = await inlineImage(file);
        if (token === generation.current) attach({ id: crypto.randomUUID(), kind: "url", value: data, name: file.name, detail });
      } else {
        const uploaded = await labFiles(apiKey, "upload", { file, signal: controller.signal }) as LabFile;
        if (token === generation.current) attach({ id: uploaded.id, kind: "file", value: uploaded.id, name: uploaded.filename });
      }
    } catch (e) { if (token === generation.current) setError(redactLab(e instanceof Error ? e.message : "Image upload failed.", apiKey)); }
    finally { if (token === generation.current) setBusy(false); }
  }
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}><TextField select size="small" label="Image source" value={mode} disabled={locked} onChange={e => { setMode(e.target.value); setValue(""); }} sx={{ minWidth: 160 }}><MenuItem value="url">Public URL</MenuItem><MenuItem value="file">Uploaded file ID</MenuItem><MenuItem value="upload">Local upload</MenuItem>{allowInline && <MenuItem value="inline">Local inline image</MenuItem>}</TextField><TextField select size="small" label="Detail" value={detail} disabled={locked || mode === "file" || mode === "upload"} onChange={e => setDetail(e.target.value as AttachmentDetail)}>{["auto", "low", "high", "original"].map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}</TextField></Stack>
    {mode === "upload" || mode === "inline" ? <Button component="label" startIcon={<UploadFile />} disabled={locked || (mode === "upload" && !apiKey.trim())}>Choose image<input hidden type="file" accept={IMAGE_ACCEPT} onChange={e => { void local(e.target.files?.[0]); e.target.value = ""; }} /></Button> : <Stack direction="row" spacing={1}><TextField fullWidth size="small" label={mode === "file" ? "File ID" : "Image URL"} disabled={locked} value={value} onChange={e => setValue(e.target.value)} /><Tooltip title="Attach image"><span><IconButton aria-label="Attach image" disabled={locked || !value.trim()} onClick={() => { try { if (mode === "url" && value.trim().startsWith("data:")) throw new Error("Use a public HTTP(S) image URL. Local images must be uploaded."); attach({ id: crypto.randomUUID(), kind: mode === "file" ? "file" : "url", value: value.trim(), name: value.trim(), detail }); setValue(""); setError(""); } catch (e) { setError(redactLab(e instanceof Error ? e.message : "Invalid image.", apiKey)); } }}><Add /></IconButton></span></Tooltip></Stack>}
    {attachments.map((attachment, index) => <Stack key={`${attachment.id}-${index}`} spacing={1}><Stack direction="row" alignItems="center"><Box sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}><Typography variant="body2">{redactLab(attachment.name, apiKey)}</Typography>{attachment.kind === "file" && <Typography variant="caption">{attachment.value}</Typography>}</Box><Tooltip title="Remove attachment"><span><IconButton aria-label={`Remove ${attachment.name}`} disabled={locked} onClick={() => onChange(attachments.filter((_, i) => i !== index))}><DeleteOutline /></IconButton></span></Tooltip></Stack>{attachment.kind === "url" && <AttachmentPreview value={attachment.value} />}</Stack>)}
    {showFiles && <FilesManager apiKey={apiKey} disabled={locked} onSelect={file => { try { attach({ id: file.id, kind: "file", value: file.id, name: file.filename }); } catch (e) { setError(e instanceof Error ? e.message : "Invalid file."); } }} onDeleted={id => onChange(latest.current.attachments.filter(a => a.kind !== "file" || a.value !== id))} />}
  </Stack>;
}

function AttachmentPreview({ value }: { value: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [value]);
  try { attachmentBlocks([{ id: "preview", kind: "url", value, name: "preview" }]); } catch { return null; }
  return failed ? <Typography variant="caption">Image preview unavailable.</Typography> : <Box component="img" src={value} alt="Selected image preview" referrerPolicy="no-referrer" onError={() => setFailed(true)} sx={{ width: "100%", height: 180, objectFit: "contain" }} />;
}

export default MediaInputs;
