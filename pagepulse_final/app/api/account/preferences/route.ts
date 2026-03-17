import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { email_notifications } = body;

    if (typeof email_notifications !== "boolean") {
      return NextResponse.json(
        { error: "email_notifications must be a boolean" },
        { status: 400 },
      );
    }

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
