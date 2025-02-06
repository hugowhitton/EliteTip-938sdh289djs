/****************************************************
 * server.js - EliteTip
 *   - Session persists 24h
 *   - No removal of any routes/logic
 ****************************************************/
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { sendEmail } = require('./mailer');
const http = require('http');   
const socketIo = require('socket.io');  
const app = express();  
const server = http.createServer(app);  
const io = socketIo(server);  
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    // Use the session user if available; otherwise use the provided email from the form
    const email = (req.session && req.session.user && req.session.user.email) || req.body.email;
    if (!email) {
      console.error("Upload Error: No user information provided.");
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!req.file) {
      console.error("No file received.");
      return res.status(400).json({ error: 'No file received' });
    }
    
    console.log("Uploading file to Cloudinary:", req.file.path);
    const result = await cloudinary.uploader.upload(req.file.path);
    console.log("Upload Success:", result.secure_url);
    
    // Update the staff document based on the email
    const user = await Staff.findOneAndUpdate(
      { email: email },
      { profileImage: result.secure_url },
      { new: true }
    );
    
    console.log("Profile Image Updated:", user ? user.profileImage : 'No user found');
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ✅ Ensure Express is properly set up
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static('public'));
app.use(cors());
// Middleware to generate a nonce for each request
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
});

// Helmet with improved CSP settings
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'", 
          "https://js.stripe.com" // Allow Stripe scripts
        ],
        scriptSrcElem: [
          "'self'", 
          "https://js.stripe.com"
        ],
        styleSrc: [
          "'self'", 
          "https://fonts.googleapis.com", // Allow Google Fonts
          "'unsafe-inline'" // Allow inline styles (safe)
        ],
        fontSrc: [
          "'self'", 
          "https://fonts.gstatic.com"
        ],
        imgSrc: [
          "'self'", 
          "data:", 
          "https://res.cloudinary.com"
        ],
        frameSrc: [
          "'self'", 
          "https://js.stripe.com"
        ],
        connectSrc: [
          "'self'", 
          "https://api.stripe.com", 
          "https://res.cloudinary.com"
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    }
  })
);
app.use(compression());
app.use(limiter);
app.use(morgan('dev'));

// ✅ Database connection
mongoose
  .then(() => console.log('MongoDB connected.'))
  .catch((err) => console.error('MongoDB connection error:', err));

// STRIPE KEY
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// SCHEMAS
const staffSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { 
    type: String, 
    required: [true, 'Email is required.'], 
    unique: true,
    lowercase: true,
    trim: true,
    match: [ /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please fill a valid email address.' ]
  },  
  employeeNumber: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true, unique: true },
  countryCode: { type: String, default: '+1' }, // Add default country code
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'maid' },
  isEmailVerified: { type: Boolean, default: false },
  verificationCode: { type: String },
  pendingEmail: { type: String },
  pendingEmailCode: { type: String },
  profilePicture: { type: String, default: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20512%20512%27%3E%3Ccircle%20cx%3D%27256%27%20cy%3D%27256%27%20r%3D%27256%27%20fill%3D%27%23333%27%2F%3E%3Ccircle%20cx%3D%27256%27%20cy%3D%27192%27%20r%3D%2764%27%20fill%3D%27%23aaa%27%2F%3E%3Cpath%20d%3D%27M192%20320h128c35.3%200%2064%2028.7%2064%2064v64H128v-64c0-35.3%2028.7-64%2064-64z%27%20fill%3D%27%23aaa%27%2F%3E%3C%2Fsvg%3E' 
  }
});

// Compound index for unique firstName + lastName
staffSchema.index({ firstName: 1, lastName: 1 }, { unique: true });

const Staff = mongoose.model('Staff', staffSchema);

const tipSchema = new mongoose.Schema({
  roomNumber: { type: String, required: true },
  amount: { type: Number, required: true },
  claimed: { type: Boolean, default: false },
  claimedBy: { type: String },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' }, // Add this
  createdAt: { type: Date, default: Date.now },
  approvalRequested: { type: Boolean, default: false },
  requestedBy: { type: String },
  approved: { type: Boolean, default: false },
  tipRejected: { type: Boolean, default: false },
  approvedBy: { type: String }, // New field for approver's email
  approvedAt: { type: Date }, // New field for approval date
});
const Tip = mongoose.model('Tip', tipSchema);

// EXPRESS SETUP
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());

// SESSION: 24h
app.use(
  session({
    secret: 'STRING_RANDOM',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
  })
);

// NODEMAILER
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: '830662001@smtp-brevo.com',
    pass: 'OCIzwgdZ1LXFrabK',
  },
});

