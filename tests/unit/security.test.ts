import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  HttpError,
  assertSameOrigin,
  detectImageType,
  errorResponse,
  readJsonObject,
  safeId,
  sanitizeDisplayFilename,
  secureJson,
  validateImageBytes,
} from "../../app/lib/security";
import {
  getRequestUser,
  normalizeTrustedEmail,
} from "../../app/lib/request-user";

const APP_URL = "https://app.example.test/api/state";

function mutationRequest(
  origin: string | null = "https://app.example.test",
  marker: string | null = "1",
  fetchSite: string | null = "same-origin",
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin !== null) headers.set("origin", origin);
  if (marker !== null) headers.set("x-summit-request", marker);
  if (fetchSite !== null) headers.set("sec-fetch-site", fetchSite);
  return new Request(APP_URL, {
    method: "POST",
    headers,
    body: "{}",
  });
}

function jsonRequest(body: BodyInit, contentType = "application/json") {
  return new Request(APP_URL, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

describe("same-origin mutation guard", () => {
  it("accepts the exact application origin with the request marker", () => {
    expect(() => assertSameOrigin(mutationRequest())).not.toThrow();
  });

  const rejectedOrigins = [
    null,
    "",
    "null",
    "http://app.example.test",
    "https://app.example.test:444",
    "https://app.example.test.attacker.invalid",
    "https://attacker.invalid@app.example.test",
    "https://attacker.invalid",
    "https://app.example.test/",
    "https://app.example.test/path",
    "https://app.example.test?query=1",
    "https://app.example.test#fragment",
    "https://APP.example.test",
    "https://app.example.test.",
    "https://%61pp.example.test",
    "ftp://app.example.test",
    "javascript:alert(1)",
    "data:text/plain,hello",
    "://broken",
    "https://",
    "app.example.test",
    "https://app.example.test, https://attacker.invalid",
  ];

  it.each(rejectedOrigins.map((origin, index) => [index, origin] as const))(
    "rejects hostile or non-canonical origin case %i",
    (_index, origin) => {
      expect(() => assertSameOrigin(mutationRequest(origin))).toThrow(HttpError);
    },
  );

  it.each([null, "", "0", "true", "2"])(
    "rejects missing or invalid request marker %j",
    (marker) => {
      expect(() => assertSameOrigin(mutationRequest("https://app.example.test", marker))).toThrowError(
        expect.objectContaining({ code: "REQUEST_MARKER_REQUIRED" }),
      );
    },
  );

  it.each(["cross-site", "same-site", "unknown", "SAME-SITE"])(
    "rejects Sec-Fetch-Site=%s",
    (fetchSite) => {
      expect(() => assertSameOrigin(mutationRequest("https://app.example.test", "1", fetchSite))).toThrowError(
        expect.objectContaining({ code: "CROSS_ORIGIN_REJECTED" }),
      );
    },
  );

  it.each(["same-origin", "none", null])("accepts safe Sec-Fetch-Site=%j", (fetchSite) => {
    expect(() => assertSameOrigin(mutationRequest("https://app.example.test", "1", fetchSite))).not.toThrow();
  });
});

describe("bounded JSON reader", () => {
  it("returns a plain JSON object", async () => {
    await expect(readJsonObject(jsonRequest('{"route":"示例山脊 B"}'))).resolves.toEqual({ route: "示例山脊 B" });
  });

  it.each([
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "text/json",
    "application/xml",
    "",
  ])("rejects content type %j", async (contentType) => {
    await expect(readJsonObject(jsonRequest("{}", contentType))).rejects.toMatchObject({
      code: "CONTENT_TYPE_INVALID",
      status: 415,
    });
  });

  it.each(["", "{", "null", "[]", "1", "true", "\"text\"", '{"a":NaN}', '{"a":}'])(
    "rejects malformed or non-object JSON %j",
    async (body) => {
      await expect(readJsonObject(jsonRequest(body))).rejects.toBeInstanceOf(HttpError);
    },
  );

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects prototype-pollution property %s",
    async (key) => {
      await expect(
        readJsonObject(jsonRequest(`{"safe":{"${key}":{"polluted":true}}}`)),
      ).rejects.toMatchObject({ code: "UNSAFE_PROPERTY" });
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    },
  );

  it("rejects a body larger than its byte limit before parsing", async () => {
    await expect(readJsonObject(jsonRequest('{"value":"12345"}'), 8)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects excessive nesting", async () => {
    const body = `${'{"a":'.repeat(14)}0${"}".repeat(14)}`;
    await expect(readJsonObject(jsonRequest(body))).rejects.toMatchObject({
      code: "JSON_TOO_COMPLEX",
    });
  });
});

describe("safe identifiers", () => {
  const validIds = [
    "a",
    "A",
    "0",
    "m-one",
    "photo_123",
    "ABC-xyz_009",
    "a".repeat(64),
    ...Array.from({ length: 40 }, (_, index) => `id-${index}`),
  ];
  it.each(validIds)("accepts stable ID %s", (value) => {
    expect(safeId(value)).toBe(value);
  });

  const invalidFragments = [
    "/",
    "\\",
    "..",
    ".",
    " ",
    "\t",
    "\n",
    "\r",
    "\0",
    ":",
    "?",
    "#",
    "%",
    "@",
    "+",
    "=",
    "<",
    ">",
    "'",
    "\"",
    "中",
    "😀",
  ];
  const invalidIds = [
    "",
    "-leading",
    "_leading",
    "a".repeat(65),
    null,
    undefined,
    1,
    {},
    [],
    ...invalidFragments.flatMap((fragment) => [
      fragment,
      `a${fragment}`,
      `${fragment}a`,
      `a${fragment}b`,
    ]),
  ];
  it.each(invalidIds.map((value, index) => [index, value] as const))(
    "rejects malformed ID case %i",
    (_index, value) => {
      expect(() => safeId(value)).toThrowError(expect.objectContaining({ code: "ID_INVALID" }));
    },
  );
});

describe("display filename sanitizer", () => {
  const attacks = [
    "../secret.jpg",
    "..\\secret.jpg",
    "/etc/passwd",
    "C:\\Windows\\win.ini",
    "\\server\\share\\x.jpg",
    ".hidden",
    ".../x.png",
    "a/b/c.jpg",
    "a\\b\\c.jpg",
    "x\0.jpg",
    "x\r\nInjected: yes.jpg",
    "\u0001\u0002.jpg",
    ". !",
    " ",
    "",
    ".".repeat(200),
    "a".repeat(300) + ".jpg",
    ...Array.from({ length: 80 }, (_, index) => `../folder-${index}/photo-${index}.jpg`),
  ];
  it.each(attacks.map((value, index) => [index, value] as const))(
    "normalizes hostile filename case %i",
    (_index, value) => {
      const result = sanitizeDisplayFilename(value);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(120);
      expect(result).not.toMatch(/[\\/\u0000-\u001f\u007f]/);
      expect(result).not.toMatch(/^\./);
      expect(sanitizeDisplayFilename(result)).toBe(result);
    },
  );
});

describe("image content detection", () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]);
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    0x00, 0x01, 0x00, 0x01, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
    0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const webpLossless = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
    0x0a, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const webpLossy = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x9d,
    0x01, 0x2a, 0x01, 0x00, 0x01, 0x00,
  ]);
  const cases = [
    ["jpeg", jpeg, "image/jpeg"],
    ["png", png, "image/png"],
    ["webp extended", webp, "image/webp"],
    ["webp lossless", webpLossless, "image/webp"],
    ["webp lossy", webpLossy, "image/webp"],
  ] as const;

  it.each(cases)("detects %s from magic bytes", (_label, bytes, contentType) => {
    expect(detectImageType(bytes)?.contentType).toBe(contentType);
    expect(validateImageBytes(bytes, contentType).contentType).toBe(contentType);
  });

  const hostileBytes = [
    new Uint8Array(),
    new TextEncoder().encode("<svg onload=alert(1)>"),
    new TextEncoder().encode("<html><script>alert(1)</script>"),
    new TextEncoder().encode("PK\x03\x04"),
    new Uint8Array([0x47, 0x49, 0x46, 0x38]),
    new Uint8Array([0xff, 0xd8]),
    new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    new Uint8Array([0, 0, 0, 0, 102, 116, 121, 112, 97, 118, 105, 102]),
    new Uint8Array([0, 0, 0, 0, 102, 116, 121, 112, 104, 101, 105, 99]),
    ...Array.from({ length: 30 }, (_, index) => new Uint8Array([index, index + 1, index + 2, index + 3])),
  ];
  it.each(hostileBytes.map((bytes, index) => [index, bytes] as const))(
    "rejects non-image signature case %i",
    (_index, bytes) => {
      expect(detectImageType(bytes)).toBeNull();
      expect(() => validateImageBytes(bytes, "image/png")).toThrowError(
        expect.objectContaining({ code: "IMAGE_SIGNATURE_INVALID" }),
      );
    },
  );

  it.each([
    ["image/png", "image/jpeg"],
    ["image/jpeg", "image/png"],
    ["image/png", "image/webp"],
  ])("rejects declared %s for actual %s", (declared, actual) => {
    const bytes = actual === "image/png"
      ? cases[1][1]
      : actual === "image/webp"
        ? cases[2][1]
        : cases[0][1];
    expect(() => validateImageBytes(bytes, declared)).toThrowError(
      expect.objectContaining({ code: "IMAGE_TYPE_MISMATCH" }),
    );
  });

  it.each(["image/svg+xml", "text/html", "application/zip", "image/gif", "image/avif", "image/heic", "image/heif"])(
    "rejects dangerous declared type %s",
    (declared) => {
      expect(() => validateImageBytes(cases[1][1], declared)).toThrowError(
        expect.objectContaining({ code: "IMAGE_TYPE_REJECTED" }),
      );
    },
  );

  it.each([
    ["truncated PNG", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"],
    ["PNG without IHDR", new Uint8Array([...png.slice(0, 12), 1, 2, 3, 4, ...png.slice(16)]), "image/png"],
    ["zero-width PNG", new Uint8Array([...png.slice(0, 16), 0, 0, 0, 0, ...png.slice(20)]), "image/png"],
    ["oversized PNG", new Uint8Array([...png.slice(0, 16), 0, 0, 0x4e, 0x21, 0, 0, 0x4e, 0x21]), "image/png"],
    ["truncated JPEG", new Uint8Array([0xff, 0xd8, 0xff, 0xc0]), "image/jpeg"],
    ["JPEG without SOF", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9, 0, 0, 0, 0]), "image/jpeg"],
    ["WebP length mismatch", new Uint8Array([...webp.slice(0, 4), 0, 0, 0, 0, ...webp.slice(8)]), "image/webp"],
    ["WebP unknown chunk", new Uint8Array([...webp.slice(0, 12), 1, 2, 3, 4, ...webp.slice(16)]), "image/webp"],
    ["WebP lossless bad signature", new Uint8Array([...webpLossless.slice(0, 20), 0x00, ...webpLossless.slice(21)]), "image/webp"],
    ["WebP lossy bad signature", new Uint8Array([...webpLossy.slice(0, 23), 0x00, ...webpLossy.slice(24)]), "image/webp"],
    ["JPEG early EOI", new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]), "image/jpeg"],
    ["JPEG invalid segment", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 0, 0, 0, 0, 0xff, 0xd9]), "image/jpeg"],
  ])("rejects structurally invalid image: %s", (_label, bytes, declared) => {
    expect(() => validateImageBytes(bytes, declared)).toThrow(HttpError);
  });

  it.each([
    ["non-marker padding", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0x00, ...jpeg.slice(2)])],
    ["restart marker", new Uint8Array([0xff, 0xd8, 0xff, 0xd0, ...jpeg.slice(2)])],
    ["temporary marker", new Uint8Array([0xff, 0xd8, 0xff, 0x01, ...jpeg.slice(2)])],
    ["metadata segment", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, ...jpeg.slice(2)])],
    ["fill marker", new Uint8Array([0xff, 0xd8, 0xff, 0xff, ...jpeg.slice(3)])],
  ])("accepts bounded JPEG scanner path: %s", (_label, bytes) => {
    expect(validateImageBytes(bytes, "image/jpeg").contentType).toBe("image/jpeg");
  });

  function pngWithDimensions(width: number, height: number) {
    const result = Uint8Array.from(png);
    const view = new DataView(result.buffer);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return result;
  }

  it.each([
    ["zero height", 1, 0],
    ["width over edge", 20_001, 1],
    ["height over edge", 1, 20_001],
    ["too many pixels", 10_000, 5_000],
  ])("rejects PNG dimension limit: %s", (_label, width, height) => {
    expect(() => validateImageBytes(pngWithDimensions(width, height), "image/png")).toThrowError(
      expect.objectContaining({ code: "IMAGE_DIMENSIONS_INVALID" }),
    );
  });
});

