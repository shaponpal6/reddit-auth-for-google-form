const fs = require("fs");
const http = require("http");
const url = require("url");
const { google } = require("googleapis");

const CREDENTIALS_PATH = "credentials.json";
const TOKEN_PATH = "token.json";

fs.readFile(CREDENTIALS_PATH, "utf8", (err, content) => {
  if (err) {
    console.error("Error loading credentials.json:", err.message);
    return;
  }

  const credentials = JSON.parse(content);
  authorize(credentials);
});

function authorize(credentials) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, "http://localhost");

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  console.log("Authorize this app by visiting this URL:", authUrl);

  // Start a simple server to handle the OAuth2 callback
  const server = http.createServer((req, res) => {
    const query = url.parse(req.url, true).query;
    if (query.code) {
      res.end("Authorization successful! You can close this window.");
      server.close();

      oAuth2Client.getToken(query.code, (err, token) => {
        if (err) {
          console.error("Error retrieving access token:", err.message);
          return;
        }
        oAuth2Client.setCredentials(token);

        // Save the token to a file
        fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
          if (err) {
            console.error("Error saving token.json:", err.message);
          } else {
            console.log("Token stored successfully in token.json.");
          }
        });
      });
    } else {
      res.end("Authorization failed or no code received.");
    }
  }).listen(80, () => {
    console.log("Waiting for Google OAuth callback...");
  });
}
