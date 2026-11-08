import { beforeEach, describe, expect, it, vi } from "vitest";
import { replayMessage, runToolConversation, parseRequestOptions, type ToolPass } from "./toolConversation";

const call = { id: "call-1", type: "function" as const, function: { name: "lookup", arguments: "{}" } };
const pass = (tools = false): ToolPass => ({ partialContent: tools ? "" : "done", partialReasoningContent: "reason", finalFinishReason: tools ? "tool_calls" : "stop", toolCalls: tools ? [call] : [] });
const result = { role: "tool" as const, tool_call_id: call.id, content: "42" };

describe("tool conversation", () => {
  it("accepts arbitrary request options but protects canonical request fields", () => {
    expect(parseRequestOptions('{"logprobs":true,"search":{"enabled":true}}')).toEqual({ logprobs: true, search: { enabled: true } });
    expect(parseRequestOptions(" ")).toEqual({});
    for (const raw of ["null", "[]", "true", "1", "invalid"]) expect(() => parseRequestOptions(raw)).toThrow();
    for (const key of ["model", "messages", "input", "system", "instructions", "stream"]) {
      expect(() => parseRequestOptions(JSON.stringify({ [key]: null }))).toThrow("reserved");
    }
  });

  it("retains provider signatures in subsequent rounds and persisted replay", async () => {
    const providerData = { format: "messages", content: [{ type: "thinking", thinking: "reason", signature: "signed" }] };
    const stream = vi.fn().mockResolvedValueOnce({ ...pass(true), providerData }).mockResolvedValue(pass());
    const persist = vi.fn(async () => {});
    await runToolConversation({ conversation: [], stream, resolve: async () => [result], signal: new AbortController().signal, persist });
    expect(stream.mock.calls[1][0][0].provider_data).toEqual(providerData);
    expect(JSON.parse(JSON.stringify(persist.mock.calls.at(-1)))[1][0].provider_data).toEqual(providerData);
  });
  it("roundtrips multiple reasoning/tool rounds through JSON and reload", async () => {
    const stream = vi.fn().mockResolvedValueOnce(pass(true)).mockResolvedValueOnce(pass(true)).mockResolvedValue(pass());
    const persisted: unknown[] = [];
    await runToolConversation({ conversation: [], stream, resolve: async () => [result], signal: new AbortController().signal,
      persist: async (_pass, history) => { persisted.push(JSON.parse(JSON.stringify(history))); } });
    expect(stream).toHaveBeenCalledTimes(3);
    expect(stream.mock.calls[2][0][0].reasoning_content).toBe("reason");
    const history = persisted.at(-1) as Parameters<typeof replayMessage>[0]["api_messages"];
    expect(replayMessage({ id: "m", threadId: "t", role: "assistant", content: "done", api_messages: history })).toEqual(history);
    expect(history).toHaveLength(5);
  });

  it("caps tool execution at eight rounds", async () => {
    const resolve = vi.fn(async () => [result]);
    const stream = vi.fn(async () => pass(true));
    await expect(runToolConversation({ conversation: [], stream, resolve, signal: new AbortController().signal, persist: async () => {} })).rejects.toThrow("limit (8)");
    expect(resolve).toHaveBeenCalledTimes(8);
    expect(stream).toHaveBeenCalledTimes(9);
  });

  it("stops between rounds without issuing a new request", async () => {
    const controller = new AbortController();
    const stream = vi.fn(async () => pass(true));
    await expect(runToolConversation({ conversation: [], stream, resolve: async () => { controller.abort(); return [result]; }, signal: controller.signal, persist: async () => {} })).rejects.toMatchObject({ name: "AbortError" });
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it("replaces an assistant prefix and preserves prior completed tool exchanges", async () => {
    const persist = vi.fn<Parameters<typeof runToolConversation>[0]["persist"]>(async () => {});
    await runToolConversation({ conversation: [{ role: "assistant", content: "base", prefix: true }], stream: async () => pass(), resolve: async () => [], signal: new AbortController().signal, prefix: "base", history: [{ role: "assistant", content: "", tool_calls: [call], reasoning_content: "old" }, result], persist });
    expect(persist.mock.calls[0][1]).toHaveLength(3);
    expect(persist.mock.calls[0][1][2]).toMatchObject({ content: "basedone", reasoning_content: "reason" });
  });
});

const mocks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as (() => unknown)[], stateIndex: 0, refIndex: 0, stream: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn() }));
vi.mock("react", () => ({
  useState: (initial: unknown) => { const i = mocks.stateIndex++; if (!(i in mocks.states)) mocks.states[i] = initial; return [mocks.states[i], (value: unknown) => { mocks.states[i] = value; }]; },
  useRef: (initial: unknown) => { const i = mocks.refIndex++; return mocks.refs[i] ?? (mocks.refs[i] = { current: initial }); },
  useEffect: (effect: () => unknown) => { mocks.effects.push(effect); if (effect.toString().includes("settingsRef.current =")) effect(); },
}));
vi.mock("../services/firebase", () => ({ db: {}, analytics: null, logEvent: vi.fn() }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), updateDoc: vi.fn(async () => {}), onSnapshot: vi.fn(), serverTimestamp: vi.fn(), increment: vi.fn() }));
vi.mock("../services/message", () => ({ listenMessages: vi.fn(), createMessage: mocks.create, updateMessage: mocks.update, deleteMessages: mocks.remove }));
vi.mock("../services/tokenizer", () => ({ fetchTokenCount: vi.fn(async () => null) }));
vi.mock("../services/deepseek", () => ({ streamDeepseek: mocks.stream, callDeepseekFim: vi.fn() }));
vi.mock("../services/thread", () => ({ createThread: vi.fn(async () => "branch") }));
vi.mock("../contexts/LanguageContext", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { useChatWindow } from "./useChatWindow";
import { onSnapshot } from "firebase/firestore";
function renderHook() {
  mocks.effects = [];
  mocks.stateIndex = 0;
  mocks.refIndex = 0;
  return useChatWindow("thread", "key", "user");
}

describe("hook execution paths", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    mocks.states = [];
    mocks.refs = [];
    mocks.create.mockResolvedValue("new-assistant");
    mocks.update.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    let round = 0;
    mocks.stream.mockImplementation(async () => {
      const tool = round++ < 2;
      return { abort: vi.fn(), async *[Symbol.asyncIterator]() {
        yield { choices: [] }; // Usage-only chunks must not crash the hook.
        yield { choices: [{ delta: { reasoning_content: "reason", ...(tool ? { tool_calls: [{ index: 0, ...call }] } : { content: "done" }) }, finish_reason: tool ? "tool_calls" : "stop" }] };
        yield { choices: [], provider_data: { format: "messages", content: [{ type: "thinking", signature: "signed" }] } };
      } };
    });
  });

  it("exposes settingsLoaded only after the current thread snapshot is applied", () => {
    expect(renderHook().settingsLoaded).toBe(false);
    mocks.effects.find((effect) => effect.toString().includes("settingsThreadRef.current = null"))!();
    const callback = vi.mocked(onSnapshot).mock.calls.at(-1)![1] as unknown as (snapshot: unknown) => void;
    callback({ exists: () => true, data: () => ({ apiFormat: "messages", streamEnabled: false, requestOptionsJson: '{"logprobs":true}' }) });
    const hook = renderHook();
    expect(hook.settingsLoaded).toBe(true);
    expect(hook.apiFormat).toBe("messages");
    expect(hook.streamEnabled).toBe(false);
    expect(hook.requestOptionsJson).toBe('{"logprobs":true}');
  });

  it("hydrates attachment drafts without erasing them and removes the draft after save", async () => {
    const attachments = [{ id: "image", kind: "file", value: "file-api-123", name: "image.png" }];
    const localStorage = { getItem: vi.fn(() => JSON.stringify(attachments)), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("window", { localStorage });
    renderHook();
    mocks.effects.find((effect) => effect.toString().includes('JSON.parse(raw)'))!();
    mocks.effects.find((effect) => effect.toString().includes("attachmentDraftThreadRef.current !=="))!();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    const hook = renderHook();
    expect(hook.attachments).toEqual(attachments);
    mocks.effects.find((effect) => effect.toString().includes("attachmentDraftThreadRef.current !=="))!();
    expect(localStorage.setItem).toHaveBeenCalledWith("thread-thread-draft-attachments", JSON.stringify(attachments));
    await hook.handleSend();
    expect(localStorage.removeItem).toHaveBeenCalledWith("thread-thread-draft-attachments");
    expect(renderHook().attachments).toEqual([]);
  });

  it("retains draft attachments and text when saving the user message fails", async () => {
    let hook = renderHook();
    const attachments = [{ id: "image", kind: "file" as const, value: "file-api-123", name: "image.png" }];
    hook.setInput("question");
    hook.setAttachments(attachments);
    mocks.create.mockRejectedValueOnce(new Error("save failed"));
    await renderHook().handleSend();
    hook = renderHook();
    expect(hook.attachments).toEqual(attachments);
    expect(hook.input).toBe("question");
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it.each((["chat", "responses", "messages"] as const).flatMap((format) => ["send", "edit", "regenerate"].map((path) => ({ format, path }))))("passes $format API settings and replays image attachments through $path", async ({ format, path }) => {
    let hook = renderHook();
    const attachments = [{ id: "image", kind: "file" as const, value: "file-api-123", name: "image.png" }];
    mocks.states[0] = [{ id: "user-message", role: "user", content: "question", attachments }, { id: "assistant-message", role: "assistant", content: "base" }];
    hook.setApiFormat(format);
    hook.setStreamEnabled(false);
    hook.setRequestOptionsJson('{"logprobs":true}');
    hook.setInput("next");
    hook = renderHook();
    if (path === "send") await hook.handleSend();
    if (path === "edit") await hook.handleEditMessage("user-message", "edited");
    if (path === "regenerate") await hook.handleRegenerateMessage("assistant-message");
    expect(mocks.stream).toHaveBeenCalled();
    for (const args of mocks.stream.mock.calls) {
      expect(args[3]).toMatchObject({ apiFormat: format, stream: false, extraBody: { logprobs: true } });
      expect(args[1][1]).toEqual(replayMessage({ id: "user-message", threadId: "thread", role: "user", content: path === "edit" ? "edited" : "question", attachments })[0]);
    }
  });

  it("continues in nonstream mode with request options and replayed images", async () => {
    let hook = renderHook();
    const attachments = [{ id: "image", kind: "file" as const, value: "file-api-123", name: "image.png" }];
    mocks.states[0] = [{ id: "u", role: "user", content: "question", attachments }, { id: "a", role: "assistant", content: "answer" }];
    hook.setPrefixCompletionEnabled(true);
    hook.setStreamEnabled(false);
    hook.setRequestOptionsJson('{"search":{"enabled":true}}');
    await renderHook().handleCompleteMessage("a");
    expect(mocks.stream).toHaveBeenCalledTimes(3);
    for (const args of mocks.stream.mock.calls) {
      expect(args[3]).toMatchObject({ apiFormat: "chat", stream: false, extraBody: { search: { enabled: true } } });
      expect(args[1][1]).toEqual(replayMessage({ id: "u", threadId: "thread", role: "user", content: "question", attachments })[0]);
    }
  });

  it("preserves attachments when editing an image-only user message", async () => {
    renderHook();
    const attachments = [{ id: "image", kind: "file" as const, value: "file-api-123", name: "image.png" }];
    mocks.states[0] = [{ id: "u", role: "user", content: "old caption", attachments }];
    await renderHook().handleEditMessage("u", "");
    expect(mocks.update).toHaveBeenCalledWith("thread", "u", "");
    expect(mocks.stream.mock.calls[0][1][1]).toEqual(replayMessage({ id: "u", threadId: "thread", role: "user", content: "", attachments })[0]);
  });

  it.each(["send", "edit", "regenerate"])("rejects non-chat FIM through %s before mutations", async (path) => {
    let hook = renderHook();
    mocks.states[0] = [{ id: "u", role: "user", content: "question" }, { id: "a", role: "assistant", content: "answer" }];
    hook.setInput("question");
    hook.setApiFormat("responses");
    hook.setFimPrefix("prefix");
    hook = renderHook();
    if (path === "send") await hook.handleSend();
    if (path === "edit") await hook.handleEditMessage("u", "edited");
    if (path === "regenerate") await hook.handleRegenerateMessage("a");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(renderHook().errorMessage).toContain("require the chat API");
  });

  it("saves image-only messages, clears saved attachments, and copies images into branches", async () => {
    let hook = renderHook();
    const attachments = [{ id: "image", kind: "url" as const, value: "https://example.com/image.png", name: "image.png" }];
    hook.setAttachments(attachments);
    hook = renderHook();
    await hook.handleSend();
    expect(mocks.create).toHaveBeenCalledWith("thread", "user", "", undefined, undefined, { attachments });
    expect(renderHook().attachments).toEqual([]);
    expect(mocks.stream.mock.calls[0][1][1]).toEqual(replayMessage({ id: "u", threadId: "thread", role: "user", content: "", attachments })[0]);
    mocks.states[0] = [{ id: "u", threadId: "thread", role: "user", content: "", attachments }, { id: "a", role: "assistant", content: "answer" }];
    await renderHook().handleBranchMessage("a");
    expect(mocks.create.mock.calls.find((args) => args[0] === "branch" && args[1] === "user")![5]).toEqual({ attachments });
  });

  it.each(["invalid", '{"messages":[]}', "[]"])("rejects invalid options before saving and retains attachments: %s", async (raw) => {
    let hook = renderHook();
    const attachments = [{ id: "image", kind: "file" as const, value: "file-api-123", name: "image.png" }];
    hook.setAttachments(attachments);
    hook.setRequestOptionsJson(raw);
    hook = renderHook();
    await hook.handleSend();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(renderHook().attachments).toEqual(attachments);
    expect(renderHook().errorMessage).toBeTruthy();
  });

  it.each(["send", "edit", "regenerate", "continue"])("rejects incompatible prefix settings before mutations through %s", async (path) => {
    let hook = renderHook();
    mocks.states[0] = [{ id: "u", role: "user", content: "question" }, { id: "a", role: "assistant", content: "answer" }];
    hook.setInput("question");
    hook.setApiFormat("messages");
    hook.setPrefixCompletionEnabled(true);
    hook = renderHook();
    if (path === "send") await hook.handleSend();
    if (path === "edit") await hook.handleEditMessage("u", "edited");
    if (path === "regenerate") await hook.handleRegenerateMessage("a");
    if (path === "continue") await hook.handleCompleteMessage("a");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(renderHook().errorMessage).toContain("require the chat API");
  });

  it.each(["send", "edit", "regenerate", "continue"])("persists tool history and reasoning through %s", async (path) => {
    let hook = renderHook();
    mocks.states[0] = [{ id: "user-message", role: "user", content: "question" }, { id: "assistant-message", role: "assistant", content: "base" }];
    hook.setInput("question");
    hook.setToolsJson(JSON.stringify([{ type: "function", function: { name: "lookup", parameters: {} } }]));
    hook.setToolHandlersJson(JSON.stringify({ lookup: "42" }));
    hook.setPrefixCompletionEnabled(true);
    hook = renderHook();
    if (path === "send") await hook.handleSend();
    if (path === "edit") await hook.handleEditMessage("user-message", "edited");
    if (path === "regenerate") await hook.handleRegenerateMessage("assistant-message");
    if (path === "continue") await hook.handleCompleteMessage("assistant-message");
    expect(mocks.stream).toHaveBeenCalledTimes(3);
    const history = mocks.update.mock.calls.at(-1)![7];
    expect(history).toHaveLength(5);
    expect(history[0]).toMatchObject({ reasoning_content: "reason", tool_calls: [call] });
    expect(history[0].provider_data).toEqual({ format: "messages", content: [{ type: "thinking", signature: "signed" }] });
    expect(history[1]).toMatchObject({ role: "tool", content: "42" });
    expect(mocks.stream.mock.calls[2][1]).toEqual(expect.arrayContaining([expect.objectContaining({ reasoning_content: "reason", tool_calls: [call] })]));
  });

  it("replays reloaded history in a new request and preserves it in branches", async () => {
    let hook = renderHook();
    const history = [{ role: "assistant", content: "", reasoning_content: "saved reason", tool_calls: [call] }, result, { role: "assistant", content: "saved answer" }];
    mocks.states[0] = [{ id: "assistant-message", role: "assistant", content: "saved answer", api_messages: JSON.parse(JSON.stringify(history)) }];
    hook.setInput("next question");
    hook = renderHook();
    await hook.handleSend();
    expect(mocks.stream.mock.calls[0][1].slice(1, 4)).toEqual(history);
    await hook.handleBranchMessage("assistant-message");
    expect(mocks.create.mock.calls.find((args) => args[0] === "branch" && args[1] === "assistant")![7]).toEqual(history);
  });

  it("aborts a stream that arrives after Stop was pressed", async () => {
    let release!: (stream: unknown) => void;
    mocks.stream.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    let hook = renderHook();
    hook.setInput("question");
    hook = renderHook();
    const sending = hook.handleSend();
    await vi.waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1));
    await renderHook().handleSend();
    const abort = vi.fn();
    release({ abort, async *[Symbol.asyncIterator]() { yield { choices: [] }; } });
    await sending;
    expect(abort).toHaveBeenCalledOnce();
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith("thread", ["new-assistant"]);
  });
});
