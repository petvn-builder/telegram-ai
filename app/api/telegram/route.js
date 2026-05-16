import { createEmbedding } from "@/lib/embeddings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrCreateUser, resetIfNewDay, isLimitReached, incrementUsage } from "@/lib/user";
import { handleQuery } from "@/lib/query-handler";
import { storeGroupMessage, getRecentMessages } from "@/lib/group-chat";
import { sendTelegram } from "@/lib/telegram-send";
import { formatForTelegram } from "@/lib/telegram-format";

// ── UUID lookup ───────────────────────────────────────────────────────────────

async function getUuidForTelegramUser(telegramUserId) {
  const { data } = await getSupabaseAdmin()
    .from("user_identities")
    .select("user_id")
    .eq("telegram_user_id", String(telegramUserId))
    .single();
  return data?.user_id ?? null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req) {
  const body = await req.json();
  const message = body.message;

  if (!message) return new Response("ok");

  const chatId = message.chat.id.toString();
  const text = message.text;
  const isGroup = ["group", "supergroup"].includes(message.chat?.type);

  console.log("[TG] raw text:", JSON.stringify(text));
  if (!text) return new Response("ok");

  // ── Store group messages for /pet context (fire-and-forget) ─────────────────
  if (isGroup) {
    storeGroupMessage(
      chatId,
      String(message.from.id),
      message.from.username || "",
      text,
      message.from.first_name || "",
      message.from.last_name || ""
    ).catch(console.error);

    // In groups, only respond to slash commands or @ai_3veryone_bot mentions
    if (!text.startsWith("/") && !/@ai_3veryone_bot/i.test(text)) return new Response("ok");
  }

  // ── Account linking ─────────────────────────────────────────────────────────
  if (text.startsWith("/start link_")) {
    const rawToken = text.slice("/start link_".length).trim();
    try {
      const { consumeLinkToken } = await import("@/lib/telegram-link");
      await consumeLinkToken(rawToken, message.from.id.toString(), message.from.username || "");
      await sendTelegram(chatId, "✅ Telegram linked! You can now use all commands.");
    } catch (err) {
      await sendTelegram(chatId, `❌ ${err.message}`);
    }
    return new Response("ok");
  }

  // ── Welcome ─────────────────────────────────────────────────────────────────
  if (text === "/start" && isGroup) return new Response("ok"); // suppress in groups
  if (text === "/start") {
    await getOrCreateUser(message.from.id, message.from.username || "");
    await sendTelegram(chatId, `🧠 Welcome to Your AI Memory Assistant

Think of me as your second brain.

You can:

💾 Save knowledge
Use: /save <your text>
→ /save My AWS key expires in March

🔎 Ask naturally
→ When does my AWS key expire?
→ What do I know about project deadlines?

⏰ Query by time
→ notes today
→ what did I write last week?

🗂 Commands
→ /task Call Ricky tomorrow
→ /todo
→ /entity <name>

Everything you save is private, organized, and instantly searchable.`);
    return new Response("ok");
  }

  // ── UUID guard ──────────────────────────────────────────────────────────────
  const userUuid = await getUuidForTelegramUser(message.from.id);
  if (!userUuid) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "the website";
    await sendTelegram(chatId, `Please register at ${appUrl} and connect your Telegram in Settings first.`);
    return new Response("ok");
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  let user = await getOrCreateUser(message.from.id, message.from.username || "");
  user = await resetIfNewDay(user);
  if (await isLimitReached(user)) {
    await sendTelegram(chatId, "🚫 You've reached your daily limit (20 messages). Try again tomorrow.");
    return new Response("ok");
  }
  await incrementUsage(user.id);

  // ── Build conversation context for /pet (group) ──────────────────────────────
  let conversationContext = "";
  if (/@ai_3veryone_bot/i.test(text)) {
    const recent = await getRecentMessages(chatId);
    conversationContext = recent
      .map((m) => `${m.displayName}: ${m.text}`)
      .join("\n");
    console.log(`[TG @mention] fetched ${recent.length} recent messages for chat ${chatId}`);
    console.log("[TG @mention] conversation context:\n" + (conversationContext || "(empty)"));
  }

  // ── Fetch recent 1:1 conversation history ────────────────────────────────────
  let recentConversation = "";
  if (!isGroup) {
    const { getRecentConversation } = await import("@/lib/ai-search");
    recentConversation = await getRecentConversation(userUuid);
  }

  // ── Fetch user tone preference ────────────────────────────────────────────────
  const { data: userSettings } = await getSupabaseAdmin()
    .from("user_settings")
    .select("tone")
    .eq("user_id", userUuid)
    .maybeSingle();
  const tone = userSettings?.tone ?? "professional";

  // ── Dispatch ─────────────────────────────────────────────────────────────────
  const response = await handleQuery(userUuid, text, {
    telegramMessageId: String(message.message_id),
    conversationContext,
    recentConversation,
    tone,
  });

  await sendTelegram(chatId, formatForTelegram(response));

  // Save conversation history for semantic search (answers only)
  if (response.kind === "answer" || response.kind === "temporal_answer" || response.kind === "tool_answer") {
    const supabase = getSupabaseAdmin();
    const answerText = response.text;
    const [userEmbedding, aiEmbedding] = await Promise.all([
      createEmbedding(text),
      createEmbedding(answerText),
    ]);
    await supabase.from("knowledge").insert([
      { user_id: userUuid, content: text,       role: "user", embedding: userEmbedding },
      { user_id: userUuid, content: answerText,  role: "ai",   embedding: aiEmbedding  },
    ]);

    // Prune: keep only the latest 10 conversation rows (user+ai) per user
    ;(async () => {
      const { data: rows } = await supabase
        .from("knowledge")
        .select("id, created_at")
        .eq("user_id", userUuid)
        .in("role", ["user", "ai"])
        .order("created_at", { ascending: false })
        .limit(11);
      if (rows && rows.length === 11) {
        const cutoff = rows[10].created_at;
        await supabase.from("knowledge").delete()
          .eq("user_id", userUuid)
          .in("role", ["user", "ai"])
          .lte("created_at", cutoff);
      }
    })().catch(console.error);
  }

  return new Response("ok");
}

