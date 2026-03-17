import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid unsubscribe token" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    const { data: subscription, error: lookupError } = await supabase
      .from("email_preferences")
      .select("id, user_id, unsubscribed")
      .eq("unsubscribe_token", token)
      .single();

    if (lookupError || !subscription) {
      return NextResponse.json(
        { error: "Invalid or expired unsubscribe token" },
        { status: 404 },
      );
    }

    if (subscription.unsubscribed) {
      return NextResponse.json({ message: "Already unsubscribed" });
    }

    const { error: updateError } = await supabase
      .from("email_preferences")
      .update({
        unsubscribed: true,
        unsubscribed_at: new Date().toISOString(),
      })
      .eq("id", subscription.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update preferences" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: "Successfully unsubscribed from marketing emails",
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
