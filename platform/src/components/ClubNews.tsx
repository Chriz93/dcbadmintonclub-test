import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const article = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
});
const publicClub = z.object({
  name: z.string(),
  contactEmail: z.string().nullable(),
  accent: z.string().nullable(),
  announcements: z.array(article),
});
export function ClubNews({ club }: { club?: string }) {
  const [news, setNews] = useState<z.infer<typeof article>[]>([]),
    [details, setDetails] = useState<z.infer<typeof publicClub> | null>(null);
  useEffect(() => {
    let alive = true;
    setNews([]);
    setDetails(null);
    if (!supabase) return;
    void (async () => {
      if (club) {
        const { data, error } = await supabase!
          .from("announcements")
          .select("id,title,body")
          .eq("club_id", club)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        if (alive) setNews(z.array(article).parse(data));
      } else {
        const { data, error } = await supabase!.rpc("public_club", {
          club_slug: import.meta.env.VITE_CLUB_SLUG || "dc-badminton",
        });
        if (error || !data) return;
        const c = publicClub.parse(data);
        if (alive) {
          setDetails(c);
          setNews(c.announcements);
        }
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [club]);
  if (!details && !news.length) return null;
  return (
    <section
      aria-label="Club news"
      style={
        details?.accent && /^#[a-fA-F0-9]{6}$/.test(details.accent)
          ? {
              borderInlineStart: `4px solid ${details.accent}`,
              paddingInlineStart: "1rem",
            }
          : undefined
      }
    >
      {details && (
        <>
          <h2>{details.name}</h2>
          {details.contactEmail && <p>Contact: {details.contactEmail}</p>}
        </>
      )}
      {news.map((a) => (
        <article key={a.id}>
          <h3>{a.title}</h3>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {a.body}
          </p>
        </article>
      ))}
    </section>
  );
}
