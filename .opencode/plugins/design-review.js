/**
 * ApexYard OpenCode Plugin: Design Review for UI Merge
 * 
 * PreToolUse hook on `gh pr merge`: requires design approval for UI changes.
 * Based on .claude/hooks/require-design-review-for-ui.sh
 */

import { isMergeCommand, extractPrNumber, getRepoRoot, getCurrentSha, fileExists, isMergeCommand } from './lib.js';

const path = require('path');

const UI_PATTERNS = [
  /\.tsx$/,
  /\.jsx$/,
  /\.vue$/,
  /\.svelte$/,
  /\.css$/,
  /\.scss$/,
  /\.sass$/,
  /\.less$/,
  /design-tokens/
];

/**
 * Check if PR has UI changes
 */
const hasUiChanges = async () => {
  try {
    // Get the diff for the PR
    const result = require('child_process').execSync('git diff --name-only HEAD~1 HEAD', { 
      encoding: 'utf8', 
      stdio: 'pipe' 
    });
    const files = result.trim().split('\n').filter(f => f);
    
    for (const file of files) {
      for (const pattern of UI_PATTERNS) {
        if (pattern.test(file)) return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
};

export const DesignReviewPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isMergeCommand(command)) return;
      
      const prNumber = extractPrNumber(command);
      if (!prNumber) return;
      
      // Check if there are UI changes
      const hasUi = await hasUiChanges();
      if (!hasUi) return;
      
      const repoRoot = getRepoRoot();
      const designMarker = path.join(repoRoot || '.', `.claude/session/reviews/${prNumber}-design.approved`);
      
      if (!fileExists(designMarker)) {
        throw new Error(`BLOCKED: PR #${prNumber} has UI changes but no design review approval.

ApexYard requires design review for UI changes. Missing:
  ${designMarker}

To approve: /approve-design ${prNumber}

UI files detected: ${UI_PATTERNS.map(p => p.toString()).join(', ')}`);
      }
      
      // Verify SHA matches
      const markerContent = require('fs').readFileSync(designMarker, 'utf8').trim();
      const markerSha = markerContent.replace(/\s/g, '');
      const currentSha = getCurrentSha();
      
      if (markerSha && currentSha && markerSha !== currentSha) {
        throw new Error(`BLOCKED: Design approved commit ${markerSha.slice(0,7)} but HEAD is now ${currentSha.slice(0,7)}.

New commits were pushed after design review. Re-request design approval.`);
      }
    }
  };
};

export default DesignReviewPlugin;