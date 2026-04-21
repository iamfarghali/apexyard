/**
 * ApexYard OpenCode Plugin: Commit Reference Verification
 * 
 * PreToolUse hook on `git commit`: verifies issue references in commit
 * messages actually exist in the tracker repo.
 * Based on .claude/hooks/verify-commit-refs.sh
 */

import { isCommit, getRepoRoot, runGh } from './lib.js';

export const CommitRefsPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isCommit(command)) return;
      
      // Skip interactive commits (no -m or -F)
      if (!command.includes('-m') && !command.includes('-F')) return;
      
      const errors = [];
      const repoRoot = getRepoRoot();
      
      // Extract commit message
      let commitMsg = '';
      
      // Try -m "message"
      const msgMatch = command.match(/-m\s+["']([^"']+)["']/);
      if (msgMatch) {
        commitMsg = msgMatch[1];
      } else {
        // Try -F <file>
        const fileMatch = command.match(/-F\s+(\S+)/);
        if (fileMatch) {
          try {
            const fs = require('fs');
            commitMsg = fs.readFileSync(fileMatch[1], 'utf8');
          } catch (e) {
            // Can't read file, skip
            return;
          }
        }
      }
      
      if (!commitMsg) return;
      
      // Find issue references
      const refPatterns = [
        /Closes\s+#(\d+)/gi,
        /Closes\s+#(\d+)/gi,
        /Fixes\s+#(\d+)/gi,
        /Resolves\s+#(\d+)/gi,
        /Refs\s+#(\d+)/gi,
        /Related\s+to\s+#(\d+)/gi
      ];
      
      const issueNumbers = new Set();
      for (const pattern of refPatterns) {
        let match;
        while ((match = pattern.exec(commitMsg)) !== null) {
          issueNumbers.add(match[1]);
        }
      }
      
      if (issueNumbers.size === 0) return;
      
      // Get tracker repo
      let trackerRepo = null;
      try {
        const originUrl = runGh('remote get-url origin');
        const urlMatch = originUrl?.match(/[:/]([^/]+\/[^/]+)(?:\.git)?$/);
        if (urlMatch) trackerRepo = urlMatch[1];
      } catch (e) {}
      
      if (!trackerRepo) return;
      
      // Verify each referenced issue
      for (const num of issueNumbers) {
        try {
          const issueJson = runGh(`issue view ${num} --repo ${trackerRepo} --json number`);
          if (!issueJson) {
            errors.push(`Issue #${num} referenced in commit does not exist in ${trackerRepo}`);
          }
        } catch (e) {
          errors.push(`Issue #${num} referenced in commit does not exist in ${trackerRepo}`);
        }
      }
      
      if (errors.length > 0) {
        throw new Error(`COMMIT BLOCKED:\n${errors.join('\n')}\n\nFix the issue references in your commit message.`);
      }
    }
  };
};

export default CommitRefsPlugin;