// Helper: showError and showNotice
function showError(res, msg) {
  return res.render('error', { msg });
}
function showNotice(res, title, msg, editProfileLink = false) {
  return res.render('notice', { title, msg, editProfileLink });
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return showError(res, 'Not logged in.');
}


// ========== CUSTOMER (TIPPING) ========== //

app.get('/', (req, res) => {
  // If someone is logged in as staff, they never see the tipping form
  if (req.session.user) {
    return res.redirect('/staff/dashboard');
  }
  // Otherwise, a guest sees index.ejs
  res.render('index', { user: null });
});

app.post('/create-checkout-session', async (req, res) => {
  // BLOCK staff from tipping
  if (req.session.user) {
    return showError(res, 'Staff cannot create a tip checkout session.');
  }
  try {
    const { roomNumber, tipAmount } = req.body;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: { name: `Tip for room ${roomNumber}` },
            unit_amount: parseInt(tipAmount) * 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'http://localhost:3000/success?room=' + roomNumber + '&amount=' + tipAmount,
      cancel_url: 'http://localhost:3000/cancel',
    });
    res.redirect(session.url);
  } catch (err) {
    console.error(err);
    return showError(res, 'Error creating Stripe session.');
  }
});

app.get('/cancel', (req, res) => {
  return showError(res, 'Payment canceled or failed.');
});

app.get('/success', async (req, res) => {
  const { room, amount } = req.query;
  try {
    await Tip.create({ roomNumber: room, amount: parseFloat(amount), claimed: false });
    res.render('success', { room, amount });
  } catch (error) {
    console.error(error);
    return showError(res, 'Error recording tip.');
  }
});

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { roomNumber, tipAmount } = req.body;
    const amount = parseInt(tipAmount) * 100;

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'cad',
      automatic_payment_methods: { enabled: true },
      metadata: { roomNumber },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: error.message });
  }
});

app.get('/disclaimer', (req, res) => {
  res.render('disclaimer');
});

// ========== STAFF SIGNUP/LOGIN/VERIFY ========== //

//maid signup
app.get('/staff/signup', (req, res) => {
  res.render('signup', { formData: {}, errorMsgs: {} });
});

