const form = document.querySelector('form');
const countryCodeInput = document.getElementById('countryCode');
const phoneNumberInput = document.getElementById('phoneNumber');
form.addEventListener('submit', (e) => {
  const countryCodeRegex = /^\+\d{1,3}$/;
  const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
  let isValid = true;
  if (!countryCodeRegex.test(countryCodeInput.value)) {
    showError(countryCodeInput, 'Invalid country code. Must start with + and digits.');
    isValid = false;
  }
  if (!phoneRegex.test(phoneNumberInput.value)) {
    showError(phoneNumberInput, 'Phone number must follow the format xxx-xxx-xxxx.');
    isValid = false;
  }
  if (!isValid) e.preventDefault();
});
const showError = (input, message) => {
  const error = document.createElement('p');
  error.textContent = message;
  error.className = 'error-message';
  error.style.color = 'red';
  error.style.fontSize = '0.9rem';
  input.insertAdjacentElement('afterend', error);
};