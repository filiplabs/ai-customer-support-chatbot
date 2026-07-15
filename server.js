const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Too many requests. Please wait a few minutes before trying again.",
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/chat", chatLimiter);

app.post("/chat", async (req, res) => {
  try {
    const messages = req.body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
  return res.status(400).json({
    error: "Conversation messages are required.",
  });
}

if (messages.length > 10) {
  return res.status(400).json({
    error: "Conversation is too long.",
  });
}

const lastMessage = messages[messages.length - 1];

if (!lastMessage.content || lastMessage.content.length > 500) {
  return res.status(400).json({
    error: "Message must be between 1 and 500 characters.",
  });
}

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions:
        "You are a helpful customer support assistant for an online store. Answer briefly, clearly, and professionally. If you do not know something, recommend contacting a human support agent.",
      input: messages,
    });

    return res.json({
      reply: response.output_text,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Unable to generate a response.",
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});