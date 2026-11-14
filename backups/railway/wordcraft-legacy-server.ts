import { mkdir, readdir, stat, access } from "node:fs/promises";
import { join, resolve, relative, basename } from "node:path";

const PORT = Number(Bun.env.PORT || 3000);
const TOKEN = Bun.env.MCP_TOKEN || "";
const RELEASE = "v0.5.0";
const ASSET = "wordcraft-0.5.0-linux-x86_64.tar.gz";
const DOWNLOAD_URL = `https://github.com/storytold/wordcraft/releases/download/${RELEASE}/${ASSET}`;
const INSTALL_DIR = "/tmp/wordcraft-install";
const ARCHIVE = "/tmp/wordcraft.tar.gz";
const SESSION_ROOT = "/tmp/wordcraft-sessions";

type Pending = {
  resolve: (value: any) => void;
  reject: (err: any) => void;
  originalId: any;
  timer: ReturnType<typeof setTimeout>;
};

type McpSession = {
  id: string;
  dir: string;
  proc: any;
  pending: Map<string, Pending>;
  nextId: number;
  buffer: string;
  lastSeen: number;
};

const sessions = new Map<string, McpSession>();
let sharedSession: McpSession | null = null;
let installPromise: Promise<string> | null = null;

function json(data: any, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, accept, mcp-session-id, mcp-protocol-version",
      "access-control-expose-headers": "mcp-session-id",
      ...extra,
    },
  });
}

function rpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function exists(p: string) {
  try { await access(p); return true; } catch { return false; }
}

async function findBinary(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isFile() && e.name === "wordcraft-cli") return p;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = join(dir, e.name);
    const found = await findBinary(p);
    if (found) return found;
  }
  return null;
}

async function ensureCli(): Promise<string> {
  if (installPromise) return installPromise;
  installPromise = (async () => {
    await mkdir(INSTALL_DIR, { recursive: true });
    await mkdir(SESSION_ROOT, { recursive: true });

    const existing = await findBinary(INSTALL_DIR);
    if (existing) return existing;

    console.log("Downloading WordCraft", DOWNLOAD_URL);
    const res = await fetch(DOWNLOAD_URL, { redirect: "follow" });
    if (!res.ok) throw new Error(`WordCraft download failed: ${res.status} ${res.statusText}`);
    const payload = await res.arrayBuffer();
    console.log("Downloaded bytes:", payload.byteLength);
    await Bun.write(ARCHIVE, payload);
    console.log("Archive written; extracting");

    const tar = Bun.spawn(["tar", "-xzf", ARCHIVE, "-C", INSTALL_DIR], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exit = await tar.exited;
    console.log("tar exit:", exit);
    if (exit !== 0) {
      const err = await new Response(tar.stderr).text();
      throw new Error(`tar failed (${exit}): ${err}`);
    }

    const bin = await findBinary(INSTALL_DIR);
    if (!bin) throw new Error("wordcraft-cli not found in release tarball");
    await Bun.spawn(["chmod", "+x", bin]).exited;
    console.log("WordCraft CLI ready:", bin);
    return bin;
  })().catch((e) => {
    installPromise = null;
    throw e;
  });
  return installPromise;
}

async function pumpStdout(session: McpSession) {
  const reader = session.proc.stdout.getReader();
  const dec = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      session.buffer += dec.decode(value, { stream: true });
      while (true) {
        const nl = session.buffer.indexOf("\n");
        if (nl < 0) break;
        const line = session.buffer.slice(0, nl).trim();
        session.buffer = session.buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg && msg.id !== undefined && msg.id !== null) {
            const key = String(msg.id);
            const p = session.pending.get(key);
            if (p) {
              session.pending.delete(key);
              clearTimeout(p.timer);
              msg.id = p.originalId;
              p.resolve(msg);
            }
          }
        } catch (e) {
          console.error("Invalid MCP stdout line", String(e));
        }
      }
    }
  } catch (e) {
    console.error("MCP stdout pump ended", String(e));
  } finally {
    for (const [, p] of session.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("WordCraft MCP process ended"));
    }
    session.pending.clear();
  }
}

async function pumpStderr(session: McpSession) {
  try {
    const text = await new Response(session.proc.stderr).text();
    if (text.trim()) console.error(`wordcraft-cli[${session.id}]:`, text.slice(-12000));
  } catch {}
}