app.post('/staff/signup', async (req, res) => {
  const { firstName, lastName, email, employeeNumber, password, confirmPassword, phoneNumber } = req.body;
  const formData = { firstName, lastName, email, employeeNumber, phoneNumber };
  const errorMsgs = {};

  if (password !== confirmPassword) {
    errorMsgs.passwordError = 'Passwords do not match.';
  }

    // Validate phone number format
    const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
    if (!phoneRegex.test(phoneNumber)) {
      errorMsgs.phoneNumberFormatError = 'Phone number must follow the format 123-456-7890.';
    }
  
    // Combine country code and phone number
    const fullPhoneNumber = `${req.body.countryCode}${req.body.phoneNumber}`;
    
  try {
    // Check for duplicates
    if (await Staff.findOne({ firstName, lastName })) {
      errorMsgs.firstLastNameError = 'A user with the same first and last name already exists.';
    }

    if (await Staff.findOne({ email })) {
      errorMsgs.emailError = 'Email is already in use.';
    }

    if (await Staff.findOne({ phoneNumber })) {
      errorMsgs.phoneNumberError = 'Phone number is already in use.';
    }

    if (await Staff.findOne({ employeeNumber })) {
      errorMsgs.employeeNumberError = 'Employee number is already in use.';
    }

    // If there are errors, re-render the form with errors and form data
    if (Object.keys(errorMsgs).length > 0) {
      return res.render('signup', { formData, errorMsgs });
    }

  // Instead of creating the user here, generate a verification code and store all data in the session:
  const passwordHash = await bcrypt.hash(password, 10);
  const code = '' + Math.floor(1000 + Math.random() * 9000);

  const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes from now

  // Save temporary user data in session
  req.session.tempUser = {
    firstName,
    lastName,
    email,
    employeeNumber,
    phoneNumber,
    passwordHash,
    verificationCode: code,
    role: 'maid',
    expiresAt  // store expiration timestamp
  };

    await sendEmail(
      email,
      'EliteTip: Your Verification Code',
      `Hello ${firstName}, your verification code is: ${code}`
    );

    res.redirect(`/staff/verify?email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('Error during signup:', err);
    return showError(res, 'Error signing up. Please try again later.');
  }
});

// Manager signup
app.get('/manager/signup', (req, res) => {
  const { code } = req.query;
  if (code !== 'SUPERSECRET123') {
    return showError(res, 'Unauthorized. Wrong or missing code.');
  }
  res.render('managerSignup', { formData: {}, errorMsgs: {} });
});

app.post('/manager/signup', async (req, res) => {
  const { firstName, lastName, email, employeeNumber, password, confirmPassword, phoneNumber } = req.body;

  const formData = { firstName, lastName, email, employeeNumber, phoneNumber };
  const errorMsgs = {};

  if (password !== confirmPassword) {
    errorMsgs.passwordError = 'Passwords do not match.';
  }

  try {
    // Check for duplicates
    if (await Staff.findOne({ firstName, lastName })) {
      errorMsgs.firstLastNameError = 'A user with the same first and last name already exists.';
    }

    if (await Staff.findOne({ email })) {
      errorMsgs.emailError = 'Email is already in use.';
    }

    if (await Staff.findOne({ phoneNumber })) {
      errorMsgs.phoneNumberError = 'Phone number is already in use.';
    }

    if (await Staff.findOne({ employeeNumber })) {
      errorMsgs.employeeNumberError = 'Employee number is already in use.';
    }

    // If there are any errors, render the form with errors and form data
    if (Object.keys(errorMsgs).length > 0) {
      return res.render('managerSignup', { formData, errorMsgs });
    }

    // Otherwise, proceed to create the manager
    const passwordHash = await bcrypt.hash(password, 10);
    const code = '' + Math.floor(1000 + Math.random() * 9000);

    await Staff.create({
      firstName,
      lastName,
      email,
      employeeNumber,
      phoneNumber,
      passwordHash,
      role: 'manager',
      isEmailVerified: false,
      verificationCode: code,
    });

    await sendEmail(
      email,
      'EliteTip Manager Verification Code',
      `Hello ${firstName}, your manager verification code is: ${code}`
    );

    res.redirect(`/staff/verify?email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('Error during manager signup:', err);
    return showError(res, 'Error signing up. Please try again later.');
  }
});

// staff/verify GET
app.get('/staff/verify', (req, res) => {
  const { email } = req.query || {};
  res.render('verify', { defaultEmail: email || '' });
});

// staff/verify POST
app.post('/staff/verify', async (req, res) => {
  const { email, code } = req.body;

  // Ensure temporary signup data exists and matches the email
  if (!req.session.tempUser || req.session.tempUser.email !== email) {
    return showError(res, 'No pending registration found. Please sign up again.');
  }

  const tempUser = req.session.tempUser;

  // Check if the temporary data has expired
  if (Date.now() > tempUser.expiresAt) {
    // Expired—delete the temporary data and notify the user
    delete req.session.tempUser;
    return showError(res, 'Verification expired. Please sign up again.');
  }

  // Check if the verification code matches
  if (tempUser.verificationCode !== code) {
    return res.render('verify', {
      defaultEmail: email,
      errorMsg: 'Invalid code. Please try again.'
    });
  }

  try {
    // Create the user in the database now that verification is successful
    const newStaff = await Staff.create({
      firstName: tempUser.firstName,
      lastName: tempUser.lastName,
      email: tempUser.email,
      employeeNumber: tempUser.employeeNumber,
      phoneNumber: tempUser.phoneNumber,
      passwordHash: tempUser.passwordHash,
      role: tempUser.role,
      isEmailVerified: true,
      verificationCode: undefined
    });

    // Remove temporary user data from the session
    delete req.session.tempUser;

    // Set session user information so the user remains logged in
    req.session.user = {
      email: newStaff.email,
      role: newStaff.role,
      firstName: newStaff.firstName,
      lastName: newStaff.lastName,
      employeeNumber: newStaff.employeeNumber,
      profileImage: newStaff.profileImage
    };

    return showNotice(res, 'Verified!', 'Your email is verified.');
  } catch (err) {
    console.error(err);
    return showError(res, 'Error verifying code.');
  }
});

// staff/login GET
app.get('/staff/login', (req, res) => {
  res.render('login');
});

// staff/login POST
app.post('/staff/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await Staff.findOne({ email });
    if (!user) {
      return showError(res, 'Invalid email or password.');
    }
    if (!user.isEmailVerified) {
      return res.render('verify', {
        defaultEmail: user.email,
        errorMsg: 'Please enter the 4-digit code we emailed you.'
      });
    }    

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return showError(res, 'Invalid email or password.');
    }

    req.session.user = {
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeNumber: user.employeeNumber,
    };    
  
    res.redirect('/staff/dashboard');
  } catch (err) {
    console.error(err);
    return showError(res, 'Error logging in.');
  }
});

