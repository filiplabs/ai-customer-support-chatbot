const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messagesContainer = document.querySelector("#messages");
const submitButton = form.querySelector('button[type="submit"]');
const clearButton = document.querySelector("#clear-chat");

const conversation = [];

function scrollToLatestMessage() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addMessage(text, type) {
  const message = document.createElement("div");

  message.classList.add("message", `${type}-message`);
  message.textContent = text;

  messagesContainer.appendChild(message);
  scrollToLatestMessage();

  return message;
}

function createTypingIndicator() {
  const typingMessage = document.createElement("div");

  typingMessage.classList.add(
    "message",
    "bot-message",
    "typing-message"
  );

  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement("span");
    dot.classList.add("typing-dot");
    typingMessage.appendChild(dot);
  }

  messagesContainer.appendChild(typingMessage);
  scrollToLatestMessage();

  return typingMessage;
}

function setLoading(isLoading) {
  input.disabled = isLoading;
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Sending..." : "Send";
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
  setLoading(true);

  const typingMessage = createTypingIndicator();

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

    addMessage(
      "Sorry, the assistant is currently unavailable. Please try again.",
      "error"
    );

    console.error("Chat request failed:", error);
  } finally {
    setLoading(false);
    input.focus();
  }
});

clearButton.addEventListener("click", () => {
  conversation.length = 0;

  messagesContainer.innerHTML = `
    <div class="message bot-message">
      Hello! I can help with delivery, returns, payments, and general store questions.
    </div>
  `;

  input.value = "";
  setLoading(false);
  input.focus();
});