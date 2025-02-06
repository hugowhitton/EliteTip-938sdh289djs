const boxes = document.querySelectorAll('.digit-box');

boxes.forEach((box) => {
  // Prevent letters via the keypress event
  box.addEventListener("keypress", function(e) {
    if (!/[0-9]/.test(e.key)) {
      e.preventDefault();
    }
  });
  
  // Also block paste events (in case a non-digit is pasted)
  box.addEventListener("paste", function(e) {
    e.preventDefault();
  });
  
  // On input, remove any non-digit and ensure only one character
  box.addEventListener("input", function() {
    this.value = this.value.replace(/[^0-9]/g, "").slice(0, 1);
  });
});
