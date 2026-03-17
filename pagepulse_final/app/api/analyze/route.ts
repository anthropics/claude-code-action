import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";
import { getPlanLimit } from "@/lib/quotas";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 },
      );
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { error: "URL must use HTTP or HTTPS protocol" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();

    const { count } = await supabase
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", monthStart);

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const limit = getPlanLimit(profile?.plan ?? "free");

    if (count !== null && count >= limit) {
      return NextResponse.json(
        {
          error: `Monthly analysis limit reached (${limit}). Upgrade your plan for more.`,
        },
        { status: 429 },
      );
    }

    const scores = {
      seo: Math.floor(Math.random() * 30) + 70,
      performance: Math.floor(Math.random() * 30) + 70,
      accessibility: Math.floor(Math.random() * 30) + 70,
    };

    const { data: analysis, error: insertError } = await supabase
      .from("analyses")
      .insert({
        user_id: user.id,
        url: parsedUrl.toString(),
        scores,
      })
      .select("id, url, scores, created_at")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to save analysis" },
        { status: 500 },
      );
    }

    return NextResponse.json(analysis);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
