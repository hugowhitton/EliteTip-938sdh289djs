document.addEventListener("DOMContentLoaded", function() {
    const boxes = document.querySelectorAll('.digit-box');
    
    boxes.forEach((box, index) => {
      // Prevent non-digit keys on keydown.
      box.addEventListener('keydown', function(e) {
        const allowedKeys = ["Backspace", "ArrowLeft", "ArrowRight", "Tab", "Delete"];
        if (allowedKeys.includes(e.key)) return;
        // If the key is not a single digit, prevent it.
        if (!/^\d$/.test(e.key)) {
          e.preventDefault();
        }
      });
      
      // On input, sanitize to a single digit and auto-advance.
      box.addEventListener('input', function() {
        // Remove any non-digits and keep only the first digit.
        const sanitized = this.value.replace(/[^0-9]/g, "").slice(0, 1);
        this.value = sanitized;
        // If a digit is present and this isn't the last box, focus the next.
        if (sanitized.length === 1 && index < boxes.length - 1) {
          boxes[index + 1].focus();
        }
      });
      
      // Prevent paste events (to block non-digit content)
      box.addEventListener('paste', function(e) {
        e.preventDefault();
      });
    });
  });
  