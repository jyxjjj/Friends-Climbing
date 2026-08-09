import type { CurrentUser } from "./models";

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const UNSAFE_HEADER_VALUE = /[,\r\n\u0000-\u001f\u007f]/;

export function normalizeTrustedEmail(value: string | null): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (
    !email ||
    email.length > 254 ||
    UNSAFE_HEADER_VALUE.test(email) ||
    !EMAIL_PATTERN.test(email)
  ) {
    return null;
  }
  return email;
}

function decodeDisplayName(
  encodedName: string | null,
  encoding: string | null,
): string | null {
  if (!encodedName || encoding !== "percent-encoded-utf-8") return null;
  try {
    const value = decodeURIComponent(encodedName).trim();
    if (!value || value.length > 120 || UNSAFE_HEADER_VALUE.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function getRequestUser(request: Request): CurrentUser | null {
  // Sites removes client-supplied identity headers and injects these values at
  // its authenticated edge. This parser deliberately rejects merged/ambiguous
  // header values so a malformed identity always fails closed.
  const email = normalizeTrustedEmail(
    request.headers.get("oai-authenticated-user-email"),
  );
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get(
    "oai-authenticated-user-full-name-encoding",
  );

  if (email) {
    const fullName = decodeDisplayName(encodedName, encoding);
    return { email, displayName: fullName ?? email.split("@")[0] };
  }

  return null;
}
