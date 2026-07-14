const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");

function addMessage(text, type) {
  const message = document.createElement("div");

  message.classList.add("message", `${type}-message`);
  message.textContent = text;

  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const userMessage = input.value.trim();

  if (!userMessage) {
    return;
  }

  addMessage(userMessage, "user");
  input.value = "";

  // AI is typing...
  const typingMessage = document.createElement("div");
  typingMessage.classList.add("message", "bot-message");
  typingMessage.textContent = "AI is typing...";

  messages.appendChild(typingMessage);
  messages.scrollTop = messages.scrollHeight;

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userMessage,
      }),
    });

    const data = await response.json();

    typingMessage.remove();

    addMessage(data.reply, "bot");
  } catch (error) {
    typingMessage.remove();

    addMessage("Something went wrong. Please try again.", "bot");
  }
});