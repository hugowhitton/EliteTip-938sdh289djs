const stripe = Stripe('pk_live_51QSqm0EPe5xWdbEjZNsh0qsjWlQFPNDt8VEUe931oVlt0xyklMUd9chKUheUOgACb4n77kZgTfsJdpfw5CsIa9RZ00xIXZrbID');
const elements = stripe.elements();

function getTipAmountCents() {
  const val = document.querySelector('[name="tipAmount"]').value || '1';
  return parseInt(val) * 100;
}

const paymentRequest = stripe.paymentRequest({
  country: 'CA',
  currency: 'cad',
  total: { label: 'Tip Maid', amount: 100 },
  requestPayerName: true,
  requestPayerEmail: true
});

const prButton = elements.create('paymentRequestButton', {
  paymentRequest,
  style: {
    paymentRequestButton: {
      theme: 'dark',
      height: '40px'
    }
  }
});

paymentRequest.canMakePayment().then((result) => {
  if (result) {
    prButton.mount('#payment-request-button');
  } else {
    document.getElementById('payment-request-button').style.display = 'none';
  }
});

paymentRequest.on('paymentmethod', async (ev) => {
  try {
    const roomNumber = document.querySelector('[name="roomNumber"]').value || 'N/A';
    const tipDollars = document.querySelector('[name="tipAmount"]').value || '1';

    const createIntentRes = await fetch('/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipAmount: tipDollars, roomNumber })
    });
    const { clientSecret, error } = await createIntentRes.json();
    if (error) {
      ev.complete('fail');
      alert(error);
      return;
    }

    const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(
      clientSecret,
      { payment_method: ev.paymentMethod.id },
      { handleActions: false }
    );

    if (confirmError) {
      ev.complete('fail');
      alert(confirmError.message);
      return;
    }
    ev.complete('success');

    if (paymentIntent.status === 'requires_action') {
      const { error: actionError, paymentIntent: updatedIntent } =
        await stripe.confirmCardPayment(clientSecret);
      if (actionError) {
        alert(actionError.message);
        return;
      }
      alert(`Payment ${updatedIntent.status}`);
    } else {
      alert(`Payment ${paymentIntent.status}`);
    }
  } catch (err) {
    ev.complete('fail');
    alert(err.message);
  }
});