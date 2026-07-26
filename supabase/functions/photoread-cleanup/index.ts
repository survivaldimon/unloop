// Hourly photo TTL sweep (pg_cron → net.http_post → this function): unpaid
// photo sessions older than 24h lose their uploaded photos. Paid sessions are
// never touched here — their photos are deleted by photoread-report the moment
// the report is cached. This function backs the landing/Privacy promise
// "photos are deleted within 24 hours", so its policy must stay at least that
// strict. Idempotent and safe to run at any frequency; verify_jwt is on and
// the cron job calls it with the anon key.
import { createClient } from "npm:@supabase/supabase-js@2";

/** Sessions per run; at hourly cadence a backlog drains fast. */
const BATCH = 200;

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: rows, error: queryError } = await admin
      .from("photoread_sessions")
      .select("id, photo_path, photo_paths")
      .is("paid_at", null)
      .is("photo_deleted_at", null)
      .lt("created_at", cutoff)
      .limit(BATCH);
    if (queryError) {
      console.error("photoread-cleanup query", queryError);
      return json({ error: "query_failed" }, 500);
    }

    let cleaned = 0;
    let filesRemoved = 0;
    for (const row of rows ?? []) {
      const id = String(row.id).toLowerCase();

      // Union of everything this session may have in the bucket: the paths the
      // row references, whatever actually sits under the <id>/ prefix (covers
      // rows whose path columns were never written), and the legacy flat
      // <id>.jpg layout of the earliest sessions. remove() silently skips
      // keys that don't exist, so over-listing costs nothing.
      const paths = new Set<string>();
      if (Array.isArray(row.photo_paths)) {
        for (const p of row.photo_paths) if (typeof p === "string" && p) paths.add(p);
      }
      if (typeof row.photo_path === "string" && row.photo_path) paths.add(row.photo_path);
      const { data: listed, error: listError } = await admin.storage
        .from("photoread")
        .list(id, { limit: 100 });
      if (listError) console.error("photoread-cleanup list", id, listError);
      for (const f of listed ?? []) paths.add(`${id}/${f.name}`);
      paths.add(`${id}.jpg`);

      const { data: removed, error: removeError } = await admin.storage
        .from("photoread")
        .remove([...paths]);
      if (removeError) {
        // Leave the row unmarked — the next hourly run retries it.
        console.error("photoread-cleanup remove", id, removeError);
        continue;
      }
      filesRemoved += removed?.length ?? 0;

      const { error: markError } = await admin
        .from("photoread_sessions")
        .update({
          photo_deleted_at: new Date().toISOString(),
          photo_path: null,
          photo_paths: null,
        })
        .eq("id", row.id);
      if (markError) {
        console.error("photoread-cleanup mark", id, markError);
        continue;
      }
      cleaned++;
    }

    return json({ ok: true, scanned: rows?.length ?? 0, cleaned, files_removed: filesRemoved });
  } catch (err) {
    console.error("photoread-cleanup error", err);
    return json({ error: "internal" }, 500);
  }
});
