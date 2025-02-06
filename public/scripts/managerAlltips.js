// Tooltip adjustments
document.querySelectorAll('.tooltip-container').forEach(container => {
    container.addEventListener('mouseenter', () => {
      const tooltip = container.querySelector('.tooltip-content');
      const rect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      if (rect.left < 0) {
        tooltip.style.left = `${-rect.left + 10}px`;
        tooltip.style.right = 'auto';
      } else if (rect.right > viewportWidth) {
        const overflow = rect.right - viewportWidth;
        tooltip.style.right = `${overflow + 10}px`;
        tooltip.style.left = 'auto';
      } else {
        tooltip.style.left = '';
        tooltip.style.right = '';
      }
    });
    container.addEventListener('mouseleave', () => {
      const tooltip = container.querySelector('.tooltip-content');
      tooltip.style.left = '';
      tooltip.style.right = '';
    });
  });
  
  // Decision handling
  async function handleDecision(tipId, decision) {
    const row = document.getElementById(`tip-${tipId}`);
    const actionsCell = row.querySelector('td:nth-child(5)');
    actionsCell.innerHTML = `
      <div class="status-column">
        <span>Are you sure?</span>
        <div class="status-column">
          <span class="glow-approve" data-tip-id="${tipId}" data-decision="approve">Yes</span>
          <span class="glow-reject" data-tip-id="${tipId}" data-decision="reject">No</span>
        </div>
      </div>
    `;
    attachDecisionHandlers();
  }
  
  function attachDecisionHandlers() {
    document.querySelectorAll('.status-column span.glow-approve, .status-column span.glow-reject').forEach(span => {
      span.addEventListener('click', async (e) => {
        const tipId = span.getAttribute('data-tip-id');
        const decision = span.getAttribute('data-decision');
        // If "No" is clicked, revert back
        if (decision === 'reject' && span.textContent.trim() === 'No') {
          const row = document.getElementById(`tip-${tipId}`);
          const actionsCell = row.querySelector('td:nth-child(5)');
          actionsCell.innerHTML = `
            <div class="status-column">
              <span class="glow-approve" onclick="handleDecision('${tipId}', 'approve')">Approve</span>
              <span class="glow-reject" onclick="handleDecision('${tipId}', 'reject')">Reject</span>
            </div>
          `;
          return;
        }
        try {
          const res = await fetch(`/manager/approve?id=${tipId}&decision=${decision}`, { method: 'GET' });
          const row = document.getElementById(`tip-${tipId}`);
          if (res.ok) {
            if (decision === 'approve') {
              row.querySelector('.status-column').innerHTML = `<span class="status-approved">Approved</span>`;
            } else {
              row.querySelector('.status-column').innerHTML = `<span class="status-unknown">Rejected</span>`;
            }
          } else {
            alert('Error processing the request. Please try again.');
          }
        } catch (error) {
          alert('An error occurred while processing the request.');
        }
      });
    });
  }
  
  attachDecisionHandlers();  