describe("secure API responses", () => {
  it("supports the default response initializer", async () => {
    const response = secureJson({ ok: true });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
  it.each([200, 201, 400, 401, 403, 404, 409, 413, 415, 500])(
    "adds private security headers to status %i",
    async (status) => {
      const response = secureJson({ ok: status < 400 }, { status });
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
      expect(response.headers.get("content-type")).toContain("application/json");
      await expect(response.json()).resolves.toEqual({ ok: status < 400 });
    },
  );

  it("does not expose an unexpected exception message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(new Error("SECRET_SQL_COOKIE_R2_KEY"), "保存失败");
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("保存失败");
    expect(body).not.toContain("SECRET_SQL_COOKIE_R2_KEY");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRET_SQL_COOKIE_R2_KEY");
    spy.mockRestore();
  });

  it("returns stable public details for an expected HttpError", async () => {
    const response = errorResponse(new HttpError(409, "CONFLICT", "数据冲突"));
    await expect(response.json()).resolves.toEqual({ error: "数据冲突", code: "CONFLICT" });
  });

  it("sanitizes non-Error failures in both logs and responses", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse("SECRET_FAILURE", "处理失败");
    expect(await response.text()).not.toContain("SECRET_FAILURE");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRET_FAILURE");
    spy.mockRestore();
  });
});

describe("trusted identity header parsing", () => {
  const validEmails = [
    "user@example.com",
    "USER@EXAMPLE.COM",
    "first.last+tag@example.co.uk",
    "a@b.co",
    ...Array.from({ length: 40 }, (_, index) => `user${index}@example.com`),
  ];
  it.each(validEmails)("normalizes valid principal %s", (email) => {
    expect(normalizeTrustedEmail(email)).toBe(email.toLowerCase());
  });

  const invalidEmails = [
    null,
    "",
    " ",
    "missing-at.example.com",
    "@example.com",
    "user@",
    "user@localhost",
    "user@example",
    "user@example.com,attacker@example.com",
    "user@example.com\r\nX: y",
    "user example@example.com",
    "a".repeat(250) + "@example.com",
    ...Array.from({ length: 40 }, (_, index) => `bad,${index}@example.com`),
  ];
  it.each(invalidEmails.map((email, index) => [index, email] as const))(
    "rejects ambiguous principal case %i",
    (_index, email) => {
      expect(normalizeTrustedEmail(email)).toBeNull();
    },
  );

  it("decodes a bounded percent-encoded display name", () => {
    const request = new Request(APP_URL, {
      headers: {
        "oai-authenticated-user-email": "USER@EXAMPLE.COM",
        "oai-authenticated-user-full-name": encodeURIComponent("示例用户"),
        "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
      },
    });
    expect(getRequestUser(request)).toEqual({
      email: "user@example.com",
      displayName: "示例用户",
    });
  });

  it.each([
    "%",
    encodeURIComponent("x\nInjected"),
    encodeURIComponent("x".repeat(121)),
  ])("falls back safely for invalid display name %j", (encoded) => {
    const request = new Request(APP_URL, {
      headers: {
        "oai-authenticated-user-email": "user@example.com",
        "oai-authenticated-user-full-name": encoded,
        "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
      },
    });
    expect(getRequestUser(request)?.displayName).toBe("user");
  });

  it("does not enable the demo identity on a production hostname", () => {
    expect(getRequestUser(new Request(APP_URL))).toBeNull();
  });
});

describe("security properties", () => {
  it("sanitizing arbitrary filenames is bounded, idempotent and path-free", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (value) => {
        const result = sanitizeDisplayFilename(value);
        expect(result.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThanOrEqual(120);
        expect(result).not.toMatch(/[\\/\u0000-\u001f\u007f]/);
        expect(sanitizeDisplayFilename(result)).toBe(result);
      }),
      { numRuns: 2_000 },
    );
  });

  it("arbitrary invalid-looking identifiers never escape the allowlist", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        try {
          const result = safeId(value);
          expect(result).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
        } catch (error) {
          expect(error).toBeInstanceOf(HttpError);
        }
      }),
      { numRuns: 2_000 },
    );
  });
});
