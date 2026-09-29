import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname.startsWith("/api/")) {
    response.writeHead(501, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Use Vercel dev for live API routes." }));
    return;
  }
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  try {
    const body = await readFile(join("public", safe));
    response.writeHead(200, { "content-type": types[extname(safe)] || "application/octet-stream" });
    response.end(body);
  } catch {
    const body = await readFile("public/index.html");
    response.writeHead(200, { "content-type": "text/html" });
    response.end(body);
  }
}).listen(4173, () => console.log("Preview: http://localhost:4173"));
