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

  var container = document.createElement("div");
  container.className = "pando-signup-widget";
  container.innerHTML =
    '<form class="pando-signup-form">' +
    '<input class="pando-signup-email" type="email" name="email" placeholder="you@example.com" required>' +
    '<button class="pando-signup-submit" type="submit">Subscribe</button>' +
    '</form>' +
    '<p class="pando-signup-message" style="display:none;"></p>';

  script.parentNode.insertBefore(container, script.nextSibling);

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
