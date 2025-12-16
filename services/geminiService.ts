
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PlanResponse } from "../types";

// --- CONFIGURATION ---
// In a real deployment, this would be your production URL (e.g., from Cloud Run)
// For local development, it defaults to localhost.
const BACKEND_URL = "http://localhost:8080/api";
// Set to FALSE by default so the app works immediately in the browser without the backend running.
const USE_BACKEND = false; 

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to clean base64 string
const cleanBase64 = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, "");

// Helper for promise timeout
const timeoutPromise = <T>(promise: Promise<T>, ms: number, fallbackValue: any = null): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`Operation timed out after ${ms}ms`);
      // Resolve with fallback instead of rejecting to keep app alive
      if (fallbackValue) resolve(fallbackValue);
      else reject(new Error("Request timed out"));
    }, ms);

    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(reason => {
        clearTimeout(timer);
        // If fallback exists, we can still survive errors
        if (fallbackValue) resolve(fallbackValue);
        else reject(reason);
      });
  });
};

// --- BACKEND WRAPPERS ---

const callBackend = async (endpoint: string, body: any) => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    
    clearTimeout(id);
    
    if (!response.ok) throw new Error(`Backend Error: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    // Determine if we should fallback
    console.warn(`Backend call to ${endpoint} failed, falling back to client-side SDK.`, error);
    throw error; 
  }
};

// --- MAIN SERVICE FUNCTIONS ---

export const generatePlan = async (
  routine: string,
  goal: string,
  dayContext: number = 1,
  daysRemaining: number = 30,
  userId?: string
): Promise<PlanResponse> => {
  
  // Emergency Fallback Object
  const EMERGENCY_PLAN: PlanResponse = {
        tasks: [
            { title: "Manual Override", description: "AI connection unstable. Set your own tasks today.", impactScore: 10 },
            { title: "Review Goal", description: "Read your primary objective out loud.", impactScore: 5 },
            { title: "Hydrate", description: "Drink water to reset biological functions.", impactScore: 3 }
        ],
        quote: "Chaos is not an excuse. Adapt."
  };

  // 1. Try Backend
  if (USE_BACKEND && userId) {
      try {
        const result = await callBackend('/daily-actions', {
            userId,
            routine,
            goal,
            dayContext,
            daysRemaining
        });
        if (result.success && result.tasks) {
            return { tasks: result.tasks, quote: result.quote };
        }
      } catch (e) {
         // Fall through to Client Side logic
      }
  }

  // 2. Client Side Fallback (Original Logic)
  const model = "gemini-2.5-flash";
  
  // Calculate Progression Phase & Difficulty
  const totalEstimatedDays = dayContext + daysRemaining;
  // Avoid division by zero
  const safeTotal = totalEstimatedDays === 0 ? 1 : totalEstimatedDays;
  const progressRatio = Math.min(1, dayContext / safeTotal);
  
  let phase = "INITIATION";
  let difficultyInstruction = "Focus on small, consistent habits. Low friction. Build the foundation.";
  
  if (progressRatio > 0.2 && progressRatio <= 0.5) {
      phase = "ACCELERATION";
      difficultyInstruction = "Increase intensity. Introduce slightly uncomfortable tasks. Compound the habits.";
  } else if (progressRatio > 0.5 && progressRatio <= 0.8) {
      phase = "PEAK PERFORMANCE";
      difficultyInstruction = "High difficulty. Complex tasks requiring deep work. Test the user's limits.";
  } else if (progressRatio > 0.8) {
      phase = "FINAL SPRINT";
      difficultyInstruction = "Maximum effort. All-out execution to cross the finish line. No excuses.";
  }

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
    
    PROGRESSION PHASE: ${phase} (${Math.round(progressRatio * 100)}% complete).
    DIFFICULTY INSTRUCTION: ${difficultyInstruction}
    
    Create a concrete, actionable daily to-do list (max 5 items) for TODAY.
    
    CRITICAL INSTRUCTION:
    - Return ONLY valid JSON.
    - No markdown formatting.
    - No introductory text.
    
    Since urgency is ${urgency} and phase is ${phase}, strictly adhere to the difficulty instruction.
    
    Also provide a short, punchy, dark-themed motivational quote.
  `;

  const schema: Schema = {
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

  const sdkCall = async () => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          systemInstruction: "You are a ruthless productivity algorithm. Return ONLY JSON.",
        },
      });

      if (response.text) {
        let text = response.text;
        
        // ROBUST PARSING:
        // 1. Clean basic markdown
        let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
        
        // 2. Extract JSON object if there is extra text around it (Look for outermost braces)
        const firstOpen = clean.indexOf('{');
        const lastClose = clean.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1) {
            clean = clean.substring(firstOpen, lastClose + 1);
        }

        return JSON.parse(clean) as PlanResponse;
      }
      throw new Error("No text returned from Gemini");
  };

  try {
    // 15 Second Timeout for Text
    return await timeoutPromise(sdkCall(), 15000, EMERGENCY_PLAN);
  } catch (error) {
    console.error("Plan generation failed:", error);
    return EMERGENCY_PLAN;
  }
};

