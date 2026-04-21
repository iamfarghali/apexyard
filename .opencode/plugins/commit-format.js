/**
 * ApexYard OpenCode Plugin: Commit Format Validation
 * 
 * PreToolUse hook on `git commit`: validates commit message format.
 * Based on .claude/hooks/validate-commit-format.sh
 */

import { isCommit, getRepoRoot, readFile, fileExists, COMMIT_TYPES } from './lib.js';

export const CommitFormatPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isCommit(command)) return;
      
      // Skip interactive commits
      if (!command.includes('-m') && !command.includes('-F')) return;
      
      let commitMsg = '';
      
      // Extract -m "message"
      const msgMatch = command.match(/-m\s+["']([^"']+)["']/);
      if (msgMatch) {
        commitMsg = msgMatch[1];
      } else {
        // Try -F <file>
        const fileMatch = command.match(/-F\s+(\S+)/);
        if (fileMatch) {
          try {
            commitMsg = require('fs').readFileSync(fileMatch[1], 'utf8');
          } catch (e) {
            return;
          }
        }
      }
      
      if (!commitMsg) return;
      
      // Get subject line
      const subjectLine = commitMsg.split('\n')[0].trim();
      
      // Validate format: type: subject or type(scope): subject
      const validTypes = COMMIT_TYPES.join('|');
      const formatRegex = new RegExp(`^(${validTypes})(\\([^)]+\\))?:\\s+.+`, 'i');
      
      if (!formatRegex.test(subjectLine)) {
        throw new Error(`BLOCKED: Commit message "${subjectLine}" doesn't match format.

Valid format: type: subject or type(scope): subject
Valid types: ${COMMIT_TYPES.join(', ')}

Example:
  feat: add user authentication
  feat(auth): add OAuth2 provider`);
      }
    }
  };
};

export default CommitFormatPlugin;