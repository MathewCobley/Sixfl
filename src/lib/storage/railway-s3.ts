import { createHash, createHmac } from "node:crypto";

type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | null;
};

type SignedRequestInput = {
  method: "GET" | "PUT" | "DELETE";
  key: string;
  payloadHash: string;
  extraHeaders?: Record<string, string>;
};

const EMPTY_PAYLOAD_HASH = createHash("sha256").update("").digest("hex");

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function getStorageConfig(): StorageConfig {
  return {
    endpoint: requiredEnv("AWS_ENDPOINT_URL").replace(/\/+$/, ""),
    region: process.env.AWS_DEFAULT_REGION?.trim() || "auto",
    bucket: requiredEnv("AWS_S3_BUCKET_NAME"),
    accessKeyId: requiredEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("AWS_SECRET_ACCESS_KEY"),
    sessionToken: process.env.AWS_SESSION_TOKEN?.trim() || null,
  };
}

function sha256Hex(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildObjectPath(bucket: string, key: string) {
  const encodedKey = key
    .split("/")
    .filter(Boolean)
    .map(encodePathSegment)
    .join("/");

  return `/${encodePathSegment(bucket)}/${encodedKey}`;
}

function getAmzDates(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function createSignedRequest(input: SignedRequestInput) {
  const config = getStorageConfig();
  const objectPath = buildObjectPath(config.bucket, input.key);
  const url = new URL(`${config.endpoint}${objectPath}`);
  const { amzDate, dateStamp } = getAmzDates();

  const signingHeaders: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": amzDate,
    ...(config.sessionToken
      ? { "x-amz-security-token": config.sessionToken }
      : {}),
  };

  const sortedHeaderNames = Object.keys(signingHeaders).sort();
  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${signingHeaders[name].trim()}\n`)
    .join("");
  const signedHeaders = sortedHeaderNames.join(";");

  const canonicalRequest = [
    input.method,
    objectPath,
    "",
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = new Headers(input.extraHeaders);
  headers.set("Authorization", authorization);
  headers.set("x-amz-content-sha256", input.payloadHash);
  headers.set("x-amz-date", amzDate);
  if (config.sessionToken) {
    headers.set("x-amz-security-token", config.sessionToken);
  }

  return { url, headers };
}

async function assertStorageResponse(response: Response, action: string) {
  if (response.ok) return;

  const detail = (await response.text().catch(() => "")).slice(0, 500);
  throw new Error(
    `${action} failed with ${response.status}${detail ? `: ${detail}` : ""}`,
  );
}

export async function uploadRailwayObject(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}) {
  const payloadHash = sha256Hex(input.body);
  const request = createSignedRequest({
    method: "PUT",
    key: input.key,
    payloadHash,
    extraHeaders: {
      "content-type": input.contentType,
    },
  });

  const response = await fetch(request.url, {
    method: "PUT",
    headers: request.headers,
    body: input.body as unknown as BodyInit,
  });

  await assertStorageResponse(response, "Video upload");
}

export async function deleteRailwayObject(key: string) {
  const request = createSignedRequest({
    method: "DELETE",
    key,
    payloadHash: EMPTY_PAYLOAD_HASH,
  });

  const response = await fetch(request.url, {
    method: "DELETE",
    headers: request.headers,
  });

  if (response.status === 404) return;
  await assertStorageResponse(response, "Video deletion");
}

export async function fetchRailwayObject(input: {
  key: string;
  range?: string | null;
}) {
  const request = createSignedRequest({
    method: "GET",
    key: input.key,
    payloadHash: EMPTY_PAYLOAD_HASH,
    extraHeaders: input.range ? { range: input.range } : undefined,
  });

  return fetch(request.url, {
    method: "GET",
    headers: request.headers,
    cache: "no-store",
  });
}