app.get('/staff/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// staff/dashboard
app.get('/staff/dashboard', async (req, res) => {
  if (!req.session.user) {
    return showError(res, 'Not logged in.');
  }

  try {
    const staff = await Staff.findOne({ email: req.session.user.email });

    if (!staff) {
      return showError(res, 'Staff not found.');
    }

    console.log(`🖼️ Debug: Profile Image for ${staff.email} →`, staff.profileImage);

    req.session.user.profileImage = staff.profilePicture || 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20512%20512%27%3E%3Ccircle%20cx%3D%27256%27%20cy%3D%27256%27%20r%3D%27256%27%20fill%3D%27%23333%27%2F%3E%3Ccircle%20cx%3D%27256%27%20cy%3D%27192%27%20r%3D%2764%27%20fill%3D%27%23aaa%27%2F%3E%3Cpath%20d%3D%27M192%20320h128c35.3%200%2064%2028.7%2064%2064v64H128v-64c0-35.3%2028.7-64%2064-64z%27%20fill%3D%27%23aaa%27%2F%3E%3C%2Fsvg%3E';

    const { email, role, firstName, lastName, employeeNumber, profileImage } = req.session.user;
    res.render('staffDashboard', { 
      user: { email, role, firstName, lastName, employeeNumber, profileImage } 
    });

  } catch (err) {
    console.error('Error loading staff dashboard:', err);
    return showError(res, 'Error loading dashboard.');
  }
});

// staff/tips => see only unclaimed tips
app.get('/staff/tips', async (req, res) => {
  if (!req.session.user) {
    return showError(res, 'Not logged in.');
  }
  
  try {
    const allTips = await Tip.find().sort({ createdAt: -1 });
    console.log("Tips found:", allTips);    

    let tipsDB = {};
    allTips.forEach(tip => {
      if (!tipsDB[tip.roomNumber]) {
        tipsDB[tip.roomNumber] = [];
      }
      tipsDB[tip.roomNumber].push(tip);
    });

    res.render('staffTips', { tipsDB, role: req.session.user.role });
  } catch (err) {
    console.error(err);
    return showError(res, 'Error loading tips.');
  }
});

app.get('/manager/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return showError(res, 'Error logging out.');
    }
    res.redirect('/'); // Redirect to home after logout
  });
});

// staff/claim => request manager approval
app.get('/staff/claim', async (req, res) => {
  if (!req.session.user) {
    return showError(res, 'Not logged in.');
  }
  if (req.session.user.role === 'manager') {
    return showError(res, 'Managers cannot claim tips.');
  }

  const { room } = req.query;
  try {
    // Find unclaimed + unrequested tips for that room
    const unclaimedTips = await Tip.find({
      roomNumber: room,
      claimed: false,
      approvalRequested: false,
      approved: false
    }).sort({ createdAt: -1 });

    if (!unclaimedTips.length) {
      return showNotice(res, 'No Tips', 'No unclaimed tips for that room or already requested.');
    }

    // Mark the first unclaimed tip as "pending approval"
    const tip = unclaimedTips[0];
    tip.approvalRequested = true;
    tip.requestedBy = `${req.session.user.firstName} ${req.session.user.lastName}`;
    tip.claimed = false;
    tip.approved = false;
    tip.tipRejected = false;
    await tip.save();

    return showNotice(res, 'Claim Requested', 'Your tip claim is now pending manager approval.');
  } catch (err) {
    console.error(err);
    return showError(res, 'Error claiming tip.');
  }
});

app.get('/manager/all-tips', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'manager') {
    return showError(res, 'Unauthorized. Manager only.');
  }

  try {
    // Only tips that are requested, approved, or rejected
    const allTips = await Tip.find({
      $or: [
        { approvalRequested: true },
        { approved: true },
        { tipRejected: true }
      ]
    }).sort({ createdAt: -1 });

    // For each tip, see if requestedBy is "FirstName LastName"
    for (const tip of allTips) {
      if (tip.requestedBy) {
        const [fName, lName] = tip.requestedBy.split(' ', 2); // e.g. "Hugo" "Whitton"
        // Find staff by first & last name
        const staffDoc = await Staff.findOne({ firstName: fName, lastName: lName });
        if (staffDoc) {
          // Attach staff info for use in EJS
          tip.requestedStaff = {
            email: staffDoc.email,
            employeeNumber: staffDoc.employeeNumber,
            role: staffDoc.role
          };
        }
      }
    }

    res.render('managerAllTips', { allTips });
  } catch (err) {
    console.error(err);
    return showError(res, 'Error loading manager tips.');
  }
});

