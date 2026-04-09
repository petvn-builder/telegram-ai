import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function askOpenAI(memory, userMessage, conversationHistory = "") {
  const messages = [
    { role: "system", content: "You are a helpful AI assistant." },
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
export async function askPetAI(knowledge, conversationContext, question) {
  const systemMessages = [
    {
      role: "system",
      content:
        "You are a helpful AI assistant embedded in a group chat. " +
        "Respond concisely and conversationally — 1–3 sentences unless depth is clearly needed. " +
        "Answer directly without repeating the question or starting with 'I'.",
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
