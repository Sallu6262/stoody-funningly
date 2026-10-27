# Connect the game to Google Sheets

The text below fixes the screen shown in your screenshot. You pasted a file link instead of the file’s JavaScript code.

## Part 1: Fix the Apps Script editor

1. In Visual Studio Code, open `google-apps-script/PuzzleApproval.gs`.
2. Press `Ctrl+A`, then `Ctrl+C` to copy all its code.
3. Return to the Google Apps Script tab shown in your screenshot.
4. Click inside `Code.gs` and press `Ctrl+A`.
5. Press `Ctrl+V`. The editor should now contain hundreds of lines.
6. Press `Ctrl+S`.
7. Open the function dropdown beside **Run**.
8. Select `setupPuzzleWorkbook`.
9. Click **Run**.

Google asks for permission the first time:

1. Click **Review permissions**.
2. Select your Google account.
3. If Google shows a warning, click **Advanced**.
4. Click **Go to Untitled project**.
5. Click **Allow**.

Return to the spreadsheet and refresh it. You should see these tabs:

- `Papers`
- `Questions`
- `Responses`

The setup function now adds one placeholder `LIVE` paper for each of the three checkpoints without overwriting existing rows. Run it again after updating the Apps Script to add the new `TIMER_SECONDS` column and any missing Checkpoint 2/3 placeholder rows.

Stop here and tell Codex: `the three tabs are ready`.

## Part 2: Add the private secret

Codex copies the private secret to your Windows clipboard when configuring the project.

1. In Apps Script, click the **Project Settings** gear on the left.
2. Scroll to **Script properties**.
3. Add a property named `PUZZLE_API_SECRET`. If it already exists, edit it.
4. Click the value box and press `Ctrl+V`.
5. Click **Save script properties**.

Do not paste this secret into chat or frontend code.

## Part 3: Connect Netlify

Add these two server environment variables in Netlify:

- `GOOGLE_APPS_SCRIPT_URL`: the deployed URL ending in `/exec`
- `PUZZLE_API_SECRET`: the same private value from Part 2

Redeploy the site after saving both variables. Codex can verify the complete connection afterward.

## Configure the three papers

Each row in `Papers` has its own `CHECKPOINT_ID`, `TIMER_SECONDS`, `LOCK_NUMBER`, and private `LOCK_CODE`. Keep exactly one paper marked `LIVE` per checkpoint. The timer may be set from 10 to 7,200 seconds.

Questions and subparts remain in `Questions`, linked by `PAPER_ID`. You can mix `MCQ`, `TEXT`, `TEXTAREA`, and `NUMBER` rows for each paper. Approval and feedback remain server-owned in `Responses`; never put a lock code or approval control in frontend code.

After editing papers, use **Racing Papers → Validate live papers**. Send Codex the real questions, options, correct answers, passing percentages, timers, and lock codes when they are ready.
