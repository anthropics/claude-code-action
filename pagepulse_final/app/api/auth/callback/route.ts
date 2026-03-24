import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, action } = body;

    if (!email || !password || !action) {
      return NextResponse.json(
        { error: "Email, password, and action are required" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    if (action === "signup") {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (data.user) {
        await supabase.from("profiles").insert({
          id: data.user.id,
          email: data.user.email,
          plan: "free",
        });
      }

      const { data: session, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (signInError || !session.session) {
        return NextResponse.json(
          { error: "Account created but login failed. Please log in." },
          { status: 400 },
        );
      }

      const response = NextResponse.json({ success: true });
      response.cookies.set("sb-access-token", session.session.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
      return response;
    }

    if (action === "login") {
      const { data: session, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !session.session) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 },
        );
      }

      const response = NextResponse.json({ success: true });
      response.cookies.set("sb-access-token", session.session.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
      return response;
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
