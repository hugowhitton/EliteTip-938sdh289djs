// managerAllStaff.js

// Attach tooltip handlers for all elements with the "tooltip-container" class
document.querySelectorAll('.tooltip-container').forEach(container => {
    const tooltip = container.querySelector('.tooltip-content');
    if (!tooltip) return;
  
    container.addEventListener('mouseenter', () => {
      tooltip.style.display = 'block';
    });
  
    container.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });  