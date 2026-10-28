import type { Config, Context } from "@netlify/edge-functions";

// Adds the cookie-free visit counter (/t.js) to the news pages, so a page
// synced from the artifacts never needs to carry the tracker itself.
export default async (_request: Request, context: Context) => {
  const response = await context.next();
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  const html = await response.text();
  if (html.includes('src="/t.js"')) return new Response(html, response);
  const tag = '<script src="/t.js" defer></script>';
  const i = html.lastIndexOf("</body>");
  const out = i === -1 ? html + tag : html.slice(0, i) + tag + html.slice(i);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(out, { status: response.status, headers });
};

export const config: Config = {
  path: ["/", "/index.html", "/daily", "/daily/", "/daily/index.html"],
  onError: "bypass",
};
