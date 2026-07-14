import { google } from "googleapis";

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-docs",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data: any) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("Google Docs not connected");
  }
  return accessToken;
}

export async function getUncachableGoogleDocsClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.docs({ version: "v1", auth: oauth2Client });
}

export function googleDocsToHtml(document: any): string {
  const body = document.body;
  if (!body || !body.content) return "";

  let html = "";

  for (const element of body.content) {
    if (element.paragraph) {
      const paragraph = element.paragraph;
      const style = paragraph.paragraphStyle?.namedStyleType || "NORMAL_TEXT";

      let paragraphHtml = "";
      if (paragraph.elements) {
        for (const elem of paragraph.elements) {
          if (elem.textRun) {
            let text = elem.textRun.content || "";
            if (text === "\n") continue;
            text = text.replace(/\n$/, "");

            const textStyle = elem.textRun.textStyle || {};
            let styledText = escapeHtml(text);

            if (textStyle.bold) styledText = `<strong>${styledText}</strong>`;
            if (textStyle.italic) styledText = `<em>${styledText}</em>`;
            if (textStyle.underline) styledText = `<u>${styledText}</u>`;
            if (textStyle.strikethrough) styledText = `<s>${styledText}</s>`;

            paragraphHtml += styledText;
          }
        }
      }

      if (style === "HEADING_1") {
        html += `<h1>${paragraphHtml}</h1>`;
      } else if (style === "HEADING_2") {
        html += `<h2>${paragraphHtml}</h2>`;
      } else if (style === "HEADING_3") {
        html += `<h3>${paragraphHtml}</h3>`;
      } else {
        html += `<p>${paragraphHtml}</p>`;
      }
    }
  }

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function htmlToGoogleDocsRequests(html: string): any[] {
  const plainText = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!plainText) return [];

  return [
    {
      insertText: {
        location: { index: 1 },
        text: plainText,
      },
    },
  ];
}
