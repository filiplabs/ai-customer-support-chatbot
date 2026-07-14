const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message?.trim();

    if (!message) {
      return res.status(400).json({
        error: "Message is required.",
      });
    }

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions:
        "You are a helpful customer support assistant for an online store. Answer briefly, clearly, and professionally. If you do not know something, say that a human support agent should be contacted.",
      input: message,
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

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});