const express = require("express");
const { translate } = require("@vitalets/google-translate-api");

const router = express.Router();

let lastRequestTime = 0;

router.post("/translate", async (req, res) => {

  try {

    const { text, targetLang } = req.body;

    const now = Date.now();

    if (now - lastRequestTime < 1500) {
      return res.json({
        success: false,
        translatedText: "Please wait..."
      });
    }

    lastRequestTime = now;

    console.log("TRANSLATE REQUEST:", text, targetLang);

    const result = await translate(text, { to: targetLang });

    console.log("TRANSLATE RESULT:", result.text);

    res.json({
      success: true,
      translatedText: result.text
    });

  } catch (error) {

    console.log("TRANSLATE ERROR:", error.message);

    res.json({
      success: false,
      translatedText: "Translation temporarily unavailable"
    });

  }

});

module.exports = router;