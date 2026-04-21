/**
 * ApexYard OpenCode Plugin: Branch Name Validation
 * 
 * PreToolUse hook on `git push`: warns if branch name doesn't follow convention.
 * Based on .claude/hooks/validate-branch-name.sh
 */

import { isPush, getCurrentBranch, getRepoRoot } from './lib.js';

const BRANCH_REGEX = /^(feature|fix|refactor|chore|docs|test|spike|ci|build|perf)\/[A-Z]{1,10}-[0-9]+-.+/;

export const BranchNamePlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isPush(command)) return;
      
      const branch = getCurrentBranch();
      if (!branch) return;
      
      // Allow main/master
      if (branch === 'main' || branch === 'master') return;
      
      if (!BRANCH_REGEX.test(branch)) {
        // Warning only - inject notice but don't block
        if (client && client.session) {
          await client.session.prompt({
            body: {
              role: 'user',
              content: `BRANCH NAMING WARNING

Branch "${branch}" doesn't match ApexYard convention.

Expected format: type/TICKET-ID-description
Valid types: feature, fix, refactor, chore, docs, test, spike, ci, build, perf

Example: feature/GH-123-add-user-auth

This is a warning - push was allowed. Consider using a properly named branch.`
            }
          });
        }
      }
    }
  };
};

export default BranchNamePlugin;