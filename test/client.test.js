const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");

const publicDirectory = path.join(__dirname, "..", "public");

async function createBrowser(fetchImplementation) {
  const [html, script] = await Promise.all([
    readFile(path.join(publicDirectory, "index.html"), "utf8"),
    readFile(path.join(publicDirectory, "script.js"), "utf8"),
  ]);
  const dom = new JSDOM(html.replace('<script src="script.js"></script>', ""), {
    runScripts: "outside-only",
    url: "https://support.example/",
  });
  dom.window.fetch = fetchImplementation;
  dom.window.console.error = () => {};
  dom.window.eval(script);
  return dom;
}

function submitMessage(window, text) {
  const input = window.document.querySelector("#message-input");
  input.value = text;
  window.document.querySelector("#chat-form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true })
  );
}

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("clear chat cancels an active request without appending stale output", async () => {
  let requestSignal;
  const dom = await createBrowser((url, options) => {
    requestSignal = options.signal;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(new dom.window.DOMException("Aborted", "AbortError"));
      });
    });
  });

  submitMessage(dom.window, "Where is my order?");
  dom.window.document.querySelector("#clear-chat").click();
  await nextTask();

  assert.equal(requestSignal.aborted, true);
  assert.equal(
    dom.window.document.querySelectorAll("#messages .message").length,
    1
  );
  assert.match(
    dom.window.document.querySelector("#messages").textContent,
    /Hello!/
  );
  assert.equal(
    dom.window.document.querySelector("#chat-status").textContent,
    "Chat cleared."
  );
});

test("a failed request is not retained in the next conversation payload", async () => {
  const requestBodies = [];
  let requestNumber = 0;
  const dom = await createBrowser(async (url, options) => {
    requestBodies.push(JSON.parse(options.body));
    requestNumber += 1;

    if (requestNumber === 1) {
      return {
        ok: false,
        json: async () => ({ error: "Unable to generate a response." }),
      };
    }

    return {
      ok: true,
      json: async () => ({ reply: "Your order is on its way." }),
    };
  });

  submitMessage(dom.window, "Where is my order?");
  await nextTask();
  submitMessage(dom.window, "Where is my order?");
  await nextTask();

  assert.deepEqual(requestBodies[1].messages, [
    { role: "user", content: "Where is my order?" },
  ]);
});

test("typing and message states expose accessible semantics", async () => {
  const dom = await createBrowser(
    () => new Promise(() => {})
  );
  submitMessage(dom.window, "Hello");

  const typingMessage = dom.window.document.querySelector(".typing-message");
  assert.equal(typingMessage.getAttribute("role"), "status");
  assert.equal(
    typingMessage.getAttribute("aria-label"),
    "Assistant is typing"
  );
  assert.equal(
    [...typingMessage.children].every(
      (dot) => dot.getAttribute("aria-hidden") === "true"
    ),
    true
  );
  assert.equal(
    dom.window.document.querySelector("#messages").getAttribute("role"),
    "log"
  );
});
