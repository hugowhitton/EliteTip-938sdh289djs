document.getElementById('imageUpload').addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (!file) {
    console.log("No file selected.");
    return;
  }
  console.log("File Selected for Upload:", file.name);

  const formData = new FormData(document.getElementById('editForm'));
  // The form data now includes the hidden "email" field
  
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload", true);
  xhr.withCredentials = true; // ensures cookies are sent if session exists

  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        const data = JSON.parse(xhr.responseText);
        console.log("Server Response:", data);
        if (data.url) {
          console.log("Updating Profile Picture:", data.url);
          const profilePicEl = document.getElementById('profilePic');
          if (profilePicEl) {
            profilePicEl.src = data.url + "?timestamp=" + new Date().getTime();
          }
          const profileImageUrlEl = document.getElementById('profileImageUrl');
          if (profileImageUrlEl) {
            profileImageUrlEl.value = data.url;
          }
        } else {
          console.error("No URL received from server.");
        }
      } catch (err) {
        console.error("Error parsing server response:", err);
      }
    } else {
      console.error("Upload failed with status:", xhr.status, xhr.statusText);
    }
  };

  xhr.onerror = function() {
    console.error("An error occurred during the upload.");
  };

  xhr.send(formData);
});

document.getElementById('editForm').addEventListener('submit', function (e) {
    e.preventDefault(); // Prevent immediate submission
  
    // Grab form fields
    const firstName = document.getElementById('firstName');
    const lastName = document.getElementById('lastName');
    const email = document.getElementById('email');
    const phoneNumber = document.getElementById('phoneNumber');
  
    // Select error containers (if they exist)
    const firstNameError = document.getElementById('firstNameError');
    const lastNameError = document.getElementById('lastNameError');
    const emailError = document.getElementById('emailError');
    const phoneError = document.getElementById('phoneError');
  
    // Remove previous errors
    [firstNameError, lastNameError, emailError, phoneError].forEach(errorElement => {
      if (errorElement) errorElement.remove();
    });
  
    // Original values
    const original = {
      firstName: "<%= staff.firstName %>",
      lastName: "<%= staff.lastName %>",
      email: "<%= staff.email %>",
      phoneNumber: "<%= staff.phoneNumber %>"
    };
  
    // Current values
    const current = {
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      email: email.value.trim(),
      phoneNumber: phoneNumber.value.trim()
    };
  
    // Validation rules
    const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let errors = {};
  
    // Validation checks
    if (!current.firstName) errors.firstNameError = 'First name is required.';
    if (!current.lastName) errors.lastNameError = 'Last name is required.';
    if (!emailRegex.test(current.email)) errors.emailError = 'Invalid email format.';
    if (!phoneRegex.test(current.phoneNumber)) errors.phoneError = 'Phone number must be in xxx-xxx-xxxx format.';
  
    // Display errors if there are any
    Object.entries(errors).forEach(([field, message]) => {
      const errorMessage = document.createElement('p');
      errorMessage.className = 'error-message';
      errorMessage.id = field;
      errorMessage.textContent = message;
  
      switch (field) {
        case 'firstNameError':
          firstName.insertAdjacentElement('afterend', errorMessage);
          break;
        case 'lastNameError':
          lastName.insertAdjacentElement('afterend', errorMessage);
          break;
        case 'emailError':
          email.insertAdjacentElement('afterend', errorMessage);
          break;
        case 'phoneError':
          phoneNumber.insertAdjacentElement('afterend', errorMessage);
          break;
      }
    });
  
    // Stop execution if there are validation errors
    if (Object.keys(errors).length > 0) {
      return;
    }
  
    // If validation passes, proceed to check for changes
    const changes = [];
    for (let key in current) {
    if (current[key] !== original[key]) {
      const fieldName = key.replace(/([A-Z])/g, ' $1').toLowerCase();
      const capitalizedField = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  
      changes.push(`
        <div class="confirm-modal-section">
          <p class="field-title">${capitalizedField}</p>
          <p class="old-value">Old: ${original[key]}</p>
          <p class="new-value">New: ${current[key]}</p>
        </div>
      `);
    }
  }
  
  
  if (changes.length === 0) {
    showNoChangesMessage();
    return;
  }
  
  // Populate and show confirmation modal
  document.getElementById('confirmMessage').innerHTML = changes.join('');
  const confirmMessageEl = document.getElementById('confirmMessage');
if (confirmMessageEl) {
  confirmMessageEl.innerHTML = changes.join('');
} else {
  console.warn("confirmMessage element not found.");
}
          document.getElementById('confirmModal').style.display = 'flex';
  
          document.getElementById('confirmSubmit').onclick = function () {
            document.getElementById('confirmModal').style.display = 'none';
            document.getElementById('editForm').submit();
          };
  
          document.getElementById('cancelSubmit').onclick = function () {
            document.getElementById('confirmModal').style.display = 'none';
          };
        });
  
  // Function to show the no changes message
  function showNoChangesMessage() {
    const messageBox = document.createElement('div');
    messageBox.className = 'no-changes-message';
    messageBox.innerHTML = `
      <p>No changes were made.</p>
      <button onclick="this.parentElement.remove()">OK</button>
    `;
  
    document.body.appendChild(messageBox);
  
    // Auto remove after 3 seconds
    setTimeout(() => {
      if (messageBox) messageBox.remove();
    }, 3000);
  }
  
  // Automatic phone number formatting
  document.getElementById('phoneNumber').addEventListener('input', function (e) {
    let input = e.target.value.replace(/\D/g, ''); // Remove non-numeric characters
    if (input.length > 3 && input.length <= 6) {
      input = `${input.slice(0, 3)}-${input.slice(3)}`;
    } else if (input.length > 6) {
      input = `${input.slice(0, 3)}-${input.slice(3, 6)}-${input.slice(6, 10)}`;
    }
    e.target.value = input;
  });
  
  // Prevent deleting only the dash when backspacing
  document.getElementById('phoneNumber').addEventListener('keydown', function (e) {
    if (e.key === 'Backspace') {
      const cursorPos = e.target.selectionStart;
      if (cursorPos > 0 && e.target.value[cursorPos - 1] === '-') {
        const newValue = e.target.value.slice(0, cursorPos - 2) + e.target.value.slice(cursorPos);
        e.target.value = newValue;
        e.target.setSelectionRange(cursorPos - 1, cursorPos - 1);
        e.preventDefault();
      }
    }
  });