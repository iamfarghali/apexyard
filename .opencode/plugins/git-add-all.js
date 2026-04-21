/**
 * ApexYard OpenCode Plugin: Block Git Add All
 * 
 * PreToolUse hook on `git add`: blocks using -A, ., or --all.
 * Based on .claude/hooks/block-git-add-all.sh
 */

import { isGitAdd } from './lib.js';

export const GitAddAllPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isGitAdd(command)) return;
      
      // Check for -A, ., or --all
      if (command.includes(' -A ') || 
          command.includes(' --all ') ||
          command.endsWith(' -A') ||
          command.endsWith(' --all') ||
          command.includes(' -A)') ||
          command.includes(' --all)')) {
        throw new Error(`BLOCKED: git add -A / git add . / git add --all is not allowed.

Always add specific files:
  git add src/specific-file.ts
  git add src/file1.ts src/file2.ts

This ensures you review each file before committing.`);
      }
      
      // Also block bare "git add ." pattern
      if (command.match(/\bgit\s+add\s+\.$/)) {
        throw new Error(`BLOCKED: git add . is not allowed.

Always add specific files to review before committing.`);
      }
    }
  };
};

export default GitAddAllPlugin;