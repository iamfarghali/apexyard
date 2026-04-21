/**
 * ApexYard OpenCode Plugin: Red CI Merge Block
 * 
 * PreToolUse hook on `gh pr merge`: blocks if CI is failing.
 * Based on .claude/hooks/block-merge-on-red-ci.sh
 */

import { isMergeCommand, extractPrNumber, runGh, getRepoRoot } from './lib.js';

export const RedCiPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isMergeCommand(command)) return;
      
      const prNumber = extractPrNumber(command);
      if (!prNumber) return;
      
      // Get repo from command
      let repo = null;
      const repoMatch = command.match(/--repo["']?\s*["']?([^"']+)["']?/);
      if (repoMatch) repo = repoMatch[1];
      
      // Get PR checks
      let checks;
      try {
        checks = runGh(`pr checks ${prNumber}${repo ? ' --repo ' + repo : ''} --json status,conclusion`);
      } catch (e) {
        checks = null;
      }
      
      if (!checks) {
        // No checks = no CI configured, allow with note
        if (client && client.session) {
          await client.session.prompt({
            body: {
              role: 'user',
              content: `NOTE: No CI checks found for PR #${prNumber}. Ensure CI is configured before merging.`
            }
          });
        }
        return;
      }
      
      try {
        const checkData = JSON.parse(checks);
        
        // Check for failures - gh pr checks --json returns array under 'checks' key
        const hasFailure = checkData.checks?.some(s => 
          s.conclusion === 'FAILURE' || s.conclusion === 'TIMED_OUT'
        );
        const hasPending = checkData.checks?.some(s => 
          s.status === 'IN_PROGRESS' || s.status === 'QUEUED' || s.status === 'PENDING'
        );
        
        if (hasFailure) {
          throw new Error(`BLOCKED: PR #${prNumber} has failing CI checks.

Do not merge with failing CI. Fix the failures first.`);
        }
        
        if (hasPending) {
          throw new Error(`BLOCKED: PR #${prNumber} has pending CI checks.

Wait for CI to complete before merging.`);
        }
      } catch (e) {
        if (e.message?.includes('BLOCKED:')) throw e;
        // If we can't parse, allow
      }
    }
  };
};

export default RedCiPlugin;