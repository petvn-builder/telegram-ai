import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const TONE_PROMPTS = {
  gen_z:        "Trả lời theo phong cách Gen Z Việt Nam: hài hước, dí dỏm, sassy, dùng tiếng lóng tự nhiên (kiểu 'oke thôi', 'ủa', 'thật ra là', 'não cá vàng', 'vibe'), ngắn gọn, có cá tính. Không nhàm chán, không cứng nhắc.",
  professional: "Respond in a clear, professional tone. Be concise and precise.",
  casual:       "Respond in a friendly, relaxed tone — like texting a close friend. Keep it light and natural.",
  formal:       "Respond formally and politely at all times. Use complete sentences and proper grammar.",
}

export async function askOpenAI(memory, userMessage, conversationHistory = "", tone = "professional") {
  const toneInstruction = TONE_PROMPTS[tone] ?? TONE_PROMPTS.professional
  const messages = [
    { role: "system", content: `You are a helpful AI assistant. ${toneInstruction}` },
    { role: "system", content: `Memory:\n${memory}` },
  ]

  if (conversationHistory) {
    messages.push({
      role: "system",
      content: `=== RECENT CONVERSATION ===\n${conversationHistory}`,
    })
  }

  messages.push({ role: "user", content: userMessage })

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  });

  return response.choices[0].message.content;
}

/**
 * LLM call tuned for the @ai_3veryone_bot group-chat agent.
 * Blends personal knowledge (RAG) with recent conversation context.
 */
export async function askPetAI(knowledge, conversationContext, question, tone = "professional") {
  const toneInstruction = TONE_PROMPTS[tone] ?? TONE_PROMPTS.professional
  const systemMessages = [
    {
      role: "system",
      content:
        "You are a helpful AI assistant in a group chat. " +
        "Answer naturally and conversationally — aim for 50–100 words. " +
        "Format your answer for easy reading: use line breaks between ideas, bullet points for lists, and bold for key terms when helpful. " +
        "Be direct. Don't repeat the question or start with 'I'. " +
        `${toneInstruction}`,
    },
  ]

  if (knowledge && knowledge.trim()) {
    systemMessages.push({
      role: "system",
      content: `=== PERSONAL KNOWLEDGE ===\n${knowledge.trim()}`,
    })
  }

  if (conversationContext && conversationContext.trim()) {
    systemMessages.push({
      role: "system",
      content: `=== RECENT CONVERSATION ===\n${conversationContext.trim()}`,
    })
  }

  const userContent =
    question && question.trim()
      ? question.trim()
      : "Summarize the recent conversation and add any relevant context from my knowledge."

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [...systemMessages, { role: "user", content: userContent }],
  })

  return response.choices[0].message.content
}
