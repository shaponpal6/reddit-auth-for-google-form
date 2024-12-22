const express = require("express");
const expressSession = require("express-session");
const crypto = require("crypto");
const axios = require("axios");
const luxon = require("luxon");
const helmet = require("helmet");
const morgan = require("morgan");
const apiInit = require("./sheets-api");
require("dotenv").config();

// Configuration
const {
  REDDIT_ID,
  REDDIT_SECRET,
  SESSION_SECRET,
  ELIGIBILITY_DATE,
  FAILURE_REDIRECT,
  SHEET_ID,
  FORM_ID,
  FIELD_ID_1,
} = process.env;
const EXEC_MODE = process.env.EXEC_MODE || "DEV"; // default to "DEV" if not set
const SITE_URL_PROD = process.env.SITE_URL_PROD || "https://prod.example.com";
const SITE_URL_DEV = process.env.SITE_URL_DEV || "http://localhost:9999";

const BASE_URL = (EXEC_MODE === "PROD") ? SITE_URL_PROD : SITE_URL_DEV;
// console.log('BASE_URL :>> ', BASE_URL);

const PORT = process.env.PORT || 9999;
const REDDIT_AUTH_URL = "https://www.reddit.com/api/v1/authorize";
const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const REDDIT_API_URL = "https://oauth.reddit.com/api/v1/me";

const app = express();

// Middleware
app.use(express.static("public"));
app.use(helmet());
app.use(morgan("dev"));
app.use(
  expressSession({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 }, // 1-hour session
  })
);

// View Engine
app.set("view engine", "ejs");

// Routes
app.get("/", (req, res) => {
  res.render("index", {
    title: "Welcome to Reddit Auth App",
    desc: "Authenticate with Reddit to proceed.",
    button_text: "Continue with Reddit",
    auth_url: "/auth",
  });
});

app.get("/auth", (req, res) => {
  req.session.state = crypto.randomBytes(32).toString("hex");
  const authUrl = `${REDDIT_AUTH_URL}?client_id=${REDDIT_ID}&response_type=code&state=${req.session.state}&redirect_uri=${BASE_URL}/auth/afterwards&duration=temporary&scope=identity`;
  res.redirect(authUrl);
});

app.get("/auth/afterwards", async (req, res) => {
  const { code, state, error } = req.query;

  if (error || state !== req.session.state) {
    return res.redirect("/ballot_ineligible");
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await axios.post(
      REDDIT_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${BASE_URL}/auth/afterwards`,
      }),
      {
        auth: {
          username: REDDIT_ID,
          password: REDDIT_SECRET,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token } = tokenResponse.data;

    // Fetch user profile
    const userResponse = await axios.get(REDDIT_API_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const profile = userResponse.data;
    const accountCreatedDate = luxon.DateTime.fromSeconds(profile.created).setZone("Asia/Seoul");
    const eligibilityDate = luxon.DateTime.fromISO(ELIGIBILITY_DATE, { zone: "Asia/Seoul" });

    // console.log("Account Created Date:", accountCreatedDate.toISO());
    // console.log("Eligibility Date:", eligibilityDate.toISO());

    req.session.user = profile;

    // Check eligibility
    if (accountCreatedDate < eligibilityDate) {
      // console.log("Eligible user. Redirecting to /ballot");
      res.redirect("/ballot");
    } else {
      // console.log("Ineligible user. Redirecting to /ballot_ineligible");
      res.redirect("/ballot_ineligible");
    }

  } catch (err) {
    console.error(err);
    res.redirect("/ballot_ineligible");
  }
});

app.get("/ballot", async (req, res) => {
  if (!req.session?.user) {
    return res.redirect("/");
  }

  const username = req.session.user.name;

  // // Initialize Sheets API
  // const sheets = await apiInit();

  // // Check if the username exists in the spreadsheet
  // const isEligible = await sheets.findUsername(username);
  // if (!isEligible) {
  //   // Append the username if not already present
  //   await sheets.appendUsername(username);
  // }

  res.setHeader("Content-Security-Policy", "frame-src https://docs.google.com;");
  res.render("ballot", {
    username,
    formUrl: `https://docs.google.com/forms/d/e/${FORM_ID}/viewform?usp=pp_url&entry.${FIELD_ID_1}=${username}`,
  });
});

app.get("/ballot_ineligible", (req, res) => {
  res.render("ineligible", {
    title: "Access Denied",
    desc: "You are ineligible to proceed further.",
    fallback_url: FAILURE_REDIRECT,
    button_text: "Go Back to Home",
  });
});

// 404 Page
app.use((req, res) => {
  res.status(404).render("404", {
    message: "Page Not Found",
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on ${BASE_URL}`);
});