async function createSession(): Promise<McpSession> {
  // This endpoint is private to one user. Keep one WordCraft backend alive so
  // hosts that reconnect/re-initialize for every tool call still see the same
  // open document and undo/selection state.
  if (sharedSession) {
    sharedSession.lastSeen = Date.now();
    sessions.set(sharedSession.id, sharedSession);
    return sharedSession;
  }
  const bin = await ensureCli();
  const id = crypto.randomUUID();
  const dir = join(SESSION_ROOT, id);
  await mkdir(dir, { recursive: true });

  const proc = Bun.spawn([
    bin, "mcp",
    "--author", "Remote MCP"
  ], {
    cwd: dir,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PATH: Bun.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      HOME: dir,
      TMPDIR: dir,
      XDG_CONFIG_HOME: join(dir, ".config"),
      LANG: "C.UTF-8",
      WORDCRAFT_NO_PREFS: "1"
    },
  });

  const session: McpSession = {
    id, dir, proc,
    pending: new Map(),
    nextId: 1,
    buffer: "",
    lastSeen: Date.now(),
  };
  sessions.set(id, session);
  sharedSession = session;
  pumpStdout(session);
  pumpStderr(session);
  return session;
}

async function forward(session: McpSession, msg: any): Promise<any | null> {
  session.lastSeen = Date.now();
  if (msg.id === undefined || msg.id === null) {
    session.proc.stdin.write(JSON.stringify(msg) + "\n");
    session.proc.stdin.flush();
    return null;
  }

  const upstreamId = `gw-${session.nextId++}`;
  const outgoing = { ...msg, id: upstreamId };
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(upstreamId);
      reject(new Error(`MCP request timed out: ${msg.method || "request"}`));
    }, 120000);
    session.pending.set(upstreamId, { resolve, reject, originalId: msg.id, timer });
    session.proc.stdin.write(JSON.stringify(outgoing) + "\n");
    session.proc.stdin.flush();
  });
}

async function listFiles(root: string, dir = root, out: any[] = []) {
  if (out.length >= 200) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (out.length >= 200) break;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await listFiles(root, p, out);
    } else if (e.isFile()) {
      const s = await stat(p);
      out.push({ path: relative(root, p), bytes: s.size });
    }
  }
  return out;
}

function safePath(root: string, rel: string) {
  const full = resolve(root, rel);
  const base = resolve(root);
  if (full !== base && !full.startsWith(base + "/")) throw new Error("Path escapes session directory");
  return full;
}

function toolResult(id: any, textValue: string) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: textValue }],
      isError: false
    }
  };
}