// staff/edit GET => Show form with existing info
app.get('/staff/edit', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/staff/login');
  }

  try {
    const staff = await Staff.findOne({ email: req.session.user.email });
    if (!staff) return res.status(404).send("Staff not found.");

    const profileImage = staff.profileImage && staff.profileImage.trim() !== '' ? staff.profileImage : '/default-avatar.png';

    // Format the phone number
    const formattedPhoneNumber = staff.phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');

    const errorMsgs = {};  

    const dataToRender = {
      user: req.session.user,
      staff: {
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        phoneNumber: formattedPhoneNumber,
        profileImage: staff.profileImage && staff.profileImage !== 'undefined' ? staff.profileImage : 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20512%20512%27%3E%3Ccircle%20cx%3D%27256%27%20cy%3D%27256%27%20r%3D%27256%27%20fill%3D%27%23333%27%2F%3E%3Ccircle%20cx%3D%27256%27%20cy%3D%27192%27%20r%3D%2764%27%20fill%3D%27%23aaa%27%2F%3E%3Cpath%20d%3D%27M192%20320h128c35.3%200%2064%2028.7%2064%2064v64H128v-64c0-35.3%2028.7-64%2064-64z%27%20fill%3D%27%23aaa%27%2F%3E%3C%2Fsvg%3E'
      },
      errorMsgs: {}
    };

    res.render('staffEdit', dataToRender);
  } catch (err) {
    console.error("Error loading staff profile:", err);
    return showError(res, 'Error loading staff profile.');
  }
});

// staff/edit POST => Save changes
app.post('/staff/edit', isAuthenticated, async (req, res) => {
  const { firstName, lastName, phoneNumber, email, profileImageUrl } = req.body;
  let errorMsgs = {};

  const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Validate inputs
  if (!firstName.trim()) {
    errorMsgs.firstNameError = 'First name is required.';
  }
  if (!lastName.trim()) {
    errorMsgs.lastNameError = 'Last name is required.';
  }
  if (!phoneRegex.test(phoneNumber)) {
    errorMsgs.phoneNumberError = 'Phone number must be in xxx-xxx-xxxx format.';
  }
  if (!emailRegex.test(email)) {
    errorMsgs.emailFormatError = 'Invalid email format.';
  }

  // Check if email is already in use
  if (email !== req.session.user.email) {
    const existingEmail = await Staff.findOne({ email });
    if (existingEmail) {
      errorMsgs.emailError = 'Email is already in use.';
    }
  }

  // Prepare data to render
  const dataToRender = {
    staff: { firstName, lastName, email, phoneNumber },
    errorMsgs
  };

  // If errors, re-render form with messages
  if (Object.keys(errorMsgs).length > 0) {
    console.log("Rendering staffEdit with errors:", JSON.stringify(dataToRender, null, 2));
    return res.render('staffEdit', dataToRender);
  }

  // Update staff details
  try {
    const staff = await Staff.findOne({ email: req.session.user.email });
    if (!staff) return showError(res, 'Staff not found.');

    staff.firstName = firstName;
    staff.lastName = lastName;
    staff.phoneNumber = phoneNumber;
    staff.email = email;
    if (profileImageUrl) staff.profileImage = profileImageUrl;

    await staff.save();

    // Update session info
    req.session.user.firstName = staff.firstName;
    req.session.user.lastName = staff.lastName;
    req.session.user.email = staff.email;
    req.session.user.profileImage = staff.profileImage;

    console.log("Profile successfully updated:", JSON.stringify(staff, null, 2));

    return showNotice(res, 'Profile Updated', 'Your info has been updated.', true);
  } catch (err) {
    console.error(err);
    errorMsgs = {};

    if (err.name === 'ValidationError') {
      for (let field in err.errors) {
        errorMsgs[field] = err.errors[field].message;
      }

      console.log("Rendering staffEdit with validation errors:", JSON.stringify(dataToRender, null, 2));

      res.render('staffEdit', {
        user: req.session.user,
        staff: {
          firstName: staff.firstName,
          lastName: staff.lastName,
          email: staff.email,
          phoneNumber: staff.phoneNumber,
          profileImage: staff.profileImage && staff.profileImage !== 'undefined' ? staff.profileImage : 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20512%20512%27%3E%3Ccircle%20cx%3D%27256%27%20cy%3D%27256%27%20r%3D%27256%27%20fill%3D%27%23333%27%2F%3E%3Ccircle%20cx%3D%27256%27%20cy%3D%27192%27%20r%3D%2764%27%20fill%3D%27%23aaa%27%2F%3E%3Cpath%20d%3D%27M192%20320h128c35.3%200%2064%2028.7%2064%2064v64H128v-64c0-35.3%2028.7-64%2064-64z%27%20fill%3D%27%23aaa%27%2F%3E%3C%2Fsvg%3E'
        },
        errorMsgs: {}
     });
     
    }
    return showError(res, 'Error updating staff profile.');
  }
});

