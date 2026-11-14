import handler from "./handler";

// Cloudflare Workers fetch entrypoint; original MCP protocol and tool definitions are preserved.
export default {
  fetch(request: Request): Promise<Response> {
    return handler(request);
  },
};