export const generateFutureSelf = async (
  imageBase64: string,
  goal: string,
  userId?: string
): Promise<string> => {
  
  // 1. Try Backend
  if (USE_BACKEND && userId) {
      try {
        const result = await callBackend('/trajectory', {
            userId,
            imageBase64,
            goal,
            type: 'FUTURE_SELF'
        });
        if (result.success && result.image) {
            return result.image;
        }
      } catch (e) {
         // Fall through
      }
  }

  // 2. Client Side Fallback
  const model = "gemini-2.5-flash-image";
  const mimeType = imageBase64.match(/data:(.*?);base64/)?.[1] || "image/jpeg";

  const prompt = `
    Transform this person into their future self who has achieved this goal: "${goal}".
    The style should be: High contrast, cinematic lighting, black and white or muted desaturated colors, epic, successful, stoic, powerful.
    Keep the facial features recognizable but enhanced by success (better grooming, confident posture, appropriate attire for the goal).
    Background should be abstract dark or minimal.
  `;

  const sdkCall = async () => {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: cleanBase64(imageBase64),
              },
            },
            { text: prompt },
          ],
        },
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
  };

  try {
    // 25 Second Timeout for Image (Images take longer)
    return await timeoutPromise(sdkCall(), 25000, imageBase64); 
  } catch (error) {
    console.error("Image generation failed:", error);
    return imageBase64; 
  }
};

export const generateCurrentRoutineImage = async (
  imageBase64: string,
  routine: string,
  years: number = 5,
  userId?: string
): Promise<string> => {

  // 1. Try Backend
  if (USE_BACKEND && userId) {
      try {
        const result = await callBackend('/trajectory', {
            userId,
            imageBase64,
            routine,
            years,
            type: 'CURRENT_ROUTINE'
        });
        if (result.success && result.image) {
            return result.image;
        }
      } catch (e) {
         // Fall through
      }
  }

  // 2. Client Side Fallback
  const model = "gemini-2.5-flash-image";
  const mimeType = imageBase64.match(/data:(.*?);base64/)?.[1] || "image/jpeg";

  const prompt = `
    Show this person ${years} years in the future if they rigidly stick to this current daily routine: "${routine}" without changing anything.
    The style should be: High contrast, black and white, gritty, film noir.
    The person should look slightly weary, stagnant, stuck in a loop, unfulfilled, or bored.
    Keep facial features recognizable but reflect the lack of progress.
    Background should be mundane, cluttered, or confining.
  `;

  const sdkCall = async () => {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64(imageBase64),
            },
          },
          { text: prompt },
        ],
      },
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
  };

  try {
    // 25 Second Timeout for Image
    return await timeoutPromise(sdkCall(), 25000, imageBase64);
  } catch (error) {
    console.error("Routine generation failed", error);
    return imageBase64; // Fallback
  }
};

export const sendChatMessage = async (
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  message: string,
  isStudyMode: boolean = false
): Promise<string> => {
  const model = "gemini-2.5-flash";
  
  const normalInstruction = "You are a mentor and strategist inside the app 'The Bridge'. Help the user achieve their goals, discuss study topics, and keep them motivated. Be concise, direct, and encouraging but realistic.";
  
  const studyInstruction = `
    You are an academic tutor and subject matter expert in 'Study Mode'. 
    Your goal is to provide structured, distraction-free learning paths related to the user's goal.
    - Do not use conversational filler or small talk.
    - Use bullet points, numbered lists, and clear headings.
    - Focus strictly on factual information, methodologies, and study plans.
    - Break down complex concepts into digestible steps.
  `;

  try {
    const chat = ai.chats.create({
      model,
      history,
      config: {
        systemInstruction: isStudyMode ? studyInstruction : normalInstruction,
      }
    });

    const result = await chat.sendMessage({ message });
    return result.text || "I'm focusing on your goal. Try again.";
  } catch (error) {
    console.error("Chat failed:", error);
    return "Connection to the bridge interrupted.";
  }
};
