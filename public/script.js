const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const submitButton = form.querySelector("button");

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
  input.disabled = true;
  submitButton.disabled = true;

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

    if (!response.ok) {
      throw new Error(data.error || "Unable to get a response.");
    }

    typingMessage.remove();
    addMessage(data.reply, "bot");
  } catch (error) {
    typingMessage.remove();
    addMessage("Something went wrong. Please try again.", "bot");
    console.error(error);
  } finally {
    input.disabled = false;
    submitButton.disabled = false;
    input.focus();
  }
});