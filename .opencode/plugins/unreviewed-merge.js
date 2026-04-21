/**
 * ApexYard OpenCode Plugin: Unreviewed Merge Block
 * 
 * PreToolUse hook on `gh pr merge`: blocks merging a PR that does not have 
 * BOTH required approval markers (Rex + CEO) in place.
 * Based on .claude/hooks/block-unreviewed-merge.sh
 * 
 * Two markers required:
 *   - .claude/session/reviews/<pr>-rex.approved (written by code-reviewer agent)
 *   - .claude/session/reviews/<pr>-ceo.approved (written ONLY by /approve-merge skill)
 * 
 * Both SHAs must match current HEAD.
 */

import { fileExists, getRepoRoot, isMergeCommand, extractPrNumber, resolvePrHead, getCurrentSha } from './lib.js';

const path = require('path');

export const UnreviewedMergePlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isMergeCommand(command)) return;
      
      const prNumber = extractPrNumber(command);
      if (!prNumber) {
        throw new Error(`BLOCKED: Could not determine PR number for merge. 
Run from a PR branch or pass an explicit PR number.`);
      }
      
      const repoRoot = getRepoRoot();
      const reviewsDir = path.join(repoRoot || '.', '.claude/session/reviews');
      const rexApproval = path.join(reviewsDir, `${prNumber}-rex.approved`);
      const ceoApproval = path.join(reviewsDir, `${prNumber}-ceo.approved`);
      
      // Get current PR HEAD from GitHub
      const currentSha = await resolvePrHead(prNumber);
      const localSha = getCurrentSha();
      
      // ==== Gate 1: Rex approval ====
      if (!fileExists(rexApproval)) {
        throw new Error(`BLOCKED: PR #${prNumber} has no recorded code-reviewer (Rex) approval.

ApexYard requires two reviews before merge (workflow-gates rule #5):
  1. Code Reviewer agent (Rex) — automated, recorded in .claude/session/reviews/
  2. Human approver (CEO) — recorded by the /approve-merge skill

Missing file: ${rexApproval}

To unblock:
  1. Invoke the code-reviewer agent on this PR
  2. When Rex returns "approved", it records the approval automatically
  3. Then run /approve-merge ${prNumber} for CEO approval
  4. Retry the merge

Never skip this check — even for typo fixes.`);
      }
      
      // Check Rex SHA match
      const rexContent = fileExists(rexApproval) ? require('fs').readFileSync(rexApproval, 'utf8').trim() : '';
      const rexSha = rexContent.replace(/\s/g, '');
      if (rexSha && currentSha && rexSha !== currentSha && rexSha !== localSha) {
        throw new Error(`BLOCKED: Code-reviewer approved commit ${rexSha.slice(0,7)} but HEAD is now ${(currentSha || localSha || '').slice(0,7)}.

New commits were pushed after the Rex review. Re-invoke Rex on the latest HEAD before merging.`);
      }
      
      // ==== Gate 2: CEO approval ====
      if (!fileExists(ceoApproval)) {
        throw new Error(`BLOCKED: PR #${prNumber} has Rex approval but no CEO approval marker.

Plan-level "go" / "continue" / "ship it" does NOT authorize a merge.
Each merge requires an explicit per-PR, per-merge CEO approval.

Missing file: ${ceoApproval}

To unblock:
  1. Stop and ask the CEO explicitly: "PR #${prNumber} ready to merge — approved?"
  2. When CEO says "approved", run: /approve-merge ${prNumber}
  3. Retry the merge

NEVER create this marker yourself from an umbrella "go" on a plan.`);
      }
      
      // Check CEO SHA match
      const ceoContent = fileExists(ceoApproval) ? require('fs').readFileSync(ceoApproval, 'utf8').trim() : '';
      const ceoSha = ceoContent.replace(/\s/g, '');
      if (ceoSha && currentSha && ceoSha !== currentSha && ceoSha !== localSha) {
        throw new Error(`BLOCKED: CEO approved commit ${ceoSha.slice(0,7)} but HEAD is now ${(currentSha || localSha || '').slice(0,7)}.

New commits were pushed after the CEO approval. Re-request CEO approval via /approve-merge ${prNumber} on the new HEAD before merging.`);
      }
    }
  };
};

export default UnreviewedMergePlugin;