// Manager view: see all staff
app.get('/manager/staff-list', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'manager') {
    return showError(res, 'Unauthorized. Manager only.');
  }
  try {
    const allStaff = await Staff.find({}).sort({ employeeNumber: 1 });

    // manager's own ID or email
    const managerId = await Staff.findOne({ email: req.session.user.email }, '_id');

    // Add fullName to each staff member
    const staffWithFullName = allStaff.map((staff) => ({
      ...staff.toObject(),
      fullName: `${staff.firstName} ${staff.lastName}`,
    }));
    
    res.render('managerAllStaff', { allStaff: staffWithFullName, managerId: managerId._id });
  } catch (err) {
    console.error(err);
    return showError(res, 'Error loading staff data.');
  }
});

// Manager Approve/Reject
app.get('/manager/approve', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'manager') {
    return showError(res, 'Unauthorized. Manager only.');
  }

  const { id, decision } = req.query;
  try {
    const tip = await Tip.findById(id);
    if (!tip) {
      return showError(res, 'Tip not found.');
    }

    // Find the manager who is approving/rejecting the tip
    const manager = await Staff.findOne({ email: req.session.user.email });

    if (decision === 'approve') {
      tip.approved = true;
      tip.claimed = true;
      tip.claimedBy = tip.requestedBy;
      tip.approvalRequested = false;
      tip.tipRejected = false;
      tip.approvedBy = `${manager.firstName} ${manager.lastName}`;
      tip.approvedAt = new Date();
    } else if (decision === 'reject') {
      tip.approved = false;
      tip.claimed = false;
      tip.approvalRequested = false;
      tip.tipRejected = true;
      tip.approvedBy = `${manager.firstName} ${manager.lastName}`;

      // Create a new unclaimed tip for staff to reclaim
      await Tip.create({
        roomNumber: tip.roomNumber,
        amount: tip.amount,
        claimed: false,
        tipRejected: false,
        approved: false,
        approvalRequested: false,
      });
    } else {
      return showError(res, 'Invalid decision.');
    }

    await tip.save();

    // 🔥 Emit an update to all clients (REAL-TIME UPDATE)
    io.emit('tipUpdated', {
      tipId: tip._id,
      approvedBy: tip.approvedBy,
      status: decision === 'approve' ? 'Approved' : 'Rejected',
    });

    return showNotice(res, 'Tip Processed', `Tip ${decision} by ${manager.firstName} ${manager.lastName}`);
  } catch (err) {
    console.error(err);
    return showError(res, 'Error approving/rejecting tip.');
  }
});

// Manager: delete staff
app.get('/manager/staff-delete', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'manager') {
    return showError(res, 'Unauthorized. Manager only.');
  }

  const { id } = req.query;
  try {
    const staff = await Staff.findById(id);
    if (!staff) {
      return showError(res, 'Staff not found.');
    }

    // Actually delete from DB
    await Staff.findByIdAndDelete(id);

    // Possibly also remove or reassign any tips claimedBy that staff, etc. up to you
    // Example: await Tip.deleteMany({ claimedBy: staff.email });

    return showNotice(res, 'User Deleted', `Staff ${staff.email} has been removed.`);
  } catch (err) {
    console.error(err);
    return showError(res, 'Error deleting staff.');
  }
});

// Manager: show an edit form
// Manager: show an edit form
app.get('/manager/staff-edit', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'manager') {
    return showError(res, 'Unauthorized. Manager only.');
  }

  const { id } = req.query;
  try {
    const staff = await Staff.findById(id);
    if (!staff) {
      return showError(res, 'Staff not found.');
    }

    // Format the phone number
    const formattedPhoneNumber = staff.phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');

    res.render('managerStaffEdit', {
      staff: {
        ...staff.toObject(),
        phoneNumber: formattedPhoneNumber,
      },
      errorMsgs: {}, // Pass an empty errorMsgs object
    });
  } catch (err) {
    console.error(err);
    return showError(res, 'Error loading staff for edit.');
  }
});

