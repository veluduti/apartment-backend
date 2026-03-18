const twilio = require("twilio");

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE;

const client = new twilio(accountSid, authToken);

let otpStore = {};

const sendOtp = async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: "Phone required"
    });
  }

  if (otpStore[phone]) {
    return res.json({
      success: false,
      message: "OTP already sent. Try after some time"
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);

  otpStore[phone] = {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000
  };

  try {
    await client.messages.create({
      body: `Your Apartment Ecosystem OTP is ${otp}`,
      from: twilioNumber,
      to: phone
    });

    console.log("OTP sent to:", phone);

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const verifyOtp = (req, res) => {
  const { phone, otp } = req.body;

  const record = otpStore[phone];

  if (
    record &&
    record.otp == otp &&
    record.expiresAt > Date.now()
  ) {
    delete otpStore[phone];
    return res.json({ success: true });
  }

  res.json({ success: false });
};

module.exports = {
  sendOtp,
  verifyOtp
};