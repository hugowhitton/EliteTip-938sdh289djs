document.addEventListener("DOMContentLoaded", function() {
  const toggleBtns = document.querySelectorAll('.toggle-password-btn');
  toggleBtns.forEach(btn => {
    const targetId = btn.getAttribute('data-target');
    const targetInput = document.getElementById(targetId);
    if (!targetInput) return;
    
    btn.addEventListener('mousedown', function() {
      targetInput.type = 'text';
    });
    
    // When you release the mouse button, revert back to password type.
    btn.addEventListener('mouseup', function() {
      targetInput.type = 'password';
    });
    
    // Also revert if the mouse leaves the button (in case the user drags the mouse away)
    btn.addEventListener('mouseleave', function() {
      targetInput.type = 'password';
    });
  });
});