app.post('/manager/staff-edit', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'manager') {
    return showError(res, 'Unauthorized. Manager only.');
  }

  const { staffId, fullName, email, role, countryCode, phoneNumber } = req.body;

  try {
    const staff = await Staff.findById(staffId);
    if (!staff) return showError(res, 'Staff not found.');

    // Validate fields
    const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
    const countryCodeRegex = /^\+\d{1,3}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const errorMsgs = {};

    if (!fullName.trim()) {
      errorMsgs.fullName = 'Full name is required.';
    }

    if (!emailRegex.test(email)) {
      errorMsgs.email = 'Invalid email format.';
    }

    if (!countryCodeRegex.test(countryCode)) {
      errorMsgs.countryCode = 'Country code must follow the format +<digits>.';
    }

    if (!phoneRegex.test(phoneNumber)) {
      errorMsgs.phoneNumber = 'Phone number must follow the format xxx-xxx-xxxx.';
    }

    // If there are errors, re-render the form with the errors
    if (Object.keys(errorMsgs).length > 0) {
      return res.render('managerStaffEdit', { staff, errorMsgs });
    }

    // Update fields
    const [firstName, lastName] = fullName.split(' ', 2);
    staff.firstName = firstName;
    staff.lastName = lastName;
    staff.email = email;
    staff.role = role;
    staff.countryCode = countryCode; // Update countryCode
    staff.phoneNumber = phoneNumber; // Update phoneNumber

    await staff.save();

    return showNotice(res, 'Staff Updated', `Staff info has been updated for ${staff.email}.`);
  } catch (err) {
    console.error(err);
    return showError(res, 'Error updating staff.');
  }
});

// Manager Edit Profile
app.get('/manager/edit-profile', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'manager') {
    return showError(res, 'Unauthorized access.');
  }
  const manager = await Staff.findOne({ email: req.session.user.email });
  if (!manager) return showError(res, 'Manager not found.');

  // Format phone number if necessary
  const formattedPhoneNumber = manager.phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');

  res.render('staffEdit', { staff: { ...manager.toObject(), phoneNumber: formattedPhoneNumber } });
});

app.post('/manager/edit-profile', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'manager') {
    return showError(res, 'Unauthorized access.');
  }

  const { phoneNumber, email: newEmail } = req.body;
  try {
    const manager = await Staff.findOne({ email: req.session.user.email });
    if (!manager) return showError(res, 'Manager not found.');

    // Always allow phone number changes
    manager.phoneNumber = phoneNumber;

    // Check if manager wants to update their email
    if (newEmail && newEmail !== manager.email) {
      // 1) Ensure the newEmail isn’t already taken by someone else
      const inUse = await Staff.findOne({ email: newEmail });
      if (inUse) {
        return showError(res, 'That email is already taken.');
      }

      // 2) Temporarily store in "pendingEmail"
      manager.pendingEmail = newEmail;

      // 3) Generate a 4-digit code
      const code = (Math.floor(1000 + Math.random() * 9000)).toString();
      manager.pendingEmailCode = code;

      // 4) Send code to the NEW email
      await sendEmail(
        newEmail,
        'Confirm Your New EliteTip Email',
        `Hello ${manager.firstName}, here is your verification code: ${code}`
      );

      await manager.save();
      return showNotice(res, 'Email Update Requested', 
        'We sent a code to your new email address. Please verify it to complete the update.'
      );
    }

    // If manager didn't change email, just save phone number, etc.
    await manager.save();
    return showNotice(res, 'Profile Updated', 'Your information has been updated.');
  } catch (err) {
    console.error(err);
    return showError(res, 'Error updating manager profile.');
  }
});

// --- Change email bs --- //

app.get('/manager/verify-new-email', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'manager') {
    return showError(res, 'Unauthorized access.');
  }
  // Render a simple form that asks for the code
  res.render('verifyNewEmail', { errorMsg: null });
});
app.post('/manager/verify-new-email', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'manager') {
    return showError(res, 'Unauthorized access.');
  }

  const { code } = req.body;
  try {
    const manager = await Staff.findOne({ email: req.session.user.email });
    if (!manager) return showError(res, 'Manager not found.');

    if (!manager.pendingEmail || !manager.pendingEmailCode) {
      return showError(res, 'No email update is pending.');
    }

    if (manager.pendingEmailCode !== code) {
      // Wrong code => re-render page
      return res.render('verifyNewEmail', {
        errorMsg: 'Invalid code. Please try again.'
      });
    }

    // Correct code => finalize
    const oldEmail = manager.email;
    manager.email = manager.pendingEmail;
    manager.pendingEmail = undefined;
    manager.pendingEmailCode = undefined;
    await manager.save();

    // Update session so they remain logged in with new email
    req.session.user.email = manager.email;

    return showNotice(res, 'Email Updated', 
      `Your email has been changed from ${oldEmail} to ${manager.email}.`
    );
  } catch (err) {
    console.error(err);
    return showError(res, 'Error verifying new email.');
  }
});


