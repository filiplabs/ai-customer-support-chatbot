const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messagesContainer = document.querySelector("#messages");
const submitButton = form.querySelector('button[type="submit"]');
const clearButton = document.querySelector("#clear-chat");
const chatStatus = document.querySelector("#chat-status");
const initialMessage = messagesContainer.firstElementChild.textContent.trim();

const conversation = [];
let activeRequestController = null;

function scrollToLatestMessage() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addMessage(text, type) {
  const message = document.createElement("div");

  message.classList.add("message", `${type}-message`);
  message.textContent = text;
  const sender = type === "user" ? "You" : type === "bot" ? "Assistant" : "Error";
  message.setAttribute("aria-label", `${sender}: ${text}`);

  if (type === "error") {
    message.setAttribute("role", "alert");
  }

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
  typingMessage.setAttribute("role", "status");
  typingMessage.setAttribute("aria-label", "Assistant is typing");

  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement("span");
    dot.classList.add("typing-dot");
    dot.setAttribute("aria-hidden", "true");
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
  const requestController = new AbortController();
  activeRequestController = requestController;

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: conversation,
      }),
      signal: requestController.signal,
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

    const lastMessage = conversation.at(-1);
    if (lastMessage?.role === "user" && lastMessage.content === userMessage) {
      conversation.pop();
    }

    if (error.name !== "AbortError") {
      addMessage(
        "Sorry, the assistant is currently unavailable. Please try again.",
        "error"
      );

      console.error("Chat request failed:", error);
    }
  } finally {
    if (activeRequestController === requestController) {
      activeRequestController = null;
      setLoading(false);
      input.focus();
    }
  }
});

clearButton.addEventListener("click", () => {
  activeRequestController?.abort();
  activeRequestController = null;
  conversation.length = 0;
  messagesContainer.replaceChildren();
  addMessage(initialMessage, "bot");
  input.value = "";
  setLoading(false);
  chatStatus.textContent = "Chat cleared.";
  input.focus();
});
