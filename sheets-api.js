const fs = require("fs");
const path = require("path");
const util = require("util");
const { google } = require("googleapis");

const CRED_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

async function apiInit() {
  const credentials = JSON.parse(fs.readFileSync(CRED_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oauth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oauth.setCredentials(token);

  return new Sheets(oauth);
}

class Sheets {
  constructor(auth, sheetId = process.env.SHEET_ID, range = "AuthUsers!A2:B") {
    this.auth = auth;
    this.sheets = google.sheets({ version: "v4", auth });
    this.input = {
      spreadsheetId: sheetId,
      range: range,
    };
  }

  async findUsername(username) {
    const asyncF = util.promisify(this.sheets.spreadsheets.values.get);
    try {
      const data = await asyncF(this.input);
      if (!data || !data.data || !data.data.values) {
        throw new Error("Invalid API response structure");
      }
      const rows = data.data.values || [];
      return rows.some(row => row[0] === username);
    } catch (err) {
      console.error("Google Sheets API Error:", err.message);
      console.error("Stack Trace:", err.stack);
      return false; // Return false if an error occurs
    }
  }
  

  async appendUsername(username) {
    const asyncF = util.promisify(this.sheets.spreadsheets.values.append);
    return asyncF({
      ...this.input,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [[username]] },
    });
  }
}

module.exports = apiInit;
