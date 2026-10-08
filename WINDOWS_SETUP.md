# Windows setup for persistent Google Flow login

This fork supports a dedicated persistent Chrome profile for Google Flow MCP.

## Important security rule

Do **not** commit your personal email, cookies, passwords, or Google session files to GitHub.

`config/flow.config.json` is already ignored by `.gitignore`. Keep your personal settings there only.

## 1. Create the local config

Copy:

`config/flow.config.example.json`

to:

`config/flow.config.json`

Then set at least:

```json
{
  "expectedAccount": "your-email@gmail.com",
  "chromeProfile": "Default",
  "cdpPort": 9222,
  "headless": false
}
```

You can leave `chromePath` and `chromeUserDataDir` empty. The MCP code will:

- auto-detect Google Chrome on Windows when possible;
- use a dedicated persistent profile under `%LOCALAPPDATA%\\GoogleFlowMCP\\ChromeUserData`.

You may override either value in `config/flow.config.json` or with environment variables:

- `FLOW_CHROME_PATH`
- `FLOW_CHROME_USER_DATA_DIR`
- `FLOW_CHROME_PROFILE`
- `FLOW_EXPECTED_ACCOUNT`

## 2. Start the MCP server

The project requires Node.js 18 or newer.

From PowerShell in the repository folder:

```powershell
npm install
npm start
```

If `node` or `npm` is not available in PowerShell, use the exact path to an existing Node.js installation instead of changing system PATH on a managed/work computer.

## 3. First Google sign-in

Call the MCP tool:

`flow_connect`

A dedicated Chrome window should open.

On the first run only:

1. Sign in to the intended Google account manually.
2. Open Google Flow and finish any normal account prompts.
3. Leave the browser profile intact.

The login cookies remain in the dedicated MCP Chrome user-data directory. Future `flow_connect` calls reuse that profile, so you normally should not need to sign in again.

## 4. Verify

Call:

- `flow_status`
- `flow_account_check`

If Google asks for CAPTCHA, reauthentication, or another verification challenge, complete it manually. The MCP should not bypass those checks.

## What "persistent" means

The Google login persists in the dedicated Chrome profile across MCP restarts. It is not a permanent API token and can still expire or be revoked by Google.
