// public/scripts/verify.js
document.addEventListener("DOMContentLoaded", function() {
  const digits = document.querySelectorAll('.digit-box');
  const verifyForm = document.getElementById('verifyForm');
  const finalCodeEl = document.getElementById('finalCode');

  // Attach event listeners to each digit box
  digits.forEach((digit, idx) => {
    // Allow only digit keys on keypress
    digit.addEventListener('keypress', function(e) {
      if (!/[0-9]/.test(e.key)) {
        e.preventDefault();
      }
    });
    
    // On input, remove non-digits and auto-advance
    digit.addEventListener('input', function() {
      // Keep only digits and only the first one
      let sanitized = this.value.replace(/[^0-9]/g, '').slice(0, 1);
      this.value = sanitized;
      if (sanitized.length === 1 && idx < digits.length - 1) {
        digits[idx + 1].focus();
      }
    });
    
    // Prevent paste events entirely
    digit.addEventListener('paste', function(e) {
      e.preventDefault();
    });
  });

  verifyForm.addEventListener('submit', function(e) {
    // Concatenate the value of all digit boxes
    let code = "";
    digits.forEach(function(box) {
      code += box.value;
    });
    console.log("Final code submitted:", code); // Debug output in console
    finalCodeEl.value = code;
  });
});