app.get('/staff/verify-new-email', (req, res) => {
  // Show a simple form for them to enter the code
  return res.render('verifyNewEmail', { errorMsg: null });
});
app.post('/staff/verify-new-email', async (req, res) => {
  if (!req.session.user) {
    return showError(res, 'Not logged in.');
  }

  const { code } = req.body;
  // Assuming 'email' refers to the pendingEmail, ensure it's correctly retrieved
  const { email: newEmail } = req.body; // Ensure your form includes <input name="email" value="...">

  try {
    // Find the staff doc based on current session’s email
    const staff = await Staff.findOne({ email: req.session.user.email });
    if (!staff) return showError(res, 'Staff not found.');

    // Check if pendingEmail & pendingEmailCode exist
    if (!staff.pendingEmail || !staff.pendingEmailCode) {
      return showError(res, 'No email update is pending.');
    }

    // Verify the code
    if (staff.pendingEmailCode !== code) {
      return res.render('verifyNewEmail', {
        defaultEmail: staff.pendingEmail,
        errorMsg: 'Invalid code. Please try again.'
      });
    }

    // If code is correct, finalize the email change
    const oldEmail = staff.email;
    staff.email = staff.pendingEmail;
    staff.pendingEmail = undefined;
    staff.pendingEmailCode = undefined;
    await staff.save();

    // Update session to reflect the new email
    req.session.user.email = staff.email;

    return showNotice(res, 'Email Updated',
      `Your email has been changed from ${oldEmail} to ${staff.email}.`
    );
  } catch (err) {
    console.error(err);
    return showError(res, 'Error verifying new email.');
  }
});

app.get('/staff/forgot', (req, res) => {
  res.render('staffForgot', { errorMsg: null });
});
app.post('/staff/forgot', async (req, res) => {
  const { email } = req.body;

  try {
    const staff = await Staff.findOne({ email });
    if (!staff) {
      // No staff found => show error inline
      return res.render('staffForgot', { errorMsg: 'No account with that email.' });
    }

    // Generate a 4-digit code
    const code = (Math.floor(1000 + Math.random() * 9000)).toString();
    staff.verificationCode = code;  // Reuse existing field or create a new one like staff.resetCode
    await staff.save();

    // Email the code
    await sendEmail(email, 'EliteTip: Reset Code', 
      `Here is your password reset code: ${code}`);

    // Move on to the “verify code” step
    return res.redirect(`/staff/forgot-verify?email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error(err);
    return showError(res, 'Error sending reset code.');
  }
});

app.get('/staff/forgot-verify', (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.redirect('/staff/forgot');
  }
  res.render('staffForgotVerify', { email, errorMsg: null });
});
app.post('/staff/forgot-verify', async (req, res) => {
  const { email, code } = req.body;

  try {
    const staff = await Staff.findOne({ email });
    if (!staff) {
      return res.render('staffForgotVerify', {
        email,
        errorMsg: 'No account found.'
      });
    }
    if (staff.verificationCode !== code) {
      return res.render('staffForgotVerify', {
        email,
        errorMsg: 'Invalid code. Please try again.'
      });
    }

    // If code is correct => proceed to set new password
    // Clear the code so it can't be reused
    staff.verificationCode = undefined;
    await staff.save();

    // We'll pass them to /staff/forgot-reset with a query or a short-lived token
    return res.redirect(`/staff/forgot-reset?email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error(err);
    return showError(res, 'Error verifying reset code.');
  }
});

app.get('/staff/forgot-reset', (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.redirect('/staff/forgot');
  }
  res.render('staffForgotReset', { email, errorMsg: null });
});
app.post('/staff/forgot-reset', async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return res.render('staffForgotReset', {
      email,
      errorMsg: 'Passwords do not match.'
    });
  }

  try {
    const staff = await Staff.findOne({ email });
    if (!staff) {
      return res.render('staffForgotReset', {
        email,
        errorMsg: 'No account found.'
      });
    }

    // If we want to ensure they've just verified a code, we might store a 
    // "resetAllowed" in staff doc or session. But for now, assume code was verified.
    const bcrypt = require('bcrypt');
    const newHash = await bcrypt.hash(newPassword, 10);
    staff.passwordHash = newHash;
    await staff.save();

    // Now redirect them to login
    return showNotice(res, 'Password Reset', 'Your password has been updated. Please log in.');
  } catch (err) {
    console.error(err);
    return showError(res, 'Error resetting password.');
  }
});

// Start
server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
