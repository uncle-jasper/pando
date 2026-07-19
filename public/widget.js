/*
 * Pando newsletter signup widget.
 * Embed with: <script src="https://pando.danbenson.me/widget.js"></script>
 * No dependencies, no build step — same zero-framework spirit as tree. Renders a
 * plain <form> right where this script tag sits, and posts to Pando's CORS-restricted
 * /api/embed/subscribe endpoint. Style it from the host page with the pando-* classes.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var origin = new URL(script.src).origin;

  // Host pages (like danbenson.me) may store their own light/dark choice rather than
  // purely following the OS-level prefers-color-scheme — e.g. danbenson.me keeps a
  // manual override in localStorage under "db-theme" that wins over the OS setting.
  // Falling back to prefers-color-scheme (via a "pando-theme-dark" class either way)
  // keeps this correct for embeds on other sites that don't set that key.
  function detectTheme() {
    var stored = null;
    try { stored = localStorage.getItem("db-theme"); } catch (e) {}
    return stored === "dark" || stored === "light"
      ? stored
      : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  var container = document.createElement("div");
  container.className = "pando-signup-widget pando-theme-" + detectTheme();
  container.innerHTML =
    '<form class="pando-signup-form">' +
    '<input class="pando-signup-email" type="email" name="email" placeholder="you@example.com" required>' +
    '<button class="pando-signup-submit" type="submit">Subscribe</button>' +
    '</form>' +
    '<p class="pando-signup-message" style="display:none;"></p>';

  script.parentNode.insertBefore(container, script.nextSibling);

  // Host pages can flip light/dark live (no reload) via their own toggle button —
  // e.g. danbenson.me instantly restyles the whole page when clicked. Watching for
  // class/attribute changes on <html>/<body> catches that same moment, so the widget
  // restyles in step with the rest of the page instead of staying frozen at load-time.
  if (window.MutationObserver) {
    var lastTheme = detectTheme();
    var observer = new MutationObserver(function () {
      var theme = detectTheme();
      if (theme === lastTheme) return;
      lastTheme = theme;
      container.classList.remove("pando-theme-light", "pando-theme-dark");
      container.classList.add("pando-theme-" + theme);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
  }

  var form = container.querySelector(".pando-signup-form");
  var emailInput = container.querySelector(".pando-signup-email");
  var submitBtn = container.querySelector(".pando-signup-submit");
  var message = container.querySelector(".pando-signup-message");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    submitBtn.disabled = true;
    message.style.display = "none";

    fetch(origin + "/api/embed/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput.value }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        submitBtn.disabled = false;
        message.style.display = "block";
        if (result.ok) {
          form.style.display = "none";
          message.textContent = "Almost there — check your inbox to confirm.";
        } else {
          message.textContent = result.body.error || "Something went wrong.";
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        message.style.display = "block";
        message.textContent = "Something went wrong. Try again shortly.";
      });
  });
})();
