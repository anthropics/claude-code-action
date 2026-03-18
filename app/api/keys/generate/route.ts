import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";

function generateApiKey(): string {
  const bytes = randomBytes(32);
  return `pp_live_${bytes.toString("base64url")}`;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Key name is required" },
        { status: 400 },
      );
    }

    if (name.length > 64) {
      return NextResponse.json(
        { error: "Key name must be 64 characters or less" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    const { count } = await supabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("revoked", false);

    if (count !== null && count >= 5) {
      return NextResponse.json(
        {
          error:
            "Maximum of 5 active API keys allowed. Revoke an existing key first.",
        },
        { status: 400 },
      );
    }

    const plaintext = generateApiKey();
    const keyHash = hashKey(plaintext);
    const prefix = plaintext.slice(0, 12);

    const { data: keyRecord, error: insertError } = await supabase
      .from("api_keys")
      .insert({
        user_id: user.id,
        name: name.trim(),
        key_hash: keyHash,
        key_prefix: prefix,
        revoked: false,
      })
      .select("id, name, created_at")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to create API key" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: keyRecord.id,
      name: keyRecord.name,
      key: plaintext,
      created_at: keyRecord.created_at,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get("id");

    if (!keyId) {
      return NextResponse.json(
        { error: "Key ID is required" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("api_keys")
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to revoke API key" },
        { status: 500 },
      );
    }

    return NextResponse.json({ message: "API key revoked" });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
