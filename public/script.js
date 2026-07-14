const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messagesContainer = document.querySelector("#messages");
const submitButton = form.querySelector("button");

const conversation = [];

function addMessage(text, type) {
  const message = document.createElement("div");

  message.classList.add("message", `${type}-message`);
  message.textContent = text;

  messagesContainer.appendChild(message);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const userMessage = input.value.trim();

  if (!userMessage) {
    return;
  }

  addMessage(userMessage, "user");

  conversation.push({
    role: "user",
    content: userMessage,
  });

  input.value = "";
  input.disabled = true;
  submitButton.disabled = true;

  const typingMessage = document.createElement("div");
  typingMessage.classList.add("message", "bot-message");
  typingMessage.textContent = "AI is typing...";

  messagesContainer.appendChild(typingMessage);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: conversation,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to get a response.");
    }

    typingMessage.remove();
    addMessage(data.reply, "bot");

    conversation.push({
      role: "assistant",
      content: data.reply,
    });
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