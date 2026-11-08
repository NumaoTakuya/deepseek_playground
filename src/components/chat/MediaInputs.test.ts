import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import MediaInputs, { FilesManager } from "./MediaInputs";

afterEach(() => vi.unstubAllGlobals());
it("renders hosted references, URL and inline previews without fetching account files", () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn());
  const html = renderToStaticMarkup(React.createElement(MediaInputs, {
    apiKey: "", onChange: vi.fn(), disabled: true,
    attachments: [
      { id: "file", kind: "file", value: "file-api-abc", name: "photo.png" },
      { id: "url", kind: "url", value: "https://example.com/image.png", name: "Remote" },
      { id: "inline", kind: "url", value: "data:image/png;base64,YWJj", name: "Existing inline" },
    ],
  }));
  expect(html).toContain("photo.png");
  expect(html).toContain("file-api-abc");
  expect(html).toContain('src="https://example.com/image.png"');
  expect(html).toContain('src="data:image/png;base64,YWJj"');
  expect(html).toContain("Files not loaded.");
  expect(html).not.toContain("Local inline image");
  expect(fetch).not.toHaveBeenCalled();
});

it("retains Lab expiry defaults and Files raw-response surface without exposing the key", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(FilesManager, { apiKey: "test-secret", defaultExpiry: "86400", onSelect: vi.fn() }));
  expect(html).toContain('value="86400"');
  expect(html).toContain("blank = permanent");
  expect(html).not.toContain("test-secret");
});
