/**
 * ApexYard OpenCode Plugin: Secrets Detection
 * 
 * PreToolUse hook on `git commit`: scans for hardcoded secrets.
 * Based on .claude/hooks/check-secrets.sh
 */

import { isCommit, getRepoRoot } from './lib.js';

const SECRET_PATTERNS = [
  /api[_-]?key\s*=\s*["'][^"']+["']/i,
  /password\s*=\s*["'][^"']+["']/i,
  /secret\s*=\s*["'][^"']+["']/i,
  /token\s*=\s*["'][^"']+["']/i,
  /private[_-]?key\s*=\s*/i,
  /aws[_-]?access[_-]?key/i,
  /aws[_-]?secret/i,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  /sk-[a-zA-Z0-9]{20,}/
];

export const SecretsPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isCommit(command)) return;
      
      // Skip interactive commits
      if (!command.includes('-m') && !command.includes('-F')) return;
      
      let commitMsg = '';
      
      // Extract message
      const msgMatch = command.match(/-m\s+["']([^"']+)["']/);
      if (msgMatch) {
        commitMsg = msgMatch[1];
      } else {
        const fileMatch = command.match(/-F\s+(\S+)/);
        if (fileMatch) {
          const filePath = fileMatch[1];
          // Validate path doesn't contain directory traversal
          if (filePath.includes('..')) {
            throw new Error(`BLOCKED: Invalid file path - directory traversal not allowed.`);
          }
          // Validate it doesn't start with / (absolute path from root)
          if (filePath.startsWith('/')) {
            throw new Error(`BLOCKED: Absolute paths not allowed. Use relative path.`);
          }
          try {
            commitMsg = require('fs').readFileSync(filePath, 'utf8');
          } catch (e) {
            throw new Error(`BLOCKED: Could not read commit message file: ${filePath}`);
          }
        }
      }
      
      if (!commitMsg) return;
      
      // Check for secrets in commit message
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(commitMsg)) {
          throw new Error(`BLOCKED: Possible secret detected in commit message.

Remove any hardcoded secrets, API keys, passwords, or tokens from your commit message.
Use environment variables or secrets management instead.`);
        }
      }
    }
  };
};

export default SecretsPlugin;