async function handleGatewayTool(session: McpSession, msg: any, origin: string): Promise<any | null> {
  if (msg?.method !== "tools/call") return null;
  const name = msg?.params?.name;
  const args = msg?.params?.arguments || {};

  if (name === "remote_list_files") {
    const files = await listFiles(session.dir);
    return toolResult(msg.id, JSON.stringify(files, null, 2));
  }

  if (name === "remote_file_url") {
    let rel = String(args.path || "");
    if (!rel) return rpcError(msg.id, -32602, "path is required");

    // Private transport helper tunneled through the existing tool schema:
    // upload-start:<filename>:<base64-chunk>
    // upload-append:<filename>:<base64-chunk>
    // upload-finish:<filename>
    for (const op of ["upload-start", "upload-append"]) {
      const prefix = op + ":";
      if (rel.startsWith(prefix)) {
        const rest = rel.slice(prefix.length);
        const cut = rest.indexOf(":");
        if (cut < 1) return rpcError(msg.id, -32602, "missing filename/chunk");
        const filename = basename(rest.slice(0, cut));
        const chunk = rest.slice(cut + 1);
        const full = safePath(session.dir, filename + ".b64parts");
        const bytes = Buffer.from(chunk, "base64");
        if (op === "upload-start") await Bun.write(full, bytes);
        else {
          const prev = (await exists(full)) ? Buffer.from(await Bun.file(full).arrayBuffer()) : Buffer.alloc(0);
          await Bun.write(full, Buffer.concat([prev, bytes]));
        }
        return toolResult(msg.id, JSON.stringify({ok:true, op, filename, chunkBytes:bytes.length}));
      }
    }
    if (rel.startsWith("upload-truncate:")) {
      const rest = rel.slice("upload-truncate:".length);
      const cut = rest.lastIndexOf(":");
      if (cut < 1) return rpcError(msg.id, -32602, "missing filename/size");
      const filename = basename(rest.slice(0, cut));
      const size = Number(rest.slice(cut + 1));
      if (!Number.isInteger(size) || size < 0) return rpcError(msg.id, -32602, "invalid size");
      const full = safePath(session.dir, filename + ".b64parts");
      if (!(await exists(full))) return rpcError(msg.id, -32602, "no uploaded parts");
      const prev = Buffer.from(await Bun.file(full).arrayBuffer());
      if (size > prev.length) return rpcError(msg.id, -32602, "size exceeds uploaded bytes");
      await Bun.write(full, prev.subarray(0, size));
      return toolResult(msg.id, JSON.stringify({ok:true, op:"upload-truncate", filename, bytes:size}));
    }

    if (rel.startsWith("upload-finish:")) {
      const filename = basename(rel.slice("upload-finish:".length));
      const parts = safePath(session.dir, filename + ".b64parts");
      if (!(await exists(parts))) return rpcError(msg.id, -32602, "no uploaded parts");
      const dest = safePath(session.dir, filename);
      const data = await Bun.file(parts).arrayBuffer();
      await Bun.write(dest, data);
      const url = `${origin}/${TOKEN}/files/${session.id}/${encodeURIComponent(filename)}`;
      return toolResult(msg.id, url);
    }

    const wantsBase64 = rel.startsWith("base64:");
    if (wantsBase64) rel = rel.slice("base64:".length);
    const full = safePath(session.dir, rel);
    if (!(await exists(full))) return rpcError(msg.id, -32602, "file does not exist");
    if (wantsBase64) {
      const buf = await Bun.file(full).arrayBuffer();
      return toolResult(msg.id, Buffer.from(buf).toString("base64"));
    }
    const url = `${origin}/${TOKEN}/files/${session.id}/${rel.split("/").map(encodeURIComponent).join("/")}`;
    return toolResult(msg.id, url);
  }

  if (name === "remote_file_base64") {
    const rel = String(args.path || "");
    if (!rel) return rpcError(msg.id, -32602, "path is required");
    const full = safePath(session.dir, rel);
    if (!(await exists(full))) return rpcError(msg.id, -32602, "file does not exist");
    const buf = await Bun.file(full).arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    return toolResult(msg.id, b64);
  }

  return null;
}

function addGatewayTools(resp: any) {
  if (!resp?.result?.tools || !Array.isArray(resp.result.tools)) return resp;
  resp.result.tools.push(
    {
      name: "remote_list_files",
      description: "List files created in this remote WordCraft MCP session. Use after save_document to discover the saved filename.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "remote_file_url",
      description: "Return a temporary HTTPS download URL for a file created in this remote WordCraft MCP session.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "Relative path returned by remote_list_files." } },
        required: ["path"],
        additionalProperties: false
      }
    },
    {
      name: "remote_file_base64",
      description: "Return a file created in this remote WordCraft MCP session as base64. Intended for small files and testing.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "Relative path returned by remote_list_files." } },
        required: ["path"],
        additionalProperties: false
      }
    }
  );
  return resp;
}

async function handleOne(req: Request, session: McpSession, msg: any, origin: string) {
  const local = await handleGatewayTool(session, msg, origin);
  if (local) return local;

  // Convenience for remote clients: open_document may receive an HTTPS URL.
  // The gateway downloads it into the isolated session directory, then passes
  // a normal local path to WordCraft.
  if (msg?.method === "tools/call" && msg?.params?.name === "open_document") {
    const rawPath = String(msg?.params?.arguments?.path || "");
    if (/^https:\/\//i.test(rawPath)) {
      const r = await fetch(rawPath, { redirect: "follow" });
      if (!r.ok) return rpcError(msg.id, -32602, `download failed: ${r.status} ${r.statusText}`);
      const cd = r.headers.get("content-disposition") || "";
      const m = cd.match(/filename="?([^";]+)"?/i);
      let name = m?.[1] || new URL(rawPath).pathname.split("/").pop() || "import.docx";
      try { name = decodeURIComponent(name); } catch {}
      name = basename(name).replace(/[^\p{L}\p{N}._() -]+/gu, "_");
      if (!/\.(docx|odt|rtf|md|tex|html|txt|json)$/i.test(name)) name += ".docx";
      const dest = safePath(session.dir, name);
      await Bun.write(dest, await r.arrayBuffer());
      msg = {
        ...msg,
        params: {
          ...msg.params,
          arguments: { ...(msg.params?.arguments || {}), path: dest }
        }
      };
    }
  }

  const resp = await forward(session, msg);
  if (resp && msg?.method === "tools/list") return addGatewayTools(resp);
  return resp;
}

