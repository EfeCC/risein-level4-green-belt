import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type FeedbackBody = {
  rating?: number;
  message?: string;
  address?: string | null;
  role?: string | null;
};

/**
 * Collects pilot-user feedback. Every submission is written to the structured
 * server log (visible in Vercel runtime logs / any host) and, if
 * FEEDBACK_WEBHOOK_URL is configured, forwarded to a Discord/Slack/Formspree
 * webhook so the team gets a live feed without standing up a database.
 */
export async function POST(req: NextRequest) {
  let body: FeedbackBody;
  try {
    body = (await req.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rating = Number(body.rating);
  const message = (body.message ?? "").toString().trim().slice(0, 2000);

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be between 1 and 5." }, { status: 400 });
  }
  if (message.length < 2) {
    return NextResponse.json({ error: "Please add a short message." }, { status: 400 });
  }

  const entry = {
    rating,
    message,
    role: (body.role ?? "").toString().slice(0, 40) || null,
    address: (body.address ?? "").toString().slice(0, 80) || null,
    at: new Date().toISOString(),
    ua: req.headers.get("user-agent")?.slice(0, 200) ?? null,
  };

  // eslint-disable-next-line no-console
  console.log("[feedback]", JSON.stringify(entry));

  const hook = process.env.FEEDBACK_WEBHOOK_URL;
  if (hook) {
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: `⭐️ ${rating}/5 — ${message}${entry.role ? ` · ${entry.role}` : ""}${
            entry.address ? `\n\`${entry.address}\`` : ""
          }`,
          embeds: [{ fields: Object.entries(entry).map(([name, value]) => ({ name, value: String(value ?? "—") })) }],
        }),
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[feedback] webhook forward failed", e);
    }
  }

  return NextResponse.json({ ok: true });
}
