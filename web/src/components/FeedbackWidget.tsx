"use client";
import { useState } from "react";
import { toast } from "sonner";
import { MessageSquarePlus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useWallet } from "@/components/providers/WalletProvider";
import { track, captureError } from "@/lib/monitoring";

const ROLES = ["Farmer", "Cooperative", "Liquidity provider", "Just exploring"];

export function FeedbackWidget() {
  const { address } = useWallet();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [role, setRole] = useState<string>("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (rating === 0) return toast.error("Pick a star rating first.");
    if (message.trim().length < 2) return toast.error("Add a short note, please.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, message, role, address }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      track("feedback_submit", { rating, role: role || "unspecified" });
      toast.success("Thank you! Your feedback was recorded.");
      setOpen(false);
      setRating(0);
      setMessage("");
      setRole("");
    } catch (e) {
      captureError(e, { where: "feedback" });
      toast.error("Could not send feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-brand-600/30 transition-transform hover:scale-105 hover:bg-brand-700"
        aria-label="Give feedback"
      >
        <MessageSquarePlus className="h-5 w-5" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-md rounded-b-none p-6 animate-in sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">Share your feedback</h3>
                <p className="mt-0.5 text-sm muted">
                  You&apos;re helping shape a real pilot. 30 seconds, honest notes welcome.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/5">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                >
                  <Star
                    className={cn(
                      "h-8 w-8 transition-colors",
                      (hover || rating) >= n
                        ? "fill-grain-400 text-grain-400"
                        : "text-[var(--border)]",
                    )}
                  />
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r === role ? "" : r)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    role === r
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                      : "border-[var(--border)] muted hover:border-brand-400",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="What worked, what confused you, what you'd want next…"
              className="mt-4 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-[var(--ring)]"
            />

            <Button onClick={submit} loading={submitting} className="mt-4 w-full">
              Send feedback
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
