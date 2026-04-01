import { parseRadicalRedSave } from "../_shared/radical-red-save.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function readBodyAsArrayBuffer(request: Request): Promise<ArrayBuffer> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Expected multipart field named 'file'.");
    }

    return await file.arrayBuffer();
  }

  return await request.arrayBuffer();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  try {
    const buffer = await readBodyAsArrayBuffer(request);

    if (buffer.byteLength === 0) {
      return json({ error: "Empty request body." }, 400);
    }

    if (buffer.byteLength > 256 * 1024) {
      return json({ error: "Save file is larger than expected for a GBA .sav." }, 400);
    }

    const parsed = parseRadicalRedSave(buffer);

    return json({
      ok: true,
      parsed,
      nextSteps: [
        "Persist metadata to public.save_imports once auth is wired into the frontend.",
        "Add Gen III party and PC parsing in supabase/functions/_shared/radical-red-save.ts.",
        "Map met_location IDs to Radical Red map-section names before exposing user-facing location strings.",
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parser failure.";
    return json({ ok: false, error: message }, 400);
  }
});
