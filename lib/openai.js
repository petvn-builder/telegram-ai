import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function askOpenAI(memory, userMessage) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a helpful AI assistant."
      },
      {
        role: "system",
        content: `Memory:\n${memory}`
      },
      {
        role: "user",
        content: userMessage
      }
    ],
  });

  return response.choices[0].message.content;
}
