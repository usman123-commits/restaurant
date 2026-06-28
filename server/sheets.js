import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
function getSpreadsheetId() {
  return process.env.SPREADSHEET_ID;
}

let sheets = null;

let TAB_NAMES = {
  Menu: 'Sheet1',
  Conversations: 'Conversations',
  Orders: 'Orders',
  Handoffs: 'Handoffs',
  BotConfig: 'BotConfig',
};

export async function initAuth() {
  // Check if already initialized (important for serverless -- avoid re-init on warm starts)
  if (sheets) return sheets;

  let client_id, client_secret;

  // Try env var first (Vercel), then local file (dev)
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const content = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    const creds = content.installed || content.web || {};
    client_id = creds.client_id;
    client_secret = creds.client_secret;
  } else {
    const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
    if (!credPath) throw new Error('GOOGLE_CREDENTIALS_PATH or GOOGLE_CREDENTIALS_JSON not set');
    const content = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    const creds = content.installed || content.web || {};
    client_id = creds.client_id;
    client_secret = creds.client_secret;
  }

  if (!client_id || !client_secret) throw new Error('Invalid credentials');

  const redirectUri = 'http://localhost:3456';
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  // Try env var first (Vercel), then local file (dev)
  let token;
  if (process.env.GOOGLE_TOKEN_JSON) {
    token = JSON.parse(process.env.GOOGLE_TOKEN_JSON);
  } else if (fs.existsSync(TOKEN_PATH)) {
    token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  }

  if (token) {
    oAuth2Client.setCredentials(token);

    // Only save refreshed tokens locally (not on Vercel)
    if (!process.env.GOOGLE_TOKEN_JSON) {
      oAuth2Client.on('tokens', (newTokens) => {
        const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
        const merged = { ...existing, ...newTokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
        console.log('Token refreshed and saved.');
      });
    }
  } else {
    // Interactive OAuth flow -- only works locally
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('Opening browser for Google OAuth consent...');
    console.log('If browser does not open, visit this URL:\n', authUrl);
    const open = (await import('open')).default;
    const code = await getAuthCodeViaBrowser(authUrl);
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('Token saved to', TOKEN_PATH);
  }

  sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: getSpreadsheetId() });
    const sheetList = meta.data.sheets || [];
    for (const s of sheetList) {
      const props = s.properties;
      if (props.sheetId === 0) TAB_NAMES.Menu = props.title;
      else if (props.sheetId === 1463559692) TAB_NAMES.Conversations = props.title;
      else if (props.sheetId === 1932049043) TAB_NAMES.Orders = props.title;
      else if (props.sheetId === 1111907072) TAB_NAMES.Handoffs = props.title;
    }
    console.log('Detected tab names:', TAB_NAMES);
  } catch (err) {
    console.warn('Could not detect tab names, using defaults:', err.message);
  }

  console.log('Google Sheets auth initialized.');
  return sheets;
}

function getAuthCodeViaBrowser(authUrl) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost:3456');
      const code = url.searchParams.get('code');
      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Auth successful! You can close this tab.</h2></body></html>');
        server.close();
        resolve(code);
      } else if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>No code received.</h2></body></html>');
      }
    });

    server.listen(3456, () => {
      // browser opened by caller
    });

    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout - no consent received within 2 minutes'));
    }, 120000);
  });
}

export function getSheetNames() {
  return { ...TAB_NAMES };
}

export async function getSheetData(sheetName, range) {
  await initAuth();
  const tabName = TAB_NAMES[sheetName] || sheetName;
  const fullRange = range ? `'${tabName}'!${range}` : `'${tabName}'`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: fullRange,
  });

  return res.data.values || [];
}

export async function updateCell(sheetName, range, value) {
  await initAuth();
  const tabName = TAB_NAMES[sheetName] || sheetName;
  const fullRange = `'${tabName}'!${range}`;

  const values = Array.isArray(value) ? value : [[value]];

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: fullRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

export async function appendRow(sheetName, values) {
  await initAuth();
  const tabName = TAB_NAMES[sheetName] || sheetName;

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `'${tabName}'`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

export async function deleteRow(sheetName, rowIndex) {
  await initAuth();
  const tabName = TAB_NAMES[sheetName] || sheetName;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: getSpreadsheetId() });
  const sheetMeta = meta.data.sheets.find(s => s.properties.title === tabName);
  if (!sheetMeta) throw new Error(`Tab "${tabName}" not found`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSpreadsheetId(),
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetMeta.properties.sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex + 1,
            endIndex: rowIndex + 2,
          },
        },
      }],
    },
  });
}

export async function ensureTab(tabName) {
  await initAuth();
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `'${tabName}'!A1`,
    });
  } catch (err) {
    if (err.code === 400 || err.message?.includes('Unable to parse range')) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: getSpreadsheetId(),
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      TAB_NAMES[tabName] = tabName;
    }
  }
}

export async function updateRow(sheetName, rowIndex, values) {
  await initAuth();
  const tabName = TAB_NAMES[sheetName] || sheetName;
  const sheetRow = rowIndex + 2;
  const endCol = String.fromCharCode(64 + values.length);
  const range = `'${tabName}'!A${sheetRow}:${endCol}${sheetRow}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}