function cleanup() {
  // Intentionally keep the private singleton backend alive for continuity
  // across hosts that reconnect for each tool invocation.
}

Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    cleanup();
    const u = new URL(req.url);

    if (u.pathname === "/health") {
      return json({ ok: true, service: "wordcraft-remote-mcp", release: RELEASE });
    }

    if (u.pathname === "/selftest") {
      let s: McpSession | undefined;
      try {
        s = await createSession();
        const init = await forward(s, {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "railway-selftest", version: "1.0.0" }
          }
        });
        await forward(s, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
        const toolsResp = await forward(s, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        const names = Array.isArray(toolsResp?.result?.tools) ? toolsResp.result.tools.map((t:any)=>t.name) : [];
        return json({ ok: true, backend: "wordcraft-cli", protocolVersion: init?.result?.protocolVersion, toolCount: names.length, sampleTools: names.slice(0, 12) });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      } finally {
        if (s) {
          try { s.proc.kill(); } catch {}
          sessions.delete(s.id);
        }
      }
    }

    if (!TOKEN) return json({ error: "MCP_TOKEN is not configured" }, 503);

    const prefix = `/${TOKEN}`;
    if (!u.pathname.startsWith(prefix)) return new Response("Not found", { status: 404 });

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST,GET,DELETE,OPTIONS",
          "access-control-allow-headers": "content-type,accept,mcp-session-id,mcp-protocol-version",
          "access-control-expose-headers": "mcp-session-id",
        }
      });
    }

    if (u.pathname.startsWith(prefix + "/files/") && req.method === "GET") {
      const rest = u.pathname.slice((prefix + "/files/").length);
      const parts = rest.split("/");
      const sessionId = parts.shift() || "";
      const session = sessions.get(sessionId);
      if (!session) return new Response("Session not found or expired", { status: 404 });
      const rel = parts.map(decodeURIComponent).join("/");
      let full: string;
      try { full = safePath(session.dir, rel); } catch { return new Response("Invalid path", { status: 400 }); }
      if (!(await exists(full))) return new Response("File not found", { status: 404 });
      const f = Bun.file(full);
      return new Response(f, {
        headers: {
          "content-type": f.type || "application/octet-stream",
          "content-disposition": `attachment; filename="${basename(full).replaceAll('"', "")}"`,
          "cache-control": "private, max-age=300"
        }
      });
    }

    if (u.pathname !== prefix + "/mcp") return new Response("Not found", { status: 404 });

    if (req.method === "GET") {
      return new Response("This MCP endpoint uses Streamable HTTP POST.", {
        status: 405,
        headers: { "allow": "POST, DELETE, OPTIONS" }
      });
    }

    if (req.method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    let body: any;
    try { body = await req.json(); }
    catch { return json(rpcError(null, -32700, "Parse error"), 400); }

    const origin = u.origin;
    const isBatch = Array.isArray(body);
    const messages = isBatch ? body : [body];
    const isInitialize = messages.some((m:any) => m?.method === "initialize");

    let sid = req.headers.get("mcp-session-id") || "";
    let session = sid ? sessions.get(sid) : undefined;

    if (!session && isInitialize) {
      try {
        session = await createSession();
        sid = session.id;
      } catch (e) {
        console.error("Failed to start WordCraft", String(e));
        return json(rpcError(messages[0]?.id, -32000, "Failed to start WordCraft MCP backend"), 503);
      }
    }

    if (!session) {
      return json(rpcError(messages[0]?.id, -32001, "Missing or expired MCP session; initialize again"), 400);
    }

    try {
      const responses: any[] = [];
      for (const msg of messages) {
        const r = await handleOne(req, session, msg, origin);
        if (r) responses.push(r);
      }
      if (responses.length === 0) {
        return new Response(null, {
          status: 202,
          headers: { "mcp-session-id": sid, "access-control-expose-headers": "mcp-session-id" }
        });
      }
      return json(isBatch ? responses : responses[0], 200, { "mcp-session-id": sid });
    } catch (e) {
      console.error("MCP gateway error", String(e));
      return json(rpcError(messages[0]?.id, -32000, String(e)), 500, { "mcp-session-id": sid });
    }
  }
});

console.log(`WordCraft remote MCP gateway listening on :${PORT}`);
