const express = require('express');
const router = express.Router();
const geminiService = require('./geminiService');

// Middleware to ensure userId is present (simple version)
const requireUser = (req, res, next) => {
  const { userId } = req.body;
  if (!userId) {
     // For demo purposes, we can generate a temporary ID if missing, 
     // but ideally we enforce it.
     req.body.userId = "anonymous_" + Date.now();
  }
  next();
};

// POST /api/predict - Context Setup & Analysis
router.post('/predict', requireUser, async (req, res) => {
  try {
    const { userId, routine, goal, daysRemaining } = req.body;
    if (!routine || !goal) return res.status(400).json({ error: "Routine and Goal required" });

    // In this flow, predict sets up the context for the user
    const prediction = await geminiService.predictOutcome(userId, routine, goal, daysRemaining);
    res.json({ success: true, prediction });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI Prediction failed" });
  }
});

// POST /api/daily-actions - Generate Tasks (Stateful or Stateless)
router.post('/daily-actions', requireUser, async (req, res) => {
  try {
    const { userId, routine, goal, dayContext, daysRemaining } = req.body;
    
    // Pass all context to ensure stateless robustness if session missing
    const result = await geminiService.generateDailyActions(userId, routine, goal, dayContext, daysRemaining);
    res.json({ success: true, tasks: result.tasks, quote: result.quote });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate actions" });
  }
});

// POST /api/trajectory - Image Generation (Future/Routine)
router.post('/trajectory', requireUser, async (req, res) => {
  try {
    const { userId, imageBase64, routine, goal, type, years } = req.body; 
    // type: 'FUTURE_SELF' | 'CURRENT_ROUTINE'
    
    let resultImage;
    if (type === 'FUTURE_SELF') {
        resultImage = await geminiService.generateFutureSelf(userId, imageBase64, goal);
    } else {
        resultImage = await geminiService.generateCurrentRoutineImage(userId, imageBase64, routine, years);
    }
    
    res.json({ success: true, image: resultImage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Trajectory calculation failed" });
  }
});

module.exports = router;