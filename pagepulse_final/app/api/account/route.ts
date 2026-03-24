import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";
import { getPlanLimit } from "@/lib/quotas";

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = createServiceClient();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("plan, stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: "Failed to fetch profile" },
        { status: 500 },
      );
    }

    const { data: emailPrefs } = await supabase
      .from("email_preferences")
      .select("unsubscribed")
      .eq("user_id", user.id)
      .single();

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

    const plan = profile?.plan ?? "free";
    const limit = getPlanLimit(plan);

    return NextResponse.json({
      plan,
      scans_used: count ?? 0,
      scans_limit: limit,
      email_notifications: !emailPrefs?.unsubscribed,
      stripe_customer_id: profile?.stripe_customer_id ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

const patchSchema = z.object({
  email_notifications: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { email_notifications } = parsed.data;

    const supabase = createServiceClient();

    const { error } = await supabase.from("email_preferences").upsert(
      {
        user_id: user.id,
        unsubscribed: !email_notifications,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      return NextResponse.json(
        { error: "Failed to update preferences" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
