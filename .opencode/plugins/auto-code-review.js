/**
 * ApexYard OpenCode Plugin: Auto Code Review
 * 
 * PostToolUse hook: after `gh pr create` succeeds, tell the agent to invoke the
 * code-reviewer agent (Rex) on the new PR automatically.
 * Based on .claude/hooks/auto-code-review.sh
 * 
 * Mechanism: This plugin uses the 'message.updated' event to detect when a PR is created,
 * writes a pending-review marker, and pushes a reminder to invoke Rex.
 */

import { fileExists, getRepoRoot, extractPrNumber, isPrCreate } from './lib.js';

const fs = require('fs');
const path = require('path');

export const AutoCodeReviewPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // Alternative approach: intercept the PR create command
    "tool.execute.after": async (input, output) => {
      // Check if this was a gh pr create command
      const command = input.args?.command || '';
      if (!isPrCreate(command)) return;
      
      // Extract PR URL from output
      const outputText = output.result || '';
      // More robust regex - match github.com URLs specifically
      const prUrlMatch = outputText.match(/https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/pull\/(\d+)/);
      if (!prUrlMatch) {
        console.error('Warning: Could not extract PR URL from gh pr create output');
        return;
      }
      
      const prUrl = prUrlMatch[0];
      const prNumber = prUrlMatch[1];
      
      if (!prNumber) return;
      
      // Write pending review marker
      const repoRoot = getRepoRoot();
      const pendingDir = path.join(repoRoot || '.', '.claude/session/pending-reviews');
      
      try {
        if (!fs.existsSync(pendingDir)) {
          fs.mkdirSync(pendingDir, { recursive: true });
        }
        fs.writeFileSync(path.join(pendingDir, prNumber), prUrl);
      } catch (e) {
        // Ignore file errors, continue with notification
      }
      
      // Push a reminder to the agent via the client
      if (client && client.session) {
        // Use the prompt injection via tui.prompt.append event
        // This is the most reliable way to push next-step instructions
        client.session.prompt({
          body: {
            role: 'user',
            content: `AUTO CODE REVIEW REQUIRED

You just created PR #${prNumber}. ApexYard requires the code-reviewer agent (Rex)
to run on every PR before it can be merged — see workflows/code-review.md
and .claude/rules/pr-workflow.md.

The merge-gate hook will block \`gh pr merge\` for this PR until a Rex approval
file exists at .claude/session/reviews/${prNumber}-rex.approved.`
          }
        });
      }
    },
    
    // Alternative: use message.updated event (more direct but needs event hook)
    "event: message.updated": async ({ event }) => {
      // This fires when any message is added/updated
      // We would need to detect if this is a PR creation result
      // For now, rely on the tool.execute.after approach above
    }
  };
};

export default AutoCodeReviewPlugin;