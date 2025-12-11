
const { GoogleGenAI, Type, Schema } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Models
const TEXT_MODEL = "gemini-2.5-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image";

// In-memory store for conversation context (Use Redis/Firestore for multi-instance production)
const sessionStore = new Map();

const SYSTEM_INSTRUCTION = `
You are the AI engine for 'The Bridge'. You are a ruthless, stoic, high-contrast motivator. 
Your job is to analyze the gap between a user's current routine and their goal.
- Be direct. No fluff.
- Use data-driven language (e.g., "Probability of failure: 87%").
- Create urgency.
`;

const getChatSession = (userId) => {
  if (!sessionStore.has(userId)) {
    // Initialize new chat
    const chat = ai.chats.create({
      model: TEXT_MODEL,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
      history: []
    });
    sessionStore.set(userId, chat);
  }
  return sessionStore.get(userId);
};

// Helper to clean base64 string
const cleanBase64 = (b64) => b64.replace(/^data:image\/\w+;base64,/, "");

module.exports = {
  /**
   * Predicts outcome based on routine and goal (Sets Context)
   */
  predictOutcome: async (userId, routine, goal, daysRemaining) => {
    const chat = getChatSession(userId);
    const prompt = `
      User Routine: "${routine}"
      User Goal: "${goal}"
      Time Remaining: ${daysRemaining} days.
      
      Analyze the trajectory. If they keep this routine, will they reach the goal? 
      Provide a percentage probability of success and a 2-sentence reality check.
    `;
    
    const result = await chat.sendMessage(prompt);
    return result.text;
  },

  /**
   * Generates daily tasks
   */
  generateDailyActions: async (userId, routine, goal, dayContext = 1, daysRemaining = 30) => {
    const chat = getChatSession(userId);
    
    let urgency = "NORMAL";
    if (daysRemaining < 7) urgency = "CRITICAL";
    else if (daysRemaining < 30) urgency = "HIGH";

    const prompt = `
      Analyze the gap between the user's current routine and their goal.
      Current Routine: "${routine}"
      Goal: "${goal}"
      Context: Day ${dayContext} of the journey.
      Time Remaining: ${daysRemaining} days.
      Urgency Level: ${urgency}.
      
      Create a concrete, actionable daily to-do list (max 5 items) for TODAY.
      
      CRITICAL INSTRUCTION:
      Since urgency is ${urgency}, adjust the intensity of the tasks.
      ${urgency === 'CRITICAL' ? 'Tasks must be drastic and high-impact. No fluff.' : 'Focus on consistency and building momentum.'}
      
      Also provide a short, punchy, dark-themed motivational quote that references time running out or the cost of delay.
    `;

    // Schema definition for structured JSON using the Type enum
    const schema = {
        type: Type.OBJECT,
        properties: {
          tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                impactScore: { type: Type.INTEGER, description: "Value 1-10 representing importance" },
              },
              required: ["title", "description", "impactScore"],
            },
          },
          quote: { type: Type.STRING },
        },
        required: ["tasks", "quote"],
      };

    const response = await chat.sendMessage({
        message: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: schema
        }
    });
    
    // Clean markdown if Gemini adds it
    let clean = response.text.replace(/```json/g, "").replace(/```/g, "").trim();
    // Robust parsing regex
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) clean = jsonMatch[0];
    
    return JSON.parse(clean);
  },

  /**
   * Generates Future Self Image
   */
  generateFutureSelf: async (userId, imageBase64, goal) => {
    const mimeType = imageBase64.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
    const prompt = `
        Transform this person into their future self who has achieved this goal: "${goal}".
        The style should be: High contrast, cinematic lighting, black and white or muted desaturated colors, epic, successful, stoic, powerful.
        Keep the facial features recognizable but enhanced by success (better grooming, confident posture, appropriate attire for the goal).
        Background should be abstract dark or minimal.
    `;

    try {
        const response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType, data: cleanBase64(imageBase64) } },
                    { text: prompt }
                ]
            }
        });
        const parts = response.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
        }
        throw new Error("No image generated");
    } catch (e) {
        console.error("Future self generation failed", e);
        return imageBase64; // Fallback
    }
  },

   /**
   * Generates Current Routine (Stagnation) Image
   */
   generateCurrentRoutineImage: async (userId, imageBase64, routine, years = 5) => {
    const mimeType = imageBase64.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
    const prompt = `
        Show this person ${years} years in the future if they rigidly stick to this current daily routine: "${routine}" without changing anything.
        The style should be: High contrast, black and white, gritty, film noir.
        The person should look slightly weary, stagnant, stuck in a loop, unfulfilled, or bored.
        Keep facial features recognizable but reflect the lack of progress.
        Background should be mundane, cluttered, or confining.
    `;

    try {
        const response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType, data: cleanBase64(imageBase64) } },
                    { text: prompt }
                ]
            }
        });
        const parts = response.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
        }
        throw new Error("No image generated");
    } catch (e) {
        console.error("Routine generation failed", e);
        return imageBase64; // Fallback
    }
